import { Redirect, Tabs } from 'expo-router';
import React from 'react';

import { useMobileAuth } from '@/lib/auth-session';
import { useMobileTheme } from '@/src/theme/mobile-theme';

export default function TabLayout() {
  const { session } = useMobileAuth();
  const { theme } = useMobileTheme();

  if (session?.rol === 'admin') {
    return <Redirect href="/(admin)" />;
  }

  if (session?.rol === 'caja') {
    return <Redirect href="/(caja)" />;
  }

  if (session?.rol === 'cocina') {
    return <Redirect href="/(cocina)" />;
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
