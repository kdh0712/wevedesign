import { createHmac } from 'node:crypto';
import { after, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from 'next-sanity';
import {
  canUseFirestoreOnServer,
  queryFirestoreCollectionByField,
  savePublicConsultationToFirestore,
  shouldUseFirestoreErp,
} from '../manager/firestore';
import {
  CONSULTATION_IP_WINDOW_MS,
  clientAddress,
  consultationFieldError,
  consultationRateDecision,
  looksAutomated,
  phoneDigits as toPhoneDigits,
  type RecentConsultation,
} from '../../lib/consultation-guard';
import { adminButtonJson, isAligoSuccess, normalizeTemplateText, type AligoResponse } from './aligo-admin';
import { pickAlertPhones } from '../../lib/alert-phones';
import { envAlertPhones, readSavedAlertPhones } from '../manager/_alert-phones-store';
import { notifyNewConsultations } from '../manager/_push';

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
  // Spam checks: a hidden field people never fill, and when the form was opened (ms).
  website?: string;
  startedAt?: number;
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

type AligoRecipient = {
  phone: string;
  name: string;
};

type AligoTemplateRequest = {
  recipients: AligoRecipient[];
  templateCode: string;
  messageTemplate: string;
  subject: string;
  buttonJson: string;
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
  buttonJson,
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

  const message = fillConsultationTemplate(normalizeTemplateText(messageTemplate), fields);
  recipients.forEach((recipient, index) => {
    const suffix = index + 1;
    form.set(`receiver_${suffix}`, recipient.phone);
    form.set(`recvname_${suffix}`, recipient.name);
    form.set(`subject_${suffix}`, subject);
    form.set(`message_${suffix}`, message);
    form.set(`button_${suffix}`, buttonJson);
  });

  const testMode = process.env.ALIGO_TEST_MODE === 'Y';
  if (testMode) form.set('testMode', 'Y');

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

    // "Accepted" only: Kakao can still reject it later (for example a template mismatch). The mid finds it in Aligo's send results.
    const mid = providerResponse.info?.mid ? String(providerResponse.info.mid) : '';
    console.info('상담 알림톡 접수', { mid, testMode, recipients: recipients.length });
    return { ok: true, mid, testMode };
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
    };
  }

  const adminEnabled = (process.env.ALIGO_CONSULTATION_ADMIN_ENABLED || '').trim().toLowerCase();
  // Numbers saved in the manager win; the Vercel variables are the fallback.
  const savedPhones = await readSavedAlertPhones().catch((error) => {
    console.error('상담 알림 번호를 불러오지 못해 Vercel 설정 번호를 사용합니다.', error);
    return null;
  });
  const adminPhones = pickAlertPhones(savedPhones, envAlertPhones()).phones;
  const adminTemplateCode =
    process.env.ALIGO_CONSULTATION_ADMIN_TEMPLATE_CODE?.trim() ||
    process.env.ALIGO_CONSULTATION_TEMPLATE_CODE?.trim() ||
    '';
  const adminMessageTemplate =
    process.env.ALIGO_CONSULTATION_ADMIN_MESSAGE_TEMPLATE?.trim() ||
    process.env.ALIGO_CONSULTATION_MESSAGE_TEMPLATE?.trim() ||
    '';
  const hasAdminConfig = Boolean(adminPhones.length || adminTemplateCode || adminMessageTemplate);

  if (adminEnabled === 'false' || adminEnabled === '0') {
    return { admin: { ok: false, skipped: 'disabled' } };
  }
  if (!hasAdminConfig) {
    return { admin: { ok: false, skipped: 'not-configured' } };
  }

  const admin = await sendAligoTemplate({
    recipients: adminPhones.map((phone) => ({ phone, name: 'WEVE DESIGN' })),
    templateCode: adminTemplateCode,
    messageTemplate: adminMessageTemplate,
    subject:
      process.env.ALIGO_CONSULTATION_ADMIN_SUBJECT?.trim() ||
      process.env.ALIGO_CONSULTATION_SUBJECT?.trim() ||
      '신규 상담 요청',
    buttonJson: adminButtonJson(process.env.ALIGO_CONSULTATION_ADMIN_BUTTON_JSON),
    fields,
  });

  return { admin };
}

