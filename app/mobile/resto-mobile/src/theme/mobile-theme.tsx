import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

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
  const mode: MobileThemeMode = 'light';

  const value = useMemo<MobileThemeContextValue>(() => {
    const theme = getRestoBrandTheme(mode);

    return {
      mode,
      isDark: false,
      theme,
      navigationTheme: createNavigationTheme(mode, theme),
      toggleTheme: () => {},
      setMode: (_mode: MobileThemeMode) => {},
    };
  }, []);

  return <MobileThemeContext.Provider value={value}>{children}</MobileThemeContext.Provider>;
}

export function useMobileTheme() {
  const context = useContext(MobileThemeContext);

  if (!context) {
    throw new Error('useMobileTheme must be used inside MobileThemeProvider');
  }

  return context;
}