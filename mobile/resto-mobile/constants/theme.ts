import { Platform } from 'react-native';

import colors from '@/src/theme/colors';
import typography from '@/src/theme/typography';

export const RestoBrandTheme = {
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
    accent: 'rgba(0, 216, 255, 0.36)',
  },
  overlay: {
    scrim: colors.overlay,
  },
} as const;

export const Colors = {
  light: {
    text: RestoBrandTheme.text.metallicLight,
    background: RestoBrandTheme.background.deepCarbon,
    tint: RestoBrandTheme.accent.primary,
    icon: RestoBrandTheme.accent.secondary,
    tabIconDefault: RestoBrandTheme.text.metallicSoft,
    tabIconSelected: RestoBrandTheme.accent.primary,
  },
  dark: {
    text: RestoBrandTheme.text.metallicLight,
    background: RestoBrandTheme.background.deepCarbon,
    tint: RestoBrandTheme.accent.primary,
    icon: RestoBrandTheme.accent.secondary,
    tabIconDefault: RestoBrandTheme.text.metallicSoft,
    tabIconSelected: RestoBrandTheme.accent.primary,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

export const Typography = typography;
