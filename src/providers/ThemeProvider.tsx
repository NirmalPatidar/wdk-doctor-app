import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, type ColorPalette } from '@/constants/colors';

export type ThemeName = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemeName;
  colors: ColorPalette;
  toggleTheme: () => void;
  setTheme: (theme: ThemeName) => void;
}

const THEME_STORAGE_KEY = 'doctor.theme';

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Starts dark (matching the app's existing default) until the persisted
  // preference loads, rather than flashing light-then-dark on launch.
  const [theme, setThemeState] = useState<ThemeName>('dark');

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark') {
          setThemeState(stored);
        }
      })
      .catch(() => {
        // Same reasoning as setTheme's write path below — if reading the
        // stored preference fails for any reason (native module unlinked,
        // storage corruption, whatever), fall back to the default theme
        // silently rather than let this surface as an uncaught rejection.
        // This was the actual bug: setTheme already had this, this read
        // path didn't, which is exactly what produced the crash.
      });
  }, []);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {
      // Best-effort persistence — a failed write just means the preference
      // won't survive a restart, not worth surfacing as an error to the user.
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const value: ThemeContextValue = {
    theme,
    colors: theme === 'dark' ? darkColors : lightColors,
    toggleTheme,
    setTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
