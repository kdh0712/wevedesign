import test from 'node:test';
import assert from 'node:assert/strict';
import { SESSION_TTL_SECONDS, resolveSessionKey, signSessionToken, verifySessionToken } from '../app/api/manager/_token.ts';

const key = Buffer.from('test-key');
const claims = { sub: 'u1', name: '직원', loginId: 'staff1', role: 'staff', perms: ['consultations'], src: 'account' };
const now = Date.UTC(2026, 9, 17, 0, 0, 0);

test('round trip keeps the claims and an 8 hour expiry', () => {
  const { token, payload } = signSessionToken(claims, key, now);
  assert.equal(SESSION_TTL_SECONDS, 28800);
  assert.equal(payload.exp - payload.iat, 28800);
  assert.equal(payload.v, 1);
  assert.deepEqual(verifySessionToken(token, key, now + 1000), payload);
});

test('rejects a payload edited to admin', () => {
  const { token } = signSessionToken(claims, key, now);
  const [body, signature] = token.split('.');
  const edited = { ...JSON.parse(Buffer.from(body, 'base64url').toString('utf8')), role: 'admin' };
  const forged = `${Buffer.from(JSON.stringify(edited)).toString('base64url')}.${signature}`;
  assert.equal(verifySessionToken(forged, key, now), null);
});

test('rejects a wrong key, an expired token and garbage', () => {
  const { token } = signSessionToken(claims, key, now);
  assert.equal(verifySessionToken(token, Buffer.from('other'), now), null);
  assert.equal(verifySessionToken(token, key, now + 28801 * 1000), null);
  for (const bad of ['', 'abc', 'a.b.c', 'local-test-master-password']) {
    assert.equal(verifySessionToken(bad, key, now), null);
  }
});

test('rejects a signature with extra or foreign characters', () => {
  const { token } = signSessionToken(claims, key, now);
  const [body, signature] = token.split('.');
  assert.equal(verifySessionToken(`${token}=`, key, now), null);
  assert.equal(verifySessionToken(`${body}.${signature.slice(0, 5)}*${signature.slice(5)}`, key, now), null);
});

test('warns once when the session secret is shorter than 32 bytes', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  resolveSessionKey({ MANAGER_SESSION_SECRET: 'short-secret-for-the-warning-test'.slice(0, 20) });
  resolveSessionKey({ MANAGER_SESSION_SECRET: 'short-secret-for-the-warning-test'.slice(0, 20) });
  assert.equal(warn.mock.callCount(), 1);
  resolveSessionKey({ MANAGER_SESSION_SECRET: 'x'.repeat(32) });
  assert.equal(warn.mock.callCount(), 1);
});

test('key resolution prefers the dedicated secret and derives a fallback', (t) => {
  t.mock.method(console, 'warn', () => {});
  assert.deepEqual(resolveSessionKey({ MANAGER_SESSION_SECRET: ' s ' }), Buffer.from('s'));
  const derived = resolveSessionKey({ SANITY_WRITE_TOKEN: 't' });
  assert.equal(derived.length, 32);
  assert.notDeepEqual(derived, Buffer.from('t'));
  assert.equal(resolveSessionKey({}), null);
  assert.equal(resolveSessionKey({ MANAGER_SESSION_SECRET: '   ' }), null);
});

test('a session can be signed with a shorter lifetime, and the default stays 8 hours', () => {
  const short = signSessionToken(claims, key, now, 3600);
  assert.equal(short.payload.exp - short.payload.iat, 3600);
  assert.deepEqual(verifySessionToken(short.token, key, now + 3599 * 1000), short.payload);
  assert.equal(verifySessionToken(short.token, key, now + 3600 * 1000), null);
  assert.equal(signSessionToken(claims, key, now).payload.exp - now / 1000, 28800);
});
