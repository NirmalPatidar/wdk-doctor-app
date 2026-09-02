import { ActivityIndicator, View, StyleSheet, ScrollView, Image, TouchableOpacity, Text, Alert } from 'react-native'
import { useWdkApp, useWalletManager } from '@tetherto/wdk-react-native-core'
import { colors } from '@/constants/colors';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wallet, ChevronRight, CheckCircle2, XCircle, Settings, Plus, Stethoscope } from 'lucide-react-native';

const FeatureGroup = ({ title, icon, children }: { title: string, icon: React.ReactNode, children: React.ReactNode }) => (
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

const FeatureItem = ({ title, route }: { title: string, route: string }) => {
  const router = useRouter();
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

const StatusBadge = ({ label, active }: { label: string, active: boolean }) => (
  <View style={[styles.badge, active ? styles.badgeActive : styles.badgeInactive]}>
    {active ? <CheckCircle2 size={12} color={colors.black} /> : <XCircle size={12} color={colors.textSecondary} />}
    <Text style={[styles.badgeText, active && styles.badgeTextActive]}>{label}</Text>
  </View>
);

const WalletCard = ({ id, isActive, onUnlock }: { id: string, isActive: boolean, onUnlock?: () => void }) => (
  <View style={[styles.walletCard, isActive && styles.walletCardActive]}>
    <View style={styles.walletCardInfo}>
      <Wallet size={16} color={isActive ? colors.black : colors.primary} />
      <Text style={[styles.walletCardId, isActive && styles.walletCardIdActive]}>{id}</Text>
    </View>
    {isActive ? (
      <View style={styles.activeLabel}>
        <CheckCircle2 size={12} color={colors.black} />
        <Text style={styles.activeLabelText}>Active</Text>
      </View>
    ) : (
      <TouchableOpacity style={styles.unlockButton} onPress={onUnlock}>
        <Text style={styles.unlockButtonText}>Unlock</Text>
      </TouchableOpacity>
    )}
  </View>
);

export default function App() {
  const { state } = useWdkApp();
  const { activeWalletId, wallets, switchWallet } = useWalletManager();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  if (state.status === 'INITIALIZING') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const handleUnlock = async (id: string) => {
    try {
      // switchWallet() replaces the old manual lock() + unlock(id) pattern.
      // It's the atomic convenience added in WDK PR #77 specifically for this
      // case — it awaits lock() before unlock() runs, guaranteeing the
      // previous wallet's state is cleared before the next one loads.
      await switchWallet(id);
    } catch (e: any) {
      Alert.alert('Unlock Failed', e.message);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        <View style={styles.header}>
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
              <StatusBadge label="Worklet Ready" active={['NO_WALLET', 'LOCKED', 'READY', 'REINITIALIZING'].includes(state.status)} />
              <StatusBadge label="Wallet Ready" active={state.status === 'READY'} />
            </View>
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
              {wallets.map(({ identifier: id }) => (
                <WalletCard 
                  key={id} 
                  id={id} 
                  isActive={id === activeWalletId && state.status === "READY"} 
                  onUnlock={() => handleUnlock(id)} 
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
            <FeatureItem title="Account / Module / Protocol Explorer" route="/features/doctor/account-module-explorer" />
            <FeatureItem title="Worklet POC (no rn-core)" route="/features/doctor/worklet-poc" />
            <FeatureItem title="Manage Addresses" route="/features/wallet/addresses" />
            <FeatureItem title="Assets & Transfers" route="/features/wallet/assets-and-transfers" />
            <FeatureItem title="Advanced Account Ops" route="/features/wallet/advanced-account-ops" />
          </FeatureGroup>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: 'rgba(255,255,255,0.05)',
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
    color: colors.black,
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
    color: colors.black,
  },
  activeLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
  },
  activeLabelText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.black,
  },
  unlockButton: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unlockButtonText: {
    color: colors.text,
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
    backgroundColor: 'rgba(66, 153, 225, 0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(66, 153, 225, 0.3)',
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
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  itemText: {
    fontSize: 16,
    color: colors.text,
  }
});
