import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { FeatureLayout } from '@/components/FeatureLayout';
import { ChainSelector } from '@/components/ChainSelector';
import { ActionCard } from '@/components/ActionCard';
import { useTheme } from '@/providers/ThemeProvider';
import type { ColorPalette } from '@/constants/colors';
import { useDoctorWorklet } from '@/providers/DoctorWorkletProvider';
import wdkConfigs from '@/config/doctorRuntime';

export default function UseAccountScreen() {
  const { rpc, workletStatus, activeWalletId } = useDoctorWorklet();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [network, setNetwork] = useState(Object.keys(wdkConfigs.networks)[0]);
  const [accountIndexInput, setAccountIndexInput] = useState('0');
  const workletReady = workletStatus === 'ready';

  // Shared by every card below, rather than each card asking for network +
  // index again — matches how the network/index picker worked in the
  // earlier combined explorer, just applied per-screen now.
  const callMethod = async (methodName: string, args: unknown[] = []) => {
    if (!rpc) throw new Error('Worklet is not ready yet');
    const accountIndex = parseInt(accountIndexInput, 10) || 0;
    const response = await rpc.callMethod({
      methodName,
      network,
      accountIndex,
      // Omit entirely for no-arg methods rather than send an empty string —
      // matches the wire schema's args being genuinely optional.
      ...(args.length > 0 ? { args: JSON.stringify(args) } : {}),
    });
    // callMethod is a generic dispatcher — its `result` field is always a
    // JSON-stringified wrapper around whatever the underlying method
    // actually returned (a plain string for sign/getAddress, a boolean for
    // verify, an object for getTokenBalance, etc.), since the wire protocol
    // can't know the return type ahead of time. This is a transport detail,
    // not the real shape of the data — parsing it here recovers the exact
    // same clean value the showcase app's own hooks would already hand back
    // directly, since those never pass through this generic wrapper at all.
    try {
      return JSON.parse(response.result);
    } catch {
      // Defensive fallback only — if this specific response genuinely isn't
      // valid JSON, show the raw string rather than crash the card.
      return response.result;
    }
  };

  return (
    <FeatureLayout
      title="Use Account"
      description="Pick a network and account index, then call any method below — common methods work the same way on every network; network-specific ones only appear where they actually apply."
    >
      <ChainSelector selectedChain={network} onSelectChain={setNetwork} label="Network" />

      {activeWalletId === null && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningBannerText}>
            No wallet is active — every method below needs one. "Worklet Ready" only means the
            worklet process started; it doesn't mean a wallet has been initialized inside it.
            Create or unlock one from Wallet Management first, then come back here.
          </Text>
        </View>
      )}

      <View style={styles.indexField}>
        <Text style={styles.label}>Account Index</Text>
        <TextInput
          style={styles.input}
          value={accountIndexInput}
          onChangeText={setAccountIndexInput}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      {/* ---- Universal methods ---- */}
      {/* Confirmed directly against wdk-wallet's shared base account class —
          every network implements these by inheritance, so no per-network
          filtering needed for this group. */}

      <ActionCard
        title="Get Balance"
        description="Returns this account's native balance. No arguments."
        fields={[]}
        action={() => callMethod('getBalance')}
        actionLabel="Get Balance"
      />

      <ActionCard
        title="Get Address"
        description="Returns this account's address. No arguments."
        fields={[]}
        action={() => callMethod('getAddress')}
        actionLabel="Get Address"
      />

      <ActionCard
        title="Get Token Balance"
        description="Returns this account's balance for a specific token contract."
        fields={[{ id: 'tokenAddress', type: 'text', label: 'Token Address', placeholder: '0x... or contract address' }]}
        action={(v) => callMethod('getTokenBalance', [v.tokenAddress])}
        actionLabel="Get Token Balance"
      />

      <ActionCard
        title="Sign Message"
        description="Signs a UTF-8 message with the account's private key."
        fields={[{ id: 'message', type: 'text', label: 'Message', placeholder: 'Hello, world!' }]}
        action={(v) => callMethod('sign', [v.message])}
        actionLabel="Sign"
      />

      <ActionCard
        title="Verify Signature"
        description="Verifies a signature against a message."
        fields={[
          { id: 'message', type: 'text', label: 'Original Message' },
          { id: 'signature', type: 'text', label: 'Signature' },
        ]}
        action={(v) => callMethod('verify', [v.message, v.signature])}
        actionLabel="Verify"
      />

      <ActionCard
        title="Send Transaction"
        description="Sends a native transaction. Confirmed shape is generic (to, value) — some networks may expect additional fields; if this errors, check that network's own transfer screen behavior for comparison."
        fields={[
          { id: 'to', type: 'text', label: 'To Address' },
          { id: 'value', type: 'text', label: 'Value (base units)' },
        ]}
        action={(v) => callMethod('sendTransaction', [{ to: v.to, value: v.value }])}
        actionLabel="Send Transaction"
      />

      <ActionCard
        title="Quote Send Transaction"
        description="Same shape as Send Transaction — returns a quote (fees/estimate) without broadcasting."
        fields={[
          { id: 'to', type: 'text', label: 'To Address' },
          { id: 'value', type: 'text', label: 'Value (base units)' },
        ]}
        action={(v) => callMethod('quoteSendTransaction', [{ to: v.to, value: v.value }])}
        actionLabel="Quote"
      />

      <ActionCard
        title="Transfer"
        description="Transfers a token. Confirmed shape is generic (recipient, amount, optional token) — some networks need extra options (e.g. paymasterToken on EVM ERC-4337); leave Token blank for native transfers."
        fields={[
          { id: 'recipient', type: 'text', label: 'Recipient' },
          { id: 'amount', type: 'text', label: 'Amount (base units)' },
          { id: 'token', type: 'text', label: 'Token (optional)', placeholder: 'leave blank for native' },
        ]}
        action={(v) => callMethod('transfer', [{
          recipient: v.recipient,
          amount: v.amount,
          ...(v.token ? { token: v.token } : {}),
        }])}
        actionLabel="Transfer"
      />

      <ActionCard
        title="Quote Transfer"
        description="Same shape as Transfer — returns a quote without broadcasting."
        fields={[
          { id: 'recipient', type: 'text', label: 'Recipient' },
          { id: 'amount', type: 'text', label: 'Amount (base units)' },
          { id: 'token', type: 'text', label: 'Token (optional)', placeholder: 'leave blank for native' },
        ]}
        action={(v) => callMethod('quoteTransfer', [{
          recipient: v.recipient,
          amount: v.amount,
          ...(v.token ? { token: v.token } : {}),
        }])}
        actionLabel="Quote"
      />

      <ActionCard
        title="Sign Transaction"
        description="Confirmed to exist on every account (wdk-wallet's base IWalletAccount interface), but its transaction shape is generic per-network — no concrete fields confirmed, so this takes raw JSON args instead of named fields."
        fields={[{ id: 'args', type: 'json', label: 'Arguments (JSON array)', placeholder: '[{"to": "...", "value": "..."}]' }]}
        action={(v) => callMethod('signTransaction', v.args ? JSON.parse(v.args) : [])}
        actionLabel="Sign Transaction"
      />

      {/* ---- Network-specific methods ---- */}
      {/* getStaticDepositAddress genuinely doesn't exist outside Spark —
          confirmed absent from the shared base class entirely, not just
          untested elsewhere. Hidden rather than shown-and-erroring. */}
      {network === 'spark' && (
        <ActionCard
          title="Get Static Deposit Address"
          description="Spark-specific extension method. No arguments."
          fields={[]}
          action={() => callMethod('getStaticDepositAddress')}
          actionLabel="Get Deposit Address"
        />
      )}

      {/* ---- Anything not covered above ---- */}
      <ActionCard
        title="Custom Method"
        description="Call any method by name — for anything not covered by the cards above, or a package-specific method this screen doesn't know about yet."
        fields={[
          { id: 'methodName', type: 'text', label: 'Method Name', placeholder: 'e.g. getTransactionReceipt' },
          { id: 'args', type: 'json', label: 'Arguments (JSON array, optional)', placeholder: '["arg1", "arg2"]' },
        ]}
        action={(v) => callMethod(v.methodName, v.args ? JSON.parse(v.args) : [])}
        actionLabel="Invoke"
      />
    </FeatureLayout>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    warningBanner: {
      backgroundColor: colors.warningBackground,
      borderWidth: 1,
      borderColor: colors.warningBorder,
      borderRadius: 12,
      padding: 14,
      marginBottom: 20,
    },
    warningBannerText: {
      fontSize: 13,
      color: colors.warning,
      lineHeight: 19,
    },
    indexField: {
      marginBottom: 20,
    },
    label: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 8,
      fontWeight: '500',
    },
    input: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 16,
      color: colors.text,
      fontSize: 16,
    },
  });
}
