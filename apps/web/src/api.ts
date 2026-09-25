const TOKEN_KEY = 'rfh_access';
const REFRESH_KEY = 'rfh_refresh';
const USER_KEY = 'rfh_user';
const HOMES_KEY = 'rfh_homes';

export type SessionUser = {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  tenantId: string;
  tenantName: string;
  timezone: string;
};

export type HomeSummary = {
  tenantId: string;
  tenantName: string;
  role: string;
  timezone: string;
  userId: string;
};

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function getStoredUser(): SessionUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function getStoredHomes(): HomeSummary[] {
  const raw = localStorage.getItem(HOMES_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as HomeSummary[];
  } catch {
    return [];
  }
}

export function setSession(
  accessToken: string,
  refreshToken: string,
  user: SessionUser,
  homes?: HomeSummary[],
) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (homes) localStorage.setItem(HOMES_KEY, JSON.stringify(homes));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(HOMES_KEY);
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const body = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
      };
      const user = getStoredUser();
      if (!user) return false;
      setSession(body.accessToken, body.refreshToken, user, getStoredHomes());
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;

  constructor(message: string, status: number, body: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`/api${path}`, { ...options, headers });
  if (
    res.status === 401 &&
    !retried &&
    !path.startsWith('/auth/login') &&
    !path.startsWith('/auth/signup')
  ) {
    const ok = await tryRefresh();
    if (ok) return api<T>(path, options, true);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const raw = body.message;
    const message = Array.isArray(raw)
      ? raw.join(', ')
      : typeof raw === 'string'
        ? raw
        : raw && typeof raw === 'object' && 'message' in (raw as object)
          ? String((raw as { message: unknown }).message)
          : `Request failed (${res.status})`;
    throw new ApiError(message, res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Authenticated binary download (PDF/CSV). Avoids logging response bodies. */
export async function downloadFile(path: string, fallbackName: string) {
  const headers = new Headers();
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res = await fetch(`/api${path}`, { headers });
  if (res.status === 401) {
    const ok = await tryRefresh();
    if (ok) {
      headers.set('Authorization', `Bearer ${getAccessToken()}`);
      res = await fetch(`/api${path}`, { headers });
    }
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const raw = (body as { message?: string | string[] }).message;
    const message = Array.isArray(raw)
      ? raw.join(', ')
      : raw || `Download failed (${res.status})`;
    throw new Error(message);
  }

  const disposition = res.headers.get('Content-Disposition') || '';
  const match = /filename="([^"]+)"/i.exec(disposition);
  const filename = match?.[1] || fallbackName;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}
