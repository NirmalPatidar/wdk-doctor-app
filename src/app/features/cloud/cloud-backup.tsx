// src/app/features/cloud/cloud-backup.tsx
//
// Cloud Backup screen — integrates @tetherto/wdk-backup-cloud.
//
// Per-wallet storage:
//   Each wallet's encrypted mnemonic is stored under its own unique record
//   (CloudKit) or file (Google Drive), derived from the wallet ID via
//   walletStorageKey() in CloudBackupContext. Multiple wallets can coexist
//   in the same iCloud/Drive account without overwriting each other.
//
// Backup flow:
//   1. Read the wallet mnemonic from WDK secure storage
//   2. Encrypt it with AES-256-GCM + scrypt (via @tetherto/wdk-utils, random salt + IV per call)
//   3. Upload the encrypted payload to CloudKit / Google Drive
//
// Restore flow:
//   1. Download the encrypted payload for a given wallet ID
//   2. Decrypt the mnemonic with AES-256-GCM
//   3. Check whether the wallet already exists in local WDK storage
//   4. If not: call restoreWallet(mnemonic, walletId) to recreate it
//   5. The wallet is then visible on the Home screen

import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { useWalletManager } from '@tetherto/wdk-react-native-core';
import { ActionCard } from '@/components/ActionCard';
import { ConsoleOutput } from '@/components/ConsoleOutput';
import { FeatureLayout } from '@/components/FeatureLayout';
import { colors } from '@/constants/colors';
import { useCloudBackup } from '@/context/CloudBackupContext';
// Payload encryption — AES-256-GCM + scrypt via @tetherto/wdk-utils
import {
  encryptPayload,
  decryptPayload,
} from '../../../utils/payloadEncryption';
// ⚠️  DEMO ONLY: EXPO_PUBLIC_* values are inlined as cleartext into the
// shipped JS bundle — the same passphrase is shared by every user of the
// same build. For production, derive a per-user or per-device secret
// (e.g. from a biometric-protected keychain entry) and never bundle it.
const BACKUP_PASSPHRASE = process.env['EXPO_PUBLIC_CLOUD_BACKUP_PASSPHRASE'];

