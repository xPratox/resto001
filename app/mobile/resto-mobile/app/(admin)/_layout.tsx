import { Redirect, Stack } from 'expo-router';

import { useMobileAuth } from '@/lib/auth-session';

export default function AdminMobileLayout() {
  const { session } = useMobileAuth();

  if (session?.rol === 'mesonero') {
    return <Redirect href="/(tabs)" />;
  }

  if (session?.rol === 'caja') {
    return <Redirect href="/(caja)" />;
  }

  if (session?.rol === 'cocina') {
    return <Redirect href="/(cocina)" />;
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="web" options={{ headerShown: false }} />
    </Stack>
  );
}