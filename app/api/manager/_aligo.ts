import { isAligoSuccess, normalizeTemplateText, type AligoResponse } from '../send-consultation/aligo-admin';

// Same endpoint, form fields and success rule as the consultation alimtalk (app/api/send-consultation/route.ts).
const ALIGO_API_URL = process.env.ALIGO_API_URL || 'https://kakaoapi.aligo.in/akv10/alimtalk/send/';
const ALIGO_TIMEOUT_MS = 15_000;

export const DEFAULT_PROGRESS_SUBJECT = '공사 진행 안내';

export type ProgressAlimtalkConfig = { templateCode: string; messageTemplate: string; buttonJson: string; subject: string };

// The template code, the approved message text and the approved button must all be set; the subject is optional.
// Kakao rejects any difference from the approved text, so the message goes through the same cleanup as the consultation template.
export function readProgressAlimtalkConfig(env: Record<string, string | undefined> = process.env): ProgressAlimtalkConfig | null {
  const templateCode = env.ALIGO_PROGRESS_TEMPLATE_CODE?.trim() || '';
  const messageTemplate = normalizeTemplateText(env.ALIGO_PROGRESS_MESSAGE_TEMPLATE?.trim() || '');
  const buttonJson = env.ALIGO_PROGRESS_BUTTON_JSON?.trim() || '';
  if (!templateCode || !messageTemplate || !buttonJson) return null;
  return { templateCode, messageTemplate, buttonJson, subject: env.ALIGO_PROGRESS_SUBJECT?.trim() || DEFAULT_PROGRESS_SUBJECT };
}

export type AlimtalkInput = {
  templateCode: string;
  receiver: string;
  receiverName: string;
  subject: string;
  message: string;
  buttonJson?: string;
};

// Sends one alimtalk. "ok" means Aligo accepted it; Kakao can still reject it later, which only shows in Aligo's send results.
export async function sendAlimtalk(input: AlimtalkInput): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.ALIGO_API_KEY?.trim() || '';
  const userId = process.env.ALIGO_USER_ID?.trim() || '';
  const senderKey = process.env.ALIGO_SENDER_KEY?.trim() || '';
  const senderPhone = process.env.ALIGO_SENDER_PHONE?.trim() || '';
  const receiver = input.receiver.replace(/\D/g, '');

  const missing = [
    ['ALIGO_API_KEY', apiKey],
    ['ALIGO_USER_ID', userId],
    ['ALIGO_SENDER_KEY', senderKey],
    ['ALIGO_SENDER_PHONE', senderPhone],
    ['templateCode', input.templateCode],
    ['message', input.message],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    console.warn(`진행 현황 알림톡 설정이 부족합니다: ${missing.join(', ')}`);
    return { ok: false, error: `알림톡 발송 설정이 부족합니다: ${missing.join(', ')}` };
  }
  if (!receiver) return { ok: false, error: '받는 사람 번호가 없습니다.' };

  const form = new URLSearchParams();
  form.set('apikey', apiKey);
  form.set('userid', userId);
  form.set('senderkey', senderKey);
  form.set('tpl_code', input.templateCode);
  form.set('sender', senderPhone);
  form.set('receiver_1', receiver);
  form.set('recvname_1', input.receiverName);
  form.set('subject_1', input.subject);
  form.set('message_1', input.message);
  if (input.buttonJson) form.set('button_1', input.buttonJson);

  const testMode = process.env.ALIGO_TEST_MODE === 'Y';
  if (testMode) form.set('testMode', 'Y');

  try {
    const response = await fetch(ALIGO_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: form,
      signal: AbortSignal.timeout(ALIGO_TIMEOUT_MS),
    });
    const body = await response.text();
    let providerResponse: AligoResponse = {};
    try {
      providerResponse = body ? (JSON.parse(body) as AligoResponse) : {};
    } catch {
      providerResponse = { message: body };
    }

    if (!response.ok || !isAligoSuccess(providerResponse)) {
      console.error('진행 현황 알림톡 발송 실패', providerResponse);
      return { ok: false, error: providerResponse.message || providerResponse.msg || `HTTP ${response.status}` };
    }

    // The receiver's number stays out of the log; the mid finds the message in Aligo's send results.
    const mid = providerResponse.info?.mid ? String(providerResponse.info.mid) : '';
    console.info('진행 현황 알림톡 접수', { mid, testMode });
    return { ok: true };
  } catch (error) {
    console.error('진행 현황 알림톡 발송 오류', error);
    if (error instanceof Error && error.name === 'TimeoutError') return { ok: false, error: '알리고 응답이 늦어 발송 결과를 확인하지 못했습니다.' };
    return { ok: false, error: error instanceof Error ? error.message : '알림톡 발송 오류' };
  }
}
