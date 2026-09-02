/**
 * WDK Doctor — Account / Module / Protocol Explorer
 *
 * Generic UI around useAccount, useModule, and useProtocol.
 *
 * Field strategy: @tetherto/wdk-react-native-core's DefaultAccountMethods type
 * (types/accountMethods.ts) is the one place a full, confirmed parameter
 * schema exists — so the Account tab renders real named fields per method
 * (no JSON typing at all for any of the 10 known methods). Module and
 * Protocol methods have no such schema anywhere (checked the wire-level HRPC
 * schema directly — no listMethods endpoint, no per-method shapes published),
 * so those stay free-text with a mobile-friendly comma-separated args parser
 * instead of requiring JSON brackets/quotes.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useAccount, useModule, useProtocol } from '@tetherto/wdk-react-native-core';
import { ActionCard } from '@/components/ActionCard';
import { FeatureLayout } from '@/components/FeatureLayout';
import { ConsoleOutput } from '@/components/ConsoleOutput';
import { ChainSelector } from '@/components/ChainSelector';
import { colors } from '@/constants/colors';
import wdkConfigs from '@/config/doctorRuntime';

// useAccount<T>().extension(), useModule<T>(), and useProtocol<T>() are all
// Record-shaped Proxies at runtime — any string key resolves to a callable
// RPC method. Typing them this way keeps dynamic method-name lookups
// type-safe with no `as any` needed anywhere below.
type GenericMethods = Record<string, (...args: unknown[]) => Promise<unknown>>;

/** A single input field rendered for a known method's parameters. */
interface MethodFieldSpec {
  id: string;
  label: string;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
}

/** A known, fully-specified method: real fields, no JSON required. */
/** A known, fully-specified method: real fields, no JSON required. */
interface MethodSpec {
  id: string;
  label: string;
  description?: string;
  fields: MethodFieldSpec[];
  buildArgs: (values: Record<string, string>) => unknown[];
  // Omit entirely for methods confirmed universal (getBalance, getAddress, sign,
  // verify, sendTransaction, transfer, quoteSendTransaction, quoteTransfer,
  // signTransaction — all defined on wdk-wallet's shared base account class, so
  // every network implements them). Set this only for methods confirmed to exist
  // on just some networks (e.g. getStaticDepositAddress is Spark-only — absent
  // from the base class entirely, confirmed via the worklet's own "method not
  // found" error). When set, the method is hidden from the picker unless the
  // currently selected network is in this list.
  networks?: string[];
}

const CUSTOM_METHOD_ID = '__custom__';

// Parses "0x123..., 100, true" into ['0x123...', 100, true] — no brackets or
// quotes needed on a mobile keyboard. Still accepts a full JSON array
// (starting with '[') for anyone who wants to pass nested objects.
function parseFriendlyArgs(raw: string): unknown[] {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error('Could not parse as a JSON array — check brackets and quotes.');
    }
    if (!Array.isArray(parsed)) throw new Error('JSON input must be an array.');
    return parsed;
  }
  return trimmed.split(',').map((token) => {
    const v = token.trim();
    if (v === '') return '';
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === 'null') return null;
    if (v !== '' && !Number.isNaN(Number(v))) return Number(v);
    return v;
  });
}

