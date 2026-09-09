import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { ThemeProvider as UikitThemeProvider } from '@tetherto/wdk-uikit-react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { Toaster } from 'sonner-native';
import { DoctorWorkletProvider, useDoctorWorklet } from '../providers/DoctorWorkletProvider';
import { ThemeProvider as DoctorThemeProvider, useTheme } from '../providers/ThemeProvider';

SplashScreen.preventAutoHideAsync();

const SplashHandler = ({ children }: { children: React.ReactNode }) => {
  const { workletStatus } = useDoctorWorklet();

  useEffect(() => {
    // Old behavior hid the splash screen as soon as WdkAppProvider's status
    // first became 'INITIALIZING' — effectively immediately, since that was
    // its starting state. workletStatus starts at 'initializing' the same
    // way, so hiding on mount here is the faithful equivalent: the app's own
    // UI (the Worklet Ready / Wallet Ready badges) takes over from here,
    // same as before.
    SplashScreen.hideAsync();
  }, [workletStatus]);

  return <>{children}</>;
};

const ThemedApp = () => {
  const { theme, colors } = useTheme();

  const navigationTheme = {
    ...(theme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(theme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.background,
      card: colors.background,
      border: colors.border,
      text: colors.text,
      primary: colors.primary,
    },
  };

  return (
    // NOTE — untested assumption: wdk-uikit-react-native's ThemeProvider
    // takes this prop as `defaultMode`, not `mode`. The name suggests it may
    // only be read once at mount rather than reacting to changes on every
    // render, since we don't have that package's source to confirm either
    // way. If toggling the theme changes this app's own screens but the
    // UIKit's own components (whichever ones use its internal styling) stay
    // stuck on whatever mode was active at launch, this is the first place
    // to look.
    <UikitThemeProvider
      defaultMode={theme}
      brandConfig={{
        primaryColor: colors.primary,
      }}
    >
      <NavigationThemeProvider value={navigationTheme}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          />
          <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        </View>
      </NavigationThemeProvider>
      <Toaster
        offset={90}
        toastOptions={{
          style: {
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.border,
          },
          titleStyle: { color: colors.text },
          descriptionStyle: { color: colors.text },
        }}
      />
    </UikitThemeProvider>
  );
};

export default function RootLayout() {
  return (
    <DoctorThemeProvider>
      <DoctorWorkletProvider>
        <SplashHandler>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <ThemedApp />
          </GestureHandlerRootView>
        </SplashHandler>
      </DoctorWorkletProvider>
    </DoctorThemeProvider>
  );
}
