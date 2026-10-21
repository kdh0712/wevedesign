import { NextResponse } from 'next/server';
import { isMobileDeviceId } from '../../_mobile-device-rules';
import { listActiveMobileDevices, MOBILE_STORE_MISSING, revokeMobileDevice } from '../../_mobile-devices';
import { isProgressStoreReady } from '../../_progress-store';
import { requireManager } from '../../_session';
import { isFirestoreConflictError } from '../../firestore';

export const runtime = 'nodejs';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// The 계정 tab's "휴대폰 로그인 기기" list (admin only). The token hash never leaves the server.
export async function GET(request: Request) {
  const access = requireManager(request, { admin: true });
  if (access.error) return access.error;
  if (!isProgressStoreReady()) return json({ error: MOBILE_STORE_MISSING }, 503);

  try {
    const devices = await listActiveMobileDevices(Date.now());
    return json({ devices: devices.map(({ tokenHash: _tokenHash, ...device }) => device) });
  } catch (error) {
    console.error('Mobile device list failed:', error);
    return json({ error: error instanceof Error ? error.message : '기기 목록을 불러오지 못했습니다.' }, 500);
  }
}

export async function DELETE(request: Request) {
  const access = requireManager(request, { admin: true });
  if (access.error) return access.error;
  if (!isProgressStoreReady()) return json({ error: MOBILE_STORE_MISSING }, 503);

  const body = (await request.json().catch(() => null)) as { deviceId?: unknown } | null;
  if (!isMobileDeviceId(body?.deviceId)) return json({ error: '끊을 기기를 선택해 주세요.' }, 400);
  try {
    await revokeMobileDevice(body.deviceId, access.session.loginId, new Date().toISOString());
    return json({ ok: true });
  } catch (error) {
    if (isFirestoreConflictError(error)) return json({ error: '기기를 찾을 수 없습니다.' }, 404);
    console.error('Mobile device revoke failed:', error);
    return json({ error: error instanceof Error ? error.message : '기기 로그인을 끊지 못했습니다.' }, 500);
  }
}
