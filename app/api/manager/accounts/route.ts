import { NextResponse } from 'next/server';
import { MANAGER_PERMISSIONS, normalizePermissions } from '../../../lib/manager-permissions';
import { LOGIN_ID_TAKEN_MESSAGE, idAccountUpdate, loginIdError, normalizeLoginId, passwordError } from '../../../lib/staff-signup-rules';
import { checkSanityDocumentType, hashId, managerClient } from '../_utils';
import { hashPassword } from '../_password';
import { requireManager } from '../_session';
import { isLoginIdTaken } from '../_signup-flow';
import {
  accountDocId,
  createIdAccount,
  firestoreSignupStore,
  getIdAccount,
  isStaffAccountStoreReady,
  listIdAccounts,
  updateIdAccount,
  type IdAccount,
} from '../_staff-accounts';
import { isFirestoreConflictError } from '../firestore';
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
const ID_STORE_MISSING = '아이디 계정 관리에는 Firestore 서비스 계정 설정이 필요합니다.';
const ID_ACCOUNT_MISSING = '계정을 찾을 수 없습니다.';

// Account management runs only for admin sessions. Firebase profiles are written with admin access
// (service account, or the signed-in Firebase admin's token), never with the edited user's own token.
async function firebaseAdminAccess(request: Request) {
  return firebaseAdminDbAuth(request.headers.get('x-firebase-token') || undefined);
}

// kind tells the screen which store an account lives in: 'firebase' (email login), 'sanity' (older ID accounts) or 'id'
// (ID accounts from a staff sign-up or made here, in Firestore managerAccounts). The password hash never leaves the server.
const idAccountRow = (account: IdAccount) => ({
  _id: account._id,
  kind: 'id' as const,
  name: account.name || '',
  loginId: account.loginId || '',
  phone: account.phone || '',
  role: account.role === 'admin' ? 'admin' : 'staff',
  permissions: normalizePermissions(account.permissions),
  isActive: account.isActive !== false,
  origin: account.origin,
  createdAt: account.createdAt,
  updatedAt: account.updatedAt,
});

async function listIdAccountRows() {
  if (!isStaffAccountStoreReady()) return [];
  const accounts = await listIdAccounts();
  return accounts.map(idAccountRow).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

// Edits an ID account: name, phone, role, permissions, on/off, and a new password when one is given. The id cannot change
// (the document id comes from it). Turning the account off also deletes its phone number (idAccountUpdate).
async function saveIdAccount(id: string, body: Record<string, unknown>, now: string) {
  const stored = await getIdAccount(id);
  if (!stored) return NextResponse.json({ error: ID_ACCOUNT_MISSING }, { status: 404 });
  if (normalizeLoginId(body.loginId) !== stored.loginId) {
    return NextResponse.json({ error: '아이디 계정의 아이디는 바꿀 수 없습니다.' }, { status: 400 });
  }

  const role = body.role === 'admin' ? 'admin' : 'staff';
  const checked = idAccountUpdate({ name: String(body.name || ''), phone: String(body.phone || ''), role, permissions: body.permissions, isActive: body.isActive !== false });
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const fields: Record<string, unknown> = { ...checked.fields, updatedAt: now };
  if (role === 'admin') fields.permissions = [...MANAGER_PERMISSIONS];
  const password = String(body.password || '').trim();
  if (password) {
    const problem = passwordError(password);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    fields.passwordHash = await hashPassword(password);
  }

  try {
    const saved = await updateIdAccount(id, fields);
    return NextResponse.json({ account: idAccountRow(saved) });
  } catch (error) {
    if (isFirestoreConflictError(error)) return NextResponse.json({ error: ID_ACCOUNT_MISSING }, { status: 404 });
    throw error;
  }
}

// A new account whose login has no '@', made by the admin: a Firestore ID account (origin 'admin'), same rules as a sign-up.
async function createAdminIdAccount(body: Record<string, unknown>, password: string, now: string) {
  const loginId = normalizeLoginId(body.loginId);
  const problem = loginIdError(loginId) || passwordError(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const role = body.role === 'admin' ? 'admin' : 'staff';
  const checked = idAccountUpdate({ name: String(body.name || ''), phone: String(body.phone || ''), role, permissions: body.permissions, isActive: body.isActive !== false });
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  if (await isLoginIdTaken(firestoreSignupStore(), loginId, Date.parse(now))) {
    return NextResponse.json({ error: LOGIN_ID_TAKEN_MESSAGE }, { status: 409 });
  }

  const fields = {
    ...checked.fields,
    permissions: role === 'admin' ? [...MANAGER_PERMISSIONS] : checked.fields.permissions,
    loginId,
    passwordHash: await hashPassword(password),
    createdAt: now,
    updatedAt: now,
    origin: 'admin',
  };
  try {
    await createIdAccount(loginId, fields);
  } catch (error) {
    if (isFirestoreConflictError(error)) return NextResponse.json({ error: LOGIN_ID_TAKEN_MESSAGE }, { status: 409 });
    throw error;
  }
  const created = await getIdAccount(accountDocId(loginId));
  return NextResponse.json({ account: created ? idAccountRow(created) : null });
}

export async function GET(request: Request) {
  const access = requireManager(request, { admin: true });
  if (access.error) return access.error;

  try {
    if (isFirebaseManagerConfigured()) {
      const dbAuth = await firebaseAdminAccess(request);
      if (!dbAuth) return NextResponse.json({ error: FIREBASE_ADMIN_REQUIRED }, { status: 400 });

      const [accounts, idAccounts] = await Promise.all([getFirebaseAccounts(dbAuth), listIdAccountRows()]);
      return NextResponse.json({
        accounts: [...idAccounts, ...accounts.map((account) => ({
          _id: account.uid,
          kind: 'firebase' as const,
          name: account.name,
          loginId: account.email,
          role: account.role,
          permissions: normalizePermissions(account.permissions),
          isActive: account.isActive,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        }))],
      });
    }

    const [accounts, idAccounts] = await Promise.all([
      managerClient.fetch<Array<Record<string, unknown>>>(
        '*[_type == "managerAccount"] | order(_createdAt desc){_id,name,loginId,role,permissions,isActive,createdAt,updatedAt}',
      ),
      listIdAccountRows(),
    ]);
    return NextResponse.json({ accounts: [...idAccounts, ...accounts.map((account) => ({ ...account, kind: 'sanity' as const }))] });
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

    if (body?.kind === 'id') {
      if (!id) return NextResponse.json({ error: ID_ACCOUNT_MISSING }, { status: 400 });
      if (!isStaffAccountStoreReady()) return NextResponse.json({ error: ID_STORE_MISSING }, { status: 503 });
      return await saveIdAccount(id, body, now);
    }
    if (!id && !loginId.includes('@') && isStaffAccountStoreReady()) {
      return await createAdminIdAccount(body, password, now);
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

    // An ID account is turned off, never deleted (its id stays taken), and its phone number is deleted (spec §4.3).
    if (body?.kind === 'id') {
      if (!isStaffAccountStoreReady()) return NextResponse.json({ error: ID_STORE_MISSING }, { status: 503 });
      try {
        await updateIdAccount(id, { isActive: false, phone: '', updatedAt: new Date().toISOString() });
      } catch (error) {
        if (isFirestoreConflictError(error)) return NextResponse.json({ error: ID_ACCOUNT_MISSING }, { status: 404 });
        throw error;
      }
      return NextResponse.json({ ok: true });
    }

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
