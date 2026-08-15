import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from 'next-sanity';
import { canUseFirestoreOnServer, savePublicConsultationToFirestore, shouldUseFirestoreErp } from '../manager/firestore';

type ConsultationPayload = {
  name?: string;
  phone?: string;
  siteType?: string;
  propertyType?: string;
  areaRange?: string;
  homeStatus?: string;
  reason?: string;
  budget?: string;
  timeline?: string;
  postcode?: string;
  address?: string;
  detailAddress?: string;
  message?: string;
  privacyAgreed?: boolean;
  source?: string;
};

type ConsultationNotificationFields = {
  name: string;
  phone: string;
  source: string;
  fullAddress: string;
  propertyType: string;
  areaRange: string;
  homeStatus: string;
  reason: string;
  budget: string;
  timeline: string;
  message: string;
};

type AligoResponse = {
  result_code?: string | number;
  code?: string | number;
  message?: string;
  msg?: string;
  [key: string]: unknown;
};

type AligoRecipient = {
  phone: string;
  name: string;
};

type AligoTemplateRequest = {
  recipients: AligoRecipient[];
  templateCode: string;
  messageTemplate: string;
  subject: string;
  fields: ConsultationNotificationFields;
};

const consultationSources: Record<string, string> = {
  'kakao-channel': '카카오 채널',
  'naver-place': '네이버 플레이스',
  blog: '블로그',
  instagram: '인스타그램',
};

const ALIGO_API_URL = process.env.ALIGO_API_URL || 'https://kakaoapi.aligo.in/akv10/alimtalk/send/';

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

function normalizePhone(value: string) {
  return value.replace(/\D/g, '');
}

function parsePhoneList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,;|\n]+/)
        .map(normalizePhone)
        .filter(Boolean),
    ),
  );
}

function isAligoSuccess(payload: AligoResponse) {
  const rawCode = payload.result_code ?? payload.code;
  if (rawCode === undefined || rawCode === null || rawCode === '') return true;
  const code = String(rawCode);
  return code === '1' || code === '0' || code.toLowerCase() === 'success';
}

function consultationSummary(fields: ConsultationNotificationFields) {
  return [
    '[WEVE DESIGN 신규 상담]',
    `이름: ${fields.name}`,
    `연락처: ${fields.phone}`,
    `유입 경로: ${fields.source}`,
    `주소: ${fields.fullAddress}`,
    `공간: ${fields.propertyType}`,
    `평수: ${fields.areaRange}`,
    `상태: ${fields.homeStatus}`,
    `이유: ${fields.reason}`,
    `예산: ${fields.budget}`,
    `희망일: ${fields.timeline}`,
    `요청사항: ${fields.message || '없음'}`,
  ].join('\n');
}

function fillConsultationTemplate(template: string, fields: ConsultationNotificationFields) {
  const summary = consultationSummary(fields);
  return template
    .replaceAll('#{상담내용}', summary)
    .replaceAll('{상담내용}', summary)
    .replaceAll('{{summary}}', summary)
    .replaceAll('#{고객명}', fields.name)
    .replaceAll('{고객명}', fields.name)
    .replaceAll('{{name}}', fields.name)
    .replaceAll('#{연락처}', fields.phone)
    .replaceAll('{연락처}', fields.phone)
    .replaceAll('{{phone}}', fields.phone)
    .replaceAll('#{주소}', fields.fullAddress)
    .replaceAll('{주소}', fields.fullAddress)
    .replaceAll('{{address}}', fields.fullAddress)
    .replaceAll('#{공간}', fields.propertyType)
    .replaceAll('{공간}', fields.propertyType)
    .replaceAll('{{propertyType}}', fields.propertyType)
    .replaceAll('#{평수}', fields.areaRange)
    .replaceAll('{평수}', fields.areaRange)
    .replaceAll('{{areaRange}}', fields.areaRange)
    .replaceAll('#{예산}', fields.budget)
    .replaceAll('{예산}', fields.budget)
    .replaceAll('{{budget}}', fields.budget)
    .replaceAll('#{희망일}', fields.timeline)
    .replaceAll('{희망일}', fields.timeline)
    .replaceAll('{{timeline}}', fields.timeline);
}

