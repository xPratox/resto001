import { ThemeProvider } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold, useFonts } from '@expo-google-fonts/space-grotesk';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import axios, { isAxiosError } from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { Fonts, type MobileBrandTheme } from '@/constants/theme';
import { API_BASE_URL } from '@/lib/api';
import { MobileAuthContext } from '@/lib/auth-session';
import { restoSocket, setSocketAuthToken } from '@/lib/socket';
import { MobileThemeProvider, useMobileTheme } from '@/src/theme/mobile-theme';

export const unstable_settings = {
  anchor: '(tabs)',
};

type ComponentWithStyleDefaults = {
  defaultProps?: {
    style?: unknown;
  };
};

export default function RootLayout() {
  return (
    <MobileThemeProvider>
      <RootLayoutContent />
    </MobileThemeProvider>
  );
}

function RootLayoutContent() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [session, setSession] = useState<{ token: string; usuario: string; rol: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { theme, isDark, toggleTheme, navigationTheme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const isAuthenticatedMesonero = useMemo(
    () => Boolean(session?.token && session.rol === 'mesonero'),
    [session],
  );

  useEffect(() => {
    const defaultTextStyle = { fontFamily: Fonts?.sans, fontWeight: '500' as const };
    const defaultInputStyle = { fontFamily: Fonts?.sans, fontWeight: '500' as const };
    const TextWithDefaults = Text as typeof Text & ComponentWithStyleDefaults;
    const TextInputWithDefaults = TextInput as typeof TextInput & ComponentWithStyleDefaults;

    TextWithDefaults.defaultProps = TextWithDefaults.defaultProps || {};
    TextWithDefaults.defaultProps.style = [defaultTextStyle, TextWithDefaults.defaultProps.style].filter(Boolean);

    TextInputWithDefaults.defaultProps = TextInputWithDefaults.defaultProps || {};
    TextInputWithDefaults.defaultProps.style = [defaultInputStyle, TextInputWithDefaults.defaultProps.style].filter(Boolean);
  }, []);

  if (!fontsLoaded) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator color={theme.accent.primary} />
      </SafeAreaView>
    );
  }

  const handleLogin = async () => {
    if (!usuario.trim() || !contrasena.trim()) {
      setErrorMessage('Debes completar usuario y contrasena.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const response = await axios.post(`${API_BASE_URL}/api/login`, {
        usuario: usuario.trim(),
        contrasena,
      });

      const data = response.data || {};

      if (data.rol !== 'mesonero') {
        throw new Error('Este modulo movil solo permite usuarios con rol mesonero.');
      }

      const token = String(data.token || '');

      if (!token) {
        throw new Error('El backend no devolvio token de sesion.');
      }

      axios.defaults.headers.common.Authorization = `Bearer ${token}`;
      setSocketAuthToken(token);

      setSession({
        token,
        usuario: data.usuario,
        rol: data.rol,
      });
      setContrasena('');
    } catch (error) {
      const message = isAxiosError(error)
        ? error.response?.data?.message
          ? String(error.response.data.message)
          : error.code === 'ERR_NETWORK'
            ? `No se pudo conectar con el backend en ${API_BASE_URL}. Verifica que el telefono y esta PC esten en la misma red Wi-Fi y que services/backend/server.js siga corriendo en el puerto 5000.`
            : String(error.message || 'No se pudo iniciar sesion.')
        : error instanceof Error
          ? error.message
          : 'No se pudo iniciar sesion.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    delete axios.defaults.headers.common.Authorization;
    setSocketAuthToken('');
    if (restoSocket.connected) {
      restoSocket.disconnect();
    }
    setSession(null);
    setContrasena('');
    setErrorMessage('');
  };

  if (!isAuthenticatedMesonero) {
    return (
      <SafeAreaView style={styles.authScreen}>
        <View style={styles.authCard}>
          <View style={styles.authTopRow}>
            <Pressable onPress={toggleTheme} style={styles.themeTogglePill}>
              <FontAwesome5 name={isDark ? 'sun' : 'moon'} size={12} color={theme.text.primary} />
              <Text style={styles.themeToggleText}>{isDark ? 'Claro' : 'Oscuro'}</Text>
            </Pressable>
          </View>
          <Text style={styles.authTitle}>Login mesonero</Text>

          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Usuario</Text>
            <TextInput
              style={styles.fieldInput}
              value={usuario}
              onChangeText={setUsuario}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Usuario"
              placeholderTextColor={theme.text.muted}
            />
          </View>

          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Clave</Text>
            <TextInput
              style={styles.fieldInput}
              value={contrasena}
              onChangeText={setContrasena}
              secureTextEntry
              placeholder="Clave"
              placeholderTextColor={theme.text.muted}
            />
          </View>

          {errorMessage ? <Text style={styles.errorBox}>{errorMessage}</Text> : null}

          <Pressable style={[styles.loginButton, isLoading && styles.loginButtonDisabled]} onPress={handleLogin} disabled={isLoading}>
            {isLoading ? <ActivityIndicator color={theme.text.onAccent} /> : <Text style={styles.loginButtonText}>Entrar</Text>}
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <MobileAuthContext.Provider value={{ session, logout: handleLogout }}>
      <ThemeProvider value={navigationTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="Tables" options={{ headerShown: false }} />
          <Stack.Screen name="active-order" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </ThemeProvider>
    </MobileAuthContext.Provider>
  );
}

const createStyles = (theme: MobileBrandTheme) =>
  StyleSheet.create({
    authScreen: {
      flex: 1,
      backgroundColor: theme.background.deepCarbon,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    authCard: {
      width: '100%',
      maxWidth: 420,
      borderRadius: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border.subtle,
      backgroundColor: theme.surface.card,
      padding: 20,
      gap: 12,
      shadowColor: '#000000',
      shadowOpacity: 0.14,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 12 },
      elevation: 8,
    },
    authTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 12,
    },
    themeTogglePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border.subtle,
      backgroundColor: theme.background.deepCarbon,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    themeToggleText: {
      color: theme.text.primary,
      fontSize: 12,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    authTitle: {
      color: theme.text.primary,
      fontSize: 34,
      lineHeight: 38,
      fontWeight: '700',
      fontFamily: Fonts?.serif,
    },
    fieldWrap: {
      gap: 6,
    },
    fieldLabel: {
      color: theme.text.muted,
      letterSpacing: 2,
      fontSize: 11,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    fieldInput: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border.subtle,
      borderRadius: 12,
      backgroundColor: theme.background.deepCarbon,
      color: theme.text.primary,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    errorBox: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.status.error,
      borderRadius: 10,
      backgroundColor: `${theme.status.error}1A`,
      color: theme.status.error,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 13,
      fontWeight: '600',
      fontFamily: Fonts?.sans,
    },
    loginButton: {
      marginTop: 4,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: theme.accent.primary,
      shadowColor: theme.accent.primary,
      shadowOpacity: 0.16,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    loginButtonDisabled: {
      opacity: 0.6,
    },
    loginButtonText: {
      color: theme.text.onAccent,
      fontWeight: '700',
      fontSize: 15,
      fontFamily: Fonts?.sans,
    },
    loadingScreen: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background.deepCarbon,
    },
  });
