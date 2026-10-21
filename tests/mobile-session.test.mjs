import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOBILE_DEVICE_STORAGE_KEY,
  createMobileSession,
  needsRefresh,
  parseStoredDevice,
  sameSessionUser,
  sendWithSession,
} from '../app/manager-weve-7519/m/mobile-session.ts';

const now = Date.UTC(2026, 9, 20, 3);
const user = { id: 'u1', name: '직원', loginId: 'staff1', role: 'staff', permissions: ['sites'] };
const device = { deviceId: 'md-0123456789abcdef01234567', deviceToken: 't'.repeat(43), expiresAt: now + 86400000 };

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values,
  };
}

const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const session = (expiresAt = now + 3600000) => ({ token: 'access', expiresAt, user });

test('parseStoredDevice keeps a well formed, unexpired device only', () => {
  assert.deepEqual(parseStoredDevice(JSON.stringify(device), now), device);
  assert.equal(parseStoredDevice(null, now), null);
  assert.equal(parseStoredDevice('{oops', now), null);
  assert.equal(parseStoredDevice(JSON.stringify({ ...device, expiresAt: now }), now), null);
  assert.equal(parseStoredDevice(JSON.stringify({ ...device, deviceToken: '' }), now), null);
});

test('needsRefresh within 5 minutes of expiry', () => {
  assert.equal(needsRefresh(null, now), true);
  assert.equal(needsRefresh({ expiresAt: now + 4 * 60000 }, now), true);
  assert.equal(needsRefresh({ expiresAt: now + 6 * 60000 }, now), false);
});

test('login stores the device and keeps the session in memory', async () => {
  const storage = memoryStorage();
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push(JSON.parse(init.body));
    return jsonResponse(200, { deviceId: device.deviceId, deviceToken: device.deviceToken, expiresAt: new Date(device.expiresAt).toISOString(), session: session() });
  };
  const mobile = createMobileSession({ fetcher, storage, now: () => now });
  const result = await mobile.login('staff1', 'pw');
  assert.equal(result.user.loginId, 'staff1');
  assert.deepEqual(calls[0], { action: 'login', loginId: 'staff1', password: 'pw' });
  assert.deepEqual(JSON.parse(storage.getItem(MOBILE_DEVICE_STORAGE_KEY)), device);
  assert.deepEqual(mobile.authHeaders(), { Authorization: 'Bearer access' });
  assert.equal((await mobile.current()).token, 'access');
  assert.equal(calls.length, 1, 'a fresh session is not refreshed');
});

test('a refused login throws the server message and stores nothing', async () => {
  const storage = memoryStorage();
  const mobile = createMobileSession({ fetcher: async () => jsonResponse(401, { error: '계정 또는 비밀번호가 올바르지 않습니다.' }), storage, now: () => now });
  await assert.rejects(mobile.login('x', 'y'), /계정 또는 비밀번호/);
  assert.equal(storage.getItem(MOBILE_DEVICE_STORAGE_KEY), null);
});

test('two current() calls at once send one refresh', async () => {
  const storage = memoryStorage({ [MOBILE_DEVICE_STORAGE_KEY]: JSON.stringify(device) });
  let calls = 0;
  const fetcher = async (url, init) => {
    calls += 1;
    assert.deepEqual(JSON.parse(init.body), { action: 'refresh', deviceId: device.deviceId, deviceToken: device.deviceToken });
    await new Promise((resolve) => setTimeout(resolve, 5));
    return jsonResponse(200, { session: session() });
  };
  const mobile = createMobileSession({ fetcher, storage, now: () => now });
  const [a, b] = await Promise.all([mobile.current(), mobile.current()]);
  assert.equal(calls, 1);
  assert.equal(a.token, 'access');
  assert.equal(b.token, 'access');
});

test('a signed-out answer clears the device and returns null', async () => {
  const storage = memoryStorage({ [MOBILE_DEVICE_STORAGE_KEY]: JSON.stringify(device) });
  const mobile = createMobileSession({ fetcher: async () => jsonResponse(401, { error: '다시 로그인해 주세요.', signedOut: true }), storage, now: () => now });
  assert.equal(await mobile.current(), null);
  assert.equal(storage.getItem(MOBILE_DEVICE_STORAGE_KEY), null);
  assert.equal(mobile.hasDevice(), false);
});

test('a network error or server failure keeps the device and throws', async () => {
  const storage = memoryStorage({ [MOBILE_DEVICE_STORAGE_KEY]: JSON.stringify(device) });
  const offline = createMobileSession({ fetcher: async () => { throw new TypeError('Failed to fetch'); }, storage, now: () => now });
  await assert.rejects(offline.current());
  assert.notEqual(storage.getItem(MOBILE_DEVICE_STORAGE_KEY), null);
  const outage = createMobileSession({ fetcher: async () => jsonResponse(503, { error: '잠시 후' }), storage, now: () => now });
  await assert.rejects(outage.current(), /잠시 후/);
  assert.notEqual(storage.getItem(MOBILE_DEVICE_STORAGE_KEY), null);
});

test('without a stored device there is no session and no request', async () => {
  let calls = 0;
  const mobile = createMobileSession({ fetcher: async () => { calls += 1; return jsonResponse(200, {}); }, storage: memoryStorage(), now: () => now });
  assert.equal(await mobile.current(), null);
  assert.equal(calls, 0);
});

