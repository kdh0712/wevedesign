// The phone app's login (spec §3, browser side). The 30 day device token stays in localStorage; the 1 hour session token
// lives in memory only and is fetched again from the device token when it is about to run out.
import type { StoredManagerUser } from '../../lib/manager-session-storage';

export const MOBILE_DEVICE_STORAGE_KEY = 'weve-mobile-device-v1';
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const SESSION_URL = '/api/manager/mobile/session';
const NETWORK_ERROR = '연결이 불안정합니다.';

export type StoredDevice = { deviceId: string; deviceToken: string; expiresAt: number };
export type ActiveSession = { token: string; expiresAt: number; user: StoredManagerUser };
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export class MobileSessionError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'MobileSessionError';
    this.status = status;
  }
}

export function parseStoredDevice(raw: string | null, nowMs: number): StoredDevice | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredDevice>;
    if (typeof parsed.deviceId !== 'string' || !parsed.deviceId) return null;
    if (typeof parsed.deviceToken !== 'string' || !parsed.deviceToken) return null;
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= nowMs) return null;
    return { deviceId: parsed.deviceId, deviceToken: parsed.deviceToken, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

export function needsRefresh(session: { expiresAt: number } | null, nowMs: number): boolean {
  return !session || session.expiresAt - nowMs < REFRESH_MARGIN_MS;
}

// Each refresh reads the account again; the screen applies a changed name, role or permission set (tabs follow it).
export function sameSessionUser(a: StoredManagerUser | null, b: StoredManagerUser): boolean {
  if (!a) return false;
  const perms = (user: StoredManagerUser) => [...(user.permissions || [])].sort().join(',');
  return a.id === b.id && a.name === b.name && a.role === b.role && perms(a) === perms(b);
}

export function createMobileSession(options: { fetcher?: typeof fetch; storage: KeyValueStorage; now?: () => number }) {
  const fetcher = options.fetcher ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const { storage } = options;
  const now = options.now ?? Date.now;
  let session: ActiveSession | null = null;
  let pending: Promise<ActiveSession | null> | null = null;

  const readDevice = () => parseStoredDevice(storage.getItem(MOBILE_DEVICE_STORAGE_KEY), now());
  const forget = () => {
    session = null;
    storage.removeItem(MOBILE_DEVICE_STORAGE_KEY);
  };

  async function post(body: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> }> {
    let response: Response;
    try {
      response = await fetcher(SESSION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch {
      throw new MobileSessionError(NETWORK_ERROR, 0);
    }
    const data = ((await response.json().catch(() => ({}))) || {}) as Record<string, unknown>;
    return { status: response.status, data };
  }

  const errorOf = (status: number, data: Record<string, unknown>, fallback: string) =>
    new MobileSessionError(typeof data.error === 'string' && data.error ? data.error : `${fallback} (HTTP ${status})`, status);

  async function refresh(device: StoredDevice): Promise<ActiveSession | null> {
    const { status, data } = await post({ action: 'refresh', deviceId: device.deviceId, deviceToken: device.deviceToken });
    if (status === 401 && data.signedOut) {
      forget();
      return null;
    }
    if (status !== 200 || !data.session) throw errorOf(status, data, '로그인을 확인하지 못했습니다.');
    session = data.session as ActiveSession;
    return session;
  }

  return {
    hasDevice: () => readDevice() !== null,

    async login(loginId: string, password: string): Promise<ActiveSession> {
      const { status, data } = await post({ action: 'login', loginId, password });
      if (status !== 200 || !data.session) throw errorOf(status, data, '로그인하지 못했습니다.');
      const device: StoredDevice = {
        deviceId: String(data.deviceId),
        deviceToken: String(data.deviceToken),
        expiresAt: Date.parse(String(data.expiresAt)),
      };
      storage.setItem(MOBILE_DEVICE_STORAGE_KEY, JSON.stringify(device));
      session = data.session as ActiveSession;
      return session;
    },

    // A usable session, refreshed when needed; null when the phone must log in. Network or server failures throw and keep
    // the device, so a bad connection never signs anyone out. Calls made while a refresh runs share it.
    async current(): Promise<ActiveSession | null> {
      const device = readDevice();
      if (!device) {
        session = null;
        return null;
      }
      if (session && !needsRefresh(session, now())) return session;
      if (!pending) pending = refresh(device).finally(() => (pending = null));
      return pending;
    },

    async logout() {
      const device = readDevice();
      forget();
      if (!device) return;
      await post({ action: 'logout', deviceId: device.deviceId, deviceToken: device.deviceToken }).catch(() => undefined);
    },

    authHeaders: (): Record<string, string> => (session ? { Authorization: `Bearer ${session.token}` } : {}),
  };
}

export type MobileSession = ReturnType<typeof createMobileSession>;
