import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANDROID_PACKAGE_NAME,
  PUSH_SUBSCRIPTIONS_COLLECTION,
  TEST_PUSH_MESSAGE,
  assetLinksFor,
  consultationPushMessage,
  isCronAuthorized,
  isPushEndpointAllowed,
  parsePushAction,
  pushSubscriptionId,
} from '../app/lib/push-rules.ts';

const now = Date.UTC(2026, 9, 21, 3);
const iso = (hoursAgo) => new Date(now - hoursAgo * 3600000).toISOString();
const consult = (extra) => ({
  _id: 'c1',
  name: '홍길동',
  phone: '010-1234-5678',
  message: '거실 확장',
  fullAddress: '경기 안양시 동안구 평촌동 123',
  siteType: '아파트',
  areaRange: '30평대',
  createdAt: iso(1),
  ...extra,
});

test('constants', () => {
  assert.equal(PUSH_SUBSCRIPTIONS_COLLECTION, 'pushSubscriptions');
  assert.equal(ANDROID_PACKAGE_NAME, 'kr.co.wevedesign.staff');
  assert.deepEqual(TEST_PUSH_MESSAGE, { title: 'WEVE Staff', body: '알림이 잘 와요.', url: '/manager-weve-7519/m?tab=consultations', tag: 'test' });
});

test('one consultation: region, space and size, never the name, phone or message', () => {
  const message = consultationPushMessage([consult()], now);
  assert.deepEqual(message, { title: '새 상담', body: '안양 평촌동 · 아파트 · 30평대', url: '/manager-weve-7519/m?tab=consultations', tag: 'new-consultation' });
  for (const secret of ['홍길동', '1234', '거실 확장']) assert.ok(!JSON.stringify(message).includes(secret), secret);
  assert.equal(consultationPushMessage([consult({ fullAddress: '', siteType: '', areaRange: '' })], now).body, '새 상담이 들어왔어요');
});

test('several consultations become one summary', () => {
  const many = Array.from({ length: 50 }, (_, i) => consult({ _id: `c${i}` }));
  assert.deepEqual(consultationPushMessage(many, now), {
    title: '새 상담 50건',
    body: '앱에서 확인해 주세요',
    url: '/manager-weve-7519/m?tab=consultations',
    tag: 'new-consultation',
  });
});

test('only consultations from the last 24 hours count', () => {
  assert.equal(consultationPushMessage([consult({ createdAt: iso(25) })], now), null);
  assert.equal(consultationPushMessage([consult({ createdAt: 'nope' })], now), null);
  assert.equal(consultationPushMessage([consult({ createdAt: iso(25) }), consult({ createdAt: iso(2) })], now).title, '새 상담');
  assert.equal(consultationPushMessage([], now), null);
});

test('a Kakao time written in Korea time without an offset still counts', () => {
  // A time without an offset is read in the machine's zone. The server (Vercel) runs in UTC, where 14:03 KST written as
  // "2026-10-21T14:03:00" lands 9 hours ahead of the real moment; this test runs in UTC to match it.
  const zone = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    const kst = new Date(now + 9 * 3600000 - 5 * 60000).toISOString().slice(0, 19);
    assert.ok(Date.parse(kst) > now + 8 * 3600000, 'read as UTC, as on the server');
    assert.equal(consultationPushMessage([consult({ createdAt: kst })], now)?.title, '새 상담');
  } finally {
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  }
});

test('pushSubscriptionId is one per device', () => {
  assert.equal(pushSubscriptionId('md-0123456789abcdef01234567'), 'ps-md-0123456789abcdef01234567');
});

test('only known push services are accepted', () => {
  for (const ok of [
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://web.push.apple.com/QGx',
    'https://updates.push.services.mozilla.com/wpush/v2/x',
    'https://wns2-par02p.notify.windows.com/w/?token=x',
  ]) {
    assert.equal(isPushEndpointAllowed(ok), true, ok);
  }
  for (const bad of [
    'http://fcm.googleapis.com/x',
    'https://fcm.googleapis.com.evil.com/x',
    'https://evil.com/fcm.googleapis.com',
    'https://push.apple.com.evil.com/x',
    'https://localhost/x',
    'https://169.254.169.254/x',
    'https://user@fcm.googleapis.com:8443/x',
    `https://fcm.googleapis.com/${'a'.repeat(1000)}`,
    42,
    '',
  ]) {
    assert.equal(isPushEndpointAllowed(bad), false, String(bad).slice(0, 60));
  }
});

test('parsePushAction', () => {
  const device = { deviceId: 'md-0123456789abcdef01234567', deviceToken: 't'.repeat(43) };
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BOr_x-1', auth: 'k9_Z' } };
  assert.deepEqual(parsePushAction({ action: 'subscribe', ...device, subscription }), {
    ok: true,
    action: 'subscribe',
    ...device,
    subscription: { endpoint: subscription.endpoint, p256dh: 'BOr_x-1', auth: 'k9_Z' },
  });
  assert.deepEqual(parsePushAction({ action: 'test', ...device }), { ok: true, action: 'test', ...device });
  assert.deepEqual(parsePushAction({ action: 'status', ...device }), { ok: true, action: 'status', ...device });
  assert.deepEqual(parsePushAction({ action: 'unsubscribe', ...device }), { ok: true, action: 'unsubscribe', ...device });
  assert.equal(parsePushAction({ action: 'subscribe', ...device, subscription: { ...subscription, endpoint: 'https://evil.com/x' } }).ok, false);
  assert.equal(parsePushAction({ action: 'subscribe', ...device, subscription: { ...subscription, keys: { p256dh: 'a b', auth: 'x' } } }).ok, false);
  assert.equal(parsePushAction({ action: 'subscribe', ...device }).ok, false);
  assert.equal(parsePushAction({ action: 'status', deviceId: '../x', deviceToken: 't' }).ok, false);
  assert.equal(parsePushAction({ action: 'status', deviceId: device.deviceId, deviceToken: '' }).ok, false);
  assert.equal(parsePushAction({ action: 'spam', ...device }).ok, false);
  assert.equal(parsePushAction(null).ok, false);
});

test('cron is closed without a secret', () => {
  assert.equal(isCronAuthorized('Bearer ', ''), false);
  assert.equal(isCronAuthorized('Bearer x', undefined), false);
  assert.equal(isCronAuthorized(null, 's3cret'), false);
  assert.equal(isCronAuthorized('Bearer wrong', 's3cret'), false);
  assert.equal(isCronAuthorized('s3cret', 's3cret'), false);
  assert.equal(isCronAuthorized('Bearer s3cret', 's3cret'), true);
});

test('assetLinksFor', () => {
  assert.deepEqual(assetLinksFor('kr.co.wevedesign.staff', undefined), []);
  assert.deepEqual(assetLinksFor('kr.co.wevedesign.staff', ' AB:CD , 12:34 '), [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: 'kr.co.wevedesign.staff', sha256_cert_fingerprints: ['AB:CD', '12:34'] },
    },
  ]);
  assert.deepEqual(assetLinksFor('kr.co.wevedesign.staff', 'ab:cd')[0].target.sha256_cert_fingerprints, ['AB:CD']);
  assert.deepEqual(assetLinksFor('kr.co.wevedesign.staff', 'not a fingerprint'), []);
});
