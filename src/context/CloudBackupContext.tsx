// src/context/CloudBackupContext.tsx
//
// Manages cloud authentication state and exposes all backup operations.
//
// iOS  → CloudKit via CloudKit JS (WebView-based sign-in)
// Android → Google Drive via @react-native-google-signin/google-signin
//
// Multi-wallet support:
//   Every operation (upload, download, delete, exists) accepts a walletId.
//   The walletId is used to derive a unique record/file name per wallet:
//     iOS CloudKit:    recordName = "wallet_<walletId_base64>"
//     Android Drive:   filePath   = "wallet_<walletId_base64>.json"
//   Base64-encoding the walletId ensures the name is safe for both
//   CloudKit record names and Drive file names regardless of what characters
//   the walletId contains (email addresses, UUIDs, etc.).
//
// Required .env variables:
//   EXPO_PUBLIC_CLOUDKIT_CONTAINER_ID   (iOS)
//   EXPO_PUBLIC_CLOUDKIT_API_TOKEN      (iOS)
//   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID    (Android)

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import {
  GoogleSignin,
  statusCodes,
  isErrorWithCode,
} from '@react-native-google-signin/google-signin';
import {
  CloudBackup,
  GoogleDriveProvider,
  CloudKitProvider,
  CloudAuthError,
} from '@tetherto/wdk-backup-cloud';
import type { CloudEncryptionKeyFile } from '@tetherto/wdk-backup-cloud';
import { CloudKitAuthWebView } from '../components/CloudKitAuthWebView';

// ─── Environment variables ────────────────────────────────────────────────────

const CLOUDKIT_CONTAINER_ID =
  process.env['EXPO_PUBLIC_CLOUDKIT_CONTAINER_ID'] ?? 'iCloud.io.tether.wdkshowcase';

const CLOUDKIT_API_TOKEN =
  process.env['EXPO_PUBLIC_CLOUDKIT_API_TOKEN'] ?? '';

// Derived from Expo's __DEV__ build-mode flag — NOT from a .env variable.
// A CLOUDKIT_ENVIRONMENT entry in .env has no effect because:
//   1. It would need an EXPO_PUBLIC_ prefix for Expo to inline it.
//   2. The value is already set at bundle time by __DEV__.
const CLOUDKIT_ENVIRONMENT: 'development' | 'production' =
  __DEV__ ? 'development' : 'production';

const GOOGLE_WEB_CLIENT_ID =
  process.env['EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'] ?? '';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Derives a safe, unique storage key from a walletId.
 *
 * The walletId is typically an email address like "user@example.com".
 * Both CloudKit record names and Drive file names have character restrictions,
 * so we encode the walletId to a base64url-safe string.
 *
 * Result format:
 *   iOS CloudKit:  "wallet_dXNlckBleGFtcGxlLmNvbQ"   (recordName)
 *   Android Drive: "wallet_dXNlckBleGFtcGxlLmNvbQ.json" (filePath)
 */
