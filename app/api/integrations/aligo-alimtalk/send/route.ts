import { normalizeKoreanMobile } from '../../../../lib/alert-phones';
import { requireManager } from '../../../manager/_session';
import { getSiteForProgress, isProgressStoreReady, resolveCustomerPhone } from '../../../manager/_progress-store';
import { patchOfficeRecordFields } from '../../../manager/firestore';
import { contractResendRefusal, fillContractTemplate } from '../_contract';

export const runtime = 'nodejs';

// The 계약 완료 안내 alimtalk, recorded per site (officeSites.contractAlimtalkSentAt, written only here). The receiver and the
// name come from the stored site, never from the browser: the number is the same one the customer progress page and its
// alimtalk use (resolveCustomerPhone), and it must be a mobile.

type AligoResponse = {
  result_code?: string | number;
  code?: string | number;
  message?: string;
  msg?: string;
  [key: string]: unknown;
};

const ALIGO_API_URL = process.env.ALIGO_API_URL || 'https://kakaoapi.aligo.in/akv10/alimtalk/send/';

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const fail = (error: string, status: number) => json({ error }, status);
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 환경변수가 설정되지 않았습니다.`);
  return value;
}

function isAligoSuccess(payload: AligoResponse) {
  const rawCode = payload.result_code ?? payload.code;
  if (rawCode === undefined || rawCode === null || rawCode === '') return true;
  const code = String(rawCode);
  return code === '1' || code === '0' || code.toLowerCase() === 'success';
}

export async function POST(request: Request) {
  const access = requireManager(request, { anyOf: ['customers', 'sites'] });
  if (access.error) return access.error;

  // Sites are read with the server service account; the Sanity data source has no per-site record to keep.
  if (!isProgressStoreReady()) return fail('계약 완료 알림톡은 Firestore 설정이 필요합니다.', 503);

  try {
    const body = (await request.json().catch(() => null)) as { action?: unknown; siteId?: unknown; resend?: unknown } | null;
    if (!body || body.action !== 'contract-complete') return fail('지원하지 않는 알림톡 유형입니다.', 400);

    const siteId = text(body.siteId);
    if (!siteId) return fail('현장 정보가 없습니다.', 400);

    const site = await getSiteForProgress(siteId);
    if (!site) return fail('현장을 찾을 수 없습니다.', 404);

    const refusal = contractResendRefusal({ contractAlimtalkSentAt: site.contractAlimtalkSentAt }, body.resend === true);
    if (refusal) return fail(refusal, 409);

    const receiver = normalizeKoreanMobile(await resolveCustomerPhone(site));
    if (!receiver) return fail('고객 휴대폰 번호가 없어 알림톡을 보낼 수 없습니다.', 400);
    const customerName = text(site.customerName) || '고객';

    const templateCode =
      process.env.ALIGO_CONSULTATION_CUSTOMER_TEMPLATE_CODE?.trim() || process.env.ALIGO_CONTRACT_TEMPLATE_CODE?.trim();
    if (!templateCode) {
      return fail('ALIGO_CONSULTATION_CUSTOMER_TEMPLATE_CODE 환경변수에 승인된 계약 완료 템플릿 코드를 설정해 주세요.', 500);
    }

    const messageTemplate =
      process.env.ALIGO_CONSULTATION_CUSTOMER_MESSAGE_TEMPLATE?.trim() ||
      process.env.ALIGO_CONTRACT_MESSAGE_TEMPLATE?.trim() ||
      process.env.ALIGO_CONTRACT_TEMPLATE_MESSAGE?.trim();
    if (!messageTemplate) {
      return fail('ALIGO_CONSULTATION_CUSTOMER_MESSAGE_TEMPLATE 환경변수에 승인된 계약 완료 안내 템플릿 문구를 설정해 주세요.', 500);
    }

    const form = new URLSearchParams();
    form.set('apikey', requireEnv('ALIGO_API_KEY'));
    form.set('userid', requireEnv('ALIGO_USER_ID'));
    form.set('senderkey', requireEnv('ALIGO_SENDER_KEY'));
    form.set('tpl_code', templateCode);
    form.set('sender', requireEnv('ALIGO_SENDER_PHONE'));
    form.set('receiver_1', receiver);
    form.set('recvname_1', customerName);
    form.set(
      'subject_1',
      process.env.ALIGO_CONSULTATION_CUSTOMER_SUBJECT?.trim() || process.env.ALIGO_CONTRACT_SUBJECT?.trim() || '계약 완료 안내',
    );
    form.set('message_1', fillContractTemplate(messageTemplate, { customerName, customerPhone: receiver }));
    const buttonJson = process.env.ALIGO_CONSULTATION_CUSTOMER_BUTTON_JSON?.trim() || process.env.ALIGO_CONTRACT_BUTTON_JSON?.trim();
    if (buttonJson) form.set('button_1', buttonJson);
    if (process.env.ALIGO_TEST_MODE === 'Y') form.set('testMode', 'Y');

    const response = await fetch(ALIGO_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: form,
    });
    const raw = await response.text();
    let payload: AligoResponse = {};
    try {
      payload = raw ? (JSON.parse(raw) as AligoResponse) : {};
    } catch {
      payload = { message: raw };
    }

    if (!response.ok || !isAligoSuccess(payload)) {
      // The receiver's number and name stay out of the log.
      console.error('계약 완료 알림톡 발송 실패', { message: payload.message || payload.msg, status: response.status });
      return fail(payload.message || payload.msg || `알리고 API 발송 실패: HTTP ${response.status}`, 502);
    }

    const sentAt = new Date().toISOString();
    let trackingWarning = '';
    try {
      await patchOfficeRecordFields('site', siteId, { contractAlimtalkSentAt: sentAt });
    } catch (trackingError) {
      console.error('계약 완료 알림톡 발송 상태 저장 실패', trackingError);
      trackingWarning = '알림톡은 발송됐지만 전송 완료 상태를 저장하지 못했습니다.';
    }

    return json({ ok: true, sentAt, ...(trackingWarning ? { trackingWarning } : {}) });
  } catch (caught) {
    console.error('계약 완료 알림톡 오류', caught instanceof Error ? caught.message : caught);
    return fail(caught instanceof Error ? caught.message : '알림톡 발송 중 오류가 발생했습니다.', 500);
  }
}
