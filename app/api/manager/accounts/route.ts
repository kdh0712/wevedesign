import { NextResponse } from 'next/server';
import { assertManager, hashId, managerClient } from '../_utils';

export const runtime = 'nodejs';

const allowedPermissions = new Set(['dashboard', 'consultations', 'customers', 'sales', 'inventory', 'vendors', 'portfolio', 'accounts']);

export async function GET(request: Request) {
  const authError = assertManager(request);
  if (authError) return authError;

  try {
    const accounts = await managerClient.fetch(
      '*[_type == "managerAccount"] | order(_createdAt desc){_id,name,loginId,role,permissions,isActive,createdAt,updatedAt}',
    );
    return NextResponse.json({ accounts });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '계정 목록을 불러오지 못했습니다.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = assertManager(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const id = String(body?.id || '').trim();
    const name = String(body?.name || '').trim();
    const loginId = String(body?.loginId || '').trim();
    const password = String(body?.password || '').trim();
    const role = body?.role === 'admin' ? 'admin' : 'staff';
    const permissions = Array.isArray(body?.permissions)
      ? body.permissions.filter((permission: unknown) => allowedPermissions.has(String(permission))).map(String)
      : [];
    const isActive = body?.isActive !== false;
    const now = new Date().toISOString();

    if (!name || !loginId) {
      return NextResponse.json({ error: '이름과 로그인 ID를 입력해 주세요.' }, { status: 400 });
    }

    if (!id && !password) {
      return NextResponse.json({ error: '새 계정은 비밀번호가 필요합니다.' }, { status: 400 });
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
  const authError = assertManager(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const id = String(body?.id || '').trim();
    if (!id) return NextResponse.json({ error: '삭제할 계정을 선택해 주세요.' }, { status: 400 });

    await managerClient.delete(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '계정을 삭제하지 못했습니다.' }, { status: 500 });
  }
}
