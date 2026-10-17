import { NextResponse } from 'next/server';
import {
  PROGRESS_LINK_OFF_MESSAGE,
  PROGRESS_NO_PHONE_MESSAGE,
  PROGRESS_UNAVAILABLE_MESSAGE,
  PROGRESS_WRONG_LAST4_MESSAGE,
  isProgressCodeShape,
  progressLockedMessage,
} from '../../../lib/progress-public';
import { phoneLast4 } from '../../../lib/site-progress';
import {
  findSiteByProgressCode,
  isProgressStoreReady,
  resolveCustomerPhone,
  saveSiteProgressFields,
} from '../../manager/_progress-store';
import {
  PROGRESS_COOKIE_MAX_AGE_SECONDS,
  isProgressLocked,
  nextProgressAccessState,
  progressCookieName,
  resolveProgressKey,
  signProgressCookie,
  type ProgressAccessState,
} from '../_access';

export const runtime = 'nodejs';

const BAD_REQUEST = '요청 형식이 올바르지 않습니다.';
const BAD_LAST4 = '휴대폰 번호 뒷자리 4자리를 숫자로 입력해 주세요.';

// A customer's check result must never be cached by the browser or a CDN.
const json = (data: unknown, status: number, headers: Record<string, string> = {}) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } });

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function lockedResponse(state: ProgressAccessState, nowMs: number) {
  const retryAfterSeconds = Math.max(1, Math.ceil((Date.parse(state.lockedUntil) - nowMs) / 1000));
  return json({ error: progressLockedMessage(retryAfterSeconds), retryAfterSeconds }, 423, { 'Retry-After': String(retryAfterSeconds) });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!isRecord(body) || typeof body.code !== 'string' || typeof body.last4 !== 'string') return json({ error: BAD_REQUEST }, 400);

  const code = body.code;
  const last4 = body.last4;
  // A malformed number is a typo, not a guess, so it answers 400 before anything is looked up or counted.
  if (!/^\d{4}$/.test(last4)) return json({ error: BAD_LAST4 }, 400);

  // Missing, switched-off and unknown codes (and a server without Firestore) all look the same from outside.
  if (!isProgressCodeShape(code) || !isProgressStoreReady()) return json({ error: PROGRESS_LINK_OFF_MESSAGE }, 404);

  try {
    const site = await findSiteByProgressCode(code);
    if (!site || !site.progressEnabled || site.progressCode !== code) return json({ error: PROGRESS_LINK_OFF_MESSAGE }, 404);

    const key = resolveProgressKey();
    if (!key) {
      console.error('Progress verify unavailable: neither MANAGER_SESSION_SECRET nor SANITY_WRITE_TOKEN is set.');
      return json({ error: PROGRESS_UNAVAILABLE_MESSAGE }, 500);
    }

    const nowMs = Date.now();
    const access = site.progressAccess;
    // The lock is checked first and nothing is counted while it holds: nextProgressAccessState(locked, true) would clear it.
    if (isProgressLocked(access, nowMs)) return lockedResponse(access as ProgressAccessState, nowMs);

    const expected = phoneLast4(await resolveCustomerPhone(site));
    if (!expected) return json({ error: PROGRESS_NO_PHONE_MESSAGE }, 409);

    if (last4 !== expected) {
      // If the failure cannot be recorded this throws, so a guess is never allowed to go uncounted.
      const next = nextProgressAccessState(access, false, nowMs);
      await saveSiteProgressFields(site._id, { progressAccess: next });
      return isProgressLocked(next, nowMs) ? lockedResponse(next, nowMs) : json({ error: PROGRESS_WRONG_LAST4_MESSAGE }, 401);
    }

    // A correct number clears earlier misses. Failing to clear them must not turn away a customer who is right.
    if (access && (access.failedCount > 0 || access.lockedUntil)) {
      await saveSiteProgressFields(site._id, { progressAccess: nextProgressAccessState(access, true, nowMs) }).catch((error) =>
        console.error('Progress access reset failed:', error),
      );
    }

    const response = json({ ok: true }, 200);
    response.cookies.set({
      name: progressCookieName(code),
      value: signProgressCookie(code, expected, key, nowMs),
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/progress',
      maxAge: PROGRESS_COOKIE_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    console.error('Progress verify failed:', error);
    return json({ error: PROGRESS_UNAVAILABLE_MESSAGE }, 500);
  }
}
