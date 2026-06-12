import { NextResponse } from 'next/server';
import { managerClient } from '../_utils';
import {
  firebaseLookup,
  firebaseSignIn,
  getFirebaseAdminFlag,
  getFirebaseProfile,
  isFirebaseManagerConfigured,
  setFirebaseProfile,
} from '../firebase';

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

const allPermissions = ['dashboard', 'consultations', 'customers', 'sites', 'sales', 'inventory', 'vendors', 'portfolio', 'accounts'];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const loginId = String(body?.loginId || 'admin').trim();
    const loginPassword = String(body?.password || '').trim();
    const managerPassword = process.env.MANAGER_PASSWORD;

    if (!managerPassword) {
      return NextResponse.json({ error: 'MANAGER_PASSWORD is not configured.' }, { status: 500 });
    }

    if (!loginPassword) {
      return NextResponse.json({ error: '비밀번호를 입력해 주세요.' }, { status: 400 });
    }

    if (isFirebaseManagerConfigured() && loginId.includes('@')) {
      const firebaseUser = await firebaseSignIn(loginId, loginPassword);
      const lookupUser = await firebaseLookup(firebaseUser.idToken);
      const uid = lookupUser?.localId || firebaseUser.localId;
      const email = lookupUser?.email || firebaseUser.email || loginId;
      let profile = await getFirebaseProfile(uid, firebaseUser.idToken);

      if (!profile) {
        profile = {
          uid,
          name: email.split('@')[0],
          email,
          role: 'staff',
          permissions: ['dashboard', 'consultations'],
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await setFirebaseProfile(uid, firebaseUser.idToken, profile);
      }

      if (profile.isActive === false) {
        return NextResponse.json({ error: '비활성화된 계정입니다.' }, { status: 403 });
      }

      const isAdmin = profile.role === 'admin' || (await getFirebaseAdminFlag(uid, firebaseUser.idToken));
      return NextResponse.json({
        token: managerPassword,
        firebaseToken: firebaseUser.idToken,
        user: {
          id: uid,
          name: profile.name || email.split('@')[0],
          loginId: email,
          role: isAdmin ? 'admin' : 'staff',
          permissions: isAdmin ? allPermissions : profile.permissions || [],
        },
      });
    }

    if ((loginId === 'admin' || loginId === 'manager') && loginPassword === managerPassword) {
      return NextResponse.json({
        token: managerPassword,
        user: {
          id: 'admin',
          name: '총괄 관리자',
          loginId: 'admin',
          role: 'admin',
          permissions: allPermissions,
        },
      });
    }

    const account = await managerClient.fetch<ManagerAccount | null>(
      '*[_type == "managerAccount" && loginId == $loginId && isActive != false][0]{_id,name,loginId,password,role,permissions,isActive}',
      { loginId },
    );

    if (!account || account.password !== loginPassword) {
      return NextResponse.json({ error: '계정 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
    }

    return NextResponse.json({
      token: managerPassword,
      user: {
        id: account._id,
        name: account.name || account.loginId || '관리자',
        loginId: account.loginId,
        role: account.role || 'staff',
        permissions: account.role === 'admin' ? allPermissions : account.permissions || [],
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '로그인 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
