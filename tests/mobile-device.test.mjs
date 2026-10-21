import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAST_USED_WRITE_INTERVAL_MS,
  credentialStamp,
  credentialStillValid,
  deviceSignature,
  MOBILE_DEVICE_TTL_MS,
  MOBILE_SESSION_TTL_SECONDS,
  deviceLabelFromUserAgent,
  deviceIsActive,
  deviceRefreshDecision,
  hashDeviceToken,
  isMobileDeviceId,
  newDeviceSecret,
  previousDeviceOf,
  pushRecipientDecision,
} from '../app/api/manager/_mobile-device-rules.ts';

const now = Date.UTC(2026, 9, 20, 3, 0, 0);
const iso = (ms) => new Date(ms).toISOString();

const key = Buffer.from('device-test-key');

// A record as the server writes it: signed with the server key over every field that decides a login.
function deviceFor(secret, overrides = {}, signKey = key) {
  const record = {
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
    credentialStamp: '',
    ...overrides,
  };
  return { ...record, signature: deviceSignature(record, signKey), ...(overrides.signature !== undefined ? { signature: overrides.signature } : {}) };
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
  assert.deepEqual(deviceRefreshDecision(deviceFor(s), s.deviceToken, now, key), { ok: true, touch: true });
  assert.deepEqual(deviceRefreshDecision(deviceFor(s, { lastUsedAt: iso(now - 60000) }), s.deviceToken, now, key), { ok: true, touch: false });
});

test('refresh is refused for a missing, revoked or expired device and a wrong token', () => {
  const s = newDeviceSecret();
  assert.deepEqual(deviceRefreshDecision(null, s.deviceToken, now, key), { ok: false, reason: 'missing' });
  assert.deepEqual(deviceRefreshDecision(deviceFor(s, { revokedAt: iso(now - 1) }), s.deviceToken, now, key), { ok: false, reason: 'revoked' });
  assert.deepEqual(deviceRefreshDecision(deviceFor(s, { expiresAt: iso(now) }), s.deviceToken, now, key), { ok: false, reason: 'expired' });
  assert.deepEqual(deviceRefreshDecision(deviceFor(s, { expiresAt: 'garbage' }), s.deviceToken, now, key), { ok: false, reason: 'expired' });
  assert.deepEqual(deviceRefreshDecision(deviceFor(s), 'wrong', now, key), { ok: false, reason: 'token' });
  assert.deepEqual(deviceRefreshDecision(deviceFor(s), '', now, key), { ok: false, reason: 'token' });
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

test('a device record that the server did not sign is refused', () => {
  const s = newDeviceSecret();
  const signed = deviceFor(s);
  assert.deepEqual(deviceRefreshDecision({ ...signed, userId: 'admin', src: 'master' }, s.deviceToken, now, key), { ok: false, reason: 'token' });
  assert.deepEqual(deviceRefreshDecision({ ...signed, expiresAt: iso(now + 365 * 86400000) }, s.deviceToken, now, key), { ok: false, reason: 'token' });
  assert.deepEqual(deviceRefreshDecision(deviceFor(s, {}, Buffer.from('other-key')), s.deviceToken, now, key), { ok: false, reason: 'token' });
  const { signature: _signature, ...unsigned } = signed;
  assert.deepEqual(deviceRefreshDecision(unsigned, s.deviceToken, now, key), { ok: false, reason: 'token' });
});

test('a changed or removed password ends the phone logins made with the old one', () => {
  const stamp = credentialStamp(key, 'hash-1');
  assert.notEqual(stamp, '');
  assert.equal(credentialStamp(key, null), '');
  assert.equal(credentialStillValid({ credentialStamp: stamp }, 'hash-1', key), true);
  assert.equal(credentialStillValid({ credentialStamp: stamp }, 'hash-2', key), false);
  assert.equal(credentialStillValid({ credentialStamp: stamp }, null, key), false, 'master password removed');
  assert.equal(credentialStillValid({ credentialStamp: '' }, null, key), true, 'Firebase accounts carry no stamp');
  assert.equal(credentialStillValid({}, 'hash-1', key), false);
});

test('a login names the device it replaces only with a well formed id and a token', () => {
  const id = 'md-0123456789abcdef01234567';
  assert.deepEqual(previousDeviceOf({ previousDeviceId: id, previousDeviceToken: 'tok' }, 'md-ffffffffffffffffffffffff'), { deviceId: id, deviceToken: 'tok' });
  assert.equal(previousDeviceOf({ previousDeviceId: id, previousDeviceToken: 'tok' }, id), null, 'never the new device itself');
  assert.equal(previousDeviceOf({ previousDeviceId: '../x', previousDeviceToken: 'tok' }, 'md-ffffffffffffffffffffffff'), null);
  assert.equal(previousDeviceOf({ previousDeviceId: id, previousDeviceToken: '' }, 'md-ffffffffffffffffffffffff'), null);
  assert.equal(previousDeviceOf({ previousDeviceId: id }, 'md-ffffffffffffffffffffffff'), null);
  assert.equal(previousDeviceOf(null, 'md-ffffffffffffffffffffffff'), null);
});

test('deviceIsActive needs a live, signed device (no token needed)', () => {
  const s = newDeviceSecret();
  assert.equal(deviceIsActive(deviceFor(s), now, key), true);
  assert.equal(deviceIsActive(deviceFor(s, { revokedAt: iso(now - 1000) }), now, key), false);
  assert.equal(deviceIsActive(deviceFor(s, { expiresAt: iso(now - 1) }), now, key), false);
  assert.equal(deviceIsActive(deviceFor(s, {}, Buffer.from('other-key')), now, key), false);
  assert.equal(deviceIsActive(null, now, key), false);
});

test('an alert goes only to a live phone whose login still holds, and only with the permission', () => {
  const s = newDeviceSecret();
  const stamped = deviceFor(s, { credentialStamp: credentialStamp(key, 'hash-1') });
  const account = { credential: 'hash-1', canGetAlerts: true };
  assert.equal(pushRecipientDecision(stamped, 'u1', account, now, key), 'send');
  assert.equal(pushRecipientDecision(stamped, 'u1', { ...account, credential: 'hash-2' }, now, key), 'drop', 'password changed');
  assert.equal(pushRecipientDecision(stamped, 'u1', null, now, key), 'drop', 'account removed');
  assert.equal(pushRecipientDecision(stamped, 'u2', account, now, key), 'drop', 'another person on the subscription');
  assert.equal(pushRecipientDecision(deviceFor(s, { revokedAt: iso(now) }), 'u1', account, now, key), 'drop');
  assert.equal(pushRecipientDecision(stamped, 'u1', { ...account, canGetAlerts: false }, now, key), 'skip', 'permission removed for now');
});
