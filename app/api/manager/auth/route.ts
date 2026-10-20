import { NextResponse } from 'next/server';
import { verifyManagerLogin, type LoginUser } from '../_login';
import { issueManagerSession, SESSION_KEY_MISSING_MESSAGE } from '../_session';
import type { SessionSource } from '../_token';
import { isFirestoreServiceAccountConfigured } from '../firestore';

export const runtime = 'nodejs';

function sessionResponse(user: LoginUser, src: SessionSource, extra: Record<string, unknown> = {}) {
  const session = issueManagerSession(user, src);
  if (!session) return NextResponse.json({ error: SESSION_KEY_MISSING_MESSAGE }, { status: 500 });
  return NextResponse.json({ ...session, ...extra });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await verifyManagerLogin(request, body?.loginId, body?.password);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    // With a service account the server reads Firestore itself, so the browser never needs a Firebase token.
    const firebaseToken = result.firebaseIdToken && !isFirestoreServiceAccountConfigured() ? result.firebaseIdToken : undefined;
    return sessionResponse(result.user, result.src, firebaseToken ? { firebaseToken } : {});
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '로그인 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
