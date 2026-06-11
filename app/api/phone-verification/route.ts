import { NextResponse } from 'next/server';
import { createVerificationToken, normalizePhone, verificationStore } from './store';

export const runtime = 'nodejs';

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
      const record = verificationStore.get(phone);

      if (!record || record.expiresAt < Date.now()) {
        return NextResponse.json({ error: '인증번호가 만료되었습니다. 다시 요청해 주세요.' }, { status: 400 });
      }

      if (record.code !== code) {
        return NextResponse.json({ error: '인증번호가 일치하지 않습니다.' }, { status: 400 });
      }

      verificationStore.set(phone, { ...record, verified: true });
      return NextResponse.json({ verified: true, token: createVerificationToken(phone) });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    verificationStore.set(phone, {
      code,
      expiresAt: Date.now() + 5 * 60 * 1000,
      verified: false,
    });

    console.info(`[WEVE] phone verification code for ${phone}: ${code}`);
    const hasSmsProvider = Boolean(process.env.SOLAPI_API_KEY || process.env.NCP_SENS_SERVICE_ID);

    return NextResponse.json({
      sent: true,
      message: hasSmsProvider
        ? '인증번호를 발송했습니다.'
        : '문자 발송 서비스 연결 전 임시 인증번호를 표시합니다.',
      debugCode: hasSmsProvider ? undefined : code,
    });
  } catch {
    return NextResponse.json({ error: '휴대폰 인증 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
