// One customer check of the last four digits, decided against a store the caller passes in, so the route stays thin and tests
// can drive every branch with a fake versioned store. No Next.js imports; only relative .ts modules, so tests load it directly.
//
// Every check that is not refused by an active lock records its result (a miss or a success) with a write conditioned on the
// version of the site it read. When that write cannot be committed, because another check or a staff edit got there first or
// the store failed, the answer is the same retry for a right and a wrong number, and no cookie is ever set without a committed
// write. So parallel guesses can neither go uncounted nor erase a lock, and a burst cannot slip a right guess through.
import {
  PROGRESS_LINK_OFF_MESSAGE,
  PROGRESS_NO_PHONE_MESSAGE,
  PROGRESS_RETRY_MESSAGE,
  PROGRESS_UNAVAILABLE_MESSAGE,
  PROGRESS_WRONG_LAST4_MESSAGE,
  isProgressCodeShape,
  progressLockedMessage,
} from '../../lib/progress-public.ts';
import { phoneLast4 } from '../../lib/site-progress.ts';
import {
  PROGRESS_COOKIE_MAX_AGE_SECONDS,
  isProgressLocked,
  nextProgressAccessState,
  progressCookieName,
  progressPhoneDigits,
  signProgressCookie,
  type ProgressAccessState,
} from './_access.ts';

export const VERIFY_BAD_REQUEST_MESSAGE = '요청 형식이 올바르지 않습니다.';
export const VERIFY_BAD_LAST4_MESSAGE = '휴대폰 번호 뒷자리 4자리를 숫자로 입력해 주세요.';
export const VERIFY_RETRY_AFTER_SECONDS = 2;

export type VerifySite = {
  _id: string;
  progressCode?: unknown;
  progressEnabled?: unknown;
  progressAccess?: ProgressAccessState;
  deletedAt?: unknown;
  [key: string]: unknown;
};

export type VerifyStore<S extends VerifySite = VerifySite> = {
  findSiteByCode(code: string): Promise<S | null>;
  // A fresh read by id, with the version (Firestore updateTime) it was read at.
  readSite(siteId: string): Promise<{ site: S; updateTime: string } | null>;
  resolvePhone(site: S): Promise<string>;
  // Writes only progressAccess, and only if the site is still at updateTime; throws otherwise.
  writeAccess(siteId: string, access: ProgressAccessState, updateTime: string): Promise<unknown>;
};

export type VerifyCookie = {
  name: string;
  value: string;
  httpOnly: true;
  secure: true;
  sameSite: 'lax';
  path: '/progress';
  maxAge: number;
};

export type VerifyResult = { status: number; body: Record<string, unknown>; headers: Record<string, string>; cookie?: VerifyCookie };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

// A customer's check result must never be cached by the browser or a CDN.
export const progressReply = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}): VerifyResult => ({
  status,
  body,
  headers: { 'Cache-Control': 'private, no-store', ...headers },
});

const linkOff = () => progressReply(404, { error: PROGRESS_LINK_OFF_MESSAGE });
const unavailable = () => progressReply(500, { error: PROGRESS_UNAVAILABLE_MESSAGE });
const retry = () => progressReply(503, { error: PROGRESS_RETRY_MESSAGE, retry: true }, { 'Retry-After': String(VERIFY_RETRY_AFTER_SECONDS) });

function locked(state: ProgressAccessState, nowMs: number) {
  const retryAfterSeconds = Math.max(1, Math.ceil((Date.parse(state.lockedUntil) - nowMs) / 1000));
  return progressReply(423, { error: progressLockedMessage(retryAfterSeconds), retryAfterSeconds }, { 'Retry-After': String(retryAfterSeconds) });
}

// Missing, trashed, switched-off and rotated links all look the same from outside.
export const isProgressLinkOpen = (site: VerifySite | null, code: string): site is VerifySite =>
  Boolean(site) && !site!.deletedAt && Boolean(site!.progressEnabled) && site!.progressCode === code;

export async function verifyProgressAttempt<S extends VerifySite>(
  body: unknown,
  deps: { store: VerifyStore<S>; storeReady: boolean; key: Buffer | null; nowMs: number },
): Promise<VerifyResult> {
  if (!isRecord(body) || typeof body.code !== 'string' || typeof body.last4 !== 'string') return progressReply(400, { error: VERIFY_BAD_REQUEST_MESSAGE });
  const { code, last4 } = body;
  // A malformed number is a typo, not a guess, so it answers 400 before anything is looked up or counted.
  if (!/^\d{4}$/.test(last4)) return progressReply(400, { error: VERIFY_BAD_LAST4_MESSAGE });
  // Missing, switched-off and unknown codes (and a server without Firestore) all look the same from outside.
  if (!isProgressCodeShape(code) || !deps.storeReady) return linkOff();

  const { store, key, nowMs } = deps;
  let read: { site: S; updateTime: string } | null;
  let phone: string;
  try {
    const found = await store.findSiteByCode(code);
    if (!isProgressLinkOpen(found, code)) return linkOff();
    if (!key) {
      console.error('Progress verify unavailable: neither MANAGER_SESSION_SECRET nor SANITY_WRITE_TOKEN is set.');
      return unavailable();
    }

    // The decision is made on a fresh read, and its result is written only on that same version.
    read = await store.readSite(found._id);
    if (!read || !isProgressLinkOpen(read.site, code)) return linkOff();

    // The lock is checked first and nothing is counted or written while it holds: nextProgressAccessState(locked, true) would clear it.
    const access = read.site.progressAccess;
    if (isProgressLocked(access, nowMs)) return locked(access as ProgressAccessState, nowMs);

    phone = await store.resolvePhone(read.site);
  } catch (error) {
    console.error('Progress verify failed:', error);
    return unavailable();
  }

  const expected = phoneLast4(phone);
  if (!expected) return progressReply(409, { error: PROGRESS_NO_PHONE_MESSAGE });

  const right = last4 === expected;
  const next = nextProgressAccessState(read.site.progressAccess, right, nowMs);
  try {
    await store.writeAccess(read.site._id, next, read.updateTime);
  } catch (error) {
    // The guess itself is never logged.
    console.error('Progress verify could not record the check:', error);
    return retry();
  }

  if (!right) return isProgressLocked(next, nowMs) ? locked(next, nowMs) : progressReply(401, { error: PROGRESS_WRONG_LAST4_MESSAGE });

  return {
    ...progressReply(200, { ok: true }),
    cookie: {
      name: progressCookieName(code),
      // Bound to the code and the customer's whole number: a new link or a changed number invalidates it.
      value: signProgressCookie(code, progressPhoneDigits(phone), key!, nowMs),
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/progress',
      maxAge: PROGRESS_COOKIE_MAX_AGE_SECONDS,
    },
  };
}
