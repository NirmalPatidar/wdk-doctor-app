import React, { useState } from 'react';
import { StyleSheet, View, Text, Modal, TouchableOpacity, FlatList } from 'react-native';
import { ChevronDown, X, Check } from 'lucide-react-native';
import { colors } from '@/constants/colors';
import wdkConfigs from '@/config/chain';

interface Props {
  selectedChain: string;
  onSelectChain: (chain: string) => void;
  label?: string;
}

export const ChainSelector: React.FC<Props> = ({ selectedChain, onSelectChain, label = "Network" }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const chains = Object.keys(wdkConfigs.networks);

  const handleSelect = (chain: string) => {
    onSelectChain(chain);
    setModalVisible(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      
      <TouchableOpacity 
        style={styles.selector} 
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.selectedValue}>{selectedChain}</Text>
        <ChevronDown size={20} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Network</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            
            <FlatList
              data={chains}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={[styles.option, item === selectedChain && styles.selectedOption]} 
                  onPress={() => handleSelect(item)}
                >
                  <Text style={[styles.optionText, item === selectedChain && styles.selectedOptionText]}>
                    {item}
                  </Text>
                  {item === selectedChain && <Check size={20} color={colors.primary} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
    fontWeight: '500',
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
  },
  selectedValue: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  selectedOption: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  optionText: {
    fontSize: 16,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  selectedOptionText: {
    color: colors.primary,
    fontWeight: '600',
  },
});
