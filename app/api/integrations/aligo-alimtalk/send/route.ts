import { assertManager, assertSanityWriteConfigured, managerClient } from '../../../manager/_utils';
import {
  canUseFirestoreForRequest,
  readOfficeDataFromFirestore,
  saveOfficeRecordToFirestore,
  shouldUseFirestoreErp,
} from '../../../manager/firestore';

export const runtime = 'nodejs';

type AligoSendRequest = {
  action?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
};

type AligoResponse = {
  result_code?: string | number;
  code?: string | number;
  message?: string;
  msg?: string;
  [key: string]: unknown;
};

type StoredCustomer = Record<string, unknown> & {
  _id: string;
  contractAlimtalkSentAt?: string;
};

const ALIGO_API_URL = process.env.ALIGO_API_URL || 'https://kakaoapi.aligo.in/akv10/alimtalk/send/';

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 환경변수가 설정되지 않았습니다.`);
  return value;
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '');
}

function fillTemplate(template: string, data: { customerName: string; customerPhone: string }) {
  return template
    .replaceAll('#{고객명}', data.customerName)
    .replaceAll('{고객명}', data.customerName)
    .replaceAll('{{customerName}}', data.customerName)
    .replaceAll('{{name}}', data.customerName)
    .replaceAll('#{연락처}', data.customerPhone)
    .replaceAll('{연락처}', data.customerPhone)
    .replaceAll('{{phone}}', data.customerPhone);
}

function isAligoSuccess(payload: AligoResponse) {
  const rawCode = payload.result_code ?? payload.code;
  if (rawCode === undefined || rawCode === null || rawCode === '') return true;
  const code = String(rawCode);
  return code === '1' || code === '0' || code.toLowerCase() === 'success';
}

async function getStoredCustomer(request: Request, customerId: string): Promise<StoredCustomer | null> {
  if (shouldUseFirestoreErp() && canUseFirestoreForRequest(request)) {
    const officeData = await readOfficeDataFromFirestore(request);
    return (officeData.customers.find((customer) => customer._id === customerId) as StoredCustomer | undefined) || null;
  }

  return managerClient.fetch<StoredCustomer | null>(
    '*[_type == "officeCustomer" && _id == $customerId][0]{_id, contractAlimtalkSentAt}',
    { customerId },
  );
}

async function markContractAlimtalkSent(request: Request, customer: StoredCustomer, sentAt: string) {
  if (shouldUseFirestoreErp() && canUseFirestoreForRequest(request)) {
    const customerData = Object.fromEntries(
      Object.entries(customer).filter(([key]) => !key.startsWith('_')),
    );
    await saveOfficeRecordToFirestore(
      request,
      'customer',
      { ...customerData, contractAlimtalkSentAt: sentAt },
      customer._id,
    );
    return;
  }

  await managerClient.patch(customer._id).set({ contractAlimtalkSentAt: sentAt }).commit();
}

export async function POST(request: Request) {
  const authError = assertManager(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as AligoSendRequest;
    if (body.action !== 'contract-complete') {
      return Response.json({ error: '지원하지 않는 알림톡 유형입니다.' }, { status: 400 });
    }

    const customerId = (body.customerId || '').trim();
    if (!customerId) {
      return Response.json({ error: '고객 정보가 연결되어 있지 않습니다.' }, { status: 400 });
    }

    if (!(shouldUseFirestoreErp() && canUseFirestoreForRequest(request))) {
      const sanityError = assertSanityWriteConfigured();
      if (sanityError) return sanityError;
    }

    const storedCustomer = await getStoredCustomer(request, customerId);
    if (!storedCustomer) {
      return Response.json({ error: '저장된 고객 정보를 찾지 못했습니다.' }, { status: 404 });
    }
    if (storedCustomer.contractAlimtalkSentAt) {
      return Response.json({
        ok: true,
        alreadySent: true,
        sentAt: storedCustomer.contractAlimtalkSentAt,
      });
    }

    const customerName = (body.customerName || '고객').trim();
    const customerPhone = normalizePhone(body.customerPhone || '');
    if (!customerPhone || customerPhone.length < 10 || customerPhone.length > 11) {
      return Response.json({ error: '고객 전화번호가 올바르지 않습니다.' }, { status: 400 });
    }

    const templateCode =
      process.env.ALIGO_CONSULTATION_CUSTOMER_TEMPLATE_CODE?.trim() ||
      process.env.ALIGO_CONTRACT_TEMPLATE_CODE?.trim();
    if (!templateCode) {
      return Response.json(
        { error: 'ALIGO_CONSULTATION_CUSTOMER_TEMPLATE_CODE 환경변수에 승인된 계약 완료 템플릿 코드를 설정해 주세요.' },
        { status: 500 },
      );
    }

    const messageTemplate =
      process.env.ALIGO_CONSULTATION_CUSTOMER_MESSAGE_TEMPLATE?.trim() ||
      process.env.ALIGO_CONTRACT_MESSAGE_TEMPLATE?.trim() ||
      process.env.ALIGO_CONTRACT_TEMPLATE_MESSAGE?.trim();
    if (!messageTemplate) {
      return Response.json(
        { error: 'ALIGO_CONSULTATION_CUSTOMER_MESSAGE_TEMPLATE 환경변수에 승인된 계약 완료 안내 템플릿 문구를 설정해 주세요.' },
        { status: 500 },
      );
    }

    const form = new URLSearchParams();
    form.set('apikey', requireEnv('ALIGO_API_KEY'));
    form.set('userid', requireEnv('ALIGO_USER_ID'));
    form.set('senderkey', requireEnv('ALIGO_SENDER_KEY'));
    form.set('tpl_code', templateCode);
    form.set('sender', requireEnv('ALIGO_SENDER_PHONE'));
    form.set('receiver_1', customerPhone);
    form.set('recvname_1', customerName);
    form.set(
      'subject_1',
      process.env.ALIGO_CONSULTATION_CUSTOMER_SUBJECT?.trim() ||
        process.env.ALIGO_CONTRACT_SUBJECT?.trim() ||
        '계약 완료 안내',
    );
    form.set('message_1', fillTemplate(messageTemplate, { customerName, customerPhone }));
    const buttonJson =
      process.env.ALIGO_CONSULTATION_CUSTOMER_BUTTON_JSON?.trim() ||
      process.env.ALIGO_CONTRACT_BUTTON_JSON?.trim();
    if (buttonJson) form.set('button_1', buttonJson);

    if (process.env.ALIGO_TEST_MODE === 'Y') form.set('testMode', 'Y');

    const response = await fetch(ALIGO_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: form,
    });
    const text = await response.text();
    let payload: AligoResponse = {};
    try {
      payload = text ? (JSON.parse(text) as AligoResponse) : {};
    } catch {
      payload = { message: text };
    }

    if (!response.ok || !isAligoSuccess(payload)) {
      return Response.json(
        {
          error: payload.message || payload.msg || `알리고 API 발송 실패: HTTP ${response.status}`,
          providerResponse: payload,
        },
        { status: 502 },
      );
    }

    const sentAt = new Date().toISOString();
    let trackingWarning = '';
    try {
      await markContractAlimtalkSent(request, storedCustomer, sentAt);
    } catch (trackingError) {
      console.error('계약 완료 알림톡 발송 상태 저장 실패', trackingError);
      trackingWarning = '알림톡은 발송됐지만 전송 완료 상태를 저장하지 못했습니다.';
    }

    return Response.json({ ok: true, sentAt, trackingWarning, providerResponse: payload });
  } catch (caught) {
    return Response.json(
      { error: caught instanceof Error ? caught.message : '알림톡 발송 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
