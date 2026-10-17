// Tab-scoped manager session shared by the dashboard and the estimate workspace (browser only).
import type { ManagerPermission, ManagerRole } from './manager-permissions';

export const MANAGER_SESSION_STORAGE_KEY = 'weve-manager-session-v2';

// Keys from before signed sessions. They held the master password and must not survive.
const LEGACY_LOCAL_STORAGE_KEYS = ['weve-manager-session', 'weve-manager-password'];

export type StoredManagerUser = {
  id: string;
  name: string;
  loginId: string;
  role: ManagerRole;
  permissions: ManagerPermission[];
};

export type StoredManagerSession = {
  token: string;
  firebaseToken: string;
  user: StoredManagerUser;
  expiresAt: number;
  savedAt: number;
};

export function parseStoredSession(raw: string | null, nowMs: number): StoredManagerSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredManagerSession>;
    // A signed token is "<payload>.<signature>"; older sessions stored the master password instead.
    if (typeof parsed.token !== 'string' || parsed.token.split('.').length !== 2) return null;
    if (!parsed.user || typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= nowMs) return null;
    return {
      token: parsed.token,
      firebaseToken: parsed.firebaseToken || '',
      user: parsed.user,
      expiresAt: parsed.expiresAt,
      savedAt: parsed.savedAt || nowMs,
    };
  } catch {
    return null;
  }
}

export function clearStoredSession() {
  window.sessionStorage.removeItem(MANAGER_SESSION_STORAGE_KEY);
  LEGACY_LOCAL_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
}

export function readStoredSession(): StoredManagerSession | null {
  const session = parseStoredSession(window.sessionStorage.getItem(MANAGER_SESSION_STORAGE_KEY), Date.now());
  if (!session) clearStoredSession();
  return session;
}

export function saveStoredSession(result: {
  token: string;
  expiresAt: number;
  user: StoredManagerUser;
  firebaseToken?: string;
}): StoredManagerSession {
  const session: StoredManagerSession = {
    token: result.token,
    firebaseToken: result.firebaseToken || '',
    user: result.user,
    expiresAt: result.expiresAt,
    savedAt: Date.now(),
  };
  window.sessionStorage.setItem(MANAGER_SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}