// A keyed hash of the client address: enough to count submissions per connection without storing the address itself.
function connectionHash(address: string) {
  if (!address) return '';
  const secret = process.env.CONSULTATION_RATE_SECRET || process.env.MANAGER_SESSION_SECRET || 'weve-consultation';
  return createHmac('sha256', secret).update(address).digest('hex').slice(0, 24);
}

// Recent submissions from the same number or connection. A failed read is logged and lets the submission through:
// a real customer must never be turned away because the check could not run.
async function readRecentConsultations(phoneDigits: string, ipHash: string): Promise<RecentConsultation[]> {
  const since = new Date(Date.now() - CONSULTATION_IP_WINDOW_MS).toISOString();
  try {
    if (shouldUseFirestoreErp() && canUseFirestoreOnServer()) {
      const [byPhone, byConnection] = await Promise.all([
        queryFirestoreCollectionByField<RecentConsultation & Record<string, unknown>>('officeConsultations', 'phoneDigits', phoneDigits),
        ipHash ? queryFirestoreCollectionByField<RecentConsultation & Record<string, unknown>>('officeConsultations', 'ipHash', ipHash) : Promise.resolve([]),
      ]);
      return [...byPhone, ...byConnection].filter((record) => String(record.createdAt || '') >= since);
    }
    return await writeClient.fetch<RecentConsultation[]>(
      '*[_type == "officeConsultation" && createdAt >= $since && (phoneDigits == $phone || (defined(ipHash) && ipHash == $ip))]{phoneDigits, phone, ipHash, createdAt}',
      { since, phone: phoneDigits, ip: ipHash || '-' },
    );
  } catch (error) {
    console.error('상담 신청 중복·횟수 확인 실패, 그대로 접수합니다.', error);
    return [];
  }
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

    const fieldError = consultationFieldError({
      name, phone, propertyType, areaRange, homeStatus, reason, budget, timeline, postcode, address, detailAddress, message,
    });
    if (fieldError) return NextResponse.json({ error: fieldError }, { status: 400 });

    // A bot gets the same answer as a person, so it learns nothing, but nothing is saved or sent.
    if (looksAutomated({ honeypot: payload.website, startedAt: payload.startedAt, now: Date.now() })) {
      console.warn('상담 신청 자동 입력으로 보여 저장하지 않았습니다.');
      return NextResponse.json({ ok: true });
    }

    const digits = toPhoneDigits(phone);
    const ipHash = connectionHash(clientAddress(request.headers));
    const rate = consultationRateDecision(await readRecentConsultations(digits, ipHash), { phoneDigits: digits, ipHash, now: Date.now() });
    if (rate === 'duplicate') {
      // The same number applied a moment ago (double click or resend): the first one is already saved and sent.
      return NextResponse.json({ ok: true, duplicate: true });
    }
    if (rate === 'too-many') {
      return NextResponse.json({ error: '짧은 시간에 상담 신청이 많이 접수되었습니다. 잠시 후 다시 시도하시거나 전화로 문의해 주세요.' }, { status: 429 });
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
      // For the duplicate and per-connection checks above; ipHash is a keyed hash, never the address.
      phoneDigits: digits,
      ...(ipHash ? { ipHash } : {}),
      createdAt: new Date().toISOString(),
    };

    if (shouldUseFirestoreErp() && canUseFirestoreOnServer()) {
      await savePublicConsultationToFirestore(consultationRecord);
    } else {
      await writeClient.create(consultationRecord);
    }

    // 새 상담 알림 to staff phones, after the answer; it never changes this request's result (spec 2026-10-21 staff push).
    after(() => notifyNewConsultations([consultationRecord]));

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
