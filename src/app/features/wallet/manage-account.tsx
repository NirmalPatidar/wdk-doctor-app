import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Wallet, Eye, Trash2, Lock } from 'lucide-react-native';
import { FeatureLayout } from '@/components/FeatureLayout';
import { ConsoleOutput } from '@/components/ConsoleOutput';
import { useTheme } from '@/providers/ThemeProvider';
import type { ColorPalette } from '@/constants/colors';
import { useDoctorWorklet, type WalletIndexEntry } from '@/providers/DoctorWorkletProvider';

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {description && <Text style={styles.cardDescription}>{description}</Text>}
      {children}
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled, loading }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? <ActivityIndicator color={colors.onPrimary} size="small" /> : <Text style={styles.buttonText}>{label}</Text>}
    </TouchableOpacity>
  );
}

export default function ManageAccountScreen() {
  const {
    workletStatus,
    activeWalletId,
    wallets,
    createWallet,
    importWallet,
    createTemporaryWallet,
    clearTemporaryWallet,
    previewMnemonic,
    revealMnemonic,
    unlockWallet,
    lockWallet,
    deleteWallet,
  } = useDoctorWorklet();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const workletReady = workletStatus === 'ready';
  const activeWallet = wallets.find((w) => w.id === activeWalletId) ?? null;

  // ---- Create ----
  const [createWalletId, setCreateWalletId] = useState('');
  const [createResult, setCreateResult] = useState<any>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const handleCreate = async () => {
    setCreateLoading(true);
    try {
      const walletId = await createWallet(createWalletId);
      setCreateResult({ success: true, walletId });
      setCreateWalletId('');
    } catch (e: any) {
      setCreateResult({ error: e?.message ?? String(e) });
    } finally {
      setCreateLoading(false);
    }
  };

  // ---- Import ----
  const [importWalletId, setImportWalletId] = useState('');
  const [importMnemonic, setImportMnemonic] = useState('');
  const [importResult, setImportResult] = useState<any>(null);
  const [importLoading, setImportLoading] = useState(false);

  const handleImport = async () => {
    setImportLoading(true);
    try {
      const walletId = await importWallet(importMnemonic, importWalletId);
      setImportResult({ success: true, walletId });
      setImportWalletId('');
      setImportMnemonic('');
    } catch (e: any) {
      setImportResult({ error: e?.message ?? String(e) });
    } finally {
      setImportLoading(false);
    }
  };

  // ---- Preview mnemonic (not saved) ----
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const handlePreview = async () => {
    setPreviewLoading(true);
    try {
      const phrase = await previewMnemonic();
      setPreviewResult({ mnemonic: phrase });
    } catch (e: any) {
      setPreviewResult({ error: e?.message ?? String(e) });
    } finally {
      setPreviewLoading(false);
    }
  };

  // ---- Temporary wallet ----
  const [tempResult, setTempResult] = useState<any>(null);
  const [tempLoading, setTempLoading] = useState(false);

  const handleTemporary = async () => {
    setTempLoading(true);
    try {
      await createTemporaryWallet();
      setTempResult({ success: true, message: 'Temporary wallet active — not saved, won\u2019t appear below' });
    } catch (e: any) {
      setTempResult({ error: e?.message ?? String(e) });
    } finally {
      setTempLoading(false);
    }
  };

  const [clearTempResult, setClearTempResult] = useState<any>(null);
  const [clearTempLoading, setClearTempLoading] = useState(false);

  const handleClearTemporary = async () => {
    setClearTempLoading(true);
    try {
      await clearTemporaryWallet();
      setClearTempResult({ success: true, message: 'Temporary wallet session cleared from memory' });
    } catch (e: any) {
      setClearTempResult({ error: e?.message ?? String(e) });
    } finally {
      setClearTempLoading(false);
    }
  };

  // ---- Lock ----
  const [lockResult, setLockResult] = useState<any>(null);
  const [lockLoading, setLockLoading] = useState(false);

  const handleLock = async () => {
    setLockLoading(true);
    try {
      await lockWallet();
      setLockResult({ success: true, message: 'Wallet locked' });
    } catch (e: any) {
      setLockResult({ error: e?.message ?? String(e) });
    } finally {
      setLockLoading(false);
    }
  };

  // ---- Reveal mnemonic for whichever wallet is currently active ----
  const [activeRevealResult, setActiveRevealResult] = useState<any>(null);
  const [activeRevealLoading, setActiveRevealLoading] = useState(false);

  const handleRevealActive = async () => {
    if (!activeWalletId) return;
    setActiveRevealLoading(true);
    try {
      const mnemonic = await revealMnemonic(activeWalletId);
      setActiveRevealResult({ mnemonic });
    } catch (e: any) {
      setActiveRevealResult({ error: e?.message ?? String(e) });
    } finally {
      setActiveRevealLoading(false);
    }
  };

  // ---- Delete by manual ID entry ----
  // Added alongside the existing per-wallet Delete button in the list below
  // (same pattern as Reveal — a dedicated card plus a per-wallet shortcut),
  // for direct testing without needing to scroll to find a specific wallet.
  const [deleteWalletId, setDeleteWalletId] = useState('');
  const [deleteResult, setDeleteResult] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDeleteById = async () => {
    setDeleteLoading(true);
    try {
      await deleteWallet(deleteWalletId);
      setDeleteResult({ success: true, message: `Wallet "${deleteWalletId}" deleted` });
      setDeleteWalletId('');
    } catch (e: any) {
      setDeleteResult({ error: e?.message ?? String(e) });
    } finally {
      setDeleteLoading(false);
    }
  };

  // ---- Per-wallet actions: unlock / reveal / delete ----
  const [busyWalletId, setBusyWalletId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ walletId: string; mnemonic: string } | null>(null);
  const [walletError, setWalletError] = useState<{ walletId: string; message: string } | null>(null);

  const handleWalletUnlock = async (wallet: WalletIndexEntry) => {
    setBusyWalletId(wallet.id);
    setWalletError(null);
    try {
      await unlockWallet(wallet.id);
    } catch (e: any) {
      setWalletError({ walletId: wallet.id, message: e?.message ?? String(e) });
    } finally {
      setBusyWalletId(null);
    }
  };

  const handleWalletReveal = async (wallet: WalletIndexEntry) => {
    setBusyWalletId(wallet.id);
    setWalletError(null);
    try {
      const mnemonic = await revealMnemonic(wallet.id);
      setRevealed({ walletId: wallet.id, mnemonic });
    } catch (e: any) {
      setWalletError({ walletId: wallet.id, message: e?.message ?? String(e) });
    } finally {
      setBusyWalletId(null);
    }
  };

  const handleWalletDelete = async (wallet: WalletIndexEntry) => {
    setBusyWalletId(wallet.id);
    setWalletError(null);
    try {
      await deleteWallet(wallet.id);
      if (revealed?.walletId === wallet.id) setRevealed(null);
    } catch (e: any) {
      setWalletError({ walletId: wallet.id, message: e?.message ?? String(e) });
    } finally {
      setBusyWalletId(null);
    }
  };

  return (
    <FeatureLayout
      title="Wallet Management"
      description="Create, import, and manage your wallets."
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Current Status</Text>
        <ConsoleOutput data={{ workletStatus, activeWalletId: activeWalletId || 'None', walletCount: wallets.length }} />
      </View>

      <Card
        title="Reveal Mnemonic (Active Wallet)"
        description={
          activeWallet
            ? `Shows the seed phrase for "${activeWallet.id}", the wallet currently active — no need to find it below.`
            : 'No wallet is currently active — unlock one first, or use a wallet\u2019s own Reveal button below.'
        }
      >
        <PrimaryButton
          label="Reveal Active Wallet's Mnemonic"
          onPress={handleRevealActive}
          disabled={!workletReady || !activeWalletId}
          loading={activeRevealLoading}
        />
        {activeRevealResult && <ConsoleOutput data={activeRevealResult} error={!!activeRevealResult.error} />}
      </Card>

      <Card title="Create New Wallet" description="Generates a new seed phrase, persists it, and activates it. No biometric gate for now (team decision).">
        <TextInput
          style={styles.input}
          value={createWalletId}
          onChangeText={setCreateWalletId}
          placeholder="Wallet ID (Email), e.g. user@example.com"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
        />
        <PrimaryButton label="Create Wallet" onPress={handleCreate} disabled={!workletReady || !createWalletId.trim()} loading={createLoading} />
        {createResult && <ConsoleOutput data={createResult} error={!!createResult.error} />}
      </Card>

      <Card title="Import from Mnemonic" description="Restore a wallet using a 12 or 24 word seed phrase.">
        <TextInput
          style={styles.input}
          value={importWalletId}
          onChangeText={setImportWalletId}
          placeholder="Wallet ID (Email), e.g. user@example.com"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
        />
        <TextInput
          style={[styles.input, styles.textArea]}
          value={importMnemonic}
          onChangeText={setImportMnemonic}
          placeholder="word1 word2 ... word12"
          placeholderTextColor={colors.textSecondary}
          multiline
        />
        <PrimaryButton label="Import Wallet" onPress={handleImport} disabled={!workletReady || !importWalletId.trim() || !importMnemonic.trim()} loading={importLoading} />
        {importResult && <ConsoleOutput data={importResult} error={!!importResult.error} />}
      </Card>

      <Card title="Generate Mnemonic" description="Generates and reveals a fresh seed phrase without persisting or activating anything — a preview before committing to create a wallet from it.">
        <PrimaryButton label="Generate" onPress={handlePreview} disabled={!workletReady} loading={previewLoading} />
        {previewResult && <ConsoleOutput data={previewResult} error={!!previewResult.error} />}
      </Card>

      <Card title="Create Temporary Wallet" description="A throwaway wallet for testing — active in the worklet for this session only, never saved, never appears in the list below.">
        <PrimaryButton label="Create Temp Wallet" onPress={handleTemporary} disabled={!workletReady} loading={tempLoading} />
        {tempResult && <ConsoleOutput data={tempResult} error={!!tempResult.error} />}
      </Card>

      <Card title="Clear Temporary Wallet" description="Clears the temporary wallet session from the worklet's memory. Distinct from Lock — a temporary wallet was never tracked as 'active' in the first place.">
        <PrimaryButton label="Clear" onPress={handleClearTemporary} disabled={!workletReady} loading={clearTempLoading} />
        {clearTempResult && <ConsoleOutput data={clearTempResult} error={!!clearTempResult.error} />}
      </Card>

      <Card title="Lock Active Wallet" description="Asks the worklet to forget the active wallet's in-memory state (via resetWdkWallets) and clears which wallet this app treats as active.">
        <PrimaryButton label="Lock" onPress={handleLock} disabled={activeWalletId === null} loading={lockLoading} />
        {lockResult && <ConsoleOutput data={lockResult} error={!!lockResult.error} />}
      </Card>

      <Card title="Delete Wallet" description="Permanently remove a wallet's stored credentials by id. The same action is also available per-wallet in the list below.">
        <TextInput
          style={styles.input}
          value={deleteWalletId}
          onChangeText={setDeleteWalletId}
          placeholder="Wallet ID (Email), e.g. user@example.com"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
        />
        <PrimaryButton label="Delete Wallet" onPress={handleDeleteById} disabled={!deleteWalletId.trim()} loading={deleteLoading} />
        {deleteResult && <ConsoleOutput data={deleteResult} error={!!deleteResult.error} />}
      </Card>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Wallets</Text>
        {wallets.length === 0 ? (
          <Text style={styles.emptyText}>No wallets yet — create or import one above.</Text>
        ) : (
          wallets.map((wallet) => {
            const isActive = wallet.id === activeWalletId;
            const isBusy = busyWalletId === wallet.id;
            return (
              <View key={wallet.id} style={styles.walletRow}>
                <View style={styles.walletRowHeader}>
                  <Wallet size={16} color={isActive ? colors.primary : colors.textSecondary} />
                  <Text style={styles.walletRowLabel}>{wallet.id}</Text>
                  {isActive && <Text style={styles.activeTag}>Active</Text>}
                </View>
                <Text style={styles.walletRowMeta}>{new Date(wallet.createdAt).toLocaleString()}</Text>

                <View style={styles.walletRowActions}>
                  <TouchableOpacity
                    style={styles.walletRowButton}
                    onPress={() => handleWalletUnlock(wallet)}
                    disabled={isBusy || !workletReady}
                  >
                    <Lock size={14} color={colors.primary} />
                    <Text style={styles.walletRowButtonText}>Unlock</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.walletRowButton}
                    onPress={() => handleWalletReveal(wallet)}
                    disabled={isBusy || !workletReady}
                  >
                    <Eye size={14} color={colors.primary} />
                    <Text style={styles.walletRowButtonText}>Reveal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.walletRowButton, styles.walletRowButtonDanger]}
                    onPress={() => handleWalletDelete(wallet)}
                    disabled={isBusy}
                  >
                    <Trash2 size={14} color={colors.danger} />
                    <Text style={[styles.walletRowButtonText, styles.walletRowButtonTextDanger]}>Delete</Text>
                  </TouchableOpacity>
                  {isBusy && <ActivityIndicator size="small" color={colors.textSecondary} />}
                </View>

                {revealed?.walletId === wallet.id && (
                  <ConsoleOutput data={{ mnemonic: revealed.mnemonic }} />
                )}
                {walletError?.walletId === wallet.id && (
                  <ConsoleOutput data={{ error: walletError.message }} error />
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
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 13,
      color: colors.textSecondary,
      fontStyle: 'italic',
    },
    card: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
    },
    cardTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    cardDescription: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 12,
      lineHeight: 18,
    },
    input: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 12,
      color: colors.text,
      fontSize: 14,
      marginBottom: 10,
    },
    textArea: {
      minHeight: 60,
      textAlignVertical: 'top',
    },
    // Primary (orange-background) button — text/icon uses onPrimary, which
    // flips white/black per theme, not a hardcoded colors.black.
    button: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
    buttonDisabled: {
      opacity: 0.4,
    },
    buttonText: {
      color: colors.onPrimary,
      fontWeight: '600',
      fontSize: 14,
    },
    walletRow: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
    },
    walletRowHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    walletRowLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      flex: 1,
    },
    activeTag: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.primary,
    },
    walletRowMeta: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
      marginLeft: 24,
    },
    walletRowActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      marginTop: 12,
    },
    walletRowButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    walletRowButtonDanger: {},
    walletRowButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },
    walletRowButtonTextDanger: {
      color: colors.danger,
    },
  });
}
