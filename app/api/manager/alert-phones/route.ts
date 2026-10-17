import { NextResponse } from 'next/server';
import { formatKoreanMobile, maskPhone, normalizeKoreanMobile, parseAlertPhoneList, pickAlertPhones } from '../../../lib/alert-phones';
import { requireManager } from '../_session';
import { envAlertPhones, isAlertPhoneStoreReady, readSavedAlertPhones, saveAlertPhones } from '../_alert-phones-store';

export const runtime = 'nodejs';

const STORE_MISSING = '번호를 저장하려면 Firebase 서비스 계정 설정이 필요합니다.';

// The Vercel fallback numbers are shown masked; only the list saved here is shown in full.
async function currentState() {
  const saved = await readSavedAlertPhones();
  const env = envAlertPhones();
  const { source } = pickAlertPhones(saved, env);
  return {
    phones: (saved || []).map(formatKoreanMobile),
    source,
    envMasked: env.map((phone) => (normalizeKoreanMobile(phone) ? maskPhone(phone) : '형식 오류')),
    storeReady: isAlertPhoneStoreReady(),
  };
}

export async function GET(request: Request) {
  const access = requireManager(request, { admin: true });
  if (access.error) return access.error;

  try {
    return NextResponse.json(await currentState());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '알림 번호를 불러오지 못했습니다.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const access = requireManager(request, { admin: true });
  if (access.error) return access.error;
  if (!isAlertPhoneStoreReady()) return NextResponse.json({ error: STORE_MISSING }, { status: 503 });

  try {
    const body = (await request.json().catch(() => null)) as { phones?: unknown } | null;
    const parsed = parseAlertPhoneList(body?.phones);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    await saveAlertPhones(parsed.phones, access.session.loginId);
    return NextResponse.json(await currentState());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '알림 번호를 저장하지 못했습니다.' }, { status: 500 });
  }
}
