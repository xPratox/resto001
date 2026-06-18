import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useMobileAuth } from '@/lib/auth-session';

export default function CajaMobileLayout() {
  const { session } = useMobileAuth();
  const router = useRouter();

  useEffect(() => {
    if (session?.rol === 'admin') {
      router.replace('/(admin)');
    } else if (session?.rol === 'mesonero') {
      router.replace('/(tabs)');
    } else {
      router.replace('/');
    }
  }, [router, session?.rol]);

  return null;
}