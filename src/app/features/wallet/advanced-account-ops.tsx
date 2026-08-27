import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAccount } from '@tetherto/wdk-react-native-core';
import type { WalletAccountSpark } from '@tetherto/wdk-wallet-spark';
import { ActionCard } from '@/components/ActionCard';
import { FeatureLayout } from '@/components/FeatureLayout';
import { ConsoleOutput } from '@/components/ConsoleOutput';
import { colors } from '@/constants/colors';

export default function AdvancedAccountOpsScreen() {
  const account = useAccount<WalletAccountSpark>({
    network: 'spark',
    accountIndex: 0
  });
  const extension = account.extension()

  return (
    <FeatureLayout
      title="Wallet Account Lookup"
      description="Look up a specific account by network and index to interact with it."
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account Details</Text>
        <Text style={styles.sectionSubtitle}>
          Derived from network "spark" at index {0}
        </Text>
        <ConsoleOutput data={{
          address: account.address,
          account: account.account
        }} />
      </View>

      <ActionCard
        title="Sign Message"
        description="Signs a UTF-8 message with the account's private key."
        fields={[
          { id: 'message', type: 'text', label: 'Message to Sign', placeholder: 'Hello, world!' }
        ]}
        action={async ({ message }) => {
          const signature = await account.sign(message);
          return { signature };
        }}
        actionLabel="Sign"
      />
      
      <ActionCard
        title="Verify Signature"
        description="Verifies a signature against a message."
        fields={[
          { id: 'message', type: 'text', label: 'Original Message' },
          { id: 'signature', type: 'text', label: 'Signature' },
        ]}
        action={async ({ message, signature }) => {
          const isValid = await account.verify(message, signature);
          return { isValid };
        }}
        actionLabel="Verify"
      />

      <ActionCard
        title="Get Static Deposit Address"
        description="An example of advanced use case requiring network-specific method."
        fields={[]}
        action={async () => {
          const depositAddress = await extension.getStaticDepositAddress();
          return { depositAddress };
        }}
        actionLabel="Get Static Deposit Address"
      />
    </FeatureLayout>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 24,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
});
