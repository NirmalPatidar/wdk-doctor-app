import React from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';

interface Props {
  data: any;
  error?: boolean;
}

export const ConsoleOutput: React.FC<Props> = ({ data, error }) => {
  if (!data) return null;

  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

  return (
    <View style={[styles.container, error && styles.errorContainer]}>
      <Text style={styles.label}>Output:</Text>
      <ScrollView style={styles.scroll} nestedScrollEnabled>
        <Text selectable style={[styles.text, error && styles.errorText]}>{text}</Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0d1117',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#30363d',
    padding: 12,
    marginTop: 16,
    maxHeight: 200,
  },
  errorContainer: {
    borderColor: 'rgba(248, 81, 73, 0.4)',
    backgroundColor: 'rgba(248, 81, 73, 0.1)',
  },
  label: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#8b949e',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  scroll: {
    maxHeight: 180,
  },
  text: {
    color: '#c9d1d9',
    fontFamily: 'monospace',
    fontSize: 12,
  },
  errorText: {
    color: '#ff7b72',
  },
});
