import { NextResponse } from 'next/server';
import { linkExpiresAt, signupLinkUrl } from '../../../lib/staff-signup-rules';
import { requireManager } from '../_session';
import { approveSignup, rejectSignup } from '../_signup-flow';
import {
  STAFF_STORE_MISSING,
  createSignupLink,
  firestoreSignupStore,
  isStaffAccountStoreReady,
  listOpenSignupLinks,
  listPendingSignupRequests,
  revokeSignupLink,
} from '../_staff-accounts';

export const runtime = 'nodejs';

// Staff sign-up for the 총괄 관리자: sign-up links (made, listed, revoked) and the requests they bring (approved or
// rejected). Spec: docs/superpowers/specs/2026-11-21-staff-signup-approval-design.md §5.1

const MEMO_MAX = 30;
// The ids this route hands out (_staff-accounts.ts): a link is the SHA-256 of its token, a request 'req-' + 24 hex.
const LINK_ID = /^[0-9a-f]{64}$/;
const REQUEST_ID = /^req-[0-9a-f]{24}$/;
const noStore = { 'Cache-Control': 'no-store' };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore });
const text = (value: unknown) => (typeof value === 'string' ? value : '');

export async function GET(request: Request) {
  const access = requireManager(request, { admin: true });
  if (access.error) return access.error;
  if (!isStaffAccountStoreReady()) return json({ error: STAFF_STORE_MISSING }, 503);

  try {
    const nowMs = Date.now();
    const [links, requests] = await Promise.all([listOpenSignupLinks(nowMs), listPendingSignupRequests(nowMs)]);
    return json({
      links: links.map((link) => ({ id: link._id, memo: link.memo || '', createdByName: link.createdByName || link.createdBy || '', expiresAt: link.expiresAt })),
      // No password hash, link id or anything else the screen does not show.
      requests: requests.map((item) => ({
        id: item._id,
        name: item.name,
        phone: item.phone,
        loginId: item.loginId,
        linkMemo: item.linkMemo || '',
        createdAt: item.createdAt,
      })),
    });
  } catch (error) {
    console.error('Staff sign-up list failed:', error);
    return json({ error: '가입 요청을 불러오지 못했습니다.' }, 500);
  }
}

export async function POST(request: Request) {
  const access = requireManager(request, { admin: true });
  if (access.error) return access.error;
  if (!isStaffAccountStoreReady()) return json({ error: STAFF_STORE_MISSING }, 503);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = text(body?.action);
  const nowMs = Date.now();

  try {
    if (action === 'createLink') {
      const memo = text(body?.memo).trim();
      if (!memo || memo.length > MEMO_MAX) return json({ error: '누구에게 보낼지 1~30자로 적어 주세요.' }, 400);
      const expiresAt = linkExpiresAt(body?.days, nowMs);
      if (!expiresAt) return json({ error: '유효기간을 골라 주세요.' }, 400);

      const { token, link } = await createSignupLink({
        memo,
        expiresAt,
        createdBy: access.session.loginId,
        createdByName: access.session.name || access.session.loginId,
        nowMs,
      });
      // The only time the link is ever shown: only its hash is stored.
      return json({
        link: { id: link._id, memo: link.memo, createdByName: link.createdByName, expiresAt: link.expiresAt },
        url: signupLinkUrl(new URL(request.url).origin, token),
      });
    }

    if (action === 'revokeLink') {
      const id = text(body?.id);
      if (!LINK_ID.test(id)) return json({ error: '취소할 링크를 골라 주세요.' }, 400);
      const revoked = await revokeSignupLink(id, nowMs);
      return revoked ? json({ ok: true }) : json({ error: '이미 쓰였거나 취소된 링크입니다.' }, 409);
    }

    if (action === 'approve' || action === 'reject') {
      const requestId = text(body?.requestId);
      if (!REQUEST_ID.test(requestId)) return json({ error: '가입 요청을 골라 주세요.' }, 400);
      const store = firestoreSignupStore();
      const result =
        action === 'approve'
          ? await approveSignup({ requestId, role: body?.role, permissions: body?.permissions, approvedBy: access.session.loginId }, store, nowMs)
          : await rejectSignup({ requestId }, store, nowMs);
      return result.ok ? json({ ok: true }) : json({ error: result.error }, result.status);
    }

    return json({ error: '알 수 없는 요청입니다.' }, 400);
  } catch (error) {
    console.error(`Staff sign-up ${action || 'request'} failed:`, error);
    return json({ error: '처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, 500);
  }
}
