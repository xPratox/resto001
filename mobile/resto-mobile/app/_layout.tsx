import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { RestoBrandTheme } from '@/constants/theme';

export const unstable_settings = {
  anchor: '(tabs)',
};

const restoNavigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: RestoBrandTheme.accent.sunsetOrange,
    background: RestoBrandTheme.background.deepCarbon,
    card: RestoBrandTheme.background.slateAccent,
    text: RestoBrandTheme.text.metallicLight,
    border: RestoBrandTheme.border.subtle,
    notification: RestoBrandTheme.status.success,
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={restoNavigationTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="Tables" options={{ headerShown: false }} />
        <Stack.Screen name="active-order" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
