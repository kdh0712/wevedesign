import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolveSessionKey } from '../app/api/manager/_token.ts';
import {
  PROGRESS_COOKIE_MAX_AGE_SECONDS,
  PROGRESS_LOCK_MS,
  PROGRESS_MAX_FAILURES,
  isProgressLocked,
  nextProgressAccessState,
  progressCookieName,
  resolveProgressKey,
  signProgressCookie,
  verifyProgressCookie,
} from '../app/api/progress/_access.ts';

const key = Buffer.from('test-key');
const code = 'abc123XYZ';
const last4 = '1234';
const now = Date.UTC(2026, 9, 17, 0, 0, 0);
const day = 24 * 60 * 60 * 1000;

test('cookie round trip', () => {
  assert.equal(PROGRESS_COOKIE_MAX_AGE_SECONDS, 15552000);
  assert.equal(PROGRESS_MAX_FAILURES, 5);
  assert.equal(PROGRESS_LOCK_MS, 900000);

  const cookie = signProgressCookie(code, last4, key, now);
  const [exp, signature] = cookie.split('.');
  assert.equal(Number(exp), Math.floor(now / 1000) + PROGRESS_COOKIE_MAX_AGE_SECONDS);
  assert.match(signature, /^[A-Za-z0-9_-]+$/);

  assert.equal(verifyProgressCookie(cookie, code, last4, key, now), true);
  assert.equal(verifyProgressCookie(cookie, code, last4, key, now + 179 * day), true);
  assert.equal(verifyProgressCookie(cookie, code, last4, key, now + 180 * day + 1000), false);
});

test('cookie fails after code rotation or phone change', () => {
  const cookie = signProgressCookie(code, last4, key, now);
  assert.equal(verifyProgressCookie(cookie, 'rotatedCode9', last4, key, now), false);
  assert.equal(verifyProgressCookie(cookie, code, '9999', key, now), false);
  assert.equal(verifyProgressCookie(cookie, code, last4, Buffer.from('other-key'), now), false);

  // One changed character in the signature.
  const [exp, signature] = cookie.split('.');
  const flipped = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
  assert.equal(verifyProgressCookie(`${exp}.${flipped}`, code, last4, key, now), false);

  // A longer expiry with the original signature must not pass.
  assert.equal(verifyProgressCookie(`${Number(exp) + 86400}.${signature}`, code, last4, key, now), false);

  assert.equal(verifyProgressCookie(undefined, code, last4, key, now), false);
  for (const bad of ['', 'abc', '.', `${exp}.`, `.${signature}`, `${cookie}.x`, `${cookie}=`, `${exp}.${signature.slice(0, 5)}*${signature.slice(5)}`]) {
    assert.equal(verifyProgressCookie(bad, code, last4, key, now), false, bad);
  }
});

test('cookie name is derived from the code only', () => {
  const name = progressCookieName(code);
  assert.equal(name, `wp_${createHash('sha256').update(code).digest('hex').slice(0, 16)}`);
  assert.match(name, /^wp_[0-9a-f]{16}$/);
  assert.equal(progressCookieName(code), name);
  assert.notEqual(progressCookieName('rotatedCode9'), name);
  assert.ok(!name.includes(code));
});

test('key derivation', (t) => {
  t.mock.method(console, 'warn', () => {});
  const progressKey = resolveProgressKey({ MANAGER_SESSION_SECRET: 's' });
  assert.ok(Buffer.isBuffer(progressKey));
  assert.equal(progressKey.length, 32);
  assert.notDeepEqual(progressKey, resolveSessionKey({ MANAGER_SESSION_SECRET: 's' }));
  assert.deepEqual(resolveProgressKey({ MANAGER_SESSION_SECRET: 's' }), progressKey);
  assert.notDeepEqual(resolveProgressKey({ MANAGER_SESSION_SECRET: 'other' }), progressKey);

  assert.ok(Buffer.isBuffer(resolveProgressKey({ SANITY_WRITE_TOKEN: 't' })));
  assert.equal(resolveProgressKey({}), null);
  assert.equal(resolveProgressKey({ MANAGER_SESSION_SECRET: '   ' }), null);
});

test('lockout after five failures', () => {
  let state;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    state = nextProgressAccessState(state, false, now);
    assert.equal(state.failedCount, attempt);
    assert.equal(state.lockedUntil, '');
    assert.equal(isProgressLocked(state, now), false);
  }

  state = nextProgressAccessState(state, false, now);
  assert.equal(state.failedCount, 5);
  assert.equal(state.lockedUntil, new Date(now + 15 * 60 * 1000).toISOString());
  assert.equal(isProgressLocked(state, now), true);
  assert.equal(isProgressLocked(state, now + 15 * 60 * 1000 - 1), true);
  assert.equal(isProgressLocked(state, now + 15 * 60 * 1000 + 1), false);

  assert.deepEqual(nextProgressAccessState(state, true, now), { failedCount: 0, lockedUntil: '' });
  assert.deepEqual(nextProgressAccessState(undefined, true, now), { failedCount: 0, lockedUntil: '' });
});

test('lockout counting restarts after the lock ends and ignores missing or bad state', () => {
  const locked = { failedCount: 5, lockedUntil: new Date(now + PROGRESS_LOCK_MS).toISOString() };

  // The first failure after the lock ended counts as 1, not 6.
  const after = now + PROGRESS_LOCK_MS + 1;
  assert.deepEqual(nextProgressAccessState(locked, false, after), { failedCount: 1, lockedUntil: '' });

  // A failure recorded while still locked must not extend or change the lock.
  assert.deepEqual(nextProgressAccessState(locked, false, now + 1000), locked);

  // A damaged stored count restarts at 1 instead of becoming NaN and never locking.
  assert.deepEqual(nextProgressAccessState({ failedCount: Number.NaN, lockedUntil: '' }, false, now), { failedCount: 1, lockedUntil: '' });
  assert.deepEqual(nextProgressAccessState({ failedCount: undefined, lockedUntil: '' }, false, now), { failedCount: 1, lockedUntil: '' });

  assert.equal(isProgressLocked(undefined, now), false);
  assert.equal(isProgressLocked({ failedCount: 2, lockedUntil: '' }, now), false);
  assert.equal(isProgressLocked({ failedCount: 5, lockedUntil: 'not a date' }, now), false);
});
