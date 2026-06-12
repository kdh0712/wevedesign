import { NextResponse } from 'next/server';
import { assertManager, hashId, managerClient } from '../_utils';
import {
  firebaseLookup,
  firebaseSignUp,
  getFirebaseAccounts,
  getFirebaseAdminFlag,
  getFirebaseProfile,
  isFirebaseManagerConfigured,
  setFirebaseProfile,
  type FirebaseProfile,
} from '../firebase';

export const runtime = 'nodejs';

const allowedPermissions = new Set(['dashboard', 'consultations', 'customers', 'sites', 'sales', 'inventory', 'vendors', 'portfolio', 'accounts']);

const normalizePermissions = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.filter((permission) => allowedPermissions.has(String(permission))).map(String);
  }

  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .filter((permission) => allowedPermissions.has(String(permission)))
      .map(String);
  }

  return [];
};

async function assertAccountAdmin(request: Request) {
  const authError = assertManager(request);
  if (authError) return authError;

  const firebaseToken = request.headers.get('x-firebase-token') || '';
  if (!isFirebaseManagerConfigured() || !firebaseToken) return null;

  const user = await firebaseLookup(firebaseToken);
  const uid = user?.localId;
  if (!uid) {
    return NextResponse.json({ error: 'Firebase 로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.' }, { status: 401 });
  }

  const profile = await getFirebaseProfile(uid, firebaseToken);
  const isAdmin = profile?.role === 'admin' || (await getFirebaseAdminFlag(uid, firebaseToken));
  if (!isAdmin) {
    return NextResponse.json({ error: '총괄 관리자 계정만 계정을 추가, 수정, 삭제할 수 있습니다.' }, { status: 403 });
  }

  return null;
}

export async function GET(request: Request) {
  const authError = await assertAccountAdmin(request);
  if (authError) return authError;

  try {
    const firebaseToken = request.headers.get('x-firebase-token') || '';
    if (isFirebaseManagerConfigured() && firebaseToken) {
      const accounts = await getFirebaseAccounts(firebaseToken);
      return NextResponse.json({
        accounts: accounts.map((account) => ({
          _id: account.uid,
          name: account.name,
          loginId: account.email,
          role: account.role,
          permissions: normalizePermissions(account.permissions),
          isActive: account.isActive,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        })),
      });
    }

    const accounts = await managerClient.fetch(
      '*[_type == "managerAccount"] | order(_createdAt desc){_id,name,loginId,role,permissions,isActive,createdAt,updatedAt}',
    );
    return NextResponse.json({ accounts });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '계정 목록을 불러오지 못했습니다.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = await assertAccountAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const id = String(body?.id || '').trim();
    const name = String(body?.name || '').trim();
    const loginId = String(body?.loginId || '').trim();
    const password = String(body?.password || '').trim();
    const role = body?.role === 'admin' ? 'admin' : 'staff';
    const permissions = normalizePermissions(body?.permissions);
    const isActive = body?.isActive !== false;
    const now = new Date().toISOString();

    if (!name || !loginId) {
      return NextResponse.json({ error: '이름과 로그인 ID를 입력해 주세요.' }, { status: 400 });
    }

    if (!id && !password) {
      return NextResponse.json({ error: '새 계정은 비밀번호가 필요합니다.' }, { status: 400 });
    }

    const firebaseToken = request.headers.get('x-firebase-token') || '';
    if (isFirebaseManagerConfigured()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginId)) {
        return NextResponse.json({ error: 'Firebase 계정은 로그인 이메일 형식으로 입력해야 합니다.' }, { status: 400 });
      }

      const profile: Omit<FirebaseProfile, 'uid'> = {
        name,
        email: loginId,
        role,
        permissions: role === 'admin' ? Array.from(allowedPermissions) : permissions,
        isActive,
        updatedAt: now,
      };

      if (id) {
        if (!firebaseToken) {
          return NextResponse.json({ error: 'Firebase 계정 수정은 Firebase 관리자 계정으로 로그인해야 합니다.' }, { status: 401 });
        }
        const record = await setFirebaseProfile(id, firebaseToken, profile);
        return NextResponse.json({ account: { _id: id, loginId, ...record } });
      }

      const createdUser = await firebaseSignUp(loginId, password);
      const record = await setFirebaseProfile(createdUser.localId, createdUser.idToken, {
        ...profile,
        createdAt: now,
      });
      return NextResponse.json({ account: { _id: createdUser.localId, loginId, ...record } });
    }

    const duplicated = await managerClient.fetch<{ _id: string } | null>(
      '*[_type == "managerAccount" && loginId == $loginId && _id != $id][0]{_id}',
      { loginId, id: id || `managerAccount-${hashId(loginId)}` },
    );

    if (duplicated?._id) {
      return NextResponse.json({ error: '이미 사용 중인 로그인 ID입니다.' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      name,
      loginId,
      role,
      permissions: role === 'admin' ? Array.from(allowedPermissions) : permissions,
      isActive,
      updatedAt: now,
    };
    if (password) updates.password = password;

    const record = id
      ? await managerClient.patch(id).set(updates).commit()
      : await managerClient.create({
          _id: `managerAccount-${hashId(loginId)}`,
          _type: 'managerAccount',
          ...updates,
          createdAt: now,
        });

    return NextResponse.json({ account: record });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '계정을 저장하지 못했습니다.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const authError = await assertAccountAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const id = String(body?.id || '').trim();
    if (!id) return NextResponse.json({ error: '삭제할 계정을 선택해 주세요.' }, { status: 400 });

    const firebaseToken = request.headers.get('x-firebase-token') || '';
    if (isFirebaseManagerConfigured() && firebaseToken) {
      await setFirebaseProfile(id, firebaseToken, { isActive: false, updatedAt: new Date().toISOString() });
      return NextResponse.json({ ok: true });
    }

    await managerClient.delete(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '계정을 삭제하지 못했습니다.' }, { status: 500 });
  }
}
