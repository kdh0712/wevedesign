import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { resolveSessionKey } from '../manager/_token.ts';

export const PROGRESS_COOKIE_MAX_AGE_SECONDS = 15552000;
export const PROGRESS_MAX_FAILURES = 5;
export const PROGRESS_LOCK_MS = 900000;

const PROGRESS_KEY_LABEL = 'weve-progress-v1';

export type ProgressAccessState = { failedCount: number; lockedUntil: string };

// Separate key from the manager session key, so a customer cookie can never be replayed as a manager token.
export function resolveProgressKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const sessionKey = resolveSessionKey(env);
  if (!sessionKey) return null;
  return createHmac('sha256', sessionKey).update(PROGRESS_KEY_LABEL).digest();
}

// The cookie name is derived from the code so the raw code never appears in a header and each link has its own cookie.
export function progressCookieName(code: string): string {
  return `wp_${createHash('sha256').update(code).digest('hex').slice(0, 16)}`;
}

const sign = (code: string, last4: string, exp: string, key: Buffer) =>
  createHmac('sha256', key).update(`${code}|${last4}|${exp}`).digest().toString('base64url');

export function signProgressCookie(code: string, last4: string, key: Buffer, nowMs = Date.now()): string {
  const exp = String(Math.floor(nowMs / 1000) + PROGRESS_COOKIE_MAX_AGE_SECONDS);
  return `${exp}.${sign(code, last4, exp, key)}`;
}

export function verifyProgressCookie(
  value: string | undefined,
  code: string,
  last4: string,
  key: Buffer,
  nowMs = Date.now(),
): boolean {
  if (!value) return false;
  const parts = value.split('.');
  if (parts.length !== 2) return false;

  const [exp, signature] = parts;
  if (!/^\d+$/.test(exp) || !signature) return false;

  // Compare the canonical text: decoding first would also accept padding or stray characters.
  const expected = Buffer.from(sign(code, last4, exp, key));
  const provided = Buffer.from(signature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return false;

  return Number(exp) > Math.floor(nowMs / 1000);
}

export function isProgressLocked(state: ProgressAccessState | undefined, nowMs = Date.now()): boolean {
  if (!state?.lockedUntil) return false;
  const until = Date.parse(state.lockedUntil);
  return Number.isFinite(until) && until > nowMs;
}

export function nextProgressAccessState(
  state: ProgressAccessState | undefined,
  success: boolean,
  nowMs = Date.now(),
): ProgressAccessState {
  if (success) return { failedCount: 0, lockedUntil: '' };

  // Checking is paused while locked, so a stray failure must not extend the lock.
  if (state && isProgressLocked(state, nowMs)) return state;

  // A lock that has already ended starts a fresh count instead of locking again on the first miss.
  // A stored count that is not a number counts as 0 rather than turning every later total into NaN (which would never lock).
  const stored = state?.lockedUntil ? 0 : state?.failedCount;
  const failedCount = (typeof stored === 'number' && Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0) + 1;
  return {
    failedCount,
    lockedUntil: failedCount >= PROGRESS_MAX_FAILURES ? new Date(nowMs + PROGRESS_LOCK_MS).toISOString() : '',
  };
}
