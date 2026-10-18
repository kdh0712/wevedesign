import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolveSessionKey } from '../app/api/manager/_token.ts';
import {
  PROGRESS_COOKIE_MAX_AGE_SECONDS,
  PROGRESS_LOCK_MS,
  PROGRESS_MAX_FAILURES,
  PROGRESS_MAX_LOCK_MS,
  isProgressLocked,
  nextProgressAccessState,
  progressCookieName,
  progressLockMs,
  progressPhoneDigits,
  resolveProgressKey,
  signProgressCookie,
  verifyProgressCookie,
} from '../app/api/progress/_access.ts';

const key = Buffer.from('test-key');
const code = 'abc123XYZ';
// The cookie binds the customer's whole number, digits only.
const digits = '01012341234';
const now = Date.UTC(2026, 9, 17, 0, 0, 0);
const day = 24 * 60 * 60 * 1000;

test('cookie round trip', () => {
  assert.equal(PROGRESS_COOKIE_MAX_AGE_SECONDS, 15552000);
  assert.equal(PROGRESS_MAX_FAILURES, 5);
  assert.equal(PROGRESS_LOCK_MS, 900000);

  const cookie = signProgressCookie(code, digits, key, now);
  const [exp, signature] = cookie.split('.');
  assert.equal(Number(exp), Math.floor(now / 1000) + PROGRESS_COOKIE_MAX_AGE_SECONDS);
  assert.match(signature, /^[A-Za-z0-9_-]+$/);

  assert.equal(verifyProgressCookie(cookie, code, digits, key, now), true);
  assert.equal(verifyProgressCookie(cookie, code, digits, key, now + 179 * day), true);
  assert.equal(verifyProgressCookie(cookie, code, digits, key, now + 180 * day + 1000), false);
});

test('cookie fails after code rotation or phone change', () => {
  const cookie = signProgressCookie(code, digits, key, now);
  assert.equal(verifyProgressCookie(cookie, 'rotatedCode9', digits, key, now), false);
  assert.equal(verifyProgressCookie(cookie, code, '01012349999', key, now), false);
  assert.equal(verifyProgressCookie(cookie, code, digits, Buffer.from('other-key'), now), false);

  // One changed character in the signature.
  const [exp, signature] = cookie.split('.');
  const flipped = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
  assert.equal(verifyProgressCookie(`${exp}.${flipped}`, code, digits, key, now), false);

  // A longer expiry with the original signature must not pass.
  assert.equal(verifyProgressCookie(`${Number(exp) + 86400}.${signature}`, code, digits, key, now), false);

  assert.equal(verifyProgressCookie(undefined, code, digits, key, now), false);
  for (const bad of ['', 'abc', '.', `${exp}.`, `.${signature}`, `${cookie}.x`, `${cookie}=`, `${exp}.${signature.slice(0, 5)}*${signature.slice(5)}`]) {
    assert.equal(verifyProgressCookie(bad, code, digits, key, now), false, bad);
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

  assert.deepEqual(nextProgressAccessState(state, true, now), { failedCount: 0, lockedUntil: '', lockCount: 0, lastOkAt: new Date(now).toISOString() });
  assert.deepEqual(nextProgressAccessState(undefined, true, now), { failedCount: 0, lockedUntil: '', lockCount: 0, lastOkAt: new Date(now).toISOString() });
});

test('lockout counting restarts after the lock ends and ignores missing or bad state', () => {
  const locked = { failedCount: 5, lockedUntil: new Date(now + PROGRESS_LOCK_MS).toISOString() };

  // The first failure after the lock ended counts as 1, not 6.
  const after = now + PROGRESS_LOCK_MS + 1;
  assert.deepEqual(nextProgressAccessState(locked, false, after), { failedCount: 1, lockedUntil: '', lockCount: 0 });

  // A failure recorded while still locked must not extend or change the lock.
  assert.deepEqual(nextProgressAccessState(locked, false, now + 1000), locked);

  // A damaged stored count restarts at 1 instead of becoming NaN and never locking.
  assert.deepEqual(nextProgressAccessState({ failedCount: Number.NaN, lockedUntil: '' }, false, now), { failedCount: 1, lockedUntil: '', lockCount: 0 });
  assert.deepEqual(nextProgressAccessState({ failedCount: undefined, lockedUntil: '' }, false, now), { failedCount: 1, lockedUntil: '', lockCount: 0 });

  assert.equal(isProgressLocked(undefined, now), false);
  assert.equal(isProgressLocked({ failedCount: 2, lockedUntil: '' }, now), false);
  assert.equal(isProgressLocked({ failedCount: 5, lockedUntil: 'not a date' }, now), false);
});

test('the cookie binds the whole number: another number with the same last four does not pass', () => {
  const cookie = signProgressCookie(code, '01012345678', key, now);
  assert.equal(verifyProgressCookie(cookie, code, '01012345678', key, now), true);
  assert.equal(verifyProgressCookie(cookie, code, '01099995678', key, now), false, 'same last four, different number');
  assert.equal(verifyProgressCookie(cookie, code, '0212345678', key, now), false, 'a landline ending in 5678');
  assert.equal(verifyProgressCookie(cookie, code, '5678', key, now), false, 'the last four alone');
  assert.equal(verifyProgressCookie(cookie, code, '', key, now), false);
  assert.equal(verifyProgressCookie(cookie, code, '010-1234-5678', key, now), false, 'only digits are compared');
});

test('progressPhoneDigits strips everything but digits', () => {
  assert.equal(progressPhoneDigits('010-1234-5678'), '01012345678');
  assert.equal(progressPhoneDigits(' +82 10 1234 5678 '), '821012345678');
  assert.equal(progressPhoneDigits('(02) 381-0489'), '023810489');
  assert.equal(progressPhoneDigits(''), '');
  assert.equal(progressPhoneDigits(undefined), '');
});

const minute = 60 * 1000;
const hour = 60 * minute;

// Five misses from a fresh count; returns the state after the fifth.
function missFiveTimes(state, at) {
  let next = state;
  for (let attempt = 0; attempt < PROGRESS_MAX_FAILURES; attempt += 1) next = nextProgressAccessState(next, false, at);
  return next;
}

test('each lock since the last success doubles, up to 24 hours', () => {
  assert.equal(PROGRESS_MAX_LOCK_MS, 86400000);
  const expected = [15 * minute, 30 * minute, hour, 2 * hour, 4 * hour, 8 * hour, 16 * hour, 24 * hour, 24 * hour, 24 * hour];
  let state;
  let at = now;
  expected.forEach((duration, index) => {
    state = missFiveTimes(state, at);
    assert.equal(state.failedCount, PROGRESS_MAX_FAILURES, `lock ${index + 1}`);
    assert.equal(state.lockCount, index + 1, `lock ${index + 1}`);
    assert.equal(state.lockedUntil, new Date(at + duration).toISOString(), `lock ${index + 1} lasts ${duration / minute} minutes`);
    at += duration + 1;
  });

  assert.equal(progressLockMs(0), 15 * minute);
  assert.equal(progressLockMs(1), 30 * minute);
  assert.equal(progressLockMs(6), 16 * hour);
  assert.equal(progressLockMs(7), 24 * hour);
  assert.equal(progressLockMs(10_000), 24 * hour, 'a huge count stays at the cap');
});

test('a lock that ended starts a fresh failure count but keeps the lock count', () => {
  const first = missFiveTimes(undefined, now);
  const after = now + 15 * minute + 1;
  assert.deepEqual(nextProgressAccessState(first, false, after), { failedCount: 1, lockedUntil: '', lockCount: 1 });

  // Four more misses after the first lock do not lock yet; the fifth locks for 30 minutes.
  let state = first;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    state = nextProgressAccessState(state, false, after);
    assert.equal(state.lockedUntil, '');
    assert.equal(state.lockCount, 1);
  }
  state = nextProgressAccessState(state, false, after);
  assert.equal(state.lockedUntil, new Date(after + 30 * minute).toISOString());
  assert.equal(state.lockCount, 2);
});

