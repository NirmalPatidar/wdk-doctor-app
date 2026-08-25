import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useWalletManager } from '@tetherto/wdk-react-native-core';
import { ActionCard } from '@/components/ActionCard';
import { FeatureLayout } from '@/components/FeatureLayout';
import { ConsoleOutput } from '@/components/ConsoleOutput';
import { colors } from '@/constants/colors';

export default function ManageAccountScreen() {
  const { 
    createWallet,
    deleteWallet,
    getMnemonic,
    wallets,
    activeWalletId,
    status,
    unlock,
    restoreWallet,
    createTemporaryWallet,
    lock,
    generateMnemonic,
    clearTemporaryWallet
  } = useWalletManager();

  return (
    <FeatureLayout 
      title="Wallet Management" 
      description="Create, import, and manage your wallets."
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Current Wallet Status</Text>
        <ConsoleOutput data={{ 
          status,
          activeWalletId: activeWalletId || 'None',
          availableWallets: wallets
        }} />
      </View>

      <ActionCard
        title="Create New Wallet"
        description="Generates a new seed phrase and saves it securely (requires biometrics)."
        fields={[
          { id: 'walletId', type: 'text', label: 'Wallet ID (Email)', placeholder: 'user@example.com' }
        ]}
        action={async ({ walletId }) => {
          await createWallet(walletId);
          return { success: true, message: `Wallet ${walletId} created` };
        }}
        actionLabel="Create Wallet"
      />

      <ActionCard
        title="Unlock Wallet"
        description="Unlock a wallet to start using it"
        fields={[
          { id: 'walletId', type: 'text', label: 'Wallet ID', placeholder: 'user@example.com' }
        ]}
        action={async ({ walletId }) => {
          await unlock(walletId);
          return { success: true, message: `Loaded wallet ${walletId}` };
        }}
        actionLabel="Load Wallet"
      />

      <ActionCard
        title="Import from Mnemonic"
        description="Restore a wallet using a 12 or 24 word seed phrase."
        fields={[
          { id: 'walletId', type: 'text', label: 'Wallet ID (Email)', placeholder: 'user@example.com' },
          { id: 'mnemonic', type: 'json', label: 'Seed Phrase', placeholder: 'word1 word2 ... word12' }
        ]}
        action={async ({ walletId, mnemonic }) => {
          await restoreWallet(mnemonic, walletId);
          return { success: true, message: `Wallet ${walletId} imported` };
        }}
        actionLabel="Import Wallet"
      />

      <ActionCard
        title="Generate Mnemonic"
        description="Generates a new seed phrase."
        fields={[]}
        action={async () => {
          const phrase = await generateMnemonic();
          return { mnemonic: phrase };
        }}
        actionLabel="Generate"
      />

      <ActionCard
        title="Create Temporary Wallet"
        description="Create a throwaway wallet for testing (not saved to storage)."
        fields={[]}
        action={async () => {
          await createTemporaryWallet('temp-wallet');
          return { success: true, message: "Temporary wallet active" };
        }}
        actionLabel="Create Temp Wallet"
      />

      <ActionCard
        title="Clear Temporary Wallet"
        description="Clears the temporary wallet session from memory."
        fields={[]}
        action={async () => {
          clearTemporaryWallet();
          return { success: true, message: "Temporary wallet cleared" };
        }}
        actionLabel="Clear"
      />

      <ActionCard
        title="Reveal Mnemonic"
        description="Decrypt and show the seed phrase for a wallet."
        fields={[
          { id: 'walletId', type: 'text', label: 'Wallet ID', placeholder: 'user@example.com (Optional if active)' }
        ]}
        action={async ({ walletId }) => {
          const targetWalletId = walletId || activeWalletId;
          if (!targetWalletId) {
            return { error: 'Please specify a Wallet ID or have an active wallet selected.' };
          }
          const phrase = await getMnemonic(targetWalletId);
          return { mnemonic: phrase };
        }}
        actionLabel="Reveal Phrase"
      />

      <ActionCard
        title="Lock Wallet"
        description="Locks the active wallet, clearing sensitive data from memory."
        fields={[]}
        action={async () => {
          // lock() now returns Promise<void> (WDK PR #77) — must be awaited
          // so the mutex-protected operation actually completes before this
          // screen reports success.
          await lock();
          return { success: true, message: "Wallet locked" };
        }}
        actionLabel="Lock"
      />

      <ActionCard
        title="Delete Wallet"
        description="Permanently remove a wallet from secure storage."
        fields={[
          { id: 'walletId', type: 'text', label: 'Wallet ID to Delete', placeholder: 'user@example.com' }
        ]}
        action={async ({ walletId }) => {
          await deleteWallet(walletId);
          return { success: true, message: `Wallet ${walletId} deleted` };
        }}
        actionLabel="Delete Wallet"
      />
    </FeatureLayout>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
});