import type { ManagerRole } from '../../lib/manager-permissions';
import { managerClient } from './_utils';
import { clientIp, loginLimiter } from './_login-limit';
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

export type LoginResult =
  | { ok: true; user: LoginUser; src: SessionSource; firebaseIdToken?: string }
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

// Unexpected failures (Firebase or Sanity unreachable) throw; the caller answers 500 with the message.
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

    if (profile.isActive === false) return { ok: false, status: 403, error: '비활성화된 계정입니다.' };

    const isAdmin = profile.role === 'admin' || (await getFirebaseAdminFlag(uid, userAuth));
    return {
      ok: true,
      user: { id: uid, name: profile.name || email.split('@')[0], loginId: email, role: isAdmin ? 'admin' : 'staff', permissions: profile.permissions },
      src: 'firebase',
      firebaseIdToken: firebaseUser.idToken,
    };
  }

  if (managerPassword && (loginId === 'admin' || loginId === 'manager') && safeEqual(loginPassword, managerPassword)) {
    loginLimiter.recordSuccess(ip, loginId);
    return { ok: true, user: MASTER_USER, src: 'master' };
  }

  const account = await managerClient.fetch<ManagerAccount | null>(
    '*[_type == "managerAccount" && loginId == $loginId && isActive != false][0]{_id,name,loginId,password,role,permissions,isActive}',
    { loginId },
  );
  const verified = await verifyPasswordOrDummy(loginPassword, account?.password);

  if (!account || !verified.ok) {
    loginLimiter.recordFailure(ip, loginId);
    return { ok: false, status: 401, error: '계정 또는 비밀번호가 올바르지 않습니다.' };
  }
  loginLimiter.recordSuccess(ip, loginId);

  if (verified.needsRehash && process.env.SANITY_WRITE_TOKEN) {
    try {
      await managerClient.patch(account._id).set({ password: await hashPassword(loginPassword) }).commit();
    } catch (error) {
      console.warn('Manager account password rehash failed:', error);
    }
  }

  return { ok: true, user: accountUser(account, loginId), src: 'account' };
}

// The account as it is now, for a phone session refresh: null when it was removed or deactivated, so the device signs out.
// Role and permissions are read again, so a change reaches the phone at its next refresh. Unexpected failures throw.
export async function reloadManagerUser(src: SessionSource, userId: string): Promise<LoginUser | null> {
  if (src === 'master') return userId === MASTER_USER.id ? MASTER_USER : null;

  if (src === 'firebase') {
    if (!isFirebaseManagerConfigured()) return null;
    const adminAuth = await firebaseAdminDbAuth();
    if (!adminAuth) throw new Error('Firebase 계정을 확인할 서비스 계정이 없습니다.');
    const profile = await getFirebaseProfile(userId, adminAuth);
    if (!profile || profile.isActive === false) return null;
    const email = profile.email || '';
    const isAdmin = profile.role === 'admin' || (await getFirebaseAdminFlag(userId, adminAuth));
    return {
      id: userId,
      name: profile.name || email.split('@')[0] || '직원',
      loginId: email || userId,
      role: isAdmin ? 'admin' : 'staff',
      permissions: profile.permissions,
    };
  }

  const account = await managerClient.fetch<ManagerAccount | null>(
    '*[_type == "managerAccount" && _id == $id && isActive != false][0]{_id,name,loginId,role,permissions,isActive}',
    { id: userId },
  );
  return account ? accountUser(account, account.loginId || '') : null;
}
