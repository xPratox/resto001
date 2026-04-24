import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { Fonts, type MobileBrandTheme } from '@/constants/theme';
import { API_BASE_URL } from '@/lib/api';
import { useMobileTheme } from '@/src/theme/mobile-theme';

const DEFAULT_ADMIN_PORT = '5174';

function buildAdminWebUrl() {
  try {
    const url = new URL(API_BASE_URL);
    url.port = process.env.EXPO_PUBLIC_ADMIN_WEB_PORT || DEFAULT_ADMIN_PORT;
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return `http://127.0.0.1:${DEFAULT_ADMIN_PORT}`;
  }
}

export default function AdminWebInExpoScreen() {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const adminWebUrl = useMemo(() => buildAdminWebUrl(), []);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>ADMIN WEB</Text>
          <Text style={styles.title}>Panel en Expo Go</Text>
          <Text style={styles.subtitle}>Si no carga, verifica que admin-web esté corriendo y que el teléfono esté en la misma red LAN.</Text>
        </View>
        <Pressable style={styles.urlPill}>
          <Ionicons name="globe-outline" size={14} color={theme.text.primary} />
          <Text style={styles.urlText}>{adminWebUrl}</Text>
        </Pressable>
      </View>

      <View style={styles.webWrap}>
        <WebView
          source={{ uri: adminWebUrl }}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={theme.accent.primary} />
              <Text style={styles.loadingText}>Cargando Admin Web...</Text>
            </View>
          )}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['*']}
        />
      </View>
    </SafeAreaView>
  );
}

const createStyles = (theme: MobileBrandTheme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background.deepCarbon,
    },
    header: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 10,
      gap: 10,
    },
    headerCopy: {
      gap: 6,
    },
    eyebrow: {
      color: theme.text.muted,
      fontSize: 11,
      letterSpacing: 2,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    title: {
      color: theme.text.primary,
      fontSize: 26,
      lineHeight: 30,
      fontWeight: '700',
      fontFamily: Fonts?.serif,
    },
    subtitle: {
      color: theme.text.secondary,
      fontSize: 13,
      lineHeight: 20,
      fontFamily: Fonts?.sans,
    },
    urlPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border.strong,
      backgroundColor: theme.surface.card,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    urlText: {
      flex: 1,
      color: theme.text.primary,
      fontSize: 12,
      fontFamily: Fonts?.sans,
    },
    webWrap: {
      flex: 1,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border.subtle,
      overflow: 'hidden',
    },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: theme.background.deepCarbon,
    },
    loadingText: {
      color: theme.text.secondary,
      fontSize: 13,
      fontFamily: Fonts?.sans,
    },
  });
