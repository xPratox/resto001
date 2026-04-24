import { Redirect, Stack } from 'expo-router';

import { useMobileAuth } from '@/lib/auth-session';

export default function CajaMobileLayout() {
  const { session } = useMobileAuth();

  if (session?.rol === 'admin') {
    return <Redirect href="/(admin)" />;
  }

  if (session?.rol === 'mesonero') {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/" />;
}