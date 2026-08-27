import React, { useState } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { colors } from '@/constants/colors';
import { ConsoleOutput } from './ConsoleOutput';
import { ChainSelector } from './ChainSelector';
import wdkConfigs from '@/config/doctorRuntime';

export interface ActionField {
  id: string;
  label?: string;
  type: 'text' | 'number' | 'chain' | 'json' | 'select';
  placeholder?: string;
  defaultValue?: any;
  options?: Array<{ label: string; value: any }>;
}

interface Props {
  title: string;
  description?: string;
  fields: ActionField[];
  action: (values: Record<string, any>) => Promise<any>;
  actionLabel?: string;
}

export const ActionCard: React.FC<Props> = ({ 
  title, 
  description, 
  fields, 
  action, 
  actionLabel = 'Run' 
}) => {
  // Initialize state with default values
  const [formValues, setFormValues] = useState<Record<string, any>>(() => {
    const initial: Record<string, any> = {};
    fields.forEach(f => {
      if (f.defaultValue !== undefined) {
        initial[f.id] = f.defaultValue;
      } else if (f.type === 'chain') {
        initial[f.id] = Object.keys(wdkConfigs.networks)[0];
      } else if (f.type === 'select') {
        initial[f.id] = f.options?.[0]?.value;
      } else {
        initial[f.id] = '';
      }
    });
    return initial;
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<any>(null);

  const handleRun = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await action(formValues);
      setResult(res);
    } catch (e: any) {
      setError(e.message || e);
    } finally {
      setLoading(false);
    }
  };

  const updateField = (id: string, value: any) => {
    setFormValues(prev => ({ ...prev, [id]: value }));
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {description && <Text style={styles.description}>{description}</Text>}
      </View>

      <View style={styles.form}>
        {fields.map(field => {
          if (field.type === 'chain') {
            return (
              <ChainSelector
                key={field.id}
                label={field.label}
                selectedChain={formValues[field.id]}
                onSelectChain={(chain) => updateField(field.id, chain)}
              />
            );
          }

          if (field.type === 'select') {
            return (
              <View key={field.id} style={styles.fieldContainer}>
                <Text style={styles.label}>{field.label || field.id}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectScrollView}>
                  {field.options?.map(option => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.selectButton,
                        formValues[field.id] === option.value && styles.selectButtonSelected
                      ]}
                      onPress={() => updateField(field.id, option.value)}
                    >
                      <Text style={[
                        styles.selectButtonText,
                        formValues[field.id] === option.value && styles.selectButtonTextSelected
                      ]}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            );
          }

          return (
            <View key={field.id} style={styles.fieldContainer}>
              <Text style={styles.label}>{field.label || field.id}</Text>
              <TextInput
                style={[
                  styles.input, 
                  field.type === 'json' && styles.textArea
                ]}
                value={String(formValues[field.id] ?? '')}
                onChangeText={(text) => updateField(field.id, text)}
                placeholder={field.placeholder}
                placeholderTextColor={colors.textSecondary}
                keyboardType={field.type === 'number' ? 'numeric' : 'default'}
                multiline={field.type === 'json'}
                numberOfLines={field.type === 'json' ? 4 : 1}
                autoCapitalize="none"
              />
            </View>
          );
        })}
      </View>

      <TouchableOpacity 
        style={styles.button} 
        onPress={handleRun}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.black} />
        ) : (
          <Text style={styles.buttonText}>{actionLabel}</Text>
        )}
      </TouchableOpacity>

      {(result || error) && (
        <ConsoleOutput data={result || error} error={!!error} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    marginBottom: 20,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  form: {
    marginBottom: 20,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    color: colors.text,
    fontSize: 16,
    minHeight: 54,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: colors.primary,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: colors.black,
    fontWeight: 'bold',
    fontSize: 16,
  },
  selectScrollView: {
    flexDirection: 'row',
  },
  selectButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 10,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  selectButtonText: {
    color: colors.text,
    fontWeight: '500',
  },
  selectButtonTextSelected: {
    color: colors.black,
  },
});
