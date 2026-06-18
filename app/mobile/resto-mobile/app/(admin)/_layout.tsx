import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useMobileAuth } from '@/lib/auth-session';

export default function AdminMobileLayout() {
  const { session } = useMobileAuth();
  const router = useRouter();

  useEffect(() => {
    if (session?.rol === 'mesonero') {
      router.replace('/(tabs)');
    } else if (session?.rol === 'caja') {
      router.replace('/(caja)');
    }
  }, [router, session?.rol]);

  if (session?.rol === 'mesonero' || session?.rol === 'caja') {
    return null;
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}