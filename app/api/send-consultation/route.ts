import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from 'next-sanity';

type ConsultationPayload = {
  name?: string;
  phone?: string;
  siteType?: string;
  address?: string;
  message?: string;
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

export async function POST(request: Request) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const settings = await client.fetch('*[_type == "siteSettings"][0]{consultationEmail}', {}, { next: { revalidate: 60 } });
    const toEmail = settings?.consultationEmail || process.env.CONSULTATION_TO_EMAIL || 'ehogh1@gmail.com';

    if (!apiKey) {
      return NextResponse.json({ error: '메일 전송 키가 설정되지 않았습니다. Vercel의 RESEND_API_KEY를 확인해 주세요.' }, { status: 500 });
    }

    const payload = (await request.json()) as ConsultationPayload;
    const name = payload.name?.trim();
    const phone = payload.phone?.trim();
    const siteType = payload.siteType?.trim();
    const address = payload.address?.trim();
    const message = payload.message?.trim();

    if (!name || !phone || !siteType || !address || !message) {
      return NextResponse.json({ error: '필수 정보가 누락되었습니다.' }, { status: 400 });
    }

    const resend = new Resend(apiKey);
    const safeName = escapeHtml(name);
    const safePhone = escapeHtml(phone);
    const safeSiteType = escapeHtml(siteType);
    const safeAddress = escapeHtml(address);
    const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');

    if (process.env.SANITY_WRITE_TOKEN) {
      try {
        await writeClient.create({
          _type: 'officeConsultation',
          name,
          phone,
          siteType,
          address,
          message,
          status: '신규',
          source: '홈페이지 상담폼',
          createdAt: new Date().toISOString(),
        });
      } catch (recordError) {
        console.error('Consultation record create failed:', recordError);
      }
    }

    const { data, error } = await resend.emails.send({
      from: 'WEVE DESIGN <onboarding@resend.dev>',
      to: [toEmail],
      subject: `[WEVE DESIGN 상담 신청] ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #171512;">
          <h2 style="margin: 0 0 20px; color: #171512;">새 상담 신청이 접수되었습니다.</h2>
          <p><strong>이름:</strong> ${safeName}</p>
          <p><strong>연락처:</strong> ${safePhone}</p>
          <p><strong>현장 종류:</strong> ${safeSiteType}</p>
          <p><strong>현장 위치:</strong> ${safeAddress}</p>
          <p><strong>문의 내용:</strong></p>
          <div style="background: #f6f4ef; padding: 16px; border-radius: 8px;">
            ${safeMessage}
          </div>
        </div>
      `,
    });

    if (error) {
      const errorMessage =
        typeof error === 'string'
          ? error
          : '메일 전송에 실패했습니다. Resend 발신자/수신자 설정을 확인해 주세요.';

      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