test('logout clears the device even when the request fails', async () => {
  const storage = memoryStorage({ [MOBILE_DEVICE_STORAGE_KEY]: JSON.stringify(device) });
  const sent = [];
  const mobile = createMobileSession({ fetcher: async (url, init) => { sent.push(JSON.parse(init.body).action); throw new TypeError('offline'); }, storage, now: () => now });
  await mobile.logout();
  assert.deepEqual(sent, ['logout']);
  assert.equal(storage.getItem(MOBILE_DEVICE_STORAGE_KEY), null);
  assert.deepEqual(mobile.authHeaders(), {});
});

test('sameSessionUser notices a changed name, role or permission set', () => {
  assert.equal(sameSessionUser(user, { ...user, permissions: ['sites'] }), true);
  assert.equal(sameSessionUser(user, { ...user, permissions: ['sites', 'consultations'] }), false);
  assert.equal(sameSessionUser(user, { ...user, role: 'admin' }), false);
  assert.equal(sameSessionUser(user, { ...user, name: '새 이름' }), false);
  assert.equal(sameSessionUser(null, user), false);
});

test('current({ force: true }) refreshes even while the session is fresh', async () => {
  const storage = memoryStorage({ [MOBILE_DEVICE_STORAGE_KEY]: JSON.stringify(device) });
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return jsonResponse(200, { session: { ...session(), token: `access-${calls}` } });
  };
  const mobile = createMobileSession({ fetcher, storage, now: () => now });
  assert.equal((await mobile.current()).token, 'access-1');
  assert.equal((await mobile.current()).token, 'access-1');
  assert.equal((await mobile.current({ force: true })).token, 'access-2');
  assert.equal(calls, 2);
});

test('a new login ends the device stored on this phone before it', async () => {
  const storage = memoryStorage({ [MOBILE_DEVICE_STORAGE_KEY]: JSON.stringify(device) });
  const sent = [];
  const fetcher = async (url, init) => {
    sent.push(JSON.parse(init.body));
    return jsonResponse(200, { deviceId: 'md-ffffffffffffffffffffffff', deviceToken: 'n'.repeat(43), expiresAt: new Date(device.expiresAt).toISOString(), session: session() });
  };
  const mobile = createMobileSession({ fetcher, storage, now: () => now });
  await mobile.login('staff1', 'pw');
  assert.deepEqual(sent[0], {
    action: 'login',
    loginId: 'staff1',
    password: 'pw',
    previousDeviceId: device.deviceId,
    previousDeviceToken: device.deviceToken,
  });
  assert.equal(JSON.parse(storage.getItem(MOBILE_DEVICE_STORAGE_KEY)).deviceId, 'md-ffffffffffffffffffffffff');
});

// A stand-in for createMobileSession: hands out the sessions in order and records logouts.
function fakeMobile(sessions) {
  const calls = [];
  return {
    calls,
    async current(options) {
      calls.push(options?.force ? 'force' : 'current');
      return sessions.length > 0 ? sessions.shift() : null;
    },
    async logout() {
      calls.push('logout');
    },
  };
}

test('sendWithSession sends with the current session token', async () => {
  const mobile = fakeMobile([session()]);
  const tokens = [];
  const response = await sendWithSession(mobile, async (active) => {
    tokens.push(active.token);
    return jsonResponse(200, { ok: true });
  });
  assert.equal(response.status, 200);
  assert.deepEqual(tokens, ['access']);
  assert.deepEqual(mobile.calls, ['current']);
});

test('sendWithSession tries a refreshed session once after a 401', async () => {
  const mobile = fakeMobile([session(), { ...session(), token: 'renewed' }]);
  const tokens = [];
  const response = await sendWithSession(mobile, async (active) => {
    tokens.push(active.token);
    return active.token === 'renewed' ? jsonResponse(200, {}) : jsonResponse(401, {});
  });
  assert.equal(response.status, 200);
  assert.deepEqual(tokens, ['access', 'renewed']);
  assert.deepEqual(mobile.calls, ['current', 'force']);
});

test('sendWithSession logs the phone out when the refreshed session is refused too', async () => {
  const mobile = fakeMobile([session(), session()]);
  let sends = 0;
  const response = await sendWithSession(mobile, async () => {
    sends += 1;
    return jsonResponse(401, {});
  });
  assert.equal(response, null);
  assert.equal(sends, 2);
  assert.deepEqual(mobile.calls, ['current', 'force', 'logout']);
});

test('sendWithSession returns null without sending when the phone has no session', async () => {
  const mobile = fakeMobile([]);
  let sends = 0;
  assert.equal(await sendWithSession(mobile, async () => { sends += 1; return jsonResponse(200, {}); }), null);
  assert.equal(sends, 0);
  assert.deepEqual(mobile.calls, ['current']);
});

test('sendWithSession hands each session it uses to onSession', async () => {
  const mobile = fakeMobile([session(), { ...session(), token: 'renewed' }]);
  const seen = [];
  await sendWithSession(
    mobile,
    async (active) => (active.token === 'renewed' ? jsonResponse(200, {}) : jsonResponse(401, {})),
    (active) => seen.push(active.token),
  );
  assert.deepEqual(seen, ['access', 'renewed']);
});
