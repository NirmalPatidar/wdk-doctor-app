import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAddresses } from '@tetherto/wdk-react-native-core';
import { ActionCard } from '@/components/ActionCard';
import { FeatureLayout } from '@/components/FeatureLayout';
import { ConsoleOutput } from '@/components/ConsoleOutput';
import { colors } from '@/constants/colors';

export default function AddressesScreen() {
  const { 
    data, 
    isLoading, 
    loadAddresses, 
    getAddressesForNetwork, 
    getAccountInfoFromAddress
  } = useAddresses();

  const [lastActionOutput, setLastActionOutput] = useState<any>(null);

  return (
    <FeatureLayout 
      title="Address Management" 
      description="Load and manage wallet addresses across networks."
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Address State</Text>
        <ConsoleOutput data={{ 
          isLoading,
          totalAddresses: data?.length || 0,
          addresses: data || [],
          lastResult: lastActionOutput
        }} />
      </View>

      <ActionCard
        title="Load Addresses"
        description="Fetch addresses for specific account indices and networks."
        fields={[
          { 
            id: 'indices', 
            type: 'text', 
            label: 'Account Indices (comma-separated)', 
            placeholder: '0, 1, 2' 
          },
          { 
            id: 'networks', 
            type: 'text', 
            label: 'Networks (comma-separated, optional)', 
            placeholder: 'bitcoin, ethereum (leave empty for all)' 
          }
        ]}
        action={async ({ indices, networks }) => {
          const indicesArray = indices 
            ? indices.split(',').map((s: string) => parseInt(s.trim(), 10)).filter((n: number) => !isNaN(n))
            : [0];
            
          const networksArray = networks 
            ? networks.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
            : undefined;

          setLastActionOutput({ status: 'Loading...', indices: indicesArray, networks: networksArray });
          
          await loadAddresses(indicesArray, networksArray);
          
          setLastActionOutput({ status: 'Loaded', indices: indicesArray, networks: networksArray });
          return { success: true, message: `Loaded addresses for indices: ${indicesArray.join(', ')}` };
        }}
        actionLabel="Load Addresses"
      />

      <ActionCard
        title="Get Addresses for Network"
        description="Filter loaded addresses by network."
        fields={[
          { id: 'network', type: 'text', label: 'Network ID', placeholder: 'bitcoin' }
        ]}
        action={async ({ network }) => {
          if (!network) return { error: 'Network ID is required' };
          
          const result = getAddressesForNetwork(network);
          setLastActionOutput({ 
            action: 'getAddressesForNetwork', 
            network, 
            result: result
          });
          
          return { success: true, message: `Found ${result.length} addresses for ${network}`, addresses: result };
        }}
        actionLabel="Filter"
      />

      <ActionCard
        title="Resolve Address Info"
        description="Find account info for a specific address string."
        fields={[
          { id: 'address', type: 'text', label: 'Wallet Address', placeholder: 'bc1q...' }
        ]}
        action={async ({ address }) => {
          if (!address) return { error: 'Address is required' };
          
          const info = getAccountInfoFromAddress(address);
          setLastActionOutput({ 
            action: 'getAccountInfoFromAddress', 
            address, 
            found: !!info,
            info 
          });

          if (info) {
            return { success: true, message: `Found info for account ${info.accountIndex} on ${info.network}` };
          } else {
            return { error: 'Address not found in loaded data' };
          }
        }}
        actionLabel="Resolve"
      />

    </FeatureLayout>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
});
