import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAST_USED_WRITE_INTERVAL_MS,
  MOBILE_DEVICE_TTL_MS,
  MOBILE_SESSION_TTL_SECONDS,
  deviceLabelFromUserAgent,
  deviceRefreshDecision,
  hashDeviceToken,
  isMobileDeviceId,
  newDeviceSecret,
} from '../app/api/manager/_mobile-device-rules.ts';

const now = Date.UTC(2026, 9, 20, 3, 0, 0);
const iso = (ms) => new Date(ms).toISOString();

function deviceFor(secret, overrides = {}) {
  return {
    _id: secret.deviceId,
    userId: 'u1',
    loginId: 'staff1',
    userName: '직원',
    src: 'account',
    deviceLabel: 'iPhone · Safari',
    tokenHash: secret.tokenHash,
    createdAt: iso(now - 86400000),
    expiresAt: iso(now + 1000),
    lastUsedAt: iso(now - 11 * 60000),
    ...overrides,
  };
}

test('the lifetimes match the spec', () => {
  assert.equal(MOBILE_DEVICE_TTL_MS, 30 * 24 * 60 * 60 * 1000);
  assert.equal(MOBILE_SESSION_TTL_SECONDS, 3600);
  assert.equal(LAST_USED_WRITE_INTERVAL_MS, 10 * 60 * 1000);
});

test('a new secret matches its own hash and nothing else', () => {
  const s = newDeviceSecret();
  assert.match(s.deviceId, /^md-[0-9a-f]{24}$/);
  assert.match(s.deviceToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(hashDeviceToken(s.deviceToken), s.tokenHash);
  assert.notEqual(hashDeviceToken(`${s.deviceToken}x`), s.tokenHash);
  assert.notEqual(newDeviceSecret().deviceToken, s.deviceToken);
});

test('refresh is allowed for a live device and touches it only after 10 minutes', () => {
  const s = newDeviceSecret();
  assert.deepEqual(deviceRefreshDecision(deviceFor(s), s.deviceToken, now), { ok: true, touch: true });
  assert.deepEqual(deviceRefreshDecision(deviceFor(s, { lastUsedAt: iso(now - 60000) }), s.deviceToken, now), { ok: true, touch: false });
});

test('refresh is refused for a missing, revoked or expired device and a wrong token', () => {
  const s = newDeviceSecret();
  assert.deepEqual(deviceRefreshDecision(null, s.deviceToken, now), { ok: false, reason: 'missing' });
  assert.deepEqual(deviceRefreshDecision(deviceFor(s, { revokedAt: iso(now - 1) }), s.deviceToken, now), { ok: false, reason: 'revoked' });
  assert.deepEqual(deviceRefreshDecision(deviceFor(s, { expiresAt: iso(now) }), s.deviceToken, now), { ok: false, reason: 'expired' });
  assert.deepEqual(deviceRefreshDecision(deviceFor(s, { expiresAt: 'garbage' }), s.deviceToken, now), { ok: false, reason: 'expired' });
  assert.deepEqual(deviceRefreshDecision(deviceFor(s), 'wrong', now), { ok: false, reason: 'token' });
  assert.deepEqual(deviceRefreshDecision(deviceFor(s), '', now), { ok: false, reason: 'token' });
});

test('device labels name the phone and browser', () => {
  assert.equal(
    deviceLabelFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'),
    'iPhone · Safari',
  );
  assert.equal(
    deviceLabelFromUserAgent('Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'),
    'Android · Chrome',
  );
  assert.equal(
    deviceLabelFromUserAgent('Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36'),
    'Android · 삼성 인터넷',
  );
  assert.equal(
    deviceLabelFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1'),
    'iPhone · Chrome',
  );
  assert.equal(deviceLabelFromUserAgent(''), '알 수 없는 기기');
});

test('only ids shaped like the ones we issue are looked up', () => {
  assert.equal(isMobileDeviceId(newDeviceSecret().deviceId), true);
  for (const bad of ['', 'md-', 'md-xyz', '../managerDevices/md-0123456789abcdef01234567', 'md-0123456789ABCDEF01234567', 42, null]) {
    assert.equal(isMobileDeviceId(bad), false, String(bad));
  }
});
