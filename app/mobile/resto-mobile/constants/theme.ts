import { Platform } from 'react-native';

import colors from '@/src/theme/colors';
import typography from '@/src/theme/typography';

export type MobileThemeMode = 'light' | 'dark';

export type MobileBrandTheme = {
  background: {
    deepCarbon: string;
    slateAccent: string;
    elevated: string;
  };
  surface: {
    base: string;
    card: string;
    elevated: string;
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
    metallicLight: string;
    metallicMuted: string;
    metallicSoft: string;
    contrastOnAccent: string;
    onAccent: string;
  };
  accent: {
    primary: string;
    secondary: string;
    electricViolet: string;
    actionCyan: string;
    sunsetOrange: string;
  };
  status: {
    info: string;
    neutral: string;
    success: string;
    warning: string;
    cleaning: string;
    danger: string;
    error: string;
  };
  border: {
    subtle: string;
    strong: string;
    accent: string;
  };
  overlay: {
    scrim: string;
  };
};

const darkRestoBrandTheme: MobileBrandTheme = {
  background: {
    deepCarbon: colors.restoBg,
    slateAccent: colors.restoSurface,
    elevated: colors.restoSurface,
  },
  surface: {
    base: colors.restoBg,
    card: colors.restoSurface,
    elevated: colors.restoSurface,
  },
  text: {
    primary: colors.restoText,
    secondary: colors.textMuted,
    muted: colors.textSoft,
    metallicLight: colors.restoText,
    metallicMuted: colors.textMuted,
    metallicSoft: colors.textSoft,
    contrastOnAccent: colors.restoBg,
    onAccent: colors.restoBg,
  },
  accent: {
    primary: colors.restoAccent,
    secondary: colors.restoCyan,
    electricViolet: colors.restoAccent,
    actionCyan: colors.restoCyan,
    sunsetOrange: colors.restoAccent,
  },
  status: {
    info: colors.pending,
    neutral: colors.pending,
    success: colors.ready,
    warning: colors.modified,
    cleaning: colors.modified,
    danger: colors.critical,
    error: colors.critical,
  },
  border: {
    subtle: colors.border,
    strong: colors.borderStrong,
    accent: 'rgba(212, 175, 55, 0.36)',
  },
  overlay: {
    scrim: colors.overlay,
  },
};

const lightRestoBrandTheme: MobileBrandTheme = {
  background: {
    deepCarbon: '#F6F1E8',
    slateAccent: '#FFFDFC',
    elevated: '#FFFFFF',
  },
  surface: {
    base: '#FFFFFF',
    card: '#FFFDFC',
    elevated: '#FFFFFF',
  },
  text: {
    primary: '#1A1A1A',
    secondary: '#5F5A52',
    muted: '#8A8378',
    metallicLight: '#1A1A1A',
    metallicMuted: '#5F5A52',
    metallicSoft: '#8A8378',
    contrastOnAccent: '#1A1A1A',
    onAccent: '#1A1A1A',
  },
  accent: {
    primary: colors.restoAccent,
    secondary: '#D3D3D3',
    electricViolet: colors.restoAccent,
    actionCyan: '#D3D3D3',
    sunsetOrange: colors.restoAccent,
  },
  status: {
    info: '#E8DED0',
    neutral: '#E8DED0',
    success: colors.ready,
    warning: '#D3D3D3',
    cleaning: '#D3D3D3',
    danger: colors.critical,
    error: colors.critical,
  },
  border: {
    subtle: 'rgba(95, 90, 82, 0.16)',
    strong: 'rgba(212, 175, 55, 0.3)',
    accent: 'rgba(212, 175, 55, 0.28)',
  },
  overlay: {
    scrim: 'rgba(26, 26, 26, 0.24)',
  },
};

export function getRestoBrandTheme(mode: MobileThemeMode = 'dark'): MobileBrandTheme {
  return mode === 'light' ? lightRestoBrandTheme : darkRestoBrandTheme;
}

export const RestoBrandTheme = darkRestoBrandTheme;

export const Colors = {
  light: {
    text: lightRestoBrandTheme.text.primary,
    background: lightRestoBrandTheme.background.deepCarbon,
    tint: lightRestoBrandTheme.accent.primary,
    icon: lightRestoBrandTheme.accent.secondary,
    tabIconDefault: '#7A7A7A',
    tabIconSelected: lightRestoBrandTheme.accent.primary,
  },
  dark: {
    text: darkRestoBrandTheme.text.metallicLight,
    background: darkRestoBrandTheme.background.deepCarbon,
    tint: darkRestoBrandTheme.accent.primary,
    icon: darkRestoBrandTheme.accent.secondary,
    tabIconDefault: darkRestoBrandTheme.text.metallicSoft,
    tabIconSelected: darkRestoBrandTheme.accent.primary,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'SpaceGrotesk_500Medium',
    serif: 'Georgia',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'SpaceGrotesk_700Bold',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'SpaceGrotesk_500Medium',
    serif: 'serif',
    rounded: 'SpaceGrotesk_700Bold',
    mono: 'monospace',
  },
  web: {
    sans: "'Space Grotesk', system-ui, sans-serif",
    serif: "Georgia, serif",
    rounded: "'Space Grotesk', system-ui, sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

export const Typography = typography;
