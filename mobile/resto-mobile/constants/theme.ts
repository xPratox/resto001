/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

export const RestoBrandTheme = {
  background: {
    deepCarbon: '#0F172A',
    slateAccent: '#1E293B',
  },
  text: {
    metallicLight: '#F8FAFC',
    metallicMuted: '#CBD5E1',
    metallicSoft: '#94A3B8',
    contrastOnAccent: '#0F172A',
  },
  accent: {
    sunsetOrange: '#FF6B35',
  },
  status: {
    success: '#10B981',
    error: '#EF4444',
  },
  border: {
    subtle: '#334155',
  },
  overlay: {
    scrim: 'rgba(15, 23, 42, 0.78)',
  },
} as const;

export const Colors = {
  light: {
    text: RestoBrandTheme.text.metallicLight,
    background: RestoBrandTheme.background.deepCarbon,
    tint: RestoBrandTheme.accent.sunsetOrange,
    icon: RestoBrandTheme.text.metallicSoft,
    tabIconDefault: RestoBrandTheme.text.metallicSoft,
    tabIconSelected: RestoBrandTheme.accent.sunsetOrange,
  },
  dark: {
    text: RestoBrandTheme.text.metallicLight,
    background: RestoBrandTheme.background.deepCarbon,
    tint: RestoBrandTheme.accent.sunsetOrange,
    icon: RestoBrandTheme.text.metallicSoft,
    tabIconDefault: RestoBrandTheme.text.metallicSoft,
    tabIconSelected: RestoBrandTheme.accent.sunsetOrange,
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
