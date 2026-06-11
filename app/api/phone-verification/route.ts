import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createVerificationChallenge, createVerificationToken, isValidVerificationChallenge, normalizePhone, verificationStore } from './store';

export const runtime = 'nodejs';

const solapiFrom = () => normalizePhone(process.env.SMS_FROM || process.env.SOLAPI_FROM || '');
const ncpSensFrom = () => normalizePhone(process.env.SMS_FROM || process.env.NCP_SENS_FROM || '');

const codeMessage = (code: string) => `[WEVE DESIGN] 인증번호는 ${code}입니다. 5분 안에 입력해 주세요.`;

const jsonHeaders = { 'Content-Type': 'application/json' };

async function sendSolapiSms(phone: string, code: string) {
  const apiKey = process.env.SOLAPI_API_KEY || '';
  const apiSecret = process.env.SOLAPI_API_SECRET || '';
  const from = solapiFrom();
  if (!apiKey || !apiSecret || !from) return false;

  const date = new Date().toISOString();
  const salt = randomUUID();
  const signature = createHmac('sha256', apiSecret).update(`${date}${salt}`).digest('hex');
  const response = await fetch('https://api.solapi.com/messages/v4/send', {
    method: 'POST',
    headers: {
      ...jsonHeaders,
      Authorization: `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
    },
    body: JSON.stringify({
      message: {
        to: phone,
        from,
        text: codeMessage(code),
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || 'SOLAPI 문자 발송에 실패했습니다.');
  }

  return true;
}

async function sendNcpSensSms(phone: string, code: string) {
  const serviceId = process.env.NCP_SENS_SERVICE_ID || '';
  const accessKey = process.env.NCP_SENS_ACCESS_KEY || process.env.NCP_ACCESS_KEY || '';
  const secretKey = process.env.NCP_SENS_SECRET_KEY || process.env.NCP_SECRET_KEY || '';
  const from = ncpSensFrom();
  if (!serviceId || !accessKey || !secretKey || !from) return false;

  const uri = `/sms/v2/services/${serviceId}/messages`;
  const timestamp = Date.now().toString();
  const signature = createHmac('sha256', secretKey).update(`POST ${uri}\n${timestamp}\n${accessKey}`).digest('base64');
  const response = await fetch(`https://sens.apigw.ntruss.com${uri}`, {
    method: 'POST',
    headers: {
      ...jsonHeaders,
      'x-ncp-apigw-timestamp': timestamp,
      'x-ncp-iam-access-key': accessKey,
      'x-ncp-apigw-signature-v2': signature,
    },
    body: JSON.stringify({
      type: 'SMS',
      contentType: 'COMM',
      countryCode: '82',
      from,
      content: codeMessage(code),
      messages: [{ to: phone }],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || 'Naver Cloud SENS 문자 발송에 실패했습니다.');
  }

  return true;
}

async function sendVerificationSms(phone: string, code: string) {
  if (await sendSolapiSms(phone, code)) return;
  if (await sendNcpSensSms(phone, code)) return;

  throw new Error('문자 발송 서비스가 설정되어 있지 않습니다. SOLAPI 또는 Naver Cloud SENS 환경변수를 Vercel에 등록해 주세요.');
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body?.action || 'send');
    const phone = normalizePhone(String(body?.phone || ''));

    if (!/^010\d{8}$/.test(phone)) {
      return NextResponse.json({ error: '010-0000-0000 형식의 휴대폰 번호를 입력해 주세요.' }, { status: 400 });
    }

    if (action === 'verify') {
      const code = String(body?.code || '').trim();
      const challenge = String(body?.challenge || '').trim();
      const record = verificationStore.get(phone);
      const verifiedByStore = Boolean(record && record.expiresAt >= Date.now() && record.code === code);
      const verifiedByChallenge = isValidVerificationChallenge(phone, code, challenge);

      if (!verifiedByStore && !verifiedByChallenge) {
        return NextResponse.json({ error: '인증번호가 일치하지 않거나 만료되었습니다. 다시 요청해 주세요.' }, { status: 400 });
      }

      verificationStore.set(phone, {
        code,
        expiresAt: Date.now() + 10 * 60 * 1000,
        verified: true,
      });
      return NextResponse.json({ verified: true, token: createVerificationToken(phone) });
    }

    const code = String(randomInt(100000, 1000000));
    const expiresAt = Date.now() + 5 * 60 * 1000;
    verificationStore.set(phone, {
      code,
      expiresAt,
      verified: false,
    });

    await sendVerificationSms(phone, code);

    return NextResponse.json({
      sent: true,
      message: '인증번호를 문자로 발송했습니다.',
      challenge: createVerificationChallenge(phone, code, expiresAt),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '휴대폰 인증 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
