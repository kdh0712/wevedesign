import { NextResponse } from 'next/server';
import { reloadManagerUser, verifyManagerLogin } from '../../_login';
import { sessionFailureAnswer } from '../../_login-rules';
import {
  credentialStillValid,
  deviceLabelFromUserAgent,
  deviceRefreshDecision,
  isMobileDeviceId,
  MOBILE_SESSION_TTL_SECONDS,
  previousDeviceOf,
} from '../../_mobile-device-rules';
import { createMobileDevice, getMobileDevice, MOBILE_STORE_MISSING, revokeMobileDevice, touchMobileDevice } from '../../_mobile-devices';
import { isProgressStoreReady } from '../../_progress-store';
import { issueManagerSession, SESSION_KEY_MISSING_MESSAGE } from '../../_session';
import { resolveSessionKey } from '../../_token';

export const runtime = 'nodejs';

// The phone app's login (spec §3): a 30 day device token that is only ever traded here for a 1 hour session token.
const SIGNED_OUT = '다시 로그인해 주세요.';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const signedOut = () => json({ error: SIGNED_OUT, signedOut: true }, 401);
const text = (value: unknown) => (typeof value === 'string' ? value : '');

export async function POST(request: Request) {
  if (!isProgressStoreReady()) return json({ error: MOBILE_STORE_MISSING }, 503);
  // Checked before a device record is made, so a login never leaves a device that can not get a session. The same key
  // signs and checks the device records.
  const key = resolveSessionKey();
  if (!key) return json({ error: SESSION_KEY_MISSING_MESSAGE }, 500);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;
  try {
    if (action === 'login') return await login(request, body, key);
    if (action === 'refresh') return await refresh(body, key);
    if (action === 'logout') return await logout(body, key);
    return json({ error: '알 수 없는 요청입니다.' }, 400);
  } catch (error) {
    // The server could not check the account (Firebase or Sanity unreachable, missing service account rights). The phone
    // gets fixed words, so staff do not blame their connection; the details stay in the server log.
    console.error(`Mobile session ${String(action)} failed:`, error);
    const failure = sessionFailureAnswer(action);
    return json({ error: failure.error }, failure.status);
  }
}

async function login(request: Request, body: Record<string, unknown> | null, key: Buffer) {
  const result = await verifyManagerLogin(request, body?.loginId, body?.password);
  if (!result.ok) return json({ error: result.error }, result.status);

  const nowMs = Date.now();
  const label = deviceLabelFromUserAgent(request.headers.get('user-agent') || '');
  const device = await createMobileDevice(result.user, result.src, label, nowMs, result.credential, key);
  const session = issueManagerSession(result.user, result.src, MOBILE_SESSION_TTL_SECONDS);
  if (!session) return json({ error: SESSION_KEY_MISSING_MESSAGE }, 500);
  // The device this phone had before would otherwise stay listed (and valid) until it expires.
  const previous = previousDeviceOf(body, device.deviceId);
  if (previous) {
    await endShownDevice(previous.deviceId, previous.deviceToken, result.user.loginId, key).catch((error) =>
      console.warn('Ending the previous mobile device failed:', error),
    );
  }
  return json({ ...device, session });
}

// Does not change the device token, so two refreshes at once (the app opened twice) both succeed.
async function refresh(body: Record<string, unknown> | null, key: Buffer) {
  const deviceId = body?.deviceId;
  if (!isMobileDeviceId(deviceId)) return signedOut();
  const nowMs = Date.now();
  const device = await getMobileDevice(deviceId);
  const decision = deviceRefreshDecision(device, text(body?.deviceToken), nowMs, key);
  if (!decision.ok || !device) return signedOut();

  const account = await reloadManagerUser(device.src, device.userId);
  if (!account || !credentialStillValid(device, account.credential, key)) {
    // The account was removed or deactivated, or its password changed: the device ends here too.
    await revokeMobileDevice(device._id, 'system', new Date(nowMs).toISOString()).catch(() => undefined);
    return signedOut();
  }
  if (decision.touch) {
    await touchMobileDevice(device._id, new Date(nowMs).toISOString()).catch((error) => console.warn('Mobile device touch failed:', error));
  }
  const session = issueManagerSession(account.user, device.src, MOBILE_SESSION_TTL_SECONDS);
  if (!session) return json({ error: SESSION_KEY_MISSING_MESSAGE }, 500);
  return json({ session });
}

// Ends only the device whose token was shown; anything else is answered the same way, so nothing is revealed.
async function logout(body: Record<string, unknown> | null, key: Buffer) {
  const deviceId = body?.deviceId;
  if (isMobileDeviceId(deviceId)) await endShownDevice(deviceId, text(body?.deviceToken), null, key);
  return json({ ok: true });
}

// Revokes the device only when the token shown is its own and it is still live; by defaults to the device's own login.
async function endShownDevice(deviceId: string, deviceToken: string, by: string | null, key: Buffer) {
  const device = await getMobileDevice(deviceId);
  if (device && deviceRefreshDecision(device, deviceToken, Date.now(), key).ok) {
    await revokeMobileDevice(device._id, by ?? device.loginId, new Date().toISOString());
  }
}
