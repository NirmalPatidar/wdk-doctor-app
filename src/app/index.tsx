import { ActivityIndicator, View, StyleSheet, ScrollView, Image, TouchableOpacity, Text, Alert, TextInput } from 'react-native'
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wallet, ChevronRight, CheckCircle2, XCircle, Settings, Plus, Stethoscope, Sun, Moon } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useDoctorWorklet, type WalletIndexEntry } from '@/providers/DoctorWorkletProvider';
import { useTheme } from '@/providers/ThemeProvider';
import type { ColorPalette } from '@/constants/colors';

const FeatureGroup = ({ title, icon, children }: { title: string, icon: React.ReactNode, children: React.ReactNode }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.groupContainer}>
      <View style={styles.groupHeader}>
        {icon}
        <Text style={styles.groupTitle}>{title}</Text>
      </View>
      <View style={styles.groupContent}>
        {children}
      </View>
    </View>
  );
};

const FeatureItem = ({ title, route }: { title: string, route: string }) => {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity 
      style={styles.item} 
      onPress={() => router.push(route as any)}
    >
      <Text style={styles.itemText}>{title}</Text>
      <ChevronRight size={16} color={colors.textSecondary} />
    </TouchableOpacity>
  );
};

const StatusBadge = ({ label, active }: { label: string, active: boolean }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.badge, active ? styles.badgeActive : styles.badgeInactive]}>
      {active ? <CheckCircle2 size={12} color={colors.onPrimary} /> : <XCircle size={12} color={colors.textSecondary} />}
      <Text style={[styles.badgeText, active && styles.badgeTextActive]}>{label}</Text>
    </View>
  );
};

