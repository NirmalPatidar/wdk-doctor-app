import React, { useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { useTheme } from '@/providers/ThemeProvider';
import type { ColorPalette } from '@/constants/colors';

interface Props {
  data: any;
  error?: boolean;
}

export const ConsoleOutput: React.FC<Props> = ({ data, error }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

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

// Previously a set of hardcoded, permanently-dark terminal colors
// (#0d1117 etc.), unrelated to the app's own palette — mapped onto existing
// tokens here instead of adding new ones, so this looks like a properly
// integrated part of whichever theme is active rather than a fixed dark
// panel regardless of it.
function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {
      backgroundColor: colors.cardDark,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      marginTop: 16,
      maxHeight: 200,
    },
    errorContainer: {
      borderColor: colors.dangerBorder,
      backgroundColor: colors.dangerBackground,
    },
    label: {
      fontSize: 10,
      fontWeight: 'bold',
      color: colors.textSecondary,
      marginBottom: 4,
      textTransform: 'uppercase',
    },
    scroll: {
      maxHeight: 180,
    },
    text: {
      color: colors.text,
      fontFamily: 'monospace',
      fontSize: 12,
    },
    errorText: {
      color: colors.danger,
    },
  });
}
