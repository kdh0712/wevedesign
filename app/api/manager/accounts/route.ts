import { NextResponse } from 'next/server';
import { MANAGER_PERMISSIONS, normalizePermissions } from '../../../lib/manager-permissions';
import { checkSanityDocumentType, hashId, managerClient } from '../_utils';
import { hashPassword } from '../_password';
import { requireManager } from '../_session';
import {
  firebaseAdminDbAuth,
  firebaseSignUp,
  getFirebaseAccounts,
  isFirebaseManagerConfigured,
  setFirebaseProfile,
  type FirebaseProfile,
} from '../firebase';

export const runtime = 'nodejs';

const FIREBASE_ADMIN_REQUIRED = 'Firebase 계정 관리에는 서비스 계정 설정이 필요합니다.';

// Account management runs only for admin sessions. Firebase profiles are written with admin access
// (service account, or the signed-in Firebase admin's token), never with the edited user's own token.
async function firebaseAdminAccess(request: Request) {
  return firebaseAdminDbAuth(request.headers.get('x-firebase-token') || undefined);
}

export async function GET(request: Request) {
  const access = requireManager(request, { admin: true });
  if (access.error) return access.error;

  try {
    if (isFirebaseManagerConfigured()) {
      const dbAuth = await firebaseAdminAccess(request);
      if (!dbAuth) return NextResponse.json({ error: FIREBASE_ADMIN_REQUIRED }, { status: 400 });

      const accounts = await getFirebaseAccounts(dbAuth);
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
  const access = requireManager(request, { admin: true });
  if (access.error) return access.error;

  try {
    const body = await request.json();
    const id = String(body?.id || '').trim();
    const name = String(body?.name || '').trim();
    const loginId = String(body?.loginId || '').trim();
    const password = String(body?.password || '').trim();
    const role = body?.role === 'admin' ? 'admin' : 'staff';
    const permissions = role === 'admin' ? [...MANAGER_PERMISSIONS] : normalizePermissions(body?.permissions);
    const isActive = body?.isActive !== false;
    const now = new Date().toISOString();

    if (!name || !loginId) {
      return NextResponse.json({ error: '이름과 로그인 ID를 입력해 주세요.' }, { status: 400 });
    }

    if (!id && !password) {
      return NextResponse.json({ error: '새 계정은 비밀번호가 필요합니다.' }, { status: 400 });
    }

    if (isFirebaseManagerConfigured()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginId)) {
        return NextResponse.json({ error: 'Firebase 계정은 로그인 이메일 형식으로 입력해야 합니다.' }, { status: 400 });
      }

      const dbAuth = await firebaseAdminAccess(request);
      if (!dbAuth) return NextResponse.json({ error: FIREBASE_ADMIN_REQUIRED }, { status: 400 });

      const profile: Omit<FirebaseProfile, 'uid'> = { name, email: loginId, role, permissions, isActive, updatedAt: now };

      if (id) {
        const record = await setFirebaseProfile(id, dbAuth, profile);
        return NextResponse.json({ account: { _id: id, loginId, ...record } });
      }

      const createdUser = await firebaseSignUp(loginId, password);
      const record = await setFirebaseProfile(createdUser.localId, dbAuth, { ...profile, createdAt: now });
      return NextResponse.json({ account: { _id: createdUser.localId, loginId, ...record } });
    }

    const duplicated = await managerClient.fetch<{ _id: string } | null>(
      '*[_type == "managerAccount" && loginId == $loginId && _id != $id][0]{_id}',
      { loginId, id: id || `managerAccount-${hashId(loginId)}` },
    );

    if (duplicated?._id) {
      return NextResponse.json({ error: '이미 사용 중인 로그인 ID입니다.' }, { status: 400 });
    }

    const updates: Record<string, unknown> = { name, loginId, role, permissions, isActive, updatedAt: now };
    if (password) updates.password = await hashPassword(password);

    const record = id
      ? await managerClient.patch(id).set(updates).commit()
      : await managerClient.create({
          _id: `managerAccount-${hashId(loginId)}`,
          _type: 'managerAccount',
          ...updates,
          createdAt: now,
        });

    // Never send the stored hash back to the browser.
    const { password: _storedPassword, ...account } = record as Record<string, unknown>;
    return NextResponse.json({ account });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '계정을 저장하지 못했습니다.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const access = requireManager(request, { admin: true });
  if (access.error) return access.error;

  try {
    const body = await request.json();
    const id = String(body?.id || '').trim();
    if (!id) return NextResponse.json({ error: '삭제할 계정을 선택해 주세요.' }, { status: 400 });

    if (isFirebaseManagerConfigured()) {
      const dbAuth = await firebaseAdminAccess(request);
      if (!dbAuth) return NextResponse.json({ error: FIREBASE_ADMIN_REQUIRED }, { status: 400 });

      await setFirebaseProfile(id, dbAuth, { isActive: false, updatedAt: new Date().toISOString() });
      return NextResponse.json({ ok: true });
    }

    const documentType = await checkSanityDocumentType(id, 'managerAccount');
    if (documentType !== 'ok') return NextResponse.json({ error: '삭제할 계정을 찾을 수 없습니다.' }, { status: 404 });

    await managerClient.delete(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '계정을 삭제하지 못했습니다.' }, { status: 500 });
  }
}
