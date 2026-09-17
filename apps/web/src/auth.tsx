import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  api,
  clearSession,
  getStoredUser,
  setSession,
  type SessionUser,
} from './api';

type AuthContextValue = {
  user: SessionUser | null;
  login: (email: string, password: string, tenantName?: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => getStoredUser());

  const login = useCallback(async (email: string, password: string, tenantName?: string) => {
    const result = await api<{
      accessToken: string;
      refreshToken: string;
      user: SessionUser;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, tenantName }),
    });
    setSession(result.accessToken, result.refreshToken, result.user);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } catch {
      /* ignore */
    }
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