function walletStorageKey(walletId: string): string {
  // btoa produces base64; replace characters not safe in record/file names
  const encoded = btoa(walletId)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `wallet_${encoded}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type BackupOperationStatus =
  | 'idle'
  | 'checking'
  | 'uploading'
  | 'downloading'
  | 'deleting'
  | 'error';

interface CloudBackupState {
  isAuthenticated: boolean;
  accountEmail: string | null;
  operationStatus: BackupOperationStatus;
  backupMetadata: CloudEncryptionKeyFile | null;
  lastError: string | null;
}

export interface CloudBackupContextValue extends CloudBackupState {
  checkAccountStatus: () => Promise<{
    available: boolean;
    email: string | null;
    reason?: string;
  }>;
  authenticate: () => Promise<boolean>;
  signOut: () => Promise<void>;
  /** Upload the encrypted mnemonic for a specific wallet. */
  uploadBackup: (encryptedKey: string, walletId: string) => Promise<CloudEncryptionKeyFile | null>;
  /** Download the encrypted mnemonic for a specific wallet. */
  downloadBackup: (walletId: string) => Promise<CloudEncryptionKeyFile | null>;
  /** Delete the backup for a specific wallet. */
  deleteBackup: (walletId: string) => Promise<void>;
  /** Check whether a backup exists for a specific wallet. */
  checkExists: (walletId: string) => Promise<boolean>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const CloudBackupContext = createContext<CloudBackupContextValue | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function CloudBackupProvider({ children }: { children: ReactNode }) {

  // ── Token cache ────────────────────────────────────────────────────────────
  // The in-memory refs are the primary runtime token store.
  // Note: on iOS, cloudkitAuthHtml.ts uses persist:true + localStorage to
  // cache the ckWebAuthToken across WebView renders. signOut() clears the
  // in-memory ref AND increments webViewSessionKey, which remounts the WebView
  // (new React key prop) — this wipes its localStorage + cookies entirely.
  const iosWebAuthToken    = useRef<string | null>(null);
  const androidAccessToken = useRef<string | null>(null);

  const [state, setState] = useState<CloudBackupState>({
    isAuthenticated: false,
    accountEmail: null,
    operationStatus: 'idle',
    backupMetadata: null,
    lastError: null,
  });

  // ── WebView modal state (iOS only) ─────────────────────────────────────────
  const [webViewVisible, setWebViewVisible] = useState(false);
  // Incrementing this key remounts the WebView, wiping its localStorage and
  // cookies (where cloudkitAuthHtml.ts persists the CloudKit session token).
  const [webViewSessionKey, setWebViewSessionKey] = useState(0);
  const authPromiseRef = useRef<{
    resolve: (success: boolean) => void;
  } | null>(null);

  // ── Google Sign-In configuration ──────────────────────────────────────────
  const googleConfigured = useRef(false);

  const ensureGoogleConfigured = useCallback(() => {
    if (googleConfigured.current) return;

    if (!GOOGLE_WEB_CLIENT_ID) {
      throw new Error(
        'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set.\n' +
        'Add it to your .env file.'
      );
    }

    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      scopes: ['https://www.googleapis.com/auth/drive.appdata'],
      offlineAccess: false,
    });

    googleConfigured.current = true;
  }, []);

  // ── Internal state helpers ────────────────────────────────────────────────

  const setError = useCallback((msg: string) => {
    setState((s) => ({ ...s, operationStatus: 'error', lastError: msg }));
  }, []);

  const setStatus = useCallback((operationStatus: BackupOperationStatus) => {
    setState((s) => ({ ...s, operationStatus, lastError: null }));
  }, []);

  // ── SDK factory — now takes a walletId for per-wallet record naming ────────
  //
  // Each wallet gets its own record (CloudKit) or file (Drive) derived from
  // its walletId. This means multiple wallets can coexist in the same iCloud/
  // Drive account without overwriting each other.

  const buildSdk = useCallback((walletId: string): CloudBackup => {
    const storageKey = walletStorageKey(walletId);

    if (Platform.OS === 'ios') {
      const webToken = iosWebAuthToken.current;

      if (!webToken) {
        throw new Error('Not authenticated. Tap "Connect iCloud" first.');
      }

      const provider = new CloudKitProvider({
        containerIdentifier: CLOUDKIT_CONTAINER_ID,
        environment: CLOUDKIT_ENVIRONMENT,
        cloudEmail: state.accountEmail ?? '',
        // Per-wallet record name: "wallet_<encoded walletId>"
        recordName: storageKey,
        getCloudKitAuth: async () => ({
          apiToken: CLOUDKIT_API_TOKEN,
          webAuthToken: webToken,
        }),
      });

      return new CloudBackup(provider);
    }

    // Android — Google Drive
    const accessToken = androidAccessToken.current;
    if (!accessToken) {
      throw new Error('Not authenticated. Tap "Sign in with Google" first.');
    }

    const provider = new GoogleDriveProvider({
      accessToken,
      cloudEmail: state.accountEmail ?? '',
      // Per-wallet file name: "wallet_<encoded walletId>.json"
      filePath: `${storageKey}.json`,
    });

    return new CloudBackup(provider);
  }, [state.accountEmail]);

  // ── checkAccountStatus ────────────────────────────────────────────────────

  const checkAccountStatus = useCallback(async () => {
    if (Platform.OS === 'ios') {
      if (iosWebAuthToken.current) {
        return { available: true, email: state.accountEmail };
      }
      return {
        available: false,
        email: null as string | null,
        reason: 'not_signed_in',
      };
    }

    try {
      ensureGoogleConfigured();
    } catch {
      return {
        available: false,
        email: null as string | null,
        reason: 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID not set in .env',
      };
    }

    try {
      const result = await GoogleSignin.signInSilently();
      if (result.type === 'success') {
        return { available: true, email: result.data.user.email };
      }
      return { available: false, email: null as string | null, reason: 'not_signed_in' };
    } catch {
      return { available: false, email: null as string | null, reason: 'not_signed_in' };
    }
  }, [ensureGoogleConfigured, state.accountEmail]);

  // ── authenticate ──────────────────────────────────────────────────────────

  const authenticate = useCallback((): Promise<boolean> => {
    if (Platform.OS === 'ios') {
      if (!CLOUDKIT_API_TOKEN) {
        setError(
          'EXPO_PUBLIC_CLOUDKIT_API_TOKEN is not set in .env. ' +
          'Get it from CloudKit Dashboard → Tokens & Keys.'
        );
        return Promise.resolve(false);
      }

      return new Promise<boolean>((resolve) => {
        authPromiseRef.current = { resolve };
        setWebViewVisible(true);
      });
    }

    // Android
    return (async () => {
      try {
        ensureGoogleConfigured();
      } catch (e: any) {
        setError(e.message);
        return false;
      }

      try {
        let email: string | null = null;

        try {
          const silentResult = await GoogleSignin.signInSilently();
          if (silentResult.type === 'success') {
            email = silentResult.data.user.email;
          }
        } catch {
          // fall through to full sign-in UI
        }

        if (!email) {
          const result = await GoogleSignin.signIn();
          if (result.type === 'cancelled') {
            setError('Google Sign-In was cancelled');
            return false;
          }
          if (result.type !== 'success') {
            setError('Google Sign-In did not return a user');
            return false;
          }
          email = result.data.user.email;
        }

        // Explicitly request the drive.appdata scope — a no-op if already
        // granted, shows a one-time prompt if not.
        const scopeResult = await GoogleSignin.addScopes({
          scopes: ['https://www.googleapis.com/auth/drive.appdata'],
        });
        if (!scopeResult) {
          setError(
            'Google Drive access was not granted.\n' +
            'Please allow access to Google Drive when prompted.'
          );
          return false;
        }

        const tokens = await GoogleSignin.getTokens();
        if (!tokens.accessToken) {
          setError('Google Sign-In succeeded but no access token was returned.');
          return false;
        }

        androidAccessToken.current = tokens.accessToken;

        setState((s) => ({
          ...s,
          isAuthenticated: true,
          accountEmail: email,
          lastError: null,
        }));
        return true;

      } catch (e: any) {
        androidAccessToken.current = null;

        if (isErrorWithCode(e)) {
          if (e.code === statusCodes.SIGN_IN_CANCELLED) {
            setError('Google Sign-In cancelled');
          } else if (e.code === statusCodes.IN_PROGRESS) {
            setError('Sign-in already in progress. Please wait.');
          } else if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
            setError('Google Play Services is not available on this device.');
          } else {
            setError(`Google Sign-In error (${e.code}): ${e.message}`);
          }
        } else {
          setError(e.message ?? 'Google Sign-In failed');
        }
        return false;
      }
    })();
  }, [ensureGoogleConfigured, setError]);

  // ── WebView callbacks (iOS) ───────────────────────────────────────────────

  const handleWebViewTokenReceived = useCallback(
    (
      webAuthToken: string,
      identity: { displayName: string | null; userRecordName: string | null }
    ) => {
      iosWebAuthToken.current = webAuthToken;
      setWebViewVisible(false);

      const displayLabel =
        identity.displayName ??
        (identity.userRecordName
          ? `iCloud (${identity.userRecordName.slice(0, 12)}…)`
          : 'iCloud account (no discoverable identity)');

      setState((s) => ({
        ...s,
        isAuthenticated: true,
        accountEmail: displayLabel,
        lastError: null,
      }));

      authPromiseRef.current?.resolve(true);
      authPromiseRef.current = null;
    },
    []
  );

  const handleWebViewError = useCallback((message: string) => {
    setWebViewVisible(false);
    setError(`CloudKit sign-in failed: ${message}`);
    authPromiseRef.current?.resolve(false);
    authPromiseRef.current = null;
  }, [setError]);

  const handleWebViewClose = useCallback(() => {
    setWebViewVisible(false);
    authPromiseRef.current?.resolve(false);
    authPromiseRef.current = null;
  }, []);

  // ── signOut ───────────────────────────────────────────────────────────────

  const signOut = useCallback(async (): Promise<void> => {
    if (Platform.OS === 'ios') {
      iosWebAuthToken.current = null;
      // Remount the WebView to wipe its localStorage + cookies where the
      // CloudKit session token is persisted via persist:true.
      setWebViewSessionKey((k) => k + 1);
    } else {
      try {
        await GoogleSignin.signOut();
      } catch {
        // ignore
      }
      androidAccessToken.current = null;
    }

    setState({
      isAuthenticated: false,
      accountEmail: null,
      operationStatus: 'idle',
      backupMetadata: null,
      lastError: null,
    });
  }, []);

  // ── uploadBackup ──────────────────────────────────────────────────────────

  const uploadBackup = useCallback(
    async (encryptedKey: string, walletId: string): Promise<CloudEncryptionKeyFile | null> => {
      setStatus('uploading');
      try {
        const sdk = buildSdk(walletId);
        const result = await sdk.uploadEncryptedKey(encryptedKey);
        setState((s) => ({
          ...s,
          operationStatus: 'idle',
          backupMetadata: result,
          lastError: null,
        }));
        return result;
      } catch (e: any) {
        if (e instanceof CloudAuthError) {
          // Clear stale token — keep isAuthenticated: true so user only needs
          // to re-tap "Connect" rather than going through full sign-in again.
          iosWebAuthToken.current = null;
          androidAccessToken.current = null;
          setError(
            Platform.OS === 'ios'
              ? 'CloudKit session expired. Tap "Connect iCloud" to reconnect.'
              : 'Google Drive token expired or missing scope. ' +
                'Tap "Sign in with Google" to get a fresh token with Drive access.'
          );
        } else {
          setError(e.message ?? 'Upload failed');
        }
        throw e;
      }
    },
    [buildSdk, setError, setStatus]
  );

  // ── downloadBackup ────────────────────────────────────────────────────────

  const downloadBackup = useCallback(
    async (walletId: string): Promise<CloudEncryptionKeyFile | null> => {
      setStatus('downloading');
      try {
        const sdk = buildSdk(walletId);
        const result = await sdk.downloadEncryptedKey();
        setState((s) => ({
          ...s,
          operationStatus: 'idle',
          backupMetadata: result,
          lastError: null,
        }));
        return result;
      } catch (e: any) {
        if (e instanceof CloudAuthError) {
          iosWebAuthToken.current = null;
          androidAccessToken.current = null;
          setError(
            Platform.OS === 'ios'
              ? 'CloudKit session expired. Tap "Connect iCloud" to reconnect.'
              : 'Google Drive token expired or missing scope. ' +
                'Tap "Sign in with Google" to get a fresh token with Drive access.'
          );
        } else {
          setError(e.message ?? 'Download failed');
        }
        throw e;
      }
    },
    [buildSdk, setError, setStatus]
  );

  // ── deleteBackup ──────────────────────────────────────────────────────────
  //
  // iOS BUG WORKAROUND: SDK's CloudKitProvider sends operationType: "delete"
  // which requires recordChangeTag (never included by the SDK → 400 BAD_REQUEST).
  // Fix: call CloudKit REST API directly with "forceDelete" on iOS.
  // Android: SDK's GoogleDriveProvider.delete() works correctly — no workaround.

  const deleteCloudKitRecordDirectly = useCallback(
    async (walletId: string): Promise<void> => {
      const webToken = iosWebAuthToken.current;
      if (!webToken) {
        throw new Error('Not authenticated. Tap "Connect iCloud" first.');
      }

      const recordName = walletStorageKey(walletId);

      const url =
        `https://api.apple-cloudkit.com/database/1/` +
        `${encodeURIComponent(CLOUDKIT_CONTAINER_ID)}/${CLOUDKIT_ENVIRONMENT}` +
        `/private/records/modify?ckAPIToken=${encodeURIComponent(CLOUDKIT_API_TOKEN)}`;

      const body = {
        operations: [{
          operationType: 'forceDelete',
          record: {
            recordType: 'WalletBackup',
            recordName,
          },
        }],
        zoneID: { zoneName: '_defaultZone' },
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Apple-CloudKit-Web-Auth-Token': webToken,
        },
        body: JSON.stringify(body),
      });

      if (response.status === 404) return;

      if (response.status === 401 || response.status === 403) {
        iosWebAuthToken.current = null;
        setState((s) => ({ ...s, isAuthenticated: false }));
        throw new Error('Session expired. Please reconnect your cloud account.');
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`CloudKit delete failed (${response.status}): ${text.slice(0, 300)}`);
      }

      const result = await response.json().catch(() => null);
      const opResult = result?.records?.[0];
      if (opResult?.reason && opResult?.serverErrorCode) {
        throw new Error(`CloudKit delete failed: ${opResult.serverErrorCode} — ${opResult.reason}`);
      }
    },
    []
  );

  const deleteBackup = useCallback(
    async (walletId: string): Promise<void> => {
      setStatus('deleting');
      try {
        if (Platform.OS === 'ios') {
          await deleteCloudKitRecordDirectly(walletId);
        } else {
          const sdk = buildSdk(walletId);
          await sdk.deleteBackup();
        }
        setState((s) => ({
          ...s,
          operationStatus: 'idle',
          backupMetadata: null,
          lastError: null,
        }));
      } catch (e: any) {
        setError(e.message ?? 'Delete failed');
        throw e;
      }
    },
    [buildSdk, deleteCloudKitRecordDirectly, setError, setStatus]
  );

  // ── checkExists ───────────────────────────────────────────────────────────

  const checkExists = useCallback(
    async (walletId: string): Promise<boolean> => {
      setStatus('checking');
      try {
        const sdk = buildSdk(walletId);
        const exists = await sdk.exists();
        setStatus('idle');
        return exists;
      } catch (e: any) {
        setError(e.message ?? 'Check failed');
        return false;
      }
    },
    [buildSdk, setError, setStatus]
  );

  // ── Context value ─────────────────────────────────────────────────────────

  const value = useMemo<CloudBackupContextValue>(
    () => ({
      ...state,
      checkAccountStatus,
      authenticate,
      signOut,
      uploadBackup,
      downloadBackup,
      deleteBackup,
      checkExists,
    }),
    [
      state,
      checkAccountStatus,
      authenticate,
      signOut,
      uploadBackup,
      downloadBackup,
      deleteBackup,
      checkExists,
    ]
  );

  return (
    <CloudBackupContext.Provider value={value}>
      {children}
      {Platform.OS === 'ios' && (
        <CloudKitAuthWebView
          key={webViewSessionKey}
          visible={webViewVisible}
          containerIdentifier={CLOUDKIT_CONTAINER_ID}
          apiToken={CLOUDKIT_API_TOKEN}
          environment={CLOUDKIT_ENVIRONMENT}
          onTokenReceived={handleWebViewTokenReceived}
          onError={handleWebViewError}
          onClose={handleWebViewClose}
        />
      )}
    </CloudBackupContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCloudBackup(): CloudBackupContextValue {
  const ctx = useContext(CloudBackupContext);
  if (!ctx) {
    throw new Error(
      'useCloudBackup must be called inside <CloudBackupProvider>. ' +
      'Make sure CloudBackupProvider wraps your app in _layout.tsx.'
    );
  }
  return ctx;
}
