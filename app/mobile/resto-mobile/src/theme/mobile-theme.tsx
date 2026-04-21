import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { getRestoBrandTheme, type MobileBrandTheme, type MobileThemeMode } from '@/constants/theme';

type MobileThemeContextValue = {
  mode: MobileThemeMode;
  isDark: boolean;
  theme: MobileBrandTheme;
  navigationTheme: Theme;
  toggleTheme: () => void;
  setMode: (mode: MobileThemeMode) => void;
};

const MobileThemeContext = createContext<MobileThemeContextValue | null>(null);
let persistedThemeMode: MobileThemeMode | null = null;

function createNavigationTheme(mode: MobileThemeMode, theme: MobileBrandTheme): Theme {
  const baseTheme = mode === 'light' ? DefaultTheme : DarkTheme;

  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: theme.accent.primary,
      background: theme.background.deepCarbon,
      card: theme.background.slateAccent,
      text: theme.text.primary,
      border: theme.border.subtle,
      notification: theme.status.success,
    },
  };
}

export function MobileThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [mode, setModeState] = useState<MobileThemeMode>(persistedThemeMode ?? (systemColorScheme === 'light' ? 'light' : 'dark'));

  const setMode = (nextMode: MobileThemeMode) => {
    persistedThemeMode = nextMode;
    setModeState(nextMode);
  };

  const value = useMemo<MobileThemeContextValue>(() => {
    const theme = getRestoBrandTheme(mode);

    return {
      mode,
      isDark: mode === 'dark',
      theme,
      navigationTheme: createNavigationTheme(mode, theme),
      toggleTheme: () => setMode(mode === 'dark' ? 'light' : 'dark'),
      setMode,
    };
  }, [mode]);

  return <MobileThemeContext.Provider value={value}>{children}</MobileThemeContext.Provider>;
}

export function useMobileTheme() {
  const context = useContext(MobileThemeContext);

  if (!context) {
    throw new Error('useMobileTheme must be used inside MobileThemeProvider');
  }

  return context;
}