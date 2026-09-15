/**
 * DoctorWorkletProvider — replaces WdkAppProvider entirely.
 *
 * Constructs exactly one Worklet and one HRPC client for the whole app's
 * lifetime. Every screen — wallet management, the account/module/protocol
 * screens, the lifecycle controls — reads from and calls into this same
 * instance via useDoctorWorklet(). No @tetherto/wdk-react-native-core
 * anywhere in this file or anything built on top of it.
 *
 * Every RPC call shape here (workletStart, generateEntropyAndEncrypt,
 * initializeWDK) is copied from worklet-poc.tsx, where each was confirmed
 * against real device runs — not re-derived from the schema alone.
 *
 * Wallet persistence: encryptionKey / encryptedSeed / encryptedEntropy are
 * stored via @tetherto/wdk-react-native-secure-storage, keyed per-wallet by
 * its own `identifier` parameter (the package supports multiple wallets
 * natively). No biometric gating for now — requireBiometrics is simply
 * omitted on every call, per team decision, not set to false (the package's
 * own default is already "not required" unless explicitly opted into).
 *
 * The secure storage package has no listWallets() — it can only check a
 * *specific* identifier (hasWallet), not enumerate which ones exist. So a
 * small, separate, non-sensitive index (just id/label/createdAt, no key
 * material) lives in AsyncStorage purely to know which identifiers to look
 * up.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Share } from 'react-native';
import { Worklet } from 'react-native-bare-kit';
import { HRPC } from '@tetherto/pear-wrk-wdk';
import { createSecureStorage } from '@tetherto/wdk-react-native-secure-storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, Paths } from 'expo-file-system';
// Path assumes this file lives at src/providers/DoctorWorkletProvider.tsx —
// same nesting depth as src/app/_layout.tsx, which uses the same '../../'
// prefix for this exact file. Adjust if placed elsewhere.
import bundle from '../../.wdk-bundle/wdk-worklet.bundle.js';
import wdkConfigs from '@/config/doctorRuntime';

// react-native-bare-kit's shipped type declarations don't include `started`
// and `suspended` on the Worklet class, even though both exist as real
// getters at runtime — confirmed directly against its index.js in
// worklet-poc.tsx. Augmenting locally rather than casting `as any` at every
// access site.
type WorkletWithStateGetters = InstanceType<typeof Worklet> & {
  readonly started: boolean;
  readonly suspended: boolean;
};

export type WorkletStatus = 'initializing' | 'ready' | 'error';

export interface LifecycleState {
  suspended: boolean;
  // Most recent events first, capped — this is a debugging display, not a
  // full audit log.
  recentEvents: string[];
}

export interface WalletIndexEntry {
  // The user-chosen identifier itself — matching the original showcase's
  // scheme (e.g. an email string) rather than an internally-generated one.
  // This is also the identifier secure storage keys everything under.
  id: string;
  createdAt: number;
}

export interface ModuleEvent {
  module: string;
  event: string;
  payload: string | null;
  timestamp: number;
}

interface DoctorWorkletContextValue {
  workletStatus: WorkletStatus;
  workletError: string | null;

  lifecycle: LifecycleState;
  suspend: (lingerMs: number) => void;
  resume: () => void;

  // Null until workletStatus === 'ready'. Screens should gate on
  // workletStatus, not on this being non-null, for a clearer UI story —
  // but this is also defensively checked inside every method below.
  rpc: InstanceType<typeof HRPC> | null;

  activeWalletId: string | null;
  wallets: WalletIndexEntry[];
  createWallet: (walletId: string, wordCount?: 12 | 24) => Promise<string>;
  importWallet: (mnemonic: string, walletId: string) => Promise<string>;
  createTemporaryWallet: () => Promise<void>;
  clearTemporaryWallet: () => Promise<void>;
  previewMnemonic: (wordCount?: 12 | 24) => Promise<string>;
  revealMnemonic: (walletId: string) => Promise<string>;
  unlockWallet: (walletId: string) => Promise<void>;
  lockWallet: () => Promise<void>;
  deleteWallet: (walletId: string) => Promise<void>;
  refreshWallets: () => Promise<void>;

  // Every moduleEvent push the worklet has sent since app launch, most
  // recent first, capped — used by Use Module's own event log display.
  // Also mirrored into debugLog below for the unified export.
  moduleEvents: ModuleEvent[];
  clearModuleEvents: () => void;

  // Every RPC call/result/error, worklet log line, module event, and
  // lifecycle transition since app launch, most recent first, capped —
  // the single comprehensive record for exportDebugLog. moduleEvents and
  // lifecycle above still exist separately for their own targeted UI
  // needs (Use Module's event log, the home screen's status badge) — this
  // is the unified superset of all of it, for debugging and export.
  debugLog: DebugLogEntry[];
  clearDebugLog: () => void;
  exportDebugLog: () => Promise<void>;
}

const WALLET_INDEX_KEY = 'doctor.walletIndex';

const DoctorWorkletContext = createContext<DoctorWorkletContextValue | null>(null);

export function useDoctorWorklet(): DoctorWorkletContextValue {
  const ctx = useContext(DoctorWorkletContext);
  if (!ctx) {
    throw new Error('useDoctorWorklet must be used within a DoctorWorkletProvider');
  }
  return ctx;
}

function pushEvent(prev: LifecycleState, label: string, suspended?: boolean): LifecycleState {
  return {
    suspended: suspended ?? prev.suspended,
    recentEvents: [label, ...prev.recentEvents].slice(0, 20),
  };
}

// This was previously only ever applied inside worklet-poc.tsx's standalone
// script — the actual shared provider every real screen runs on (this file)
// was still sending doctor.runtime.json's static, confirmed-nonfunctional
// placeholder ("./addressbook-storage") the whole time, meaning Use Module
// (and anything else exercising the addressBook module through the real app,
// not the POC) hit the exact same ENOENT the POC already fixed. Ported
// directly from worklet-poc.tsx's getRealAddressBookStoragePath /
// buildConfigWithRealStoragePath — same logic, same reasoning: a JSON file
// can't call a native API, so the real path has to be computed here and
// substituted in before the config is ever sent, not left as a static value.
function getRealAddressBookStoragePath(): string {
  const dir = new Directory(Paths.document, 'wdk-doctor-addressbook');
  if (!dir.exists) {
    dir.create();
  }
  return dir.uri.replace('file://', '');
}

function buildRuntimeConfig(): typeof wdkConfigs {
  const modules = wdkConfigs.modules as Record<string, any> | undefined;
  if (!modules?.addressBook) {
    return wdkConfigs;
  }
  return {
    ...wdkConfigs,
    modules: {
      ...modules,
      addressBook: {
        ...modules.addressBook,
        storagePath: getRealAddressBookStoragePath(),
      },
    },
  } as typeof wdkConfigs;
}

export interface DebugLogEntry {
  id: string;
  timestamp: number;
  category: 'rpc-call' | 'rpc-result' | 'rpc-error' | 'worklet-log' | 'module-event' | 'lifecycle';
  label: string;
  detail?: unknown;
}

let debugLogIdCounter = 0;
function nextDebugLogId(): string {
  debugLogIdCounter += 1;
  return `log-${debugLogIdCounter}`;
}

// Wraps every RPC call transparently rather than requiring each call site
// (createWallet, use-account.tsx's callMethod, use-module.tsx's callModule,
// anything built later) to manually report itself. "on"-prefixed methods
// (onLog, onModuleEvent) are handler *registrations*, not calls with a
// request/response round trip — passed through unwrapped rather than logged
// the same way, since logging "onLog was registered" once at boot isn't
// useful the way logging an actual RPC call and its result is.
function wrapRpcWithLogging(
  rawRpc: InstanceType<typeof HRPC>,
  onEntry: (entry: Omit<DebugLogEntry, 'id'>) => void
): InstanceType<typeof HRPC> {
  return new Proxy(rawRpc, {
    get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver);
      if (typeof orig !== 'function' || typeof prop !== 'string' || prop.startsWith('on')) {
        return typeof orig === 'function' ? orig.bind(target) : orig;
      }
      return async (...args: any[]) => {
        onEntry({ timestamp: Date.now(), category: 'rpc-call', label: prop, detail: args[0] });
        try {
          const result = await orig.apply(target, args);
          onEntry({ timestamp: Date.now(), category: 'rpc-result', label: prop, detail: result });
          return result;
        } catch (err: any) {
          onEntry({ timestamp: Date.now(), category: 'rpc-error', label: prop, detail: err?.message ?? String(err) });
          throw err;
        }
      };
    },
  });
}

export function DoctorWorkletProvider({ children }: { children: React.ReactNode }) {
  const [workletStatus, setWorkletStatus] = useState<WorkletStatus>('initializing');
  const [workletError, setWorkletError] = useState<string | null>(null);
  const [lifecycle, setLifecycle] = useState<LifecycleState>({
    suspended: false,
    recentEvents: [],
  });

  const [worklet, setWorklet] = useState<WorkletWithStateGetters | null>(null);
  const [rpc, setRpc] = useState<InstanceType<typeof HRPC> | null>(null);

  const [activeWalletId, setActiveWalletId] = useState<string | null>(null);
  const [wallets, setWallets] = useState<WalletIndexEntry[]>([]);
  const [moduleEvents, setModuleEvents] = useState<ModuleEvent[]>([]);
  const [debugLog, setDebugLog] = useState<DebugLogEntry[]>([]);

  const addDebugLogEntry = useCallback((entry: Omit<DebugLogEntry, 'id'>) => {
    setDebugLog((prev) => [{ ...entry, id: nextDebugLogId() }, ...prev].slice(0, 500));
  }, []);

  // createSecureStorage() should be called once and reused, per the
  // package's own docs — useRef's initializer only runs on first render.
  const secureStorageRef = useRef(createSecureStorage());

  // ---- Boot the worklet exactly once, on mount ----
  useEffect(() => {
    let cancelled = false;
    let localWorklet: WorkletWithStateGetters | null = null;

    async function boot() {
      try {
        const w = new Worklet() as WorkletWithStateGetters;
        localWorklet = w;
        w.start('wdk-worklet.bundle', bundle as string);

        w.on('suspend', (linger: number) => {
          setLifecycle((prev) => pushEvent(prev, `suspend(linger=${linger})`, true));
          addDebugLogEntry({ category: 'lifecycle', label: 'suspend', detail: { linger } });
        });
        w.on('resume', () => {
          setLifecycle((prev) => pushEvent(prev, 'resume', false));
          addDebugLogEntry({ category: 'lifecycle', label: 'resume' });
        });
        w.on('wakeup', (deadline: number) => {
          setLifecycle((prev) => pushEvent(prev, `wakeup(deadline=${deadline})`));
          addDebugLogEntry({ category: 'lifecycle', label: 'wakeup', detail: { deadline } });
        });
        w.on('idle', () => {
          setLifecycle((prev) => pushEvent(prev, 'idle'));
          addDebugLogEntry({ category: 'lifecycle', label: 'idle' });
        });

        const rawR = new HRPC(w.IPC);
        // Every real RPC call (workletStart, generateEntropyAndEncrypt,
        // callMethod, callModule, everything) is captured transparently
        // through this wrapper — no call site anywhere else needed to
        // change for this to work.
        const r = wrapRpcWithLogging(rawR, addDebugLogEntry);
        // Registered before any outgoing call — a suspended-call crash
        // during POC testing confirmed this is required, not optional, if
        // the worklet can push a message before we've asked for anything.
        r.onLog(async (entry: unknown) => {
          addDebugLogEntry({ category: 'worklet-log', label: 'log', detail: entry });
        });
        // Confirmed request shape from the wire schema: { module, event,
        // payload? }. Actually captured now, not discarded — a module's
        // event behavior is often exactly what needs testing.
        r.onModuleEvent(async (evt: { module: string; event: string; payload?: string | null }) => {
          setModuleEvents((prev) =>
            [{ module: evt.module, event: evt.event, payload: evt.payload ?? null, timestamp: Date.now() }, ...prev].slice(0, 100)
          );
          addDebugLogEntry({ category: 'module-event', label: `${evt.module}:${evt.event}`, detail: evt.payload ?? null });
        });

        await r.workletStart({ config: JSON.stringify(buildRuntimeConfig()) });

        if (cancelled) return;
        setWorklet(w);
        setRpc(r);
        setWorkletStatus('ready');
      } catch (err: any) {
        if (cancelled) return;
        setWorkletError(err?.message ?? String(err));
        setWorkletStatus('error');
      }
    }

    boot();

    return () => {
      cancelled = true;
      localWorklet?.terminate();
    };
  }, []);

  // ---- Load the wallet index once, on mount ----
  const refreshWallets = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(WALLET_INDEX_KEY);
      setWallets(raw ? JSON.parse(raw) : []);
    } catch {
      // Corrupted index is recoverable — treat as empty rather than crash
      // the whole provider over a debug-tool storage glitch.
      setWallets([]);
    }
  }, []);

  useEffect(() => {
    refreshWallets();
  }, [refreshWallets]);

  const saveWalletIndex = useCallback(async (next: WalletIndexEntry[]) => {
    await AsyncStorage.setItem(WALLET_INDEX_KEY, JSON.stringify(next));
    setWallets(next);
  }, []);

  const suspend = useCallback(
    (lingerMs: number) => {
      worklet?.suspend(lingerMs);
    },
    [worklet]
  );

  const resume = useCallback(() => {
    worklet?.resume();
  }, [worklet]);

  const createWallet = useCallback(
    async (walletId: string, wordCount: 12 | 24 = 12): Promise<string> => {
      if (!rpc) throw new Error('Worklet is not ready yet');
      if (!walletId.trim()) throw new Error('Wallet ID is required');
      if (wallets.some((w) => w.id === walletId)) {
        // Real risk once IDs are user-chosen rather than auto-generated:
        // secure storage's per-identifier setters don't check for an
        // existing entry, so creating a wallet with a duplicate ID would
        // silently overwrite another wallet's stored credentials. Guarding
        // here rather than relying on the storage layer to catch it.
        throw new Error(`A wallet with id "${walletId}" already exists`);
      }

      // Field names confirmed from worklet-poc.tsx's Section A — despite
      // the "Buffer" suffix, these arrive as strings over the wire (the
      // schema encodes them with c.string), passed straight through with
      // no conversion.
      const entropy = await rpc.generateEntropyAndEncrypt({ wordCount });

      await secureStorageRef.current.setEncryptionKey(entropy.encryptionKey, walletId);
      await secureStorageRef.current.setEncryptedSeed(entropy.encryptedSeedBuffer, walletId);
      await secureStorageRef.current.setEncryptedEntropy(entropy.encryptedEntropyBuffer, walletId);

      await rpc.initializeWDK({
        encryptionKey: entropy.encryptionKey,
        encryptedSeed: entropy.encryptedSeedBuffer,
        config: JSON.stringify(buildRuntimeConfig()),
      });

      const entry: WalletIndexEntry = { id: walletId, createdAt: Date.now() };
      await saveWalletIndex([...wallets, entry]);
      setActiveWalletId(walletId);
      return walletId;
    },
    [rpc, wallets, saveWalletIndex]
  );

  // NOTE on importWallet/previewMnemonic/revealMnemonic below: the field
  // shapes (getSeedAndEntropyFromMnemonic({mnemonic}) -> {encryptionKey,
  // encryptedSeedBuffer, encryptedEntropyBuffer}; getMnemonicFromEntropy(
  // {encryptedEntropy, encryptionKey}) -> {mnemonic}) were re-verified
  // directly against the wire schema (@tetherto/pear-wrk-wdk's generated
  // messages.js) after initially only being cross-referenced from
  // wdk-core-kotlin's docs — confirmed exact, no changes needed.

  const importWallet = useCallback(
    async (mnemonic: string, walletId: string): Promise<string> => {
      if (!rpc) throw new Error('Worklet is not ready yet');
      if (!walletId.trim()) throw new Error('Wallet ID is required');
      if (wallets.some((w) => w.id === walletId)) {
        throw new Error(`A wallet with id "${walletId}" already exists`);
      }

      const seedResult = await rpc.getSeedAndEntropyFromMnemonic({ mnemonic });

      await secureStorageRef.current.setEncryptionKey(seedResult.encryptionKey, walletId);
      await secureStorageRef.current.setEncryptedSeed(seedResult.encryptedSeedBuffer, walletId);
      await secureStorageRef.current.setEncryptedEntropy(seedResult.encryptedEntropyBuffer, walletId);

      await rpc.initializeWDK({
        encryptionKey: seedResult.encryptionKey,
        encryptedSeed: seedResult.encryptedSeedBuffer,
        config: JSON.stringify(buildRuntimeConfig()),
      });

      const entry: WalletIndexEntry = { id: walletId, createdAt: Date.now() };
      await saveWalletIndex([...wallets, entry]);
      setActiveWalletId(walletId);
      return walletId;
    },
    [rpc, wallets, saveWalletIndex]
  );

  const createTemporaryWallet = useCallback(async (): Promise<void> => {
    if (!rpc) throw new Error('Worklet is not ready yet');

    // Deliberately skips every secure-storage / index step below — a
    // temporary wallet is active in the worklet for this session only and
    // is never persisted anywhere, matching the old useWalletManager's
    // createTemporaryWallet semantics.
    const entropy = await rpc.generateEntropyAndEncrypt({ wordCount: 12 });
    await rpc.initializeWDK({
      encryptionKey: entropy.encryptionKey,
      encryptedSeed: entropy.encryptedSeedBuffer,
      config: JSON.stringify(buildRuntimeConfig()),
    });
    // No wallet id to track in the index — temporary wallets deliberately
    // don't appear in the home screen's wallet list. activeWalletId stays
    // null so the UI doesn't imply a persisted wallet exists to lock/unlock.
  }, [rpc]);

  const previewMnemonic = useCallback(
    async (wordCount: 12 | 24 = 12): Promise<string> => {
      if (!rpc) throw new Error('Worklet is not ready yet');

      // Generates and immediately reveals a phrase without persisting or
      // activating anything — a way to preview a fresh phrase before
      // committing to create a wallet from it.
      const entropy = await rpc.generateEntropyAndEncrypt({ wordCount });
      const result = await rpc.getMnemonicFromEntropy({
        encryptedEntropy: entropy.encryptedEntropyBuffer,
        encryptionKey: entropy.encryptionKey,
      });
      return result.mnemonic;
    },
    [rpc]
  );

  const revealMnemonic = useCallback(
    async (walletId: string): Promise<string> => {
      if (!rpc) throw new Error('Worklet is not ready yet');

      const encryptionKey = await secureStorageRef.current.getEncryptionKey(walletId);
      const encryptedEntropy = await secureStorageRef.current.getEncryptedEntropy(walletId);

      if (!encryptionKey || !encryptedEntropy) {
        throw new Error(`No stored credentials found for wallet ${walletId}`);
      }

      const result = await rpc.getMnemonicFromEntropy({ encryptedEntropy, encryptionKey });
      return result.mnemonic;
    },
    [rpc]
  );

  const unlockWallet = useCallback(
    async (walletId: string) => {
      if (!rpc) throw new Error('Worklet is not ready yet');

      const encryptionKey = await secureStorageRef.current.getEncryptionKey(walletId);
      const encryptedSeed = await secureStorageRef.current.getEncryptedSeed(walletId);

      if (!encryptionKey || !encryptedSeed) {
        throw new Error(`No stored credentials found for wallet ${walletId}`);
      }

      await rpc.initializeWDK({
        encryptionKey,
        encryptedSeed,
        config: JSON.stringify(buildRuntimeConfig()),
      });

      setActiveWalletId(walletId);
    },
    [rpc]
  );

  const lockWallet = useCallback(async () => {
    // Confirmed fresh against the actual current wire schema (pear-wrk-wdk
    // 1.0.0-beta.13's messages.js): resetWdkWallets-request reuses the same
    // encoding as registerWallet-request — { config } in, { status } out.
    // Asks the worklet to actually forget the active wallet's in-memory
    // state, not just clear our own UI's activeWalletId.
    if (rpc) {
      await rpc.resetWdkWallets({ config: JSON.stringify(buildRuntimeConfig()) });
    }
    setActiveWalletId(null);
  }, [rpc]);

  const clearTemporaryWallet = useCallback(async () => {
    // Distinct from lockWallet in the original useWalletManager API — kept
    // separate here too, even though the underlying call is the same
    // resetWdkWallets. The difference is semantic: a temporary wallet was
    // never assigned an activeWalletId in this design (createTemporaryWallet
    // doesn't set one), so there's nothing UI-side to clear beyond asking
    // the worklet to forget it.
    if (rpc) {
      await rpc.resetWdkWallets({ config: JSON.stringify(buildRuntimeConfig()) });
    }
  }, [rpc]);

  const deleteWallet = useCallback(
    async (walletId: string) => {
      await secureStorageRef.current.deleteWallet(walletId);
      const next = wallets.filter((w) => w.id !== walletId);
      await saveWalletIndex(next);
      if (activeWalletId === walletId) {
        setActiveWalletId(null);
      }
    },
    [wallets, saveWalletIndex, activeWalletId]
  );

  const clearModuleEvents = useCallback(() => {
    setModuleEvents([]);
  }, []);

  const clearDebugLog = useCallback(() => {
    setDebugLog([]);
  }, []);

  const exportDebugLog = useCallback(async () => {
    // Oldest-first for export — easier to read as a narrative than the
    // newest-first order the UI displays for quick scanning.
    const chronological = [...debugLog].reverse();
    const lines = chronological.map((entry) => {
      const time = new Date(entry.timestamp).toISOString();
      const detail = entry.detail !== undefined
        ? (typeof entry.detail === 'string' ? entry.detail : JSON.stringify(entry.detail))
        : '';
      return `[${time}] [${entry.category}] ${entry.label}${detail ? `: ${detail}` : ''}`;
    });
    const header = `WDK Doctor App — debug log export\nGenerated: ${new Date().toISOString()}\nEntries: ${chronological.length}\n${'='.repeat(40)}\n`;
    try {
      await Share.share({ message: header + lines.join('\n') });
    } catch (err: any) {
      // Share being dismissed/cancelled by the user isn't a real failure —
      // let it fail silently rather than surface a confusing error for
      // someone just closing the share sheet.
    }
  }, [debugLog]);

  const value: DoctorWorkletContextValue = {
    workletStatus,
    workletError,
    lifecycle,
    suspend,
    resume,
    rpc,
    activeWalletId,
    wallets,
    createWallet,
    importWallet,
    createTemporaryWallet,
    clearTemporaryWallet,
    previewMnemonic,
    revealMnemonic,
    unlockWallet,
    lockWallet,
    deleteWallet,
    refreshWallets,
    moduleEvents,
    clearModuleEvents,
    debugLog,
    clearDebugLog,
    exportDebugLog,
  };

  return (
    <DoctorWorkletContext.Provider value={value}>{children}</DoctorWorkletContext.Provider>
  );
}
