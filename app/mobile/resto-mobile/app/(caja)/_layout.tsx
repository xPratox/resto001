import { Redirect, Stack } from 'expo-router';

import { useMobileAuth } from '@/lib/auth-session';

export default function CajaMobileLayout() {
  const { session } = useMobileAuth();

  if (session?.rol === 'mesonero') {
    return <Redirect href="/(tabs)" />;
  }

  if (session?.rol === 'admin') {
    return <Redirect href="/(admin)" />;
  }

  if (session?.rol === 'cocina') {
    return <Redirect href="/(cocina)" />;
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}