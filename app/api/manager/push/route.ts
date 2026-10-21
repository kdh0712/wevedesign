import { NextResponse } from 'next/server';
import { parsePushAction, TEST_PUSH_MESSAGE } from '../../../lib/push-rules';
import { deviceRefreshDecision } from '../_mobile-device-rules';
import { getMobileDevice, MOBILE_STORE_MISSING } from '../_mobile-devices';
import { isProgressStoreReady } from '../_progress-store';
import { sendPushToDevice, webPushConfig } from '../_push';
import { deletePushSubscription, hasPushSubscription, savePushSubscription } from '../_push-subscriptions';
import { requireManager } from '../_session';
import { resolveSessionKey } from '../_token';

export const runtime = 'nodejs';

// 새 상담 알림 on a phone (spec 2026-10-21 staff push §2–3). Only for people with the consultations permission, and every
// change names the phone login it belongs to: the server checks that device and that it is this person's.
const NOT_CONFIGURED = '알림 기능이 아직 설정되지 않았어요.';
const DEVICE_REFUSED = '이 휴대폰 로그인을 확인하지 못했어요. 다시 로그인해 주세요.';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request) {
  const access = requireManager(request, { anyOf: ['consultations'] });
  if (access.error) return access.error;
  const config = webPushConfig();
  return json({ configured: Boolean(config), publicKey: config?.publicKey || '' });
}

export async function POST(request: Request) {
  const access = requireManager(request, { anyOf: ['consultations'] });
  if (access.error) return access.error;
  if (!isProgressStoreReady()) return json({ error: MOBILE_STORE_MISSING }, 503);
  const key = resolveSessionKey();
  if (!key) return json({ error: DEVICE_REFUSED }, 500);

  const parsed = parsePushAction(await request.json().catch(() => null));
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  try {
    const device = await getMobileDevice(parsed.deviceId);
    if (!device || !deviceRefreshDecision(device, parsed.deviceToken, Date.now(), key).ok || device.userId !== access.session.sub) {
      return json({ error: DEVICE_REFUSED }, 403);
    }

    if (parsed.action === 'status') return json({ subscribed: await hasPushSubscription(device._id) });
    if (parsed.action === 'unsubscribe') {
      await deletePushSubscription(device._id);
      return json({ ok: true });
    }
    if (!webPushConfig()) return json({ error: NOT_CONFIGURED }, 503);
    if (parsed.action === 'subscribe') {
      await savePushSubscription(device, parsed.subscription, new Date().toISOString());
      return json({ ok: true });
    }
    return json({ result: await sendPushToDevice(device._id, TEST_PUSH_MESSAGE) });
  } catch (error) {
    console.error(`Push ${parsed.action} failed:`, error instanceof Error ? error.message : error);
    return json({ error: '알림 설정을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.' }, 500);
  }
}
