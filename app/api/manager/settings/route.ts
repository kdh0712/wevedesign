import { NextResponse } from 'next/server';
import { assertManager, managerClient } from '../_utils';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authError = assertManager(request);
  if (authError) return authError;

  try {
    const settings = await managerClient.fetch(
      '*[_type == "siteSettings"][0]{consultationEmail, representativeName, businessNumber, companyStartYear, phone, address, lotAddress, locationLabel, locationTitle, heroLabel, heroTitle, heroDescription, primaryButtonLabel, secondaryButtonLabel, statementLabel, statementTitle, statementBody, projectSectionTitle, projectButtonLabel, portfolioTitle, aboutLabel, aboutTitle, aboutBody, processLabel, processTitle, contactLabel, contactTitle, contactBody, kakaoUrl, "heroImage": heroImage.asset->url, "heroImage2": heroImage2.asset->url, "heroImage3": heroImage3.asset->url}',
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
      'representativeName',
      'businessNumber',
      'companyStartYear',
      'phone',
      'address',
      'lotAddress',
      'locationLabel',
      'locationTitle',
      'heroLabel',
      'heroTitle',
      'heroDescription',
      'primaryButtonLabel',
      'secondaryButtonLabel',
      'statementLabel',
      'statementTitle',
      'statementBody',
      'projectSectionTitle',
      'projectButtonLabel',
      'portfolioTitle',
      'aboutLabel',
      'aboutTitle',
      'aboutBody',
      'processLabel',
      'processTitle',
      'contactLabel',
      'contactTitle',
      'contactBody',
      'kakaoUrl',
    ];

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        updates[field] = String(body[field] || '').trim();
      }
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