// Confirmed directly from @tetherto/wdk-react-native-core's
// DefaultAccountMethods type — same shape for every network.
const ACCOUNT_METHOD_SPECS: MethodSpec[] = [
  {
    id: 'getBalance',
    label: 'getBalance',
    description: 'Returns this account\'s native balance. No arguments.',
    fields: [],
    buildArgs: () => [],
  },
  {
    id: 'getAddress',
    label: 'getAddress',
    description: 'Returns this account\'s address. No arguments.',
    fields: [],
    buildArgs: () => [],
  },
  {
    id: 'getTokenBalance',
    label: 'getTokenBalance',
    fields: [{ id: 'tokenAddress', label: 'Token Address', placeholder: '0x...' }],
    buildArgs: (v) => [v.tokenAddress],
  },
  {
    id: 'getTokenBalances',
    label: 'getTokenBalances',
    fields: [{ id: 'tokenAddresses', label: 'Token Addresses (comma-separated)', placeholder: '0xabc..., 0xdef...' }],
    buildArgs: (v) =>
      (v.tokenAddresses ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
  },
  {
    id: 'sign',
    label: 'sign',
    fields: [{ id: 'message', label: 'Message', placeholder: 'Hello, world!' }],
    buildArgs: (v) => [v.message],
  },
  {
    id: 'signTransaction',
    label: 'signTransaction',
    description:
      'Confirmed to exist on every account (wdk-wallet\'s base IWalletAccount interface), but its ' +
      'transaction shape is generic per-network — no concrete fields confirmed, so args stay free-form.',
    fields: [{ id: 'args', label: 'Arguments (comma-separated, or [a full JSON array])', placeholder: '' }],
    buildArgs: (v) => parseFriendlyArgs(v.args ?? ''),
  },
  {
    id: 'verify',
    label: 'verify',
    fields: [
      { id: 'message', label: 'Message' },
      { id: 'signature', label: 'Signature' },
    ],
    buildArgs: (v) => [v.message, v.signature],
  },
  {
    id: 'sendTransaction',
    label: 'sendTransaction',
    description: '"from" is implicit — it\'s this account. Only "to" and "value" are needed.',
    fields: [
      { id: 'to', label: 'To (recipient address)', placeholder: '0x...' },
      { id: 'value', label: 'Value (base units)', placeholder: '100000000000000000', keyboardType: 'numeric' },
    ],
    buildArgs: (v) => [{ to: v.to, value: v.value }],
  },
  {
    id: 'quoteSendTransaction',
    label: 'quoteSendTransaction',
    description: 'Same shape as sendTransaction — returns an estimated fee instead of sending.',
    fields: [
      { id: 'to', label: 'To (recipient address)', placeholder: '0x...' },
      { id: 'value', label: 'Value (base units)', placeholder: '100000000000000000', keyboardType: 'numeric' },
    ],
    buildArgs: (v) => [{ to: v.to, value: v.value }],
  },
  {
    id: 'transfer',
    label: 'transfer',
    description: 'Token transfer — recipient, amount, and the token\'s contract address.',
    fields: [
      { id: 'recipient', label: 'Recipient', placeholder: '0x...' },
      { id: 'amount', label: 'Amount (base units)', placeholder: '100000', keyboardType: 'numeric' },
      { id: 'token', label: 'Token Address', placeholder: '0x...' },
    ],
    buildArgs: (v) => [{ recipient: v.recipient, amount: v.amount, token: v.token }],
  },
  {
    id: 'quoteTransfer',
    label: 'quoteTransfer',
    description: 'Same shape as transfer — returns an estimated fee instead of sending.',
    fields: [
      { id: 'recipient', label: 'Recipient', placeholder: '0x...' },
      { id: 'amount', label: 'Amount (base units)', placeholder: '100000', keyboardType: 'numeric' },
      { id: 'token', label: 'Token Address', placeholder: '0x...' },
    ],
    buildArgs: (v) => [{ recipient: v.recipient, amount: v.amount, token: v.token }],
  },
  {
    id: 'getStaticDepositAddress',
    label: 'getStaticDepositAddress',
    description: 'Confirmed network-specific extension method (see advanced-account-ops.tsx). No arguments.',
    fields: [],
    buildArgs: () => [],
    networks: ['spark'],
  },
];

const CUSTOM_METHOD_SPEC: MethodSpec = {
  id: CUSTOM_METHOD_ID,
  label: 'Custom…',
  description: 'For anything not listed — no confirmed shape, so arguments are free-form.',
  fields: [
    { id: 'customMethodName', label: 'Method Name', placeholder: 'yourMethodName' },
    { id: 'args', label: 'Arguments (comma-separated, or [a full JSON array])', placeholder: '0x123..., 100' },
  ],
  buildArgs: (v) => parseFriendlyArgs(v.args ?? ''),
};

/**
 * Renders a method picker plus whichever real fields that method needs.
 * Switching methods resets the field values so nothing stale leaks into
 * the next call.
 */
function MethodInvokerCard({
  title,
  description,
  methodSpecs,
  onInvoke,
  currentNetwork,
}: {
  title: string;
  description?: string;
  methodSpecs: MethodSpec[];
  onInvoke: (methodName: string, args: unknown[]) => Promise<unknown>;
  // When provided, methods with a `networks` restriction are hidden unless
  // currentNetwork is in that list. Methods with no restriction always show.
  currentNetwork?: string;
}) {
  const visibleSpecs = currentNetwork
    ? methodSpecs.filter((spec) => !spec.networks || spec.networks.includes(currentNetwork))
    : methodSpecs;
  const options = [...visibleSpecs, CUSTOM_METHOD_SPEC];
  const [selectedId, setSelectedId] = useState(options[0].id);
  const selected = options.find((o) => o.id === selectedId) ?? options[0];

  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setValues({});
    setResult(undefined);
    setError(null);
  };

  // If the previously-selected method is no longer visible (e.g. it was
  // getStaticDepositAddress and the network just changed away from Spark),
  // fall back to the first visible option explicitly rather than relying on
  // the `?? options[0]` fallback below alone — that fallback prevents a
  // crash, but silently, with no pill showing as selected. This keeps the
  // visible state consistent with what's actually about to be invoked.
  useEffect(() => {
    if (!options.some((o) => o.id === selectedId)) {
      handleSelect(options[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNetwork]);

  const updateValue = (id: string, v: string) => setValues((prev) => ({ ...prev, [id]: v }));

  const handleInvoke = async () => {
    setLoading(true);
    setResult(undefined);
    setError(null);
    try {
      const methodName =
        selected.id === CUSTOM_METHOD_ID ? values.customMethodName?.trim() : selected.id;
      if (!methodName) throw new Error('Method name is required');
      const args = selected.buildArgs(values);
      const res = await onInvoke(methodName, args);
      setResult(res);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {description && <Text style={styles.cardDescription}>{description}</Text>}

      {options.length > 1 && (
        <>
          <Text style={styles.label}>Method</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.pill, selectedId === opt.id && styles.pillActive]}
                onPress={() => handleSelect(opt.id)}
              >
                <Text style={[styles.pillText, selectedId === opt.id && styles.pillTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      {selected.description && <Text style={styles.methodHint}>{selected.description}</Text>}

      {selected.fields.map((f) => (
        <View key={f.id} style={styles.fieldContainer}>
          <Text style={styles.label}>{f.label}</Text>
          <TextInput
            style={styles.input}
            value={values[f.id] ?? ''}
            onChangeText={(t) => updateValue(f.id, t)}
            placeholder={f.placeholder}
            placeholderTextColor={colors.textSecondary}
            keyboardType={f.keyboardType ?? 'default'}
            autoCapitalize="none"
          />
        </View>
      ))}

      {selected.fields.length === 0 && selected.id !== CUSTOM_METHOD_ID && (
        <Text style={styles.noArgsHint}>This method takes no arguments.</Text>
      )}

      <TouchableOpacity style={styles.button} onPress={handleInvoke} disabled={loading}>
        {loading ? <ActivityIndicator color={colors.black} /> : <Text style={styles.buttonText}>Invoke</Text>}
      </TouchableOpacity>

      {(result !== undefined || error !== null) && <ConsoleOutput data={result ?? error} error={!!error} />}
    </View>
  );
}

function NetworkAndIndexPicker({
  network,
  onNetworkChange,
  accountIndexStr,
  onAccountIndexChange,
}: {
  network: string;
  onNetworkChange: (v: string) => void;
  accountIndexStr: string;
  onAccountIndexChange: (v: string) => void;
}) {
  return (
    <>
      <ChainSelector selectedChain={network} onSelectChain={onNetworkChange} />
      <View style={styles.fieldContainer}>
        <Text style={styles.label}>Account Index</Text>
        <TextInput
          style={styles.input}
          value={accountIndexStr}
          onChangeText={onAccountIndexChange}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={colors.textSecondary}
        />
      </View>
    </>
  );
}

function AccountExplorer() {
  const [network, setNetwork] = useState<string>(Object.keys(wdkConfigs.networks)[0]);
  const [accountIndexStr, setAccountIndexStr] = useState('0');
  const parsedIndex = parseInt(accountIndexStr, 10);
  const accountIndex = Number.isFinite(parsedIndex) ? parsedIndex : 0;

  const account = useAccount<GenericMethods>({ network, accountIndex });

  return (
    <>
      <NetworkAndIndexPicker
        network={network}
        onNetworkChange={setNetwork}
        accountIndexStr={accountIndexStr}
        onAccountIndexChange={setAccountIndexStr}
      />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account State</Text>
        <ConsoleOutput
          data={{
            network,
            accountIndex,
            address: account.address,
            isLoading: account.isLoading,
            account: account.account,
            error: account.error?.message ?? null,
          }}
        />
      </View>

      <ActionCard
        title="Sign Message"
        description="Signs a UTF-8 message with this account's private key."
        fields={[{ id: 'message', type: 'text', label: 'Message', placeholder: 'Hello, world!' }]}
        action={async ({ message }) => account.sign(message)}
        actionLabel="Sign"
      />

      <ActionCard
        title="Verify Signature"
        description="Verifies a signature against a message."
        fields={[
          { id: 'message', type: 'text', label: 'Message' },
          { id: 'signature', type: 'text', label: 'Signature' },
        ]}
        action={async ({ message, signature }) => account.verify(message, signature)}
        actionLabel="Verify"
      />

      <MethodInvokerCard
        title="Call Account Method"
        description="Pick a method — the fields below update to match it. Choose Custom for anything else."
        methodSpecs={ACCOUNT_METHOD_SPECS}
        currentNetwork={network}
        onInvoke={async (methodName, args) => {
          const ext = account.extension();
          const result = await ext[methodName](...args);
          return { network, accountIndex, method: methodName, args, result };
        }}
      />
    </>
  );
}

function ProtocolExplorer() {
  const [network, setNetwork] = useState<string>(Object.keys(wdkConfigs.networks)[0]);
  const [accountIndexStr, setAccountIndexStr] = useState('0');
  const parsedIndex = parseInt(accountIndexStr, 10);
  const accountIndex = Number.isFinite(parsedIndex) ? parsedIndex : 0;

  const [protocolType, setProtocolType] = useState<'bridge' | 'swap' | 'lending' | 'fiat'>('bridge');
  const [protocolName, setProtocolName] = useState('');

  const protocol = useProtocol<GenericMethods>({
    network,
    accountIndex,
    protocolType,
    protocolName,
  });

  return (
    <>
      <NetworkAndIndexPicker
        network={network}
        onNetworkChange={setNetwork}
        accountIndexStr={accountIndexStr}
        onAccountIndexChange={setAccountIndexStr}
      />

      <View style={styles.fieldContainer}>
        <Text style={styles.label}>Protocol Type</Text>
        <View style={styles.pillRowWrap}>
          {(['bridge', 'swap', 'lending', 'fiat'] as const).map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.pill, protocolType === opt && styles.pillActive]}
              onPress={() => setProtocolType(opt)}
            >
              <Text style={[styles.pillText, protocolType === opt && styles.pillTextActive]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.fieldContainer}>
        <Text style={styles.label}>Protocol Name</Text>
        <TextInput
          style={styles.input}
          value={protocolName}
          onChangeText={setProtocolName}
          placeholder="USDT0_EVM"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
        />
      </View>

      <MethodInvokerCard
        title="Call Protocol Method"
        description={
          'No confirmed field schema exists for protocols yet — only method NAMES for a "bridge" ' +
          'protocolType are confirmed from the SDK docs (quoteBridge, bridge). Arguments stay free-form ' +
          'until real shapes are published.'
        }
        methodSpecs={[
          { id: 'bridge', label: 'bridge', fields: [{ id: 'args', label: 'Arguments (comma-separated)', placeholder: '' }], buildArgs: (v) => parseFriendlyArgs(v.args ?? '') },
          { id: 'quoteBridge', label: 'quoteBridge', fields: [{ id: 'args', label: 'Arguments (comma-separated)', placeholder: '' }], buildArgs: (v) => parseFriendlyArgs(v.args ?? '') },
        ]}
        onInvoke={async (methodName, args) => {
          if (!protocolName.trim()) throw new Error('Protocol name is required');
          const result = await protocol[methodName](...args);
          return { network, accountIndex, protocolType, protocolName, method: methodName, args, result };
        }}
      />
    </>
  );
}

function ModuleExplorer() {
  const [moduleName, setModuleName] = useState('');
  const moduleProxy = useModule<GenericMethods>(moduleName);

  const [eventName, setEventName] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [events, setEvents] = useState<Array<{ event: string; payload: unknown; at: string }>>([]);
  const unsubscribeRef = useRef<null | (() => void)>(null);

  const toggleSubscribe = () => {
    if (subscribed) {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      setSubscribed(false);
      return;
    }
    if (!moduleName.trim() || !eventName.trim()) return;
    const unsubscribe = moduleProxy.on(eventName, (payload) => {
      setEvents((prev) => [{ event: eventName, payload, at: new Date().toLocaleTimeString() }, ...prev].slice(0, 20));
    });
    unsubscribeRef.current = unsubscribe;
    setSubscribed(true);
  };

  return (
    <>
      <View style={styles.fieldContainer}>
        <Text style={styles.label}>Module Name</Text>
        <TextInput
          style={styles.input}
          value={moduleName}
          onChangeText={setModuleName}
          placeholder="addressBook"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
        />
      </View>

      <MethodInvokerCard
        title="Call Module Method"
        description="No method list exists for modules yet — type the method name from documentation. Arguments are comma-separated, no brackets or quotes needed."
        methodSpecs={[]}
        onInvoke={async (methodName, args) => {
          if (!moduleName.trim()) throw new Error('Module name is required');
          const result = await moduleProxy[methodName](...args);
          return { module: moduleName, method: methodName, args, result };
        }}
      />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Event Subscription</Text>
        <View style={styles.eventRow}>
          <TextInput
            style={[styles.input, styles.eventInput]}
            value={eventName}
            onChangeText={setEventName}
            placeholder="event name, e.g. update"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.subscribeButton} onPress={toggleSubscribe}>
            <Text style={styles.subscribeButtonText}>{subscribed ? 'Unsubscribe' : 'Subscribe'}</Text>
          </TouchableOpacity>
        </View>
        <ConsoleOutput data={events.length ? events : 'No events received yet.'} />
      </View>
    </>
  );
}

const MODES = [
  { id: 'account', label: 'useAccount' },
  { id: 'module', label: 'useModule' },
  { id: 'protocol', label: 'useProtocol' },
] as const;

type Mode = (typeof MODES)[number]['id'];

export default function AccountModuleExplorerScreen() {
  const [mode, setMode] = useState<Mode>('account');

  return (
    <FeatureLayout
      title="Account / Module / Protocol Explorer"
      description="Poke at any account, bundled module, or protocol for the active wallet — no per-network wiring required."
    >
      <View style={styles.modeToggle}>
        {MODES.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[styles.modeButton, mode === m.id && styles.modeButtonActive]}
            onPress={() => setMode(m.id)}
          >
            <Text style={[styles.modeButtonText, mode === m.id && styles.modeButtonTextActive]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === 'account' && <AccountExplorer />}
      {mode === 'module' && <ModuleExplorer />}
      {mode === 'protocol' && <ProtocolExplorer />}
    </FeatureLayout>
  );
}

const styles = StyleSheet.create({
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    marginBottom: 24,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: colors.primary,
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modeButtonTextActive: {
    color: colors.black,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    color: colors.text,
    fontSize: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  methodHint: {
    fontSize: 12,
    color: colors.textTertiary,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  noArgsHint: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  pillScroll: {
    marginBottom: 8,
  },
  pillRowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 10,
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    color: colors.text,
    fontWeight: '500',
  },
  pillTextActive: {
    color: colors.black,
  },
  button: {
    backgroundColor: colors.primary,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonText: {
    color: colors.black,
    fontWeight: 'bold',
    fontSize: 16,
  },
  eventRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  eventInput: {
    flex: 1,
  },
  subscribeButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  subscribeButtonText: {
    color: colors.black,
    fontWeight: '600',
    fontSize: 14,
  },
});
