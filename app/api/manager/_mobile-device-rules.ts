import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// Rules for the staff phone app's device login (spec docs/superpowers/specs/2026-10-20-staff-mobile-app-design.md §3).
// A phone keeps a 30 day device token. It never calls an API with it: it only trades it for a 1 hour session token,
// so every other manager API keeps checking the usual signed session.

export type MobileDeviceRecord = {
  _id: string;
  userId: string;
  loginId: string;
  userName: string;
  src: 'master' | 'account' | 'firebase';
  deviceLabel: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
  revokedAt?: string;
  revokedBy?: string;
};

// Counted from the login; using the app does not extend it.
export const MOBILE_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// A revoked device or a changed account reaches the phone within this time.
export const MOBILE_SESSION_TTL_SECONDS = 3600;
// lastUsedAt is written at most this often, to keep Firestore writes down.
export const LAST_USED_WRITE_INTERVAL_MS = 10 * 60 * 1000;

export type DeviceRefreshDecision = { ok: true; touch: boolean } | { ok: false; reason: 'missing' | 'revoked' | 'expired' | 'token' };

export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

// Only the hash is stored; the token itself exists on the phone alone.
export function newDeviceSecret(): { deviceId: string; deviceToken: string; tokenHash: string } {
  const deviceToken = randomBytes(32).toString('base64url');
  return { deviceId: `md-${randomBytes(12).toString('hex')}`, deviceToken, tokenHash: hashDeviceToken(deviceToken) };
}

// Checked before any Firestore read, so a request can only name a document id this module could have made.
export const isMobileDeviceId = (value: unknown): value is string => typeof value === 'string' && /^md-[0-9a-f]{24}$/.test(value);

function tokenMatches(token: string, tokenHash: string) {
  const provided = Buffer.from(hashDeviceToken(token), 'hex');
  const stored = Buffer.from(tokenHash, 'hex');
  return token !== '' && provided.length === stored.length && timingSafeEqual(provided, stored);
}

export function deviceRefreshDecision(device: MobileDeviceRecord | null, token: string, nowMs: number): DeviceRefreshDecision {
  if (!device) return { ok: false, reason: 'missing' };
  if (device.revokedAt) return { ok: false, reason: 'revoked' };
  const expiresAt = Date.parse(device.expiresAt);
  // An unreadable date counts as expired, never as forever.
  if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) return { ok: false, reason: 'expired' };
  if (!tokenMatches(token, device.tokenHash)) return { ok: false, reason: 'token' };
  const lastUsedAt = Date.parse(device.lastUsedAt);
  return { ok: true, touch: !Number.isFinite(lastUsedAt) || nowMs - lastUsedAt >= LAST_USED_WRITE_INTERVAL_MS };
}

// A short name for the device list on the manager screen, e.g. "iPhone · Safari".
export function deviceLabelFromUserAgent(userAgent: string): string {
  const ua = userAgent || '';
  const platform = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Macintosh/.test(ua)
            ? 'Mac'
            : '';
  const browser = /SamsungBrowser/.test(ua)
    ? '삼성 인터넷'
    : /KAKAOTALK/i.test(ua)
      ? '카카오톡'
      : /NAVER/.test(ua)
        ? '네이버'
        : /CriOS|Chrome/.test(ua)
          ? 'Chrome'
          : /FxiOS|Firefox/.test(ua)
            ? 'Firefox'
            : /Safari/.test(ua)
              ? 'Safari'
              : '';
  if (!platform && !browser) return '알 수 없는 기기';
  return [platform, browser].filter(Boolean).join(' · ');
}
