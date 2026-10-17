import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { resolveSessionKey } from '../manager/_token.ts';

export const PROGRESS_COOKIE_MAX_AGE_SECONDS = 15552000;
export const PROGRESS_MAX_FAILURES = 5;
// The first lock lasts 15 minutes; each later lock since the last success doubles it, up to 24 hours.
export const PROGRESS_LOCK_MS = 900000;
export const PROGRESS_MAX_LOCK_MS = 86400000;

const PROGRESS_KEY_LABEL = 'weve-progress-v1';

// lockCount: locks since the last success (missing on older records, which counts as 0). lastOkAt: the last correct answer.
export type ProgressAccessState = { failedCount: number; lockedUntil: string; lockCount?: number; lastOkAt?: string };

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

// The cookie binds the customer's whole number, digits only, so another number that shares the last four does not pass.
export const progressPhoneDigits = (phone: string | undefined) => String(phone ?? '').replace(/\D/g, '');

const sign = (code: string, phoneDigits: string, exp: string, key: Buffer) =>
  createHmac('sha256', key).update(`${code}|${phoneDigits}|${exp}`).digest().toString('base64url');

// phoneDigits: progressPhoneDigits() of the resolved customer phone.
export function signProgressCookie(code: string, phoneDigits: string, key: Buffer, nowMs = Date.now()): string {
  const exp = String(Math.floor(nowMs / 1000) + PROGRESS_COOKIE_MAX_AGE_SECONDS);
  return `${exp}.${sign(code, phoneDigits, exp, key)}`;
}

export function verifyProgressCookie(
  value: string | undefined,
  code: string,
  phoneDigits: string,
  key: Buffer,
  nowMs = Date.now(),
): boolean {
  if (!value || !/^\d+$/.test(phoneDigits)) return false;
  const parts = value.split('.');
  if (parts.length !== 2) return false;

  const [exp, signature] = parts;
  if (!/^\d+$/.test(exp) || !signature) return false;

  // Compare the canonical text: decoding first would also accept padding or stray characters.
  const expected = Buffer.from(sign(code, phoneDigits, exp, key));
  const provided = Buffer.from(signature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return false;

  return Number(exp) > Math.floor(nowMs / 1000);
}

export function isProgressLocked(state: ProgressAccessState | undefined, nowMs = Date.now()): boolean {
  if (!state?.lockedUntil) return false;
  const until = Date.parse(state.lockedUntil);
  return Number.isFinite(until) && until > nowMs;
}

// A stored count that is not a number counts as 0 rather than turning every later total into NaN (which would never lock).
const storedCount = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

// How long the next lock lasts, given the locks since the last success: 15m, 30m, 1h, 2h ... capped at 24h.
export function progressLockMs(lockCount: number): number {
  return Math.min(PROGRESS_LOCK_MS * 2 ** storedCount(lockCount), PROGRESS_MAX_LOCK_MS);
}

export function nextProgressAccessState(
  state: ProgressAccessState | undefined,
  success: boolean,
  nowMs = Date.now(),
): ProgressAccessState {
  // Always a change to the stored record (lastOkAt is new), so a success is never a write that changes nothing.
  if (success) return { failedCount: 0, lockedUntil: '', lockCount: 0, lastOkAt: new Date(nowMs).toISOString() };

  // Checking is paused while locked, so a stray failure must not extend the lock.
  if (state && isProgressLocked(state, nowMs)) return state;

  // A lock that has already ended starts a fresh count instead of locking again on the first miss; its lockCount carries over.
  const failedCount = storedCount(state?.lockedUntil ? 0 : state?.failedCount) + 1;
  const lockCount = storedCount(state?.lockCount);
  const lastOkAt = typeof state?.lastOkAt === 'string' && state.lastOkAt ? { lastOkAt: state.lastOkAt } : {};
  if (failedCount < PROGRESS_MAX_FAILURES) return { failedCount, lockedUntil: '', lockCount, ...lastOkAt };
  return { failedCount, lockedUntil: new Date(nowMs + progressLockMs(lockCount)).toISOString(), lockCount: lockCount + 1, ...lastOkAt };
}
