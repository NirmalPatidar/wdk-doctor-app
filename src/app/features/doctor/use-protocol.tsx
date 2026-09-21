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
    try {
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
    } catch (err: any) {
      const message = err?.message ?? String(err);
      // This exact error text means registration silently no-op'd rather
      // than throwing (confirmed from @tetherto/wdk's registerProtocol
      // source — its instanceof type-check chain has no final else) — the
      // overwhelmingly likely cause, confirmed multiple times against real
      // protocol packages, is that this protocol's own package pins a
      // different @tetherto/wdk-wallet version than the rest of the app's
      // dependency tree resolved to, so the protocol's base class and the
      // one @tetherto/wdk checks against are two separate module
      // instances. Enriching the message here rather than replacing it,
      // so the original error is still visible for anyone who wants it.
      const match = /No \w+ protocol registered for label: ([\w-]+)/.exec(message);
      if (match) {
        const label = match[1];
        throw new Error(
          `${message}\n\n` +
          `Likely cause: a duplicate @tetherto/wdk-wallet install inside "${label}"'s own package — a known issue affecting every wdk-protocol-* package (each pins an old, exact wdk-wallet version instead of a range). Run "npm ls @tetherto/wdk-wallet" and check for a version under "${label}" that isn't deduped with the rest of the tree, or shows "invalid".\n\n` +
          `Confirmed fix: add to package.json — "overrides": {"@tetherto/wdk-wallet": "<range matching what @tetherto/wdk itself declares, e.g. ^1.0.0-beta.15>"}. Use a range, not another exact pin — a pin breaks again on the next registry update; the range self-heals.`
        );
      }
      throw err;
    }
  };

  return (
    <FeatureLayout
      title="Use Protocol"
      description="Call protocol methods (swap, bridge, lending, fiat, swidge) on a configured network."
    >
      <View style={styles.warningBanner}>
        <Text style={styles.warningBannerTitle}>Confirmed working — real data back from a live network</Text>
        <Text style={styles.warningBannerText}>
          @tetherto/wdk-protocol-lending-aave-evm (Aave V3 lending) is wired in and confirmed
          working end to end: real data back from Aave's contract on Sepolia via getAccountData.
          Config is correct at every level this app controls (wdk.config.js's protocols entry,
          doctor.runtime.json's protocolName/blockchain/config fields, and callMethod's
          protocolType/protocolName options routing — pass "options":
          {'{'}"protocolType": "lending", "protocolName": "aave"{'}'} alongside a normal
          methodName; the handler swaps the plain account for account.getLendingProtocol("aave")
          before calling your method on it).{'\n\n'}
          Getting it working needed one thing outside this app's own config: every wdk-protocol-*
          package pins an outdated @tetherto/wdk-wallet version, which breaks an internal instanceof
          type check the moment the app's dependency tree has already converged on a newer one —
          registration succeeds with no error, but the protocol was never actually attached, so
          calling it fails with "No lending protocol registered for label: aave". Fixed here via a
          package.json override pinning @tetherto/wdk-wallet to a range (not an exact version —
          that breaks again on the next registry update). See this screen's own error handling below
          for the same guidance if you hit this with a different protocol.
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
            No wallet is active. Protocol calls need one, the same way account and module calls do —
            confirmed directly from the callMethod handler's source (it fetches the account first,
            regardless of protocolType/protocolName).
          </Text>
        </View>
      )}

      <View key={network}>
        {network === 'ethereum' ? (
          <ActionCard
            title="Get Account Data (Aave)"
            description="Confirmed working — a pure read, no gas, no funds needed. Returns collateral, debt, and health-factor data for this account on Aave (likely all zeros/max-health-factor for a fresh wallet, which is the correct response, not an error)."
            fields={[]}
            action={() => callMethod('getAccountData', [], { protocolType: 'lending', protocolName: 'aave' })}
            actionLabel="Get Account Data"
          />
        ) : (
          <View style={styles.warningBanner}>
            <Text style={styles.warningBannerText}>
              Aave is only registered against the "ethereum" network in doctor.runtime.json —
              select Ethereum above to use the Get Account Data card.
            </Text>
          </View>
        )}

        <ActionCard
          title="Call Protocol Method"
          description="Any other method, on any configured protocol. protocolType must be one of swap/bridge/lending/fiat/swidge — confirmed as the complete, fixed set from the callMethod handler's own source, not inferred."
          fields={[
            { id: 'methodName', type: 'text', label: 'Method Name', placeholder: 'e.g. supply, quoteSupply' },
            { id: 'args', type: 'json', label: 'Arguments (JSON array, optional)', placeholder: '[{"token": "0x...", "amount": 1000000}]' },
            { id: 'options', type: 'json', label: 'Options (JSON object — protocolType + protocolName)', placeholder: '{"protocolType": "lending", "protocolName": "aave"}' },
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
