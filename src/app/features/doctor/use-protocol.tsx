import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { FeatureLayout } from '@/components/FeatureLayout';
import { ChainSelector } from '@/components/ChainSelector';
import { ActionCard } from '@/components/ActionCard';
import { useTheme } from '@/providers/ThemeProvider';
import type { ColorPalette } from '@/constants/colors';
import { useDoctorWorklet } from '@/providers/DoctorWorkletProvider';
import wdkConfigs from '@/config/doctorRuntime';

export default function UseProtocolScreen() {
  const { rpc, workletStatus, activeWalletId } = useDoctorWorklet();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [network, setNetwork] = useState(Object.keys(wdkConfigs.networks)[0]);
  const [accountIndexInput, setAccountIndexInput] = useState('0');
  const workletReady = workletStatus === 'ready';

  const callMethod = async (methodName: string, args: unknown[] = [], options?: unknown) => {
    if (!rpc) throw new Error('Worklet is not ready yet');
    const accountIndex = parseInt(accountIndexInput, 10) || 0;
    const response = await rpc.callMethod({
      methodName,
      network,
      accountIndex,
      ...(args.length > 0 ? { args: JSON.stringify(args) } : {}),
      ...(options !== undefined ? { options: JSON.stringify(options) } : {}),
    });
    try {
      return JSON.parse(response.result);
    } catch {
      return response.result;
    }
  };

  return (
    <FeatureLayout
      title="Use Protocol"
      description="Call protocol methods (swap, bridge, lending, fiat, swidge) on a configured network."
    >
      <View style={styles.warningBanner}>
        <Text style={styles.warningBannerTitle}>Not yet exercised through this app — but a real, safe path exists</Text>
        <Text style={styles.warningBannerText}>
          No protocol has ever been configured in doctor.runtime.json or called through this
          app's RPC layer specifically — that part is still true. But @tetherto/wdk-protocol-lending-aave-evm
          (Aave V3 lending) is real, published, and its getAccountData() method is genuinely safe
          to test with zero funds at risk: it's a pure read (collateral, debt, health factor),
          confirmed from Tether's own official API docs, not a guess. supply/withdraw/borrow/repay
          are real methods too, but need actual token balances on a live network — Aave V3 has no
          confirmed testnet deployment, so those specifically carry the same real-funds caution as
          anything on mainnet. See TESTING_YOUR_PACKAGE.md for the exact config and a concrete
          first call to try.{'\n\n'}
          Still unconfirmed: whether "options" (below) is how a specific protocol implementation
          gets selected for a call at the RPC layer, or whether that happens some other way —
          this app's own wiring for a protocol call hasn't been tried yet, even with Aave.
        </Text>
      </View>

      <ChainSelector selectedChain={network} onSelectChain={setNetwork} label="Network" />

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

      {activeWalletId === null && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningBannerText}>
            No wallet is active. Protocol calls likely need one, the same way account and module
            calls do — unconfirmed here specifically, since nothing has been tested, but assume
            it applies until shown otherwise.
          </Text>
        </View>
      )}

      <View key={network}>
        <ActionCard
          title="Call Protocol Method"
          description={
            'No common protocol method set has been confirmed callable this way. Known protocol ' +
            'type interfaces from wdk-wallet\'s source (for reference, not confirmed callable ' +
            'through this exact path): IBridgeProtocol has bridge/quoteBridge. Swap, lending, ' +
            'fiat, and swidge protocol types also exist per wdk-core\'s registerProtocol pattern, ' +
            'but their method names were not independently confirmed this session.'
          }
          fields={[
            { id: 'methodName', type: 'text', label: 'Method Name', placeholder: 'e.g. bridge, quoteBridge' },
            { id: 'args', type: 'json', label: 'Arguments (JSON array, optional)', placeholder: '[{"amount": "100"}]' },
            { id: 'options', type: 'json', label: 'Options (JSON object, optional — see warning above)', placeholder: '{"protocol": "paraswap"}' },
          ]}
          action={(v) =>
            callMethod(
              v.methodName,
              v.args ? JSON.parse(v.args) : [],
              v.options ? JSON.parse(v.options) : undefined
            )
          }
          actionLabel="Invoke"
        />
      </View>
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
    warningBannerTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.warning,
      marginBottom: 6,
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
