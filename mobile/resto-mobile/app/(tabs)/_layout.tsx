import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { RestoBrandTheme } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        sceneStyle: { backgroundColor: RestoBrandTheme.background.deepCarbon },
        tabBarStyle: {
          backgroundColor: RestoBrandTheme.background.slateAccent,
          borderTopColor: RestoBrandTheme.border.subtle,
        },
        tabBarActiveTintColor: RestoBrandTheme.accent.sunsetOrange,
        tabBarInactiveTintColor: RestoBrandTheme.text.metallicSoft,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Mesonero',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="fork.knife" color={color} />,
        }}
      />
    </Tabs>
  );
}
