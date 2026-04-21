import { createContext, useContext } from 'react';

export type MobileAuthSession = {
  token: string;
  usuario: string;
  rol: string;
} | null;

export type MobileAuthContextValue = {
  session: MobileAuthSession;
  logout: () => void;
};

export const MobileAuthContext = createContext<MobileAuthContextValue>({
  session: null,
  logout: () => {},
});

export function useMobileAuth() {
  return useContext(MobileAuthContext);
}
