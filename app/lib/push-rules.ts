// 새 상담 푸시 알림과 안드로이드 앱 (spec docs/superpowers/specs/2026-10-21-staff-push-android-design.md). Pure rules shared
// by the push and cron routes and Node tests. Server only (node:crypto).
import { timingSafeEqual } from 'node:crypto';
import { toMobileConsultation } from './mobile-overview.ts';

export const PUSH_SUBSCRIPTIONS_COLLECTION = 'pushSubscriptions';
export const ANDROID_PACKAGE_NAME = 'kr.co.wevedesign.staff';

const CONSULTATIONS_URL = '/manager-weve-7519/m?tab=consultations';
const RECENT_MS = 24 * 3600000;

// One subscription per phone login, so turning alerts on again (or another person logging in on that phone) replaces it.
export const pushSubscriptionId = (deviceId: string) => `ps-${deviceId}`;

export type PushMessage = { title: string; body: string; url: string; tag: string };

export const TEST_PUSH_MESSAGE: PushMessage = { title: '위브 업무', body: '알림이 잘 와요.', url: CONSULTATIONS_URL, tag: 'test' };

// Lock screens show this, so it never carries the customer's name, phone or message: only where, what and how big.
// Only consultations received in the last 24 hours count, so a backlog imported at once never alerts about old ones.
// There is no upper bound: a Kakao time written in Korea time without an offset reads 9 hours ahead on the server.
export function consultationPushMessage(consultations: Array<Record<string, unknown>>, nowMs: number): PushMessage | null {
  const recent = consultations.filter((record) => {
    const received = Date.parse(typeof record.createdAt === 'string' ? record.createdAt : '');
    return Number.isFinite(received) && nowMs - received <= RECENT_MS;
  });
  if (recent.length === 0) return null;
  if (recent.length > 1) return { title: `새 상담 ${recent.length}건`, body: '앱에서 확인해 주세요', url: CONSULTATIONS_URL, tag: 'new-consultation' };
  const view = toMobileConsultation(recent[0]);
  const body = [view.region, view.siteType, view.areaRange].filter(Boolean).join(' · ') || '새 상담이 들어왔어요';
  return { title: '새 상담', body, url: CONSULTATIONS_URL, tag: 'new-consultation' };
}

// The server sends requests to this address, so only the browsers' own push services are accepted.
const PUSH_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com'];
const PUSH_HOST_SUFFIXES = ['.push.apple.com', '.notify.windows.com'];

export function isPushEndpointAllowed(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || !endpoint || endpoint.length > 1000) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.includes(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

const isDeviceId = (value: unknown): value is string => typeof value === 'string' && /^md-[0-9a-f]{24}$/.test(value);
const isKey = (value: unknown): value is string => typeof value === 'string' && value.length <= 200 && /^[A-Za-z0-9_-]+={0,2}$/.test(value);

type DeviceAction = { deviceId: string; deviceToken: string };
export type PushAction =
  | ({ ok: true; action: 'status' | 'unsubscribe' | 'test' } & DeviceAction)
  | ({ ok: true; action: 'subscribe'; subscription: { endpoint: string; p256dh: string; auth: string } } & DeviceAction)
  | { ok: false; error: string };

export function parsePushAction(body: unknown): PushAction {
  const unknownRequest = { ok: false as const, error: '알 수 없는 요청입니다.' };
  if (typeof body !== 'object' || body === null) return unknownRequest;
  const input = body as Record<string, unknown>;
  if (!isDeviceId(input.deviceId) || typeof input.deviceToken !== 'string' || !input.deviceToken) {
    return { ok: false, error: '이 휴대폰 로그인을 확인하지 못했어요. 다시 로그인해 주세요.' };
  }
  const device = { deviceId: input.deviceId, deviceToken: input.deviceToken };
  if (input.action === 'status' || input.action === 'unsubscribe' || input.action === 'test') return { ok: true, action: input.action, ...device };
  if (input.action !== 'subscribe') return unknownRequest;

  const subscription = (typeof input.subscription === 'object' && input.subscription !== null ? input.subscription : {}) as Record<string, unknown>;
  const keys = (typeof subscription.keys === 'object' && subscription.keys !== null ? subscription.keys : {}) as Record<string, unknown>;
  if (!isPushEndpointAllowed(subscription.endpoint) || !isKey(keys.p256dh) || !isKey(keys.auth)) {
    return { ok: false, error: '이 휴대폰의 알림 정보를 확인하지 못했어요.' };
  }
  return { ok: true, action: 'subscribe', ...device, subscription: { endpoint: subscription.endpoint, p256dh: keys.p256dh, auth: keys.auth } };
}

// The scheduled Kakao import is open only with the shared secret; with no secret configured it is closed to everyone.
export function isCronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`, 'utf8');
  const given = Buffer.from(header.trim(), 'utf8');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Digital Asset Links: proves the Android app (TWA) belongs to this site, so it opens without an address bar.
export function assetLinksFor(packageName: string, fingerprintsEnv: string | undefined): Array<Record<string, unknown>> {
  const fingerprints = (fingerprintsEnv || '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^[0-9A-F]{2}(:[0-9A-F]{2})+$/.test(value));
  if (fingerprints.length === 0) return [];
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: packageName, sha256_cert_fingerprints: fingerprints },
    },
  ];
}
