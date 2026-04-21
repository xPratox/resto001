import { Tabs } from 'expo-router';
import React from 'react';

import { useMobileTheme } from '@/src/theme/mobile-theme';

export default function TabLayout() {
  const { theme } = useMobileTheme();

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
