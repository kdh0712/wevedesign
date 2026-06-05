import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from 'next-sanity';

type ConsultationPayload = {
  name?: string;
  phone?: string;
  siteType?: string;
  propertyType?: string;
  areaRange?: string;
  homeStatus?: string;
  reason?: string;
  spaces?: string[];
  otherSpace?: string;
  budget?: string;
  timeline?: string;
  postcode?: string;
  address?: string;
  detailAddress?: string;
  message?: string;
  privacyAgreed?: boolean;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const client = createClient({
  projectId: 'q2qjj1se',
  dataset: 'production',
  useCdn: true,
  apiVersion: '2026-01-01',
  token: process.env.SANITY_READ_TOKEN,
});

const writeClient = createClient({
  projectId: 'q2qjj1se',
  dataset: 'production',
  useCdn: false,
  apiVersion: '2026-01-01',
  token: process.env.SANITY_WRITE_TOKEN,
});

const fieldRow = (label: string, value: string) => `
  <tr>
    <th style="width:150px; padding:10px 12px; text-align:left; background:#f6f4ef; border-bottom:1px solid #e7dece;">${escapeHtml(label)}</th>
    <td style="padding:10px 12px; border-bottom:1px solid #e7dece;">${escapeHtml(value || '-')}</td>
  </tr>
`;

export async function POST(request: Request) {
  try {
    const settings = await client.fetch('*[_type == "siteSettings"][0]{consultationEmail}', {}, { next: { revalidate: 60 } });
    const toEmail = settings?.consultationEmail || process.env.CONSULTATION_TO_EMAIL || 'ehogh1@gmail.com';
    const payload = (await request.json()) as ConsultationPayload;

    const name = payload.name?.trim() || '';
    const phone = payload.phone?.trim() || '';
    const propertyType = payload.propertyType?.trim() || payload.siteType?.trim() || '';
    const areaRange = payload.areaRange?.trim() || '';
    const homeStatus = payload.homeStatus?.trim() || '';
    const reason = payload.reason?.trim() || '';
    const spaces = Array.isArray(payload.spaces) ? payload.spaces.map((space) => space.trim()).filter(Boolean) : [];
    const otherSpace = payload.otherSpace?.trim() || '';
    const budget = payload.budget?.trim() || '';
    const timeline = payload.timeline?.trim() || '';
    const postcode = payload.postcode?.trim() || '';
    const address = payload.address?.trim() || '';
    const detailAddress = payload.detailAddress?.trim() || '';
    const message = payload.message?.trim() || '';
    const privacyAgreed = payload.privacyAgreed === true;
    const fullAddress = [postcode ? `(${postcode})` : '', address, detailAddress].filter(Boolean).join(' ');
    const spaceText = [...spaces.filter((space) => space !== '기타 입력'), otherSpace ? `기타: ${otherSpace}` : ''].filter(Boolean).join(', ');

    if (
      !name ||
      !phone ||
      !propertyType ||
      !areaRange ||
      !homeStatus ||
      !reason ||
      spaces.length === 0 ||
      !budget ||
      !timeline ||
      !address ||
      !detailAddress ||
      !privacyAgreed
    ) {
      return NextResponse.json({ error: '필수 정보가 누락되었습니다.' }, { status: 400 });
    }

    if (!process.env.SANITY_WRITE_TOKEN) {
      return NextResponse.json({ error: '관리자 저장 토큰(SANITY_WRITE_TOKEN)이 설정되어 있지 않습니다.' }, { status: 500 });
    }

    await writeClient.create({
      _type: 'officeConsultation',
      name,
      phone,
      siteType: propertyType,
      propertyType,
      areaRange,
      homeStatus,
      reason,
      spaces,
      otherSpace,
      budget,
      timeline,
      postcode,
      address,
      detailAddress,
      fullAddress,
      message,
      privacyAgreed,
      status: '신규',
      source: '홈페이지 상담 신청',
      createdAt: new Date().toISOString(),
    });

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: '메일 전송 키(RESEND_API_KEY)가 설정되어 있지 않습니다. 상담 요청은 관리자 페이지에 저장되었습니다.' }, { status: 500 });
    }

    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: 'WEVE DESIGN <onboarding@resend.dev>',
      to: [toEmail],
      subject: `[WEVE DESIGN 상담 신청] ${name} / ${propertyType} / ${areaRange}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height:1.7; color:#171512;">
          <h2 style="margin:0 0 20px; color:#171512;">새 상담 신청이 접수되었습니다.</h2>
          <table style="width:100%; max-width:720px; border-collapse:collapse; border-top:2px solid #171512;">
            ${fieldRow('이름', name)}
            ${fieldRow('연락처', phone)}
            ${fieldRow('시공 주소', fullAddress)}
            ${fieldRow('공간 종류', propertyType)}
            ${fieldRow('평수', areaRange)}
            ${fieldRow('현재 상태', homeStatus)}
            ${fieldRow('인테리어 이유', reason)}
            ${fieldRow('필요 공간', spaceText)}
            ${fieldRow('예산', budget)}
            ${fieldRow('희망 시작일', timeline)}
          </table>
          <h3 style="margin:24px 0 10px;">요청사항</h3>
          <div style="max-width:720px; background:#f6f4ef; padding:16px; border-radius:8px;">
            ${escapeHtml(message || '별도 요청사항 없음').replace(/\n/g, '<br>')}
          </div>
        </div>
      `,
    });

    if (error) {
      const errorMessage =
        typeof error === 'string'
          ? error
          : '메일 전송에 실패했습니다. Resend 발신/수신 설정을 확인해 주세요. 상담 요청은 관리자 페이지에 저장되었습니다.';

      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
