import test from 'node:test';
import assert from 'node:assert/strict';
import { MANAGER_SESSION_STORAGE_KEY, parseStoredSession } from '../app/lib/manager-session-storage.ts';

const now = Date.UTC(2026, 9, 17);
const user = { id: 'admin', name: '총괄 관리자', loginId: 'admin', role: 'admin', permissions: [] };

test('keeps the existing tab session key', () => {
  assert.equal(MANAGER_SESSION_STORAGE_KEY, 'weve-manager-session-v2');
});

test('returns a valid signed session', () => {
  const session = { token: 'payload.signature', firebaseToken: '', user, expiresAt: now + 1000, savedAt: now };
  assert.deepEqual(parseStoredSession(JSON.stringify(session), now), session);
});

test('rejects a session saved before signed tokens (master password as token)', () => {
  assert.equal(parseStoredSession(JSON.stringify({ token: 'local-test-master-password', user, savedAt: now }), now), null);
});

test('rejects expired, malformed and empty values', () => {
  assert.equal(parseStoredSession(JSON.stringify({ token: 'p.s', user, expiresAt: now - 1, savedAt: now }), now), null);
  assert.equal(parseStoredSession(JSON.stringify({ token: 'p.s', expiresAt: now + 1000, savedAt: now }), now), null);
  assert.equal(parseStoredSession('{', now), null);
  assert.equal(parseStoredSession(null, now), null);
});
