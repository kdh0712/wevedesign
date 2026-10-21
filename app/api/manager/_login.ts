import type { ManagerRole } from '../../lib/manager-permissions';
import { managerClient } from './_utils';
import { clientIp, loginLimiter } from './_login-limit';
import { isFirebaseCredentialRefusal, reloadSourceOutage } from './_login-rules';
import { hashPassword, safeEqual, verifyPasswordOrDummy } from './_password';
import type { SessionSource } from './_token';
import {
  firebaseAdminDbAuth,
  firebaseLookup,
  firebaseSignIn,
  getFirebaseAdminFlag,
  getFirebaseProfile,
  isFirebaseManagerConfigured,
  setFirebaseProfile,
} from './firebase';

// Login checks shared by the PC dashboard (POST /api/manager/auth) and the phone app (POST /api/manager/mobile/session).

export type LoginUser = { id: string; name: string; loginId: string; role: ManagerRole; permissions: unknown };

// credential: what the login was checked against (the master password, or the account's stored password hash after any
// rehash). The phone app stamps it on its device so a later password change ends that device. Never sent to a browser.
export type LoginResult =
  | { ok: true; user: LoginUser; src: SessionSource; credential: string | null; firebaseIdToken?: string }
  | { ok: false; status: number; error: string };

type ManagerAccount = {
  _id: string;
  name?: string;
  loginId?: string;
  password?: string;
  role?: 'admin' | 'staff';
  permissions?: string[];
  isActive?: boolean;
};

const MASTER_USER: LoginUser = { id: 'admin', name: '총괄 관리자', loginId: 'admin', role: 'admin', permissions: [] };

const accountUser = (account: ManagerAccount, loginId: string): LoginUser => ({
  id: account._id,
  name: account.name || account.loginId || '관리자',
  loginId: account.loginId || loginId,
  role: account.role === 'admin' ? 'admin' : 'staff',
  permissions: account.permissions,
});

const WRONG_CREDENTIALS = '계정 또는 비밀번호가 올바르지 않습니다.';

// Unexpected failures (Firebase or Sanity unreachable) throw; the caller answers 500.
export async function verifyManagerLogin(request: Request, rawLoginId: unknown, rawPassword: unknown): Promise<LoginResult> {
  const loginId = String(rawLoginId || 'admin').trim();
  const loginPassword = String(rawPassword || '').trim();
  const managerPassword = process.env.MANAGER_PASSWORD;

  if (!loginPassword) return { ok: false, status: 400, error: '비밀번호를 입력해 주세요.' };

  const ip = clientIp(request);
  if (loginLimiter.isBlocked(ip, loginId)) {
    return { ok: false, status: 429, error: '로그인 시도가 너무 많습니다. 15분 뒤에 다시 시도해 주세요.' };
  }

  if (isFirebaseManagerConfigured() && loginId.includes('@')) {
    let firebaseUser: Awaited<ReturnType<typeof firebaseSignIn>>;
    try {
      firebaseUser = await firebaseSignIn(loginId, loginPassword);
    } catch (error) {
      loginLimiter.recordFailure(ip, loginId);
      if (isFirebaseCredentialRefusal(error)) return { ok: false, status: 401, error: WRONG_CREDENTIALS };
      throw error;
    }
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

    if (profile.isActive === false) return { ok: false, status: 403, error: '비활성화된 계정입니다.' };

    const isAdmin = profile.role === 'admin' || (await getFirebaseAdminFlag(uid, userAuth));
    return {
      ok: true,
      user: { id: uid, name: profile.name || email.split('@')[0], loginId: email, role: isAdmin ? 'admin' : 'staff', permissions: profile.permissions },
      src: 'firebase',
      credential: null,
      firebaseIdToken: firebaseUser.idToken,
    };
  }

  if (managerPassword && (loginId === 'admin' || loginId === 'manager') && safeEqual(loginPassword, managerPassword)) {
    loginLimiter.recordSuccess(ip, loginId);
    return { ok: true, user: MASTER_USER, src: 'master', credential: managerPassword };
  }

  const account = await managerClient.fetch<ManagerAccount | null>(
    '*[_type == "managerAccount" && loginId == $loginId && isActive != false][0]{_id,name,loginId,password,role,permissions,isActive}',
    { loginId },
  );
  const verified = await verifyPasswordOrDummy(loginPassword, account?.password);

  if (!account || !verified.ok) {
    loginLimiter.recordFailure(ip, loginId);
    return { ok: false, status: 401, error: WRONG_CREDENTIALS };
  }
  loginLimiter.recordSuccess(ip, loginId);

  let storedPassword = account.password || '';
  if (verified.needsRehash && process.env.SANITY_WRITE_TOKEN) {
    try {
      const rehashed = await hashPassword(loginPassword);
      await managerClient.patch(account._id).set({ password: rehashed }).commit();
      storedPassword = rehashed;
    } catch (error) {
      console.warn('Manager account password rehash failed:', error);
    }
  }

  return { ok: true, user: accountUser(account, loginId), src: 'account', credential: storedPassword };
}

// The account as it is now, for a phone session refresh: null when it was removed or deactivated, so the device signs out.
// Role and permissions are read again, so a change reaches the phone at its next refresh; credential is compared with the
// device's stamp, so a changed password signs it out too. Unexpected failures throw, and so does a Firebase account on a
// deploy without the Firebase settings: that is a configuration slip, and the phone must keep its device through it.
export async function reloadManagerUser(src: SessionSource, userId: string): Promise<{ user: LoginUser; credential: string | null } | null> {
  const outage = reloadSourceOutage(src, { firebaseConfigured: isFirebaseManagerConfigured() });
  if (outage) throw new Error(outage);

  if (src === 'master') {
    const managerPassword = process.env.MANAGER_PASSWORD;
    // No master password configured any more: master phones end.
    return userId === MASTER_USER.id && managerPassword ? { user: MASTER_USER, credential: managerPassword } : null;
  }

  if (src === 'firebase') {
    const adminAuth = await firebaseAdminDbAuth();
    if (!adminAuth) throw new Error('Firebase 계정을 확인할 서비스 계정이 없습니다.');
    const profile = await getFirebaseProfile(userId, adminAuth);
    if (!profile || profile.isActive === false) return null;
    const email = profile.email || '';
    const isAdmin = profile.role === 'admin' || (await getFirebaseAdminFlag(userId, adminAuth));
    return {
      user: {
        id: userId,
        name: profile.name || email.split('@')[0] || '직원',
        loginId: email || userId,
        role: isAdmin ? 'admin' : 'staff',
        permissions: profile.permissions,
      },
      credential: null,
    };
  }

  const account = await managerClient.fetch<ManagerAccount | null>(
    '*[_type == "managerAccount" && _id == $id && isActive != false][0]{_id,name,loginId,password,role,permissions,isActive}',
    { id: userId },
  );
  return account ? { user: accountUser(account, account.loginId || ''), credential: account.password || '' } : null;
}
