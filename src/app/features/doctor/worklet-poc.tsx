/**
 * Worklet POC — single worklet, no wdk-react-native-core
 *
 * Purpose: prove three things in one script, on one worklet instance, so
 * there's no ambiguity about whether they coexist:
 *   1. Every call normally routed through wdk-react-native-core (workletStart,
 *      wallet creation, account methods) can be made manually via HRPC,
 *      directly on a Worklet we construct ourselves.
 *   2. Module calls (callModule) work the same way — using
 *      @tetherto/wdk-p2p-address-book as the real test case, not a stub.
 *   3. That SAME worklet's lifecycle (suspend/resume) is fully controllable
 *      and observable — because it's the one instance, not a second one
 *      running in parallel.
 *
 * Every RPC call sequence and field name below is copied from the real
 * production code path (wdk-react-native-core's workletLifecycleService.ts)
 * or confirmed directly from the wire schema — not guessed.
 *
 * Revision note: the first run of this POC showed a suspended call
 * *completing* instead of hanging. That wasn't a bug — worklet.suspend()
 * with no argument defaults to a native-chosen linger (a grace period
 * before the worklet actually stops, during which it keeps running
 * normally). The first run's 300ms wait was nowhere near the ~30s linger
 * that came back. This revision tests both cases deliberately and labels
 * them so the result is never ambiguous again: one suspend with a real
 * linger (call should complete — this is correct, expected behavior, not
 * a failure), and one with linger=0 (call should hang — this is the actual
 * "is the worklet stopped" test).
 *
 * Second revision note: even with linger=0 and suspended:true confirmed,
 * a getAddress call still completed. Also not a bug — getAddress is pure
 * local HD-key derivation with no network, I/O, or timer dependency, so
 * there's nothing for suspend to actually block. Per suspendify's README,
 * suspend/resume is about releasing external resources (network
 * connections, file locks), not halting JS execution outright. Switched
 * the suspend tests (C12, C15) to getBalance, which needs a real network
 * round-trip — an operation actually dependent on something suspend
 * should affect. Timeout widened to 8s accordingly, so normal network
 * latency isn't mistaken for genuine blocking.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Worklet } from 'react-native-bare-kit';
import { HRPC } from '@tetherto/pear-wrk-wdk';
import { Directory, Paths } from 'expo-file-system';
// Path assumes this file lives at src/app/features/doctor/worklet-poc.tsx —
// adjust the relative path if you place it elsewhere.
import bundle from '../../../../.wdk-bundle/wdk-worklet.bundle.js';
import { FeatureLayout } from '@/components/FeatureLayout';
import { ConsoleOutput } from '@/components/ConsoleOutput';
import { colors } from '@/constants/colors';
import wdkConfigs from '@/config/doctorRuntime';

// react-native-bare-kit's shipped type declarations don't include `started`
// and `suspended` on the Worklet class, even though both exist as real
// getters at runtime — confirmed directly against its index.js (get started()
// at line 162, get suspended() at line 170). This is a gap in the package's
// .d.ts, not a mistake in the code below — augment locally rather than
// scatter `as any` at each access site.
type WorkletWithStateGetters = InstanceType<typeof Worklet> & {
  readonly started: boolean;
  readonly suspended: boolean;
};

interface LogEntry {
  step: string;
  data: unknown;
}

// Adjust to a network actually present in your doctor.runtime.json — bitcoin
// is the simplest (no ERC-4337 paymaster dance, no gasfree credentials).
const TEST_NETWORK = 'bitcoin';
const TEST_MODULE = 'addressBook';

function raceWithTimeout<T>(promise: Promise<T>, ms: number, timeoutLabel: string): Promise<T | string> {
  return Promise.race([
    promise,
    new Promise<string>((resolve) => setTimeout(() => resolve(timeoutLabel), ms)),
  ]);
}

// doctor.runtime.json's modules.addressBook.storagePath ("./addressbook-storage")
// is a plain relative string with no connection to any real device path — it
// does NOT resolve inside the Bare sandbox, confirmed via a real ENOENT on
// first run. Bare's filesystem does not auto-create missing directories, so
// the fix isn't just "use an absolute path" — the directory has to actually
// exist first. Mirrors bare-mobile-doctor's useBareDirectory hook exactly,
// which is the one place in everything researched so far that had this
// working for real: Paths.document (a real, guaranteed-writable device path
// from expo-file-system) + an explicit create-if-missing check, not left to
// the module or Corestore to handle.
//
// This is a POC-local fix, not a permanent one — doctor.runtime.json is
// static JSON and genuinely can't call a native API to produce this value at
// parse time. The config below is a runtime-computed override of the static
// JSON's guess, applied just before it's sent. A proper permanent fix would
// need doctorRuntime.ts's loader to special-case a sentinel value (e.g.
// "$BARE_WRITABLE_DIR") and substitute a real computed path the same way —
// worth doing once this pattern is confirmed working, not before.
function getRealAddressBookStoragePath(): string {
  const dir = new Directory(Paths.document, 'wdk-doctor-addressbook');
  if (!dir.exists) {
    dir.create();
  }
  return dir.uri.replace('file://', '');
}

function buildConfigWithRealStoragePath(): typeof wdkConfigs {
  const realPath = getRealAddressBookStoragePath();
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
        storagePath: realPath,
      },
    },
  } as typeof wdkConfigs;
}

export default function WorkletPocScreen() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);

  const addLog = (step: string, data: unknown) => {
    setLog((prev) => [...prev, { step, data }]);
  };

  const runPoc = async () => {
    setRunning(true);
    setLog([]);

    let worklet: WorkletWithStateGetters | null = null;
    const firedEvents: string[] = [];
    const workletLogs: unknown[] = [];

    const callGetAddress = (rpc: any) =>
      rpc.callMethod({ methodName: 'getAddress', network: TEST_NETWORK, accountIndex: 0 });

    // getAddress is pure local HD-key derivation — no network, no I/O, nothing
    // for suspend to actually block. It's the right call for A7 (proving the
    // manual RPC path works) but the wrong one for testing suspend, which is
    // about releasing external resources (per suspendify's README: network
    // connections, file locks), not halting JS execution outright. getBalance
    // needs a real round-trip to the Blockbook provider — an operation that
    // genuinely depends on something suspend is meant to affect. Requires
    // real network reachability on the test device.
    const callGetBalance = (rpc: any) =>
      rpc.callMethod({ methodName: 'getBalance', network: TEST_NETWORK, accountIndex: 0 });

    try {
      // ---- 0. Compute a real, created storage path — see comment above ----
      const runtimeConfig = buildConfigWithRealStoragePath();
      addLog('A0. Computed real addressBook storagePath (fixes the ENOENT from last run)', {
        storagePath: (runtimeConfig.modules as any)?.addressBook?.storagePath,
      });


      // ================= SECTION A — manual RPC path =================

      // ---- 1. Construct + start the worklet with the existing bundle ----
      worklet = new Worklet() as WorkletWithStateGetters;
      worklet.start('wdk-worklet.bundle', bundle as string);
      addLog('A1. Worklet constructed + started', { started: worklet.started });

      // ---- 2. Subscribe to lifecycle events BEFORE triggering any ----
      worklet.on('suspend', (linger: number) => firedEvents.push(`suspend(linger=${linger})`));
      worklet.on('resume', () => firedEvents.push('resume'));
      worklet.on('wakeup', (deadline: number) => firedEvents.push(`wakeup(deadline=${deadline})`));
      worklet.on('idle', () => firedEvents.push('idle'));
      addLog('A2. Subscribed to suspend/resume/wakeup/idle', { listenersAttached: true });

      // ---- 3. Bind HRPC, register handlers for worklet-initiated pushes ----
      // before any outgoing call — a suspended-call crash last run confirmed
      // this is required, not optional (see git history on this file).
      const rpc = new HRPC(worklet.IPC);
      rpc.onLog(async (entry: unknown) => {
        workletLogs.push({ type: 'log', entry });
      });
      rpc.onModuleEvent(async (evt: unknown) => {
        workletLogs.push({ type: 'moduleEvent', evt });
      });
      addLog('A3. HRPC bound, onLog + onModuleEvent registered', { bound: true });

      // ---- 4. workletStart — activates the WDK runtime with our config ----
      const startResult = await rpc.workletStart({ config: JSON.stringify(runtimeConfig) });
      addLog('A4. workletStart RPC', { startResult, workletLogsSoFar: [...workletLogs] });

      // ---- 5. Generate a throwaway wallet's entropy + encryption key ----
      const entropy = await rpc.generateEntropyAndEncrypt({ wordCount: 12 });
      addLog('A5. generateEntropyAndEncrypt RPC', {
        encryptionKey: entropy.encryptionKey,
        hasEncryptedSeed: Boolean(entropy.encryptedSeedBuffer),
      });

      // ---- 6. initializeWDK — same config again, plus the key/seed ----
      const initResult = await rpc.initializeWDK({
        encryptionKey: entropy.encryptionKey,
        encryptedSeed: entropy.encryptedSeedBuffer,
        config: JSON.stringify(runtimeConfig),
      });
      addLog('A6. initializeWDK RPC', initResult);

      // ---- 7. callMethod — proves the manual RPC path works end to end ----
      const addressResult = await callGetAddress(rpc);
      addLog(`A7. callMethod(getAddress, ${TEST_NETWORK})`, addressResult);

      // ================= SECTION B — module path =================
      // Uses the real addressBook module, not a stub.

      const workletLogsBeforeModule = workletLogs.length;

      // ---- 8. getInfo — simplest possible module call, no args ----
      // Confirmed fields: { autobaseKey, writable }. Expect writable:false
      // here — this book hasn't been enrolled yet, that's step 9.
      const infoResult = await rpc.callModule({ module: TEST_MODULE, method: 'getInfo' });
      addLog('B8. callModule(addressBook, getInfo)', {
        infoResult,
        newWorkletLogs: workletLogs.slice(workletLogsBeforeModule),
      });

      // ---- 9. create — REQUIRED before any write, confirmed from source ----
      // addContact never checks or waits for writability itself — it assumes
      // the book is already enrolled. create() is what performs that
      // enrollment (_ensureEnrolled({ bootstrap: false })). Skipping this
      // step is exactly what produced "Not writable" on the previous run —
      // unrelated to the storagePath fix, which is confirmed working now
      // (this call succeeding at all, past module construction, proves it).
      // Since this POC generates a fresh random seed every run, this is
      // always a brand-new book — create() (not addMirror(), which is for
      // syncing an existing one) is the correct call here. This can take a
      // few seconds (waiting on the local writer's 'writable' event,
      // internally timeout-bounded at 20s) — not instant, not hung.
      await rpc.callModule({ module: TEST_MODULE, method: 'create' });
      const infoAfterCreate = await rpc.callModule({ module: TEST_MODULE, method: 'getInfo' });
      addLog('B9. callModule(addressBook, create) — enrolls the local writer', {
        infoAfterCreate,
      });

      // ---- 10. addContact — the write path, single-object arg ----
      const addContactResult = await rpc.callModule({
        module: TEST_MODULE,
        method: 'addContact',
        args: JSON.stringify([{ name: 'POC Test Contact' }]),
      });
      addLog('B10. callModule(addressBook, addContact)', addContactResult);

      // ---- 11. listContacts — confirms the write from B10 actually persisted ----
      const listResult = await rpc.callModule({ module: TEST_MODULE, method: 'listContacts' });
      addLog('B11. callModule(addressBook, listContacts)', listResult);

      // ================= SECTION C — lifecycle, two deliberate cases =================

      // ---- 11. Suspend WITH a real linger — call should COMPLETE ----
      // This is the case that surprised us last run. Labeling it explicitly
      // now so "completed" here reads as correct, not as a regression.
      worklet.suspend(5000);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const lingerEventsSoFar = [...firedEvents];
      const duringLingerOutcome = await raceWithTimeout(callGetBalance(rpc), 8000, 'timed-out');
      addLog('C12. suspend(linger=5000) — callMethod(getBalance) attempted during grace period', {
        eventsAfterSuspendCall: lingerEventsSoFar,
        callOutcome: duringLingerOutcome === 'timed-out' ? 'timed-out' : 'completed (expected — still lingering)',
      });

      // ---- 12. Resume — cancels the pending linger, back to normal ----
      worklet.resume();
      await new Promise((resolve) => setTimeout(resolve, 300));
      addLog('C13. resume() — cancels the linger', { eventsSoFar: [...firedEvents] });

      // ---- 13. Suspend with linger=0 — call should genuinely HANG ----
      worklet.suspend(0);
      await new Promise((resolve) => setTimeout(resolve, 300));
      addLog('C14. suspend(linger=0) called', {
        suspended: worklet.suspended,
        eventsSoFar: [...firedEvents],
      });

      // Timeout widened to 8s (vs 2s for the pure-local getAddress calls) —
      // getBalance needs a real network round-trip, so a short timeout would
      // conflate "genuinely blocked by suspend" with "just normal network
      // latency," which would be a misleading result either way.
      const stuckCallPromise = callGetBalance(rpc);
      const raceOutcome = await raceWithTimeout(stuckCallPromise, 8000, 'timed-out-as-expected');
      addLog('C15. callMethod(getBalance) attempted while genuinely suspended (linger=0)', { outcome: raceOutcome });

      // ---- 16. Resume — confirm the pending call from C15 completes ----
      worklet.resume();
      const resumedResult = await stuckCallPromise;
      await new Promise((resolve) => setTimeout(resolve, 100));
      addLog('C16. resume() called, pending call completed', {
        resumedResult,
        allEventsFired: [...firedEvents],
      });

      addLog('DONE', {
        totalEventsFired: firedEvents,
        totalWorkletLogsReceived: workletLogs,
      });
    } catch (err: any) {
      addLog('ERROR', { message: err?.message ?? String(err), stack: err?.stack });
    } finally {
      worklet?.terminate();
      setRunning(false);
    }
  };

  return (
    <FeatureLayout
      title="Worklet POC"
      description="One worklet: manual RPC calls, module calls, and two deliberate lifecycle tests — zero wdk-react-native-core involvement."
    >
      <TouchableOpacity style={styles.button} onPress={runPoc} disabled={running}>
        <Text style={styles.buttonText}>{running ? 'Running…' : 'Run POC'}</Text>
      </TouchableOpacity>

      {log.map((entry, i) => (
        <View key={i} style={styles.section}>
          <Text style={styles.stepTitle}>{entry.step}</Text>
          <ConsoleOutput data={entry.data} />
        </View>
      ))}
    </FeatureLayout>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.primary,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  buttonText: {
    color: colors.black,
    fontWeight: 'bold',
    fontSize: 16,
  },
  section: {
    marginBottom: 20,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
});
