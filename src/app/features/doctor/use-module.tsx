import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FeatureLayout } from '@/components/FeatureLayout';
import { ActionCard } from '@/components/ActionCard';
import { ConsoleOutput } from '@/components/ConsoleOutput';
import { useTheme } from '@/providers/ThemeProvider';
import type { ColorPalette } from '@/constants/colors';
import { useDoctorWorklet } from '@/providers/DoctorWorkletProvider';
import wdkConfigs from '@/config/doctorRuntime';

// A hint, not a claim of completeness — modules genuinely have no universal
// method set, so this can't be derived automatically the way it could for
// accounts. Known entries are confirmed real method names from that
// package's own source (see TESTING_YOUR_PACKAGE.md). Anything not listed
// here — including any new module a package author adds — falls back to a
// generic placeholder rather than showing a stale, wrong example.
const KNOWN_MODULE_METHOD_HINTS: Record<string, string> = {
  addressBook: 'e.g. getInfo, addContact, create, listContacts',
};

function methodPlaceholderFor(moduleName: string): string {
  return KNOWN_MODULE_METHOD_HINTS[moduleName] ?? 'e.g. yourMethodName — check the package source for what it implements';
}

export default function UseModuleScreen() {
  const { rpc, workletStatus, activeWalletId, moduleEvents, clearModuleEvents } = useDoctorWorklet();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const availableModules = Object.keys(wdkConfigs.modules ?? {});
  const [selectedModule, setSelectedModule] = useState(availableModules[0] ?? '');
  const workletReady = workletStatus === 'ready';

  const callModule = async (methodName: string, args: unknown[] = []) => {
    if (!rpc) throw new Error('Worklet is not ready yet');
    if (!selectedModule) throw new Error('No module selected');
    const response = await rpc.callModule({
      module: selectedModule,
      method: methodName,
      ...(args.length > 0 ? { args: JSON.stringify(args) } : {}),
    });
    // Same unwrapping callMethod needs on the Use Account screen — callModule
    // is an equally generic dispatcher, so its `result` field is JSON-
    // stringified regardless of what the module's method actually returns.
    // See ARCHITECTURE.md's "callMethod/callModule return JSON-stringified
    // results" section.
    try {
      return JSON.parse(response.result);
    } catch {
      return response.result;
    }
  };

  const eventsForSelectedModule = moduleEvents.filter((e) => e.module === selectedModule);

  return (
    <FeatureLayout
      title="Use Module"
      description="Modules have no common method set the way accounts do — each package defines its own. Pick a configured module, then call any of its methods by name."
    >
      {availableModules.length === 0 ? (
        <View style={styles.warningBanner}>
          <Text style={styles.warningBannerText}>
            No modules are configured in wdk.config.js / doctor.runtime.json yet. Add one first —
            see TESTING_YOUR_PACKAGE.md for the exact workflow.
          </Text>
        </View>
      ) : (
        <View style={styles.moduleField}>
          <Text style={styles.label}>Module</Text>
          <View style={styles.moduleRow}>
            {availableModules.map((mod) => (
              <TouchableOpacity
                key={mod}
                style={[styles.modulePill, selectedModule === mod && styles.modulePillSelected]}
                onPress={() => setSelectedModule(mod)}
              >
                <Text style={[styles.modulePillText, selectedModule === mod && styles.modulePillTextSelected]}>
                  {mod}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {activeWalletId === null && availableModules.length > 0 && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningBannerText}>
            No wallet is active. Modules are constructed from the active wallet's seed
            (createWorkletModule receives it directly) — confirmed via the addressBook module's own
            factory signature. Create or unlock a wallet first, or calls here will likely fail the
            same way account methods do without one.
          </Text>
        </View>
      )}

      {/* Keyed by selected module — same reasoning as Use Account: without
          this, switching modules would leave a previous module's stale
          result showing until the card is tapped again. */}
      <View key={selectedModule}>
        <ActionCard
          title="Call Method"
          description="Call any method on the selected module by name. No common method set exists across modules — check the specific package's own source for what it actually implements (see the addressBook example referenced in TESTING_YOUR_PACKAGE.md)."
          fields={[
            { id: 'methodName', type: 'text', label: 'Method Name', placeholder: methodPlaceholderFor(selectedModule) },
            { id: 'args', type: 'json', label: 'Arguments (JSON array, optional)', placeholder: '[{"name": "Alice"}]' },
          ]}
          action={(v) => callModule(v.methodName, v.args ? JSON.parse(v.args) : [])}
          actionLabel="Invoke"
        />
      </View>

      <View style={styles.section}>
        <View style={styles.eventHeader}>
          <Text style={styles.sectionTitle}>Event Log{selectedModule ? ` — ${selectedModule}` : ''}</Text>
          <TouchableOpacity onPress={clearModuleEvents}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>
        {eventsForSelectedModule.length === 0 ? (
          <Text style={styles.emptyText}>
            No events received yet for this module. Events only appear here if the module actually
            emits one and it's declared in wdk.config.js's events array for that module — the
            addressBook example declares only 'update'.
          </Text>
        ) : (
          eventsForSelectedModule.map((evt, i) => {
            // Same unwrapping principle as callMethod/callModule's result
            // field — the wire payload is a JSON-stringified value, and a
            // module emitting an event with no real payload sends the
            // literal string "null", not an empty/absent field. Parsing
            // before checking is what actually distinguishes "no payload"
            // from "the payload happens to be the value null" — a bare
            // `!== null` string check can never catch the former.
            let parsedPayload: unknown = null;
            if (evt.payload !== null) {
              try {
                parsedPayload = JSON.parse(evt.payload);
              } catch {
                parsedPayload = evt.payload;
              }
            }
            return (
              <View key={i} style={styles.eventRow}>
                <Text style={styles.eventMeta}>
                  {new Date(evt.timestamp).toLocaleTimeString()} — {evt.event}
                </Text>
                {parsedPayload !== null ? (
                  <ConsoleOutput data={parsedPayload} />
                ) : (
                  <Text style={styles.noPayloadText}>(no payload)</Text>
                )}
              </View>
            );
          })
        )}
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
    warningBannerText: {
      fontSize: 13,
      color: colors.warning,
      lineHeight: 19,
    },
    moduleField: {
      marginBottom: 20,
    },
    label: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 8,
      fontWeight: '500',
    },
    moduleRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    modulePill: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modulePillSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    modulePillText: {
      color: colors.primary,
      fontWeight: '500',
    },
    modulePillTextSelected: {
      color: colors.onPrimary,
    },
    section: {
      marginTop: 8,
    },
    eventHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: colors.text,
    },
    clearText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },
    emptyText: {
      fontSize: 13,
      color: colors.textSecondary,
      fontStyle: 'italic',
      lineHeight: 19,
    },
    eventRow: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 12,
      marginBottom: 8,
    },
    eventMeta: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    noPayloadText: {
      fontSize: 12,
      color: colors.textSecondary,
      fontStyle: 'italic',
      marginTop: 6,
    },
  });
}
