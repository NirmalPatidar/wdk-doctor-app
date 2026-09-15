import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FeatureLayout } from '@/components/FeatureLayout';
import { ConsoleOutput } from '@/components/ConsoleOutput';
import { useTheme } from '@/providers/ThemeProvider';
import type { ColorPalette } from '@/constants/colors';
import { useDoctorWorklet, type DebugLogEntry } from '@/providers/DoctorWorkletProvider';

type CategoryFilter = 'all' | DebugLogEntry['category'];

const CATEGORY_LABELS: Record<DebugLogEntry['category'], string> = {
  'rpc-call': 'RPC Call',
  'rpc-result': 'RPC Result',
  'rpc-error': 'RPC Error',
  'worklet-log': 'Worklet Log',
  'module-event': 'Module Event',
  lifecycle: 'Lifecycle',
};

export default function DebugLogScreen() {
  const { debugLog, clearDebugLog, exportDebugLog } = useDoctorWorklet();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [filter, setFilter] = useState<CategoryFilter>('all');

  const filtered = filter === 'all' ? debugLog : debugLog.filter((e) => e.category === filter);
  const categories: CategoryFilter[] = ['all', 'rpc-call', 'rpc-result', 'rpc-error', 'worklet-log', 'module-event', 'lifecycle'];

  return (
    <FeatureLayout
      title="Debug Log"
      description="Every RPC call and result, worklet log line, module event, and lifecycle transition since app launch — the full record, for when something needs debugging or a bug report needs evidence attached."
    >
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionButton} onPress={exportDebugLog}>
          <Text style={styles.actionButtonText}>Export</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.actionButtonSecondary]} onPress={clearDebugLog}>
          <Text style={styles.actionButtonTextSecondary}>Clear</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.filterPill, filter === cat && styles.filterPillSelected]}
            onPress={() => setFilter(cat)}
          >
            <Text style={[styles.filterPillText, filter === cat && styles.filterPillTextSelected]}>
              {cat === 'all' ? 'All' : CATEGORY_LABELS[cat]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.countText}>
        {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}{filter !== 'all' ? ` (${CATEGORY_LABELS[filter as DebugLogEntry['category']]})` : ''}
      </Text>

      {filtered.length === 0 ? (
        <Text style={styles.emptyText}>
          Nothing here yet — this fills in as you use other screens (Use Account, Use Module,
          Wallet Management, the lifecycle controls on Home).
        </Text>
      ) : (
        filtered.map((entry) => (
          <View key={entry.id} style={styles.entryRow}>
            <View style={styles.entryHeader}>
              <Text style={styles.entryCategory}>{CATEGORY_LABELS[entry.category]}</Text>
              <Text style={styles.entryTime}>{new Date(entry.timestamp).toLocaleTimeString()}</Text>
            </View>
            <Text style={styles.entryLabel}>{entry.label}</Text>
            {entry.detail !== undefined && <ConsoleOutput data={entry.detail} error={entry.category === 'rpc-error'} />}
          </View>
        ))
      )}
    </FeatureLayout>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    actionRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 16,
    },
    actionButton: {
      flex: 1,
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
    actionButtonText: {
      color: colors.onPrimary,
      fontWeight: '600',
      fontSize: 14,
    },
    actionButtonSecondary: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    actionButtonTextSecondary: {
      color: colors.primary,
      fontWeight: '600',
      fontSize: 14,
    },
    filterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 12,
    },
    filterPill: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 8,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterPillSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterPillText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },
    filterPillTextSelected: {
      color: colors.onPrimary,
    },
    countText: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 16,
    },
    emptyText: {
      fontSize: 13,
      color: colors.textSecondary,
      fontStyle: 'italic',
      lineHeight: 19,
    },
    entryRow: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 12,
      marginBottom: 8,
    },
    entryHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    entryCategory: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
      textTransform: 'uppercase',
    },
    entryTime: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    entryLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
  });
}
