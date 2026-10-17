import { NextResponse } from 'next/server';
import type { ManagerRole } from '../../../lib/manager-permissions';
import { managerClient } from '../_utils';
import { clientIp, loginLimiter } from '../_login-limit';
import { hashPassword, safeEqual, verifyPasswordOrDummy } from '../_password';
import { issueManagerSession, SESSION_KEY_MISSING_MESSAGE } from '../_session';
import type { SessionSource } from '../_token';
import {
  firebaseAdminDbAuth,
  firebaseLookup,
  firebaseSignIn,
  getFirebaseAdminFlag,
  getFirebaseProfile,
  isFirebaseManagerConfigured,
  setFirebaseProfile,
} from '../firebase';
import { isFirestoreServiceAccountConfigured } from '../firestore';

export const runtime = 'nodejs';

type ManagerAccount = {
  _id: string;
  name?: string;
  loginId?: string;
  password?: string;
  role?: 'admin' | 'staff';
  permissions?: string[];
  isActive?: boolean;
};

function sessionResponse(
  user: { id: string; name: string; loginId: string; role: ManagerRole; permissions: unknown },
  src: SessionSource,
  extra: Record<string, unknown> = {},
) {
  const session = issueManagerSession(user, src);
  if (!session) return NextResponse.json({ error: SESSION_KEY_MISSING_MESSAGE }, { status: 500 });
  return NextResponse.json({ ...session, ...extra });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const loginId = String(body?.loginId || 'admin').trim();
    const loginPassword = String(body?.password || '').trim();
    const managerPassword = process.env.MANAGER_PASSWORD;

    if (!loginPassword) {
      return NextResponse.json({ error: '비밀번호를 입력해 주세요.' }, { status: 400 });
    }

    const ip = clientIp(request);
    if (loginLimiter.isBlocked(ip, loginId)) {
      return NextResponse.json({ error: '로그인 시도가 너무 많습니다. 15분 뒤에 다시 시도해 주세요.' }, { status: 429 });
    }

    if (isFirebaseManagerConfigured() && loginId.includes('@')) {
      const firebaseUser = await firebaseSignIn(loginId, loginPassword).catch((error: unknown) => {
        loginLimiter.recordFailure(ip, loginId);
        throw error;
      });
      loginLimiter.recordSuccess(ip, loginId);
      const lookupUser = await firebaseLookup(firebaseUser.idToken);
      const uid = lookupUser?.localId || firebaseUser.localId;
      const email = lookupUser?.email || firebaseUser.email || loginId;
      const userAuth = { idToken: firebaseUser.idToken };
      let profile = await getFirebaseProfile(uid, userAuth);

      if (!profile) {
        // Only the fields a user may write about themselves; an admin grants role and permissions later.
        const now = new Date().toISOString();
        const basics = { name: email.split('@')[0], email, createdAt: now, updatedAt: now };
        const adminAuth = await firebaseAdminDbAuth().catch(() => null);
        try {
          await setFirebaseProfile(uid, adminAuth || userAuth, basics);
        } catch (error) {
          // The service account may lack the Realtime Database role; the rules let users write these fields themselves.
          if (!adminAuth) throw error;
          await setFirebaseProfile(uid, userAuth, basics);
        }
        profile = { uid, ...basics };
      }

      if (profile.isActive === false) {
        return NextResponse.json({ error: '비활성화된 계정입니다.' }, { status: 403 });
      }

      const isAdmin = profile.role === 'admin' || (await getFirebaseAdminFlag(uid, userAuth));
      // With a service account the server reads Firestore itself, so the browser never needs a Firebase token.
      const firebaseToken = isFirestoreServiceAccountConfigured() ? undefined : firebaseUser.idToken;
      return sessionResponse(
        {
          id: uid,
          name: profile.name || email.split('@')[0],
          loginId: email,
          role: isAdmin ? 'admin' : 'staff',
          permissions: profile.permissions,
        },
        'firebase',
        firebaseToken ? { firebaseToken } : {},
      );
    }

    if (managerPassword && (loginId === 'admin' || loginId === 'manager') && safeEqual(loginPassword, managerPassword)) {
      loginLimiter.recordSuccess(ip, loginId);
      return sessionResponse({ id: 'admin', name: '총괄 관리자', loginId: 'admin', role: 'admin', permissions: [] }, 'master');
    }

    const account = await managerClient.fetch<ManagerAccount | null>(
      '*[_type == "managerAccount" && loginId == $loginId && isActive != false][0]{_id,name,loginId,password,role,permissions,isActive}',
      { loginId },
    );
    const verified = await verifyPasswordOrDummy(loginPassword, account?.password);

    if (!account || !verified.ok) {
      loginLimiter.recordFailure(ip, loginId);
      return NextResponse.json({ error: '계정 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
    }
    loginLimiter.recordSuccess(ip, loginId);

    if (verified.needsRehash && process.env.SANITY_WRITE_TOKEN) {
      try {
        await managerClient.patch(account._id).set({ password: await hashPassword(loginPassword) }).commit();
      } catch (error) {
        console.warn('Manager account password rehash failed:', error);
      }
    }

    return sessionResponse(
      {
        id: account._id,
        name: account.name || account.loginId || '관리자',
        loginId: account.loginId || loginId,
        role: account.role === 'admin' ? 'admin' : 'staff',
        permissions: account.permissions,
      },
      'account',
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '로그인 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
