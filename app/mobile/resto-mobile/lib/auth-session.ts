import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext } from 'react';

export type MobileAuthSession = {
  token: string;
  usuario: string;
  rol: string;
  nombre?: string;
} | null;

export type MobileAuthContextValue = {
  session: MobileAuthSession;
  logout: () => void | Promise<void>;
};

const MOBILE_AUTH_SESSION_STORAGE_KEY = 'resto001:mobile-auth-session';

function normalizeStoredSession(rawValue: unknown): MobileAuthSession {
  if (!rawValue || typeof rawValue !== 'object') {
    return null;
  }

  const candidate = rawValue as Record<string, unknown>;
  const token = typeof candidate.token === 'string' ? candidate.token.trim() : '';
  const usuario = typeof candidate.usuario === 'string' ? candidate.usuario.trim().toLowerCase() : '';
  const rol = typeof candidate.rol === 'string' ? candidate.rol.trim().toLowerCase() : '';
  const nombre = typeof candidate.nombre === 'string' ? candidate.nombre.trim() : '';

  if (!token || !usuario || !rol) {
    return null;
  }

  return {
    token,
    usuario,
    rol,
    nombre,
  };
}

export async function loadMobileSession() {
  try {
    const storedValue = await AsyncStorage.getItem(MOBILE_AUTH_SESSION_STORAGE_KEY);

    if (!storedValue) {
      return null;
    }

    return normalizeStoredSession(JSON.parse(storedValue));
  } catch {
    await AsyncStorage.removeItem(MOBILE_AUTH_SESSION_STORAGE_KEY);
    return null;
  }
}

export async function persistMobileSession(session: NonNullable<MobileAuthSession>) {
  await AsyncStorage.setItem(MOBILE_AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export async function clearMobileSession() {
  await AsyncStorage.removeItem(MOBILE_AUTH_SESSION_STORAGE_KEY);
}

export const MobileAuthContext = createContext<MobileAuthContextValue>({
  session: null,
  logout: () => {},
});

export function useMobileAuth() {
  return useContext(MobileAuthContext);
}
