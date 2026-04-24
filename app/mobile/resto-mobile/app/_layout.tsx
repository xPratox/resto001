import { ThemeProvider } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold, useFonts } from '@expo-google-fonts/space-grotesk';
import { Redirect, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import axios, { isAxiosError } from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { Fonts, type MobileBrandTheme } from '@/constants/theme';
import { API_BASE_URL } from '@/lib/api';
import { clearMobileSession, loadMobileSession, MobileAuthContext, persistMobileSession, type MobileAuthSession } from '@/lib/auth-session';
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

function clearAuthenticatedClients() {
  delete axios.defaults.headers.common.Authorization;
  setSocketAuthToken('');

  if (restoSocket.connected) {
    restoSocket.disconnect();
  }
}

function applyAuthenticatedClients(token: string) {
  axios.defaults.headers.common.Authorization = `Bearer ${token}`;
  setSocketAuthToken(token);
}

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
  const [session, setSession] = useState<MobileAuthSession>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [isAuthClientsReady, setIsAuthClientsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { theme, isDark, toggleTheme, navigationTheme } = useMobileTheme();
  const segments = useSegments();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const normalizedRole = String(session?.rol || '').trim().toLowerCase();
  const isAuthenticated = Boolean(session?.token && normalizedRole);
  const isMesoneroSession = normalizedRole === 'mesonero';
  const isAdminSession = normalizedRole === 'admin';
  const currentRootSegment = String(segments[0] || '');

  const roleHomePath = useMemo(() => {
    if (isMesoneroSession) {
      return '/(tabs)';
    }

    if (isAdminSession) {
      return '/(admin)';
    }

    return null;
  }, [isAdminSession, isMesoneroSession]);

  const isRouteAllowedForRole = useMemo(() => {
    if (!isAuthenticated) {
      return true;
    }

    if (isMesoneroSession) {
      return currentRootSegment === '(tabs)' || currentRootSegment === 'Tables' || currentRootSegment === 'active-order';
    }

    if (isAdminSession) {
      return currentRootSegment === '(admin)';
    }

    return false;
  }, [currentRootSegment, isAdminSession, isAuthenticated, isMesoneroSession]);

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

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      const restoredSession = await loadMobileSession();

      if (!isMounted) {
        return;
      }

      setSession(restoredSession);
      setUsuario(restoredSession?.usuario || '');
      setIsRestoringSession(false);
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isRestoringSession) {
      return;
    }

    if (session?.token) {
      applyAuthenticatedClients(session.token);
      setIsAuthClientsReady(true);
      void persistMobileSession(session);
      return;
    }

    clearAuthenticatedClients();
    setIsAuthClientsReady(true);
    void clearMobileSession();
  }, [isRestoringSession, session]);

  if (!fontsLoaded || isRestoringSession || (Boolean(session?.token) && !isAuthClientsReady)) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator color={theme.accent.primary} />
        <StatusBar style={isDark ? 'light' : 'dark'} />
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
      const token = String(data.token || '');
      const rol = String(data.rol || '').trim().toLowerCase();
      const nextUsuario = String(data.usuario || usuario).trim().toLowerCase();
      const nombre = typeof data.nombre === 'string' ? data.nombre.trim() : '';

      if (!token || !rol || !nextUsuario) {
        throw new Error('El backend no devolvio una sesion valida.');
      }

      if (rol !== 'admin' && rol !== 'mesonero') {
        throw new Error('Demo móvil habilitada solo para roles admin y mesonero.');
      }

      setIsAuthClientsReady(false);
      setSession({
        token,
        usuario: nextUsuario,
        rol,
        nombre,
      });
      setUsuario(nextUsuario);
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
    setIsAuthClientsReady(false);
    setSession(null);
    setContrasena('');
    setErrorMessage('');
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.authScreen}>
        <View style={styles.authCard}>
          <View style={styles.authTopRow}>
            <Pressable onPress={toggleTheme} style={styles.themeTogglePill}>
              <FontAwesome5 name={isDark ? 'sun' : 'moon'} size={12} color={theme.text.primary} />
              <Text style={styles.themeToggleText}>{isDark ? 'Claro' : 'Oscuro'}</Text>
            </Pressable>
          </View>
          <Text style={styles.authTitle}>Login Resto001</Text>

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
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </SafeAreaView>
    );
  }

  if (!isMesoneroSession && !isAdminSession) {
    return (
      <MobileAuthContext.Provider value={{ session, logout: handleLogout }}>
        <SafeAreaView style={styles.authScreen}>
          <View style={styles.authCard}>
            <View style={styles.authTopRow}>
              <Pressable onPress={toggleTheme} style={styles.themeTogglePill}>
                <FontAwesome5 name={isDark ? 'sun' : 'moon'} size={12} color={theme.text.primary} />
                <Text style={styles.themeToggleText}>{isDark ? 'Claro' : 'Oscuro'}</Text>
              </Pressable>
            </View>
            <Text style={styles.authEyebrow}>ROL DETECTADO</Text>
            <Text style={styles.authTitle}>{session?.nombre || session?.usuario || 'Usuario'}</Text>
            <Text style={styles.authSubtitle}>La sesión se autenticó correctamente, pero esta demo móvil solo permite roles admin y mesonero. Rol detectado: {normalizedRole || 'desconocido'}.</Text>
            <Pressable style={styles.secondaryButton} onPress={handleLogout}>
              <Text style={styles.secondaryButtonText}>Cerrar sesión</Text>
            </Pressable>
          </View>
          <StatusBar style={isDark ? 'light' : 'dark'} />
        </SafeAreaView>
      </MobileAuthContext.Provider>
    );
  }

  if (roleHomePath && !isRouteAllowedForRole) {
    return <Redirect href={roleHomePath} />;
  }

  return (
    <MobileAuthContext.Provider value={{ session, logout: handleLogout }}>
      <ThemeProvider value={navigationTheme}>
        <Stack>
          {isMesoneroSession ? <Stack.Screen name="(tabs)" options={{ headerShown: false }} /> : null}
          {isMesoneroSession ? <Stack.Screen name="Tables" options={{ headerShown: false }} /> : null}
          {isMesoneroSession ? <Stack.Screen name="active-order" options={{ headerShown: false }} /> : null}
          {isAdminSession ? <Stack.Screen name="(admin)" options={{ headerShown: false }} /> : null}
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
    authEyebrow: {
      color: theme.text.muted,
      letterSpacing: 3,
      fontSize: 11,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
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
    authSubtitle: {
      color: theme.text.secondary,
      fontSize: 14,
      lineHeight: 22,
      fontFamily: Fonts?.sans,
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
    secondaryButton: {
      marginTop: 8,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border.strong,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: theme.background.deepCarbon,
    },
    secondaryButtonText: {
      color: theme.text.primary,
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