test('a failure while locked does not extend the lock or count it', () => {
  const locked = missFiveTimes(missFiveTimes(undefined, now), now + 15 * minute + 1);
  assert.equal(locked.lockCount, 2);
  assert.deepEqual(nextProgressAccessState(locked, false, now + 15 * minute + 2), locked);
});

test('a correct answer resets the lock count, so the next lock is 15 minutes again', () => {
  const twice = missFiveTimes(missFiveTimes(undefined, now), now + 15 * minute + 1);
  const later = now + 2 * hour;
  const ok = nextProgressAccessState(twice, true, later);
  assert.deepEqual(ok, { failedCount: 0, lockedUntil: '', lockCount: 0, lastOkAt: new Date(later).toISOString() });

  const again = missFiveTimes(ok, later);
  assert.equal(again.lockedUntil, new Date(later + 15 * minute).toISOString());
  assert.equal(again.lockCount, 1);
  assert.equal(again.lastOkAt, new Date(later).toISOString(), 'misses keep the time of the last success');
});

test('a stored lock count that is not a number counts as 0', () => {
  for (const lockCount of ['3', Number.NaN, Number.POSITIVE_INFINITY, -2, null, {}, undefined]) {
    const state = missFiveTimes({ failedCount: 0, lockedUntil: '', lockCount }, now);
    assert.equal(state.lockedUntil, new Date(now + 15 * minute).toISOString(), String(lockCount));
    assert.equal(state.lockCount, 1, String(lockCount));
  }
  // A fractional count is rounded down.
  assert.equal(missFiveTimes({ failedCount: 0, lockedUntil: '', lockCount: 1.7 }, now).lockedUntil, new Date(now + 30 * minute).toISOString());
});

test('a record written before lockCount existed still works', () => {
  const old = { failedCount: 4, lockedUntil: '' };
  const state = nextProgressAccessState(old, false, now);
  assert.deepEqual(state, { failedCount: 5, lockedUntil: new Date(now + 15 * minute).toISOString(), lockCount: 1 });
});
