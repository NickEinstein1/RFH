import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  api,
  clearSession,
  getStoredHomes,
  getStoredUser,
  setSession,
  type HomeSummary,
  type SessionUser,
} from './api';

const IDLE_MS = 15 * 60 * 1000;
const WARN_BEFORE_MS = 60 * 1000;
const ABSOLUTE_MS = 8 * 60 * 60 * 1000;
const SESSION_STARTED_KEY = 'rfh_session_started';

type AuthContextValue = {
  user: SessionUser | null;
  homes: HomeSummary[];
  login: (email: string, password: string, tenantName?: string) => Promise<void>;
  logout: () => Promise<void>;
  switchHome: (tenantId: string) => Promise<void>;
  idleWarning: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => getStoredUser());
  const [homes, setHomes] = useState<HomeSummary[]>(() => getStoredHomes());
  const [idleWarning, setIdleWarning] = useState(false);
  const lastActivity = useRef(Date.now());
  const logoutRef = useRef<() => Promise<void>>(async () => undefined);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } catch {
      /* ignore */
    }
    clearSession();
    localStorage.removeItem(SESSION_STARTED_KEY);
    setIdleWarning(false);
    setHomes([]);
    setUser(null);
  }, []);

  logoutRef.current = logout;

  const login = useCallback(async (email: string, password: string, tenantName?: string) => {
    const result = await api<{
      accessToken: string;
      refreshToken: string;
      user: SessionUser;
      homes?: HomeSummary[];
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, tenantName }),
    });
    const nextHomes = result.homes || [];
    setSession(result.accessToken, result.refreshToken, result.user, nextHomes);
    localStorage.setItem(SESSION_STARTED_KEY, String(Date.now()));
    lastActivity.current = Date.now();
    setIdleWarning(false);
    setHomes(nextHomes);
    setUser(result.user);
  }, []);

  const switchHome = useCallback(async (tenantId: string) => {
    const result = await api<{
      accessToken: string;
      refreshToken: string;
      user: SessionUser;
      homes?: HomeSummary[];
    }>('/auth/switch-home', {
      method: 'POST',
      body: JSON.stringify({ tenantId }),
    });
    const nextHomes = result.homes || [];
    setSession(result.accessToken, result.refreshToken, result.user, nextHomes);
    localStorage.setItem(SESSION_STARTED_KEY, String(Date.now()));
    lastActivity.current = Date.now();
    setHomes(nextHomes);
    setUser(result.user);
    window.location.assign('/');
  }, []);

  useEffect(() => {
    if (!user) return;
    void api<{ homes?: HomeSummary[] }>('/auth/me')
      .then((me) => {
        if (me.homes) {
          setHomes(me.homes);
          localStorage.setItem('rfh_homes', JSON.stringify(me.homes));
        }
      })
      .catch(() => undefined);
  }, [user?.tenantId]);

  useEffect(() => {
    if (!user) return;

    const bump = () => {
      lastActivity.current = Date.now();
      setIdleWarning(false);
    };
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'] as const;
    for (const ev of events) window.addEventListener(ev, bump, { passive: true });

    const startedRaw = localStorage.getItem(SESSION_STARTED_KEY);
    if (!startedRaw) localStorage.setItem(SESSION_STARTED_KEY, String(Date.now()));

    const timer = window.setInterval(() => {
      const started = Number(localStorage.getItem(SESSION_STARTED_KEY) || Date.now());
      const idleFor = Date.now() - lastActivity.current;
      const absoluteFor = Date.now() - started;

      if (absoluteFor >= ABSOLUTE_MS || idleFor >= IDLE_MS) {
        void logoutRef.current();
        return;
      }
      if (idleFor >= IDLE_MS - WARN_BEFORE_MS) {
        setIdleWarning(true);
      }
    }, 5000);

    return () => {
      for (const ev of events) window.removeEventListener(ev, bump);
      window.clearInterval(timer);
    };
  }, [user]);

  const value = useMemo(
    () => ({ user, homes, login, logout, switchHome, idleWarning }),
    [user, homes, login, logout, switchHome, idleWarning],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