async function sendAligoTemplate({
  recipients,
  templateCode,
  messageTemplate,
  subject,
  fields,
}: AligoTemplateRequest) {
  const senderPhone = process.env.ALIGO_SENDER_PHONE?.trim() || '';
  const requiredEntries = [
    ['ALIGO_API_KEY', process.env.ALIGO_API_KEY?.trim()],
    ['ALIGO_USER_ID', process.env.ALIGO_USER_ID?.trim()],
    ['ALIGO_SENDER_KEY', process.env.ALIGO_SENDER_KEY?.trim()],
    ['ALIGO_SENDER_PHONE', senderPhone],
    ['templateCode', templateCode],
    ['messageTemplate', messageTemplate],
    ['recipients', recipients.length > 0 ? 'configured' : ''],
  ];
  const missing = requiredEntries.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    console.warn(`상담 알림톡 설정이 부족합니다: ${missing.join(', ')}`);
    return { ok: false, skipped: 'missing-config', missing };
  }

  const form = new URLSearchParams();
  form.set('apikey', process.env.ALIGO_API_KEY!.trim());
  form.set('userid', process.env.ALIGO_USER_ID!.trim());
  form.set('senderkey', process.env.ALIGO_SENDER_KEY!.trim());
  form.set('tpl_code', templateCode);
  form.set('sender', senderPhone);

  const message = fillConsultationTemplate(messageTemplate, fields);
  recipients.forEach((recipient, index) => {
    const suffix = index + 1;
    form.set(`receiver_${suffix}`, recipient.phone);
    form.set(`recvname_${suffix}`, recipient.name);
    form.set(`subject_${suffix}`, subject);
    form.set(`message_${suffix}`, message);
  });

  if (process.env.ALIGO_TEST_MODE === 'Y') form.set('testMode', 'Y');

  try {
    const response = await fetch(ALIGO_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: form,
    });
    const text = await response.text();
    let providerResponse: AligoResponse = {};
    try {
      providerResponse = text ? (JSON.parse(text) as AligoResponse) : {};
    } catch {
      providerResponse = { message: text };
    }

    if (!response.ok || !isAligoSuccess(providerResponse)) {
      console.error('상담 알림톡 발송 실패', providerResponse);
      return { ok: false, error: providerResponse.message || providerResponse.msg || `HTTP ${response.status}` };
    }

    return { ok: true };
  } catch (error) {
    console.error('상담 알림톡 발송 오류', error);
    return { ok: false, error: error instanceof Error ? error.message : '알림톡 발송 오류' };
  }
}

async function sendConsultationKakaoNotifications(fields: ConsultationNotificationFields) {
  const enabled = (process.env.ALIGO_CONSULTATION_ENABLED || '').trim().toLowerCase();
  if (enabled === 'false' || enabled === '0') {
    return {
      admin: { ok: false, skipped: 'disabled' },
      customer: { ok: false, skipped: 'disabled' },
    };
  }

  const adminEnabled = (process.env.ALIGO_CONSULTATION_ADMIN_ENABLED || '').trim().toLowerCase();
  const adminPhones = parsePhoneList(
    process.env.ALIGO_CONSULTATION_ADMIN_RECEIVER_PHONES ||
      process.env.ALIGO_CONSULTATION_RECEIVER_PHONE ||
      process.env.KAKAO_CONSULTATION_RECEIVER_PHONE ||
      process.env.CONSULTATION_NOTIFY_PHONE ||
      '',
  );
  const adminTemplateCode =
    process.env.ALIGO_CONSULTATION_ADMIN_TEMPLATE_CODE?.trim() ||
    process.env.ALIGO_CONSULTATION_TEMPLATE_CODE?.trim() ||
    '';
  const adminMessageTemplate =
    process.env.ALIGO_CONSULTATION_ADMIN_MESSAGE_TEMPLATE?.trim() ||
    process.env.ALIGO_CONSULTATION_MESSAGE_TEMPLATE?.trim() ||
    '';
  const hasAdminConfig = Boolean(adminPhones.length || adminTemplateCode || adminMessageTemplate);

  const customerEnabled = (process.env.ALIGO_CONSULTATION_CUSTOMER_ENABLED || '').trim().toLowerCase();
  const customerTemplateCode = process.env.ALIGO_CONSULTATION_CUSTOMER_TEMPLATE_CODE?.trim() || '';
  const customerMessageTemplate = process.env.ALIGO_CONSULTATION_CUSTOMER_MESSAGE_TEMPLATE?.trim() || '';
  const hasCustomerConfig = Boolean(customerTemplateCode || customerMessageTemplate);

  const adminPromise =
    adminEnabled === 'false' || adminEnabled === '0'
      ? Promise.resolve({ ok: false, skipped: 'disabled' })
      : !hasAdminConfig
        ? Promise.resolve({ ok: false, skipped: 'not-configured' })
        : sendAligoTemplate({
            recipients: adminPhones.map((phone) => ({ phone, name: 'WEVE DESIGN' })),
            templateCode: adminTemplateCode,
            messageTemplate: adminMessageTemplate,
            subject:
              process.env.ALIGO_CONSULTATION_ADMIN_SUBJECT?.trim() ||
              process.env.ALIGO_CONSULTATION_SUBJECT?.trim() ||
              '신규 상담 요청',
            fields,
          });

  const customerPromise =
    customerEnabled === 'false' || customerEnabled === '0'
      ? Promise.resolve({ ok: false, skipped: 'disabled' })
      : !hasCustomerConfig
        ? Promise.resolve({ ok: false, skipped: 'not-configured' })
        : sendAligoTemplate({
            recipients: [{ phone: normalizePhone(fields.phone), name: fields.name }],
            templateCode: customerTemplateCode,
            messageTemplate: customerMessageTemplate,
            subject: process.env.ALIGO_CONSULTATION_CUSTOMER_SUBJECT?.trim() || '상담 접수 완료',
            fields,
          });

  const [admin, customer] = await Promise.all([adminPromise, customerPromise]);
  return { admin, customer };
}