export default function CloudBackupScreen() {
  const {
    isAuthenticated,
    accountEmail,
    operationStatus,
    backupMetadata,
    lastError,
    checkAccountStatus,
    authenticate,
    signOut,
    uploadBackup,
    downloadBackup,
    deleteBackup,
    checkExists,
  } = useCloudBackup();

  const {
    getMnemonic,
    restoreWallet,
    getSeedAndEntropyFromMnemonic,
    getMnemonicFromEntropy,
    wallets,
    activeWalletId,
    lock,
  } = useWalletManager();

  const [deviceStatus, setDeviceStatus] = useState<any>(null);

  // liveStateRef keeps a fresh snapshot of context state for use inside
  // action closures that run asynchronously after state has updated.
  const liveStateRef = useRef({ accountEmail, isAuthenticated, lastError });
  useEffect(() => {
    liveStateRef.current = { accountEmail, isAuthenticated, lastError };
  }, [accountEmail, isAuthenticated, lastError]);

  useEffect(() => {
    checkAccountStatus().then(setDeviceStatus).catch(() => {});
  }, [checkAccountStatus]);

  const providerLabel =
    Platform.OS === 'ios' ? 'Apple CloudKit' : 'Google Drive';

  return (
    <FeatureLayout
      title="Cloud Backup"
      description={`Back up and restore your wallet encryption keys via ${providerLabel}.`}
    >
      {/* ── Live status panel ───────────────────────────────────────────── */}
      <View style={styles.statusSection}>
        <Text style={styles.statusTitle}>Current Status</Text>
        <ConsoleOutput
          data={{
            platform: Platform.OS,
            provider: providerLabel,
            deviceCloudAccount: deviceStatus,
            authenticated: isAuthenticated,
            signedInAs: accountEmail ?? 'Not signed in',
            operationStatus,
            backupSavedAt: backupMetadata?.savedAt ?? 'No backup in memory',
            lastError: lastError ?? 'None',
          }}
        />
      </View>

      {/* ── 1. Check Cloud Account ──────────────────────────────────────── */}
      <ActionCard
        title="1. Check Cloud Account"
        description={`Check ${providerLabel} availability and sign-in state on this device.`}
        fields={[]}
        action={async () => {
          const status = await checkAccountStatus();
          setDeviceStatus(status);
          return status;
        }}
        actionLabel="Check"
      />

      {/* ── 2. Connect ─────────────────────────────────────────────────── */}
      <ActionCard
        title={Platform.OS === 'ios' ? '2. Connect iCloud' : '2. Connect Google Drive'}
        description={
          Platform.OS === 'ios'
            ? 'Sign in with your Apple ID to get a CloudKit web auth token.'
            : 'Sign in with your Google account to authorize Drive access.'
        }
        fields={[]}
        action={async () => {
          const success = await authenticate();
          if (!success) {
            await new Promise((resolve) => setTimeout(resolve, 50));
            throw new Error(
              liveStateRef.current.lastError ??
                'Authentication failed. See status panel above.'
            );
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
          return {
            success: true,
            signedInAs: liveStateRef.current.accountEmail,
          };
        }}
        actionLabel={Platform.OS === 'ios' ? 'Connect iCloud' : 'Sign in with Google'}
      />

      {/* ── 3. Backup Wallet ────────────────────────────────────────────── */}
      <ActionCard
        title="3. Backup Wallet"
        description={
          `Reads the wallet mnemonic, encrypts it with AES-256-GCM, ` +
          `and uploads the encrypted payload to ${providerLabel}. ` +
          `Each wallet is stored under its own unique record — ` +
          `multiple wallets can be backed up independently.`
        }
        fields={[
          {
            id: 'walletId',
            type: 'text',
            label: 'Wallet ID (leave blank for active wallet)',
            placeholder: 'user@example.com',
          },
        ]}
        action={async ({ walletId }) => {
          if (!liveStateRef.current.isAuthenticated) {
            throw new Error('Complete step 2 first.');
          }

          const targetId =
            typeof walletId === 'string' && walletId.trim().length > 0
              ? walletId.trim()
              : activeWalletId;

          if (!targetId) {
            throw new Error(
              'No active wallet. Create or unlock a wallet in ' +
              'Wallet Management first.'
            );
          }

          // Step 1: Read the plaintext mnemonic from WDK secure storage
          const mnemonic = await getMnemonic(targetId);
          if (!mnemonic) {
            throw new Error(
              'Could not read mnemonic. Make sure the wallet is unlocked.'
            );
          }

          // Step 2: Use the WDK's own crypto to produce an encryptionKey
          // and encryptedEntropyBuffer from the mnemonic. These two values
          // together are what is needed to recover the mnemonic on restore.
          // We JSON-encode them into a single string to fit the SDK's
          // CloudEncryptionKeyFile.encryptionKey field (a single string).
          const { encryptionKey, encryptedEntropyBuffer } =
            await getSeedAndEntropyFromMnemonic(mnemonic);

          // Step 3: Encrypt the payload with the passphrase from .env
          // Uses AES-256-GCM + scrypt key derivation from @tetherto/wdk-utils.
          // The entire { encryptionKey, encryptedEntropyBuffer } object is
          // encrypted so nothing meaningful is visible in CloudKit/Drive.
          if (!BACKUP_PASSPHRASE) {
            throw new Error(
              'EXPO_PUBLIC_CLOUD_BACKUP_PASSPHRASE is not set. ' +
              'Add it to your .env file before using cloud backup.'
            );
          }

          const plaintext = JSON.stringify({ encryptionKey, encryptedEntropyBuffer });
          const encryptedPayload = await encryptPayload(plaintext, BACKUP_PASSPHRASE);
          const payload = JSON.stringify(encryptedPayload);
          // DEMO ONLY — encryptionKey+encryptedEntropyBuffer are wallet-recovery
          // material; remove this log before shipping to production.
          if (__DEV__) { console.log(`[BackupWallet]: encrypted payload ready, ${payload.length} bytes`); }

          // Step 4: Upload — stored under wallet-specific record/file name
          const result = await uploadBackup(payload, targetId);

          return {
            success: true,
            walletId: targetId,
            uploadedAt: result?.savedAt ?? 'unknown',
            cloudAccount: result?.cloudEmail ?? 'unknown',
          };
        }}
        actionLabel="Backup"
      />

      {/* ── 4. Restore Wallet ───────────────────────────────────────────── */}
      <ActionCard
        title="4. Restore Wallet"
        description={
          `Downloads the encrypted payload for the given Wallet ID from ` +
          `${providerLabel}, decrypts it, then restores the wallet into ` +
          `local secure storage if it does not already exist. ` +
          `The restored wallet will appear on the Home screen.`
        }
        fields={[
          {
            id: 'walletId',
            type: 'text',
            label: 'Wallet ID to restore',
            placeholder: 'user@example.com',
          },
        ]}
        action={async ({ walletId }) => {
          if (!liveStateRef.current.isAuthenticated) {
            throw new Error('Complete step 2 first.');
          }

          const targetId =
            typeof walletId === 'string' && walletId.trim().length > 0
              ? walletId.trim()
              : null;

          if (!targetId) {
            throw new Error(
              'Please enter the Wallet ID to restore. ' +
              'This is the email you used when creating the wallet.'
            );
          }

          // Check whether this wallet already exists locally
          const alreadyExists = wallets.some(
            (w) => w.identifier === targetId
          );

          if (alreadyExists) {
            return {
              alreadyExists: true,
              walletId: targetId,
              message:
                `Wallet "${targetId}" is already on this device. ` +
                `No restore needed.`,
            };
          }

          // Download the encrypted payload from cloud
          const result = await downloadBackup(targetId);

          if (!result) {
            return {
              found: false,
              walletId: targetId,
              message:
                `No backup found for "${targetId}" in ${providerLabel}. ` +
                `Make sure the correct Wallet ID is entered and that it ` +
                `was previously backed up from this cloud account.`,
            };
          }

          if (!BACKUP_PASSPHRASE) {
            throw new Error(
              'EXPO_PUBLIC_CLOUD_BACKUP_PASSPHRASE is not set. ' +
              'It must match the passphrase used when the backup was created.'
            );
          }

          // Step 1: Decrypt the outer payload with the passphrase
          let plaintext: string;
          try {
            const encryptedPayload = JSON.parse(result.encryptionKey);
            plaintext = await decryptPayload(encryptedPayload, BACKUP_PASSPHRASE);
            // DEMO ONLY — plaintext contains decrypted wallet-recovery material;
            // remove this log before shipping to production.
            if (__DEV__) { console.log(`[RestoreWallet]: decrypted ${plaintext.length} chars`); }
          } catch (e: any) {
            throw new Error(
              `Decryption failed: ${e.message}. ` +
              `Make sure EXPO_PUBLIC_CLOUD_BACKUP_PASSPHRASE matches the ` +
              `value used when the backup was originally created.`
            );
          }

          // Step 2: Decode the decrypted JSON — { encryptionKey, encryptedEntropyBuffer }
          let encryptionKey: string;
          let encryptedEntropyBuffer: string;
          try {
            const parsed = JSON.parse(plaintext);
            encryptionKey = parsed.encryptionKey;
            encryptedEntropyBuffer = parsed.encryptedEntropyBuffer;
            if (!encryptionKey || !encryptedEntropyBuffer) {
              throw new Error('Missing encryptionKey or encryptedEntropyBuffer in payload');
            }
          } catch (e: any) {
            throw new Error(
              `Backup payload is malformed: ${e.message}. ` +
              `This backup may have been created before the encrypted format ` +
              `was introduced — please re-backup the wallet.`
            );
          }

          // Recover the mnemonic using the WDK's own crypto
          let mnemonic: string;
          try {
            const result2 = await getMnemonicFromEntropy(
              encryptedEntropyBuffer,
              encryptionKey
            );
            mnemonic = result2.mnemonic;
          } catch (e: any) {
            throw new Error(
              `Failed to recover mnemonic: ${e.message}. ` +
              `The backup may be corrupted.`
            );
          }

          // Restore the wallet — this recreates it in WDK secure storage
          // and makes it appear on the Home screen.
          //
          // WDK PR #77 breaking change: restoreWallet() now throws if a
          // wallet is already active, instead of silently overwriting the
          // session. If the user currently has a different wallet unlocked
          // while restoring this one, lock it first.
          if (activeWalletId) {
            await lock();
          }
          await restoreWallet(mnemonic, targetId);

          return {
            success: true,
            walletId: targetId,
            restoredAt: new Date().toISOString(),
            backupSavedAt: result.savedAt,
            message:
              `Wallet "${targetId}" restored successfully. ` +
              `It is now listed on the Home screen.`,
          };
        }}
        actionLabel="Restore"
      />

      {/* ── 5. Check Backup Exists ──────────────────────────────────────── */}
      <ActionCard
        title="5. Check Backup Exists"
        description={`Probe whether a backup exists in ${providerLabel} for a given wallet.`}
        fields={[
          {
            id: 'walletId',
            type: 'text',
            label: 'Wallet ID (leave blank for active wallet)',
            placeholder: 'user@example.com',
          },
        ]}
        action={async ({ walletId }) => {
          if (!liveStateRef.current.isAuthenticated) {
            throw new Error('Complete step 2 first.');
          }

          const targetId =
            typeof walletId === 'string' && walletId.trim().length > 0
              ? walletId.trim()
              : activeWalletId;

          if (!targetId) {
            throw new Error('No active wallet and no Wallet ID entered.');
          }

          const exists = await checkExists(targetId);
          return {
            walletId: targetId,
            exists,
            message: exists
              ? `✓ Backup found for "${targetId}" in ${providerLabel}`
              : `✗ No backup found for "${targetId}" in ${providerLabel}`,
          };
        }}
        actionLabel="Check"
      />

      {/* ── 6. Delete Backup ────────────────────────────────────────────── */}
      <ActionCard
        title="6. Delete Backup"
        description={`Permanently remove a wallet's backup from ${providerLabel}. Cannot be undone.`}
        fields={[
          {
            id: 'walletId',
            type: 'text',
            label: 'Wallet ID (leave blank for active wallet)',
            placeholder: 'user@example.com',
          },
        ]}
        action={async ({ walletId }) => {
          if (!liveStateRef.current.isAuthenticated) {
            throw new Error('Complete step 2 first.');
          }

          const targetId =
            typeof walletId === 'string' && walletId.trim().length > 0
              ? walletId.trim()
              : activeWalletId;

          if (!targetId) {
            throw new Error('No active wallet and no Wallet ID entered.');
          }

          await deleteBackup(targetId);
          return {
            success: true,
            walletId: targetId,
            message: `Backup for "${targetId}" permanently deleted.`,
          };
        }}
        actionLabel="Delete"
      />

      {/* ── 7. Sign Out ─────────────────────────────────────────────────── */}
      <ActionCard
        title="7. Sign Out"
        description={
          Platform.OS === 'ios'
            ? 'Clear the CloudKit session tokens from memory.'
            : 'Sign out of Google and clear the Drive access token from memory.'
        }
        fields={[]}
        action={async () => {
          await signOut();
          setDeviceStatus(null);
          return { success: true, message: 'Signed out. Tokens cleared from memory.' };
        }}
        actionLabel="Sign Out"
      />
    </FeatureLayout>
  );
}

const styles = StyleSheet.create({
  statusSection: { marginBottom: 8 },
  statusTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
