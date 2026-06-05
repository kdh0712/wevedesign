import { NextResponse } from 'next/server';
import { assertManager, managerClient } from '../_utils';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authError = assertManager(request);
  if (authError) return authError;

  try {
    const settings = await managerClient.fetch(
      '*[_type == "siteSettings"][0]{consultationEmail, phone, address, lotAddress, locationTitle, heroTitle, heroDescription, primaryButtonLabel, secondaryButtonLabel, contactTitle, contactBody, kakaoUrl}',
    );
    return NextResponse.json({ settings: settings || null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load settings.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authError = assertManager(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as Record<string, string | undefined>;
    const updates: Record<string, string> = {};

    const allowedFields = [
      'consultationEmail',
      'phone',
      'address',
      'lotAddress',
      'locationTitle',
      'heroTitle',
      'heroDescription',
      'primaryButtonLabel',
      'secondaryButtonLabel',
      'contactTitle',
      'contactBody',
      'kakaoUrl',
    ];

    for (const field of allowedFields) {
      const value = body[field]?.trim();
      if (value) updates[field] = value;
    }

    if (updates.consultationEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.consultationEmail)) {
      return NextResponse.json({ error: '올바른 이메일 주소를 입력해주세요.' }, { status: 400 });
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '저장할 홈페이지 설정을 입력해주세요.' }, { status: 400 });
    }

    await managerClient.createIfNotExists({
      _id: 'siteSettings',
      _type: 'siteSettings',
      title: 'WEVE DESIGN 홈페이지 설정',
    });

    const settings = await managerClient.patch('siteSettings').set(updates).commit();
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to save settings.' }, { status: 500 });
  }
}
