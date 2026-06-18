import { Tabs, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useMobileAuth } from '@/lib/auth-session';
import { useMobileTheme } from '@/src/theme/mobile-theme';

export default function TabLayout() {
  const { session } = useMobileAuth();
  const { theme } = useMobileTheme();
  const router = useRouter();

  useEffect(() => {
    if (session?.rol === 'admin') {
      router.replace('/(admin)');
    } else if (session?.rol === 'caja') {
      router.replace('/(caja)');
    }
  }, [router, session?.rol]);

  if (session?.rol === 'admin' || session?.rol === 'caja') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background.deepCarbon }}>
        <ActivityIndicator color={theme.accent.primary} />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        sceneStyle: { backgroundColor: theme.background.deepCarbon },
        tabBarStyle: {
          backgroundColor: theme.background.slateAccent,
          borderTopColor: theme.border.subtle,
        },
        tabBarActiveTintColor: theme.accent.primary,
        tabBarInactiveTintColor: theme.text.metallicSoft,
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Mesonero',
        }}
      />
    </Tabs>
  );
}
