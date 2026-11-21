import { NextResponse } from 'next/server';
import { looksAutomated } from '../../lib/consultation-guard';
import { LOGIN_ID_TAKEN_MESSAGE, UNUSABLE_LINK_MESSAGE, isLinkUsable, loginIdError, normalizeLoginId } from '../../lib/staff-signup-rules';
import { clientIp, createLoginLimiter } from '../manager/_login-limit';
import { isLoginIdTaken, submitSignup } from '../manager/_signup-flow';
import { firestoreSignupStore, isStaffAccountStoreReady, signupTokenHash } from '../manager/_staff-accounts';

export const runtime = 'nodejs';

// The public side of a staff sign-up link, called without a session from /manager-weve-7519/join. It lives outside
// /api/manager/ because everything there requires a session. The token travels only in the POST body (the page reads it
// from after '#'), so it never reaches a URL, a server log or a Referer header. Never log the address, token, password or
// phone number. Spec: docs/superpowers/specs/2026-11-21-staff-signup-approval-design.md §5.2, §5.3

const WINDOW_MS = 15 * 60 * 1000;
// Every call counts, a wrong token included. Each server instance counts on its own (like the login limiter).
const checkLimiter = createLoginLimiter({ windowMs: WINDOW_MS, maxPerLogin: 30, maxPerIp: 30 });
const submitLimiter = createLoginLimiter({ windowMs: WINDOW_MS, maxPerLogin: 5, maxPerIp: 5 });

const TOO_MANY = '시도가 너무 많습니다. 15분 뒤에 다시 시도해 주세요.';
const STORE_MISSING = '지금은 가입할 수 없습니다. 총괄 관리자에게 알려 주세요.';
const FAILED = '처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
// newSignupToken() gives 43 base64url characters; anything far off that is not a token.
const TOKEN = /^[A-Za-z0-9_-]{20,100}$/;

const noStore = { 'Cache-Control': 'no-store' };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore });
const text = (value: unknown) => (typeof value === 'string' ? value : '');

// Counts this call and says whether the address is over its limit.
function overLimit(limiter: ReturnType<typeof createLoginLimiter>, ip: string, now: number) {
  if (limiter.isBlocked(ip, 'staff-signup', now)) return true;
  limiter.recordFailure(ip, 'staff-signup', now);
  return false;
}

async function linkIsUsable(token: string, nowMs: number) {
  if (!TOKEN.test(token)) return false;
  const link = await firestoreSignupStore().readLink(signupTokenHash(token));
  return Boolean(link && isLinkUsable(link.record, nowMs));
}

export async function POST(request: Request) {
  if (!isStaffAccountStoreReady()) return json({ error: STORE_MISSING }, 503);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = text(body?.action);
  const token = text(body?.token);
  const ip = clientIp(request);
  const nowMs = Date.now();

  try {
    if (action === 'check' || action === 'checkLoginId') {
      if (overLimit(checkLimiter, ip, nowMs)) return json({ ok: false, error: TOO_MANY }, 429);
      const usable = await linkIsUsable(token, nowMs);
      // No reason is ever given for an unusable link.
      if (action === 'check') return json({ ok: usable });
      if (!usable) return json({ ok: false, error: UNUSABLE_LINK_MESSAGE }, 404);

      const loginId = normalizeLoginId(body?.loginId);
      const problem = loginIdError(loginId);
      if (problem) return json({ ok: false, error: problem });
      if (await isLoginIdTaken(firestoreSignupStore(), loginId, nowMs)) return json({ ok: false, error: LOGIN_ID_TAKEN_MESSAGE });
      return json({ ok: true });
    }

    if (action === 'submit') {
      if (overLimit(submitLimiter, ip, nowMs)) return json({ ok: false, error: TOO_MANY }, 429);
      // A filled hidden field or a form sent within 3 seconds: answered like a success, nothing is stored.
      if (looksAutomated({ honeypot: body?.website, startedAt: body?.startedAt, now: nowMs })) return json({ ok: true });
      if (!TOKEN.test(token)) return json({ ok: false, error: UNUSABLE_LINK_MESSAGE }, 404);

      const result = await submitSignup(
        { tokenHash: signupTokenHash(token), fields: { name: body?.name, phone: body?.phone, loginId: body?.loginId, password: body?.password } },
        firestoreSignupStore(),
        nowMs,
      );
      return result.ok ? json({ ok: true }) : json({ ok: false, error: result.error }, result.status);
    }

    return json({ ok: false, error: '알 수 없는 요청입니다.' }, 400);
  } catch (error) {
    // The error may name a Firestore document path (a link's token hash, a request id), never the token or what was typed.
    console.error(`Staff sign-up ${action || 'request'} failed:`, error instanceof Error ? error.message : error);
    return json({ ok: false, error: FAILED }, 500);
  }
}
