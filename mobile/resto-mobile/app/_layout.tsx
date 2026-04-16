import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import axios, { isAxiosError } from 'axios';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { RestoBrandTheme } from '@/constants/theme';
import { API_BASE_URL } from '@/lib/api';
import { MobileAuthContext } from '@/lib/auth-session';
import { restoSocket, setSocketAuthToken } from '@/lib/socket';

export const unstable_settings = {
  anchor: '(tabs)',
};

const restoNavigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: RestoBrandTheme.accent.primary,
    background: RestoBrandTheme.background.deepCarbon,
    card: RestoBrandTheme.background.slateAccent,
    text: RestoBrandTheme.text.metallicLight,
    border: RestoBrandTheme.border.subtle,
    notification: RestoBrandTheme.status.success,
  },
};

export default function RootLayout() {
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [session, setSession] = useState<{ token: string; usuario: string; rol: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const isAuthenticatedMesonero = useMemo(
    () => Boolean(session?.token && session.rol === 'mesonero'),
    [session],
  );

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
        ? String(error.response?.data?.message || error.message || 'No se pudo iniciar sesion.')
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
          <Text style={styles.authKicker}>RESTO 001</Text>
          <Text style={styles.authTitle}>Login mesonero</Text>
          <Text style={styles.authSubtitle}>Inicia sesion para entrar al modulo movil.</Text>

          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>USUARIO</Text>
            <TextInput
              style={styles.fieldInput}
              value={usuario}
              onChangeText={setUsuario}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="mesonero"
              placeholderTextColor="#64748b"
            />
          </View>

          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>CONTRASENA</Text>
            <TextInput
              style={styles.fieldInput}
              value={contrasena}
              onChangeText={setContrasena}
              secureTextEntry
              placeholder="********"
              placeholderTextColor="#64748b"
            />
          </View>

          {errorMessage ? <Text style={styles.errorBox}>{errorMessage}</Text> : null}

          <Pressable style={[styles.loginButton, isLoading && styles.loginButtonDisabled]} onPress={handleLogin} disabled={isLoading}>
            {isLoading ? <ActivityIndicator color="#082f49" /> : <Text style={styles.loginButtonText}>Entrar</Text>}
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <MobileAuthContext.Provider value={{ session, logout: handleLogout }}>
      <ThemeProvider value={restoNavigationTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="Tables" options={{ headerShown: false }} />
          <Stack.Screen name="active-order" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="light" />
      </ThemeProvider>
    </MobileAuthContext.Provider>
  );
}

const styles = StyleSheet.create({
  authScreen: {
    flex: 1,
    backgroundColor: '#020617',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  authCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.35)',
    backgroundColor: 'rgba(15,23,42,0.95)',
    padding: 20,
    gap: 12,
  },
  authKicker: {
    color: '#67e8f9',
    letterSpacing: 2.8,
    fontSize: 11,
    fontWeight: '700',
  },
  authTitle: {
    color: '#f8fafc',
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800',
  },
  authSubtitle: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 2,
  },
  fieldWrap: {
    gap: 6,
  },
  fieldLabel: {
    color: '#94a3b8',
    letterSpacing: 2,
    fontSize: 11,
    fontWeight: '700',
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    backgroundColor: '#020617',
    color: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  errorBox: {
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.45)',
    borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.12)',
    color: '#fecaca',
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    fontWeight: '600',
  },
  loginButton: {
    marginTop: 4,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#22d3ee',
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#082f49',
    fontWeight: '700',
    fontSize: 15,
  },
});
