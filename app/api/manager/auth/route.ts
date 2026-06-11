import { NextResponse } from 'next/server';
import { managerClient } from '../_utils';

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

const allPermissions = ['dashboard', 'consultations', 'customers', 'sales', 'inventory', 'vendors', 'portfolio', 'accounts'];

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
