import { NextResponse } from 'next/server';
import { assertManager, managerClient } from '../_utils';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authError = assertManager(request);
  if (authError) return authError;

  const settings = await managerClient.fetch('*[_type == "siteSettings"][0]{consultationEmail, phone, address, lotAddress}');
  return NextResponse.json({ settings: settings || null });
}

export async function PATCH(request: Request) {
  const authError = assertManager(request);
  if (authError) return authError;

  const body = (await request.json()) as { consultationEmail?: string };
  const consultationEmail = body.consultationEmail?.trim();

  if (!consultationEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(consultationEmail)) {
    return NextResponse.json({ error: '올바른 이메일 주소를 입력해주세요.' }, { status: 400 });
  }

  await managerClient.createIfNotExists({
    _id: 'siteSettings',
    _type: 'siteSettings',
    title: 'WEVE DESIGN 홈페이지 설정',
  });

  const settings = await managerClient.patch('siteSettings').set({ consultationEmail }).commit();
  return NextResponse.json({ settings });
}