const WalletCard = ({
  wallet,
  isActive,
  onUnlock,
  onLock,
}: {
  wallet: WalletIndexEntry;
  isActive: boolean;
  onUnlock?: () => void;
  onLock?: () => void;
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.walletCard, isActive && styles.walletCardActive]}>
      <View style={styles.walletCardInfo}>
        <Wallet size={16} color={isActive ? colors.onPrimary : colors.primary} />
        <Text style={[styles.walletCardId, isActive && styles.walletCardIdActive]}>{wallet.id}</Text>
      </View>
      {isActive ? (
        <View style={styles.activeRow}>
          <View style={styles.activeLabel}>
            <CheckCircle2 size={12} color={colors.onPrimary} />
            <Text style={styles.activeLabelText}>Active</Text>
          </View>
          <TouchableOpacity style={styles.lockButton} onPress={onLock}>
            <Text style={styles.lockButtonText}>Lock</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.unlockButton} onPress={onUnlock}>
          <Text style={styles.unlockButtonText}>Unlock</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default function App() {
  const {
    workletStatus,
    lifecycle,
    suspend,
    resume,
    activeWalletId,
    wallets,
    unlockWallet,
    lockWallet,
  } = useDoctorWorklet();
  const { theme, colors, toggleTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [lingerInput, setLingerInput] = useState('');

  if (workletStatus === 'initializing') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const handleUnlock = async (id: string) => {
    try {
      // The old switchWallet() was an atomic lock-then-unlock convenience
      // specifically for switching between two persisted wallets. Here,
      // unlockWallet() alone already re-runs initializeWDK for the new
      // wallet, which supersedes whichever one was previously active from
      // the UI's perspective — there's no separate worklet-side "previous
      // wallet" state that needs an explicit lock() first in this model.
      await unlockWallet(id);
    } catch (e: any) {
      Alert.alert('Unlock Failed', e.message);
    }
  };

  const handleLock = async () => {
    try {
      await lockWallet();
    } catch (e: any) {
      Alert.alert('Lock Failed', e.message);
    }
  };

  const handleSuspend = () => {
    const parsed = parseInt(lingerInput, 10);
    // Default to 0 (immediate effect) when the field is empty, rather than
    // the native ~30s default — for a debugging tool, seeing the effect
    // right away is almost always what's wanted; testing the grace period
    // specifically just means typing a value.
    suspend(Number.isFinite(parsed) ? parsed : 0);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <View style={{ width: 40 }} />
            <TouchableOpacity
              style={styles.themeToggle}
              onPress={toggleTheme}
              accessibilityLabel={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? (
                <Moon size={20} color={colors.text} />
              ) : (
                <Sun size={20} color={colors.text} />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.illustrationContainer}>
            <Image
              source={require('../../assets/images/wdk-logo.png')}
              style={styles.wdkLogo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.title}>WDK Doctor App</Text>
          <Text style={styles.subtitle}>
            Explore the unified capabilities of the Wallet Development Kit.
          </Text>
          
          <View style={styles.statusContainer}>
            <Text style={styles.statusLabel}>WDK Lifecycle Status:</Text>
            <View style={styles.badges}>
              <StatusBadge label="Worklet Ready" active={workletStatus === 'ready'} />
              <StatusBadge label="Wallet Ready" active={activeWalletId !== null} />
              <StatusBadge
                label={lifecycle.suspended ? 'Suspended' : 'Active'}
                active={!lifecycle.suspended}
              />
            </View>
          </View>
        </View>

        <View style={styles.walletsSection}>
          <Text style={[styles.sectionTitle, styles.lifecycleSectionTitle]}>Manage Worklet Lifecycle</Text>
          <View style={styles.lifecycleControls}>
            <Text style={styles.lingerNote}>
              Linger delays when suspend takes effect — it isn't how long the worklet stays suspended.
              Once suspended, only Resume brings it back to Active; it never resumes on its own.
            </Text>
            <TextInput
              style={styles.lingerInput}
              value={lingerInput}
              onChangeText={setLingerInput}
              keyboardType="numeric"
              placeholder="Linger (ms), default 0"
              placeholderTextColor={colors.textSecondary}
            />
            <View style={styles.lingerButtonRow}>
              <TouchableOpacity
                style={[styles.lifecycleButton, workletStatus !== 'ready' && styles.lifecycleButtonDisabled]}
                onPress={handleSuspend}
                disabled={workletStatus !== 'ready'}
              >
                <Text style={styles.lifecycleButtonText}>Suspend</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.lifecycleButton, workletStatus !== 'ready' && styles.lifecycleButtonDisabled]}
                onPress={resume}
                disabled={workletStatus !== 'ready'}
              >
                <Text style={styles.lifecycleButtonText}>Resume</Text>
              </TouchableOpacity>
            </View>

            {lifecycle.recentEvents.length > 0 && (
              <Text style={styles.eventLogLine} numberOfLines={1}>
                Last event: {lifecycle.recentEvents[0]}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.walletsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Wallets</Text>
            <TouchableOpacity 
              onPress={() => router.push('/features/wallet/manage-account')}
              style={styles.manageButton}
            >
              <Settings size={16} color={colors.primary} />
              <Text style={styles.manageButtonText}>Manage</Text>
            </TouchableOpacity>
          </View>

          {wallets.length > 0 ? (
            <View style={styles.walletList}>
              {wallets.map((wallet) => (
                <WalletCard 
                  key={wallet.id} 
                  wallet={wallet} 
                  isActive={wallet.id === activeWalletId} 
                  onUnlock={() => handleUnlock(wallet.id)} 
                  onLock={handleLock}
                />
              ))}
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.createFirstButton}
              onPress={() => router.push('/features/wallet/manage-account')}
            >
              <Plus size={20} color={colors.primary} />
              <Text style={styles.createFirstButtonText}>Create your first wallet</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.groupsContainer}>
          <FeatureGroup 
            title="Doctor's Tools" 
            icon={<Stethoscope size={20} color={colors.primary} />}
          >
            <FeatureItem title="Use Account" route="/features/doctor/use-account" />
            <FeatureItem title="Use Module" route="/features/doctor/use-module" />
            <FeatureItem title="Use Protocol" route="/features/doctor/use-protocol" />
            <FeatureItem title="Worklet POC (no rn-core)" route="/features/doctor/worklet-poc" />
          </FeatureGroup>
        </View>
      </ScrollView>
    </View>
  );
}

// Moved from a module-scope StyleSheet.create(...) to a factory function so
// every screen and sub-component here can recompute its styles reactively
// against whichever palette (light or dark) is currently active, memoized
// via useMemo so this only actually re-runs when the theme changes.
function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingBottom: 40,
    },
    header: {
      paddingHorizontal: 24,
      paddingTop: 20,
      marginBottom: 24,
      alignItems: 'flex-start',
    },
    headerTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
      marginBottom: 8,
    },
    themeToggle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    illustrationContainer: {
      width: '100%',
      alignItems: 'center'
    },
    wdkLogo: {
      width: 180, 
      height: 180,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      color: colors.textSecondary,
      lineHeight: 22,
      marginBottom: 20,
    },
    statusContainer: {
      backgroundColor: colors.card,
      padding: 12,
      borderRadius: 12,
      width: '100%',
    },
    statusLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 8,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    badges: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 20,
      gap: 6,
      borderWidth: 1,
    },
    badgeActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    badgeInactive: {
      backgroundColor: 'transparent',
      borderColor: colors.border,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    badgeTextActive: {
      color: colors.onPrimary,
    },
    lifecycleControls: {
      marginTop: 4,
    },
    lingerNote: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 17,
      marginBottom: 12,
    },
    lifecycleSectionTitle: {
      marginBottom: 16,
    },
    lingerInput: {
      width: '100%',
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
      color: colors.text,
      fontSize: 14,
      marginBottom: 10,
    },
    lingerButtonRow: {
      flexDirection: 'row',
      gap: 8,
    },
    lifecycleButton: {
      flex: 1,
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingVertical: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    lifecycleButtonDisabled: {
      opacity: 0.4,
    },
    lifecycleButtonText: {
      color: colors.onPrimary,
      fontWeight: '600',
      fontSize: 13,
    },
    eventLogLine: {
      marginTop: 8,
      fontSize: 11,
      color: colors.textSecondary,
      fontFamily: 'monospace',
    },
    walletsSection: {
      paddingHorizontal: 24,
      marginBottom: 32,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text,
    },
    manageButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    manageButtonText: {
      color: colors.primary,
      fontWeight: '600',
      fontSize: 14,
    },
    walletCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 8,
    },
    walletCardActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    walletCardInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    walletCardId: {
      fontSize: 14,
      fontWeight: 'bold',
      color: colors.text,
    },
    walletCardIdActive: {
      color: colors.onPrimary,
    },
    activeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    activeLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.overlay,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 10,
    },
    activeLabelText: {
      fontSize: 11,
      fontWeight: 'bold',
      color: colors.onPrimary,
    },
    lockButton: {
      backgroundColor: colors.background,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
    },
    lockButtonText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '600',
    },
    unlockButton: {
      backgroundColor: colors.cardDark,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    unlockButtonText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '600',
    },
    walletList: {
      marginTop: 8,
    },
    createFirstButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 16,
      backgroundColor: colors.tintedBackground,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    createFirstButtonText: {
      color: colors.primary,
      fontWeight: 'bold',
      fontSize: 16,
    },
    groupsContainer: {
      paddingHorizontal: 24,
      gap: 24,
    },
    groupContainer: {
      gap: 12,
    },
    groupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingLeft: 4,
    },
    groupTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    groupContent: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    itemText: {
      fontSize: 16,
      color: colors.text,
    }
  });
}