export async function POST(request: Request) {
  try {
    const settings = await client.fetch('coalesce(*[_id == "siteSettings"][0], *[_type == "siteSettings"][0]){consultationEmail}', {}, { next: { revalidate: 60 } });
    const toEmail = settings?.consultationEmail || process.env.CONSULTATION_TO_EMAIL || 'ehogh1@gmail.com';
    const payload = (await request.json()) as ConsultationPayload;

    const name = payload.name?.trim() || '';
    const phone = payload.phone?.trim() || '';
    const propertyType = payload.propertyType?.trim() || payload.siteType?.trim() || '';
    const areaRange = payload.areaRange?.trim() || '';
    const homeStatus = payload.homeStatus?.trim() || '';
    const reason = payload.reason?.trim() || '';
    const budget = payload.budget?.trim() || '';
    const timeline = payload.timeline?.trim() || '';
    const postcode = payload.postcode?.trim() || '';
    const address = payload.address?.trim() || '';
    const detailAddress = payload.detailAddress?.trim() || '';
    const message = payload.message?.trim() || '';
    const privacyAgreed = payload.privacyAgreed === true;
    const source = consultationSources[payload.source?.trim() || ''] || '홈페이지 상담 신청';
    const fullAddress = [postcode ? `(${postcode})` : '', address, detailAddress].filter(Boolean).join(' ');

    if (
      !name ||
      !phone ||
      !propertyType ||
      !areaRange ||
      !homeStatus ||
      !reason ||
      !budget ||
      !timeline ||
      !address ||
      !detailAddress ||
      !privacyAgreed
    ) {
      return NextResponse.json({ error: '필수 정보가 누락되었습니다.' }, { status: 400 });
    }

    if (!process.env.SANITY_WRITE_TOKEN && !(shouldUseFirestoreErp() && canUseFirestoreOnServer())) {
      return NextResponse.json({ error: '관리자 저장 토큰(SANITY_WRITE_TOKEN)이 설정되어 있지 않습니다.' }, { status: 500 });
    }

    const consultationRecord = {
      _type: 'officeConsultation',
      name,
      phone,
      siteType: propertyType,
      propertyType,
      areaRange,
      homeStatus,
      reason,
      budget,
      timeline,
      postcode,
      address,
      detailAddress,
      fullAddress,
      message,
      privacyAgreed,
      status: '신규',
      source,
      createdAt: new Date().toISOString(),
    };

    if (shouldUseFirestoreErp() && canUseFirestoreOnServer()) {
      await savePublicConsultationToFirestore(consultationRecord);
    } else {
      await writeClient.create(consultationRecord);
    }

    const kakaoNotification = await sendConsultationKakaoNotifications({
      name,
      phone,
      source,
      fullAddress,
      propertyType,
      areaRange,
      homeStatus,
      reason,
      budget,
      timeline,
      message,
    });

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn('RESEND_API_KEY가 없어 상담 접수 메일을 건너뜁니다.');
      return NextResponse.json({
        ok: true,
        kakaoNotification,
        emailNotification: { ok: false, skipped: 'not-configured' },
      });
    }

    try {
      const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || 'onboarding@resend.dev';
      const resend = new Resend(apiKey);
      const { data, error } = await resend.emails.send({
        from: `WEVE DESIGN <${fromEmail}>`,
        to: [toEmail],
        subject: `[WEVE DESIGN 상담 신청] ${name} / ${propertyType} / ${areaRange}`,
        html: `
        <div style="font-family: Arial, sans-serif; line-height:1.7; color:#171512;">
          <h2 style="margin:0 0 20px; color:#171512;">새 상담 신청이 접수되었습니다.</h2>
          <table style="width:100%; max-width:720px; border-collapse:collapse; border-top:2px solid #171512;">
            ${fieldRow('이름', name)}
            ${fieldRow('연락처', phone)}
            ${fieldRow('유입 경로', source)}
            ${fieldRow('시공 주소', fullAddress)}
            ${fieldRow('공간 종류', propertyType)}
            ${fieldRow('평수', areaRange)}
            ${fieldRow('현재 상태', homeStatus)}
            ${fieldRow('인테리어 이유', reason)}
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
            : 'Resend 발신/수신 설정을 확인해 주세요.';

        console.error('상담 접수 메일 발송 실패', error);
        return NextResponse.json({
          ok: true,
          kakaoNotification,
          emailNotification: { ok: false, error: errorMessage },
        });
      }

      return NextResponse.json({
        ok: true,
        data,
        kakaoNotification,
        emailNotification: { ok: true },
      });
    } catch (emailError) {
      const errorMessage = emailError instanceof Error ? emailError.message : '메일 발송 오류';
      console.error('상담 접수 메일 발송 오류', emailError);
      return NextResponse.json({
        ok: true,
        kakaoNotification,
        emailNotification: { ok: false, error: errorMessage },
      });
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
