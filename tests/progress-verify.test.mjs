import test from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import {
  PROGRESS_LINK_OFF_MESSAGE,
  PROGRESS_NO_PHONE_MESSAGE,
  PROGRESS_RETRY_MESSAGE,
  PROGRESS_UNAVAILABLE_MESSAGE,
  PROGRESS_WRONG_LAST4_MESSAGE,
  progressLockedMessage,
} from '../app/lib/progress-public.ts';
import { PROGRESS_COOKIE_MAX_AGE_SECONDS, progressCookieName, verifyProgressCookie } from '../app/api/progress/_access.ts';
import { VERIFY_BAD_LAST4_MESSAGE, VERIFY_BAD_REQUEST_MESSAGE, verifyProgressAttempt } from '../app/api/progress/_verify.ts';

const CODE = 'abcDEF123_-abcDEF123_-';
const PHONE = '010-1234-5678';
const PHONE_DIGITS = '01012345678';
const RIGHT = '5678';
// Not part of any number, message or id below, so a log line that contains it can only have come from the guess.
const WRONG = '4821';
const key = Buffer.from('verify-test-key');
const now = Date.UTC(2026, 9, 18, 3, 0, 0);
const minute = 60 * 1000;

class PreconditionFailed extends Error {}

// A versioned store like Firestore's: a write lands only on the version it was read at, and every committed write
// makes a new version.
function versionedStore({ site = {}, phone = PHONE } = {}) {
  let version = 1;
  let doc = { _id: 'site-1', title: '테스트 현장', progressCode: CODE, progressEnabled: true, ...site };
  const calls = { find: 0, read: 0, phone: 0, write: 0 };
  const store = {
    calls,
    writes: [],
    get doc() {
      return doc;
    },
    // A change made somewhere else (a staff edit, a rotation, the 휴지통).
    touch(fields) {
      doc = { ...doc, ...fields };
      version += 1;
    },
    async findSiteByCode(code) {
      calls.find += 1;
      return doc.progressCode === code && !doc.deletedAt ? structuredClone(doc) : null;
    },
    async readSite(id) {
      calls.read += 1;
      return id === doc._id ? { site: structuredClone(doc), updateTime: `v${version}` } : null;
    },
    async resolvePhone() {
      calls.phone += 1;
      return phone;
    },
    async writeAccess(id, access, updateTime) {
      calls.write += 1;
      if (id !== doc._id || updateTime !== `v${version}`) throw new PreconditionFailed(`stored version is v${version}, not ${updateTime}`);
      doc = { ...doc, progressAccess: structuredClone(access) };
      version += 1;
      store.writes.push(structuredClone(access));
    },
  };
  return store;
}

// Every attempt reads the same version before any of them writes. Attempts then resume in the order they read.
function holdReads(store, count) {
  const read = store.readSite;
  const waiting = [];
  store.readSite = async (id) => {
    const snapshot = await read(id);
    await new Promise((resolve) => {
      waiting.push(resolve);
      if (waiting.length === count) waiting.forEach((go) => go());
    });
    return snapshot;
  };
}

const attempt = (store, last4, overrides = {}) =>
  verifyProgressAttempt({ code: CODE, last4 }, { store, storeReady: true, key, nowMs: now, ...overrides });

const quiet = (t) => t.mock.method(console, 'error', () => {});

function assertRetry(result) {
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, { error: PROGRESS_RETRY_MESSAGE, retry: true });
  assert.equal(result.headers['Retry-After'], '2');
  assert.equal(result.cookie, undefined, 'no cookie without a committed write');
}

test('a malformed request answers 400 before anything is looked up', async () => {
  const store = versionedStore();
  for (const body of [null, [], 'x', {}, { code: CODE }, { last4: RIGHT }, { code: 1, last4: RIGHT }, { code: CODE, last4: 5678 }]) {
    const result = await verifyProgressAttempt(body, { store, storeReady: true, key, nowMs: now });
    assert.equal(result.status, 400, inspect(body));
    assert.deepEqual(result.body, { error: VERIFY_BAD_REQUEST_MESSAGE });
  }
  for (const last4 of ['123', '12345', 'abcd', ' 5678', '56 78', '５６７８', '']) {
    const result = await attempt(store, last4);
    assert.equal(result.status, 400, last4);
    assert.deepEqual(result.body, { error: VERIFY_BAD_LAST4_MESSAGE });
  }
  assert.deepEqual(store.calls, { find: 0, read: 0, phone: 0, write: 0 });
});

test('an impossible code or a server without the store answers the link-off 404 without a lookup', async () => {
  const store = versionedStore();
  for (const code of ['bad code!', 'a/b', '']) {
    const result = await verifyProgressAttempt({ code, last4: RIGHT }, { store, storeReady: true, key, nowMs: now });
    assert.equal(result.status, 404, code);
    assert.deepEqual(result.body, { error: PROGRESS_LINK_OFF_MESSAGE });
  }
  const notReady = await attempt(store, RIGHT, { storeReady: false });
  assert.equal(notReady.status, 404);
  assert.deepEqual(notReady.body, { error: PROGRESS_LINK_OFF_MESSAGE });
  assert.deepEqual(store.calls, { find: 0, read: 0, phone: 0, write: 0 });
});

test('an unknown, switched-off or mismatched link answers the same 404 and writes nothing', async () => {
  const unknown = versionedStore({ site: { progressCode: 'someOtherCode' } });
  const off = versionedStore({ site: { progressEnabled: false } });
  const mismatched = versionedStore();
  mismatched.findSiteByCode = async () => ({ ...mismatched.doc, progressCode: 'someOtherCode' });
  for (const store of [unknown, off, mismatched]) {
    const result = await attempt(store, RIGHT);
    assert.equal(result.status, 404);
    assert.deepEqual(result.body, { error: PROGRESS_LINK_OFF_MESSAGE });
    assert.equal(store.writes.length, 0);
  }
});

test('the fresh read checks the link again: gone, trashed, switched off or rotated in between answers 404', async () => {
  const changes = [
    { deletedAt: '2026-10-18T03:00:00.000Z' },
    { progressEnabled: false },
    { progressCode: 'rotatedCode9' },
  ];
  for (const change of changes) {
    const store = versionedStore();
    const find = store.findSiteByCode;
    store.findSiteByCode = async (code) => {
      const found = await find(code);
      store.touch(change);
      return found;
    };
    const result = await attempt(store, RIGHT);
    assert.equal(result.status, 404, inspect(change));
    assert.deepEqual(result.body, { error: PROGRESS_LINK_OFF_MESSAGE });
    assert.equal(store.writes.length, 0);
    assert.equal(result.cookie, undefined);
  }

  const gone = versionedStore();
  gone.readSite = async () => null;
  const result = await attempt(gone, RIGHT);
  assert.equal(result.status, 404);
  assert.equal(gone.writes.length, 0);
});

test('without a cookie key the check answers 500 and writes nothing', async (t) => {
  const log = quiet(t);
  const store = versionedStore();
  const result = await attempt(store, RIGHT, { key: null });
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: PROGRESS_UNAVAILABLE_MESSAGE });
  assert.equal(store.calls.write, 0);
  assert.equal(log.mock.callCount(), 1);
});

test('a failed read answers 500 and writes nothing', async (t) => {
  quiet(t);
  for (const step of ['findSiteByCode', 'readSite', 'resolvePhone']) {
    const store = versionedStore();
    store[step] = async () => {
      throw new Error('Firestore unavailable');
    };
    const result = await attempt(store, RIGHT);
    assert.equal(result.status, 500, step);
    assert.deepEqual(result.body, { error: PROGRESS_UNAVAILABLE_MESSAGE });
    assert.equal(store.writes.length, 0);
  }
});

test('a locked link answers 423 with the time left, for right and wrong numbers, and writes nothing', async () => {
  const locked = { failedCount: 5, lockedUntil: new Date(now + 10 * minute).toISOString(), lockCount: 1 };
  for (const last4 of [RIGHT, WRONG]) {
    const store = versionedStore({ site: { progressAccess: locked } });
    const result = await attempt(store, last4);
    assert.equal(result.status, 423);
    assert.deepEqual(result.body, { error: progressLockedMessage(600), retryAfterSeconds: 600 });
    assert.equal(result.headers['Retry-After'], '600');
    assert.equal(result.cookie, undefined);
    assert.equal(store.calls.write, 0);
    assert.deepEqual(store.doc.progressAccess, locked);
  }
});

test('a site without a customer number answers 409 and writes nothing', async () => {
  for (const phone of ['', '12']) {
    const store = versionedStore({ phone });
    const result = await attempt(store, RIGHT);
    assert.equal(result.status, 409);
    assert.deepEqual(result.body, { error: PROGRESS_NO_PHONE_MESSAGE });
    assert.equal(store.calls.write, 0);
  }
});

test('a wrong number is recorded on the version that was read, then answers 401', async () => {
  const store = versionedStore();
  const result = await attempt(store, WRONG);
  assert.equal(result.status, 401);
  assert.deepEqual(result.body, { error: PROGRESS_WRONG_LAST4_MESSAGE });
  assert.equal(result.cookie, undefined);
  assert.deepEqual(store.writes, [{ failedCount: 1, lockedUntil: '', lockCount: 0 }]);
});

test('the right number is recorded, then answers 200 with a cookie bound to the whole number', async () => {
  const store = versionedStore({ site: { progressAccess: { failedCount: 3, lockedUntil: '', lockCount: 2 } } });
  const result = await attempt(store, RIGHT);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });
  assert.deepEqual(store.writes, [{ failedCount: 0, lockedUntil: '', lockCount: 0, lastOkAt: new Date(now).toISOString() }]);

  const { cookie } = result;
  assert.deepEqual({ ...cookie, value: '' }, {
    name: progressCookieName(CODE),
    value: '',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/progress',
    maxAge: PROGRESS_COOKIE_MAX_AGE_SECONDS,
  });
  assert.equal(verifyProgressCookie(cookie.value, CODE, PHONE_DIGITS, key, now), true);
  assert.equal(verifyProgressCookie(cookie.value, CODE, '01099995678', key, now), false, 'same last four, another number');
});

test('every answer is marked private and never cached', async (t) => {
  quiet(t);
  const results = [
    await verifyProgressAttempt(null, { store: versionedStore(), storeReady: true, key, nowMs: now }),
    await attempt(versionedStore(), RIGHT, { storeReady: false }),
    await attempt(versionedStore(), RIGHT, { key: null }),
    await attempt(versionedStore({ phone: '' }), RIGHT),
    await attempt(versionedStore(), WRONG),
    await attempt(versionedStore(), RIGHT),
  ];
  const failing = versionedStore();
  failing.writeAccess = async () => {
    throw new Error('Firestore unavailable');
  };
  results.push(await attempt(failing, RIGHT));
  for (const result of results) assert.equal(result.headers['Cache-Control'], 'private, no-store', String(result.status));
});

test('five misses in a row lock the link; later attempts answer 423 and write nothing', async () => {
  const store = versionedStore();
  const statuses = [];
  for (let miss = 1; miss <= 5; miss += 1) statuses.push((await attempt(store, WRONG)).status);
  assert.deepEqual(statuses, [401, 401, 401, 401, 423]);
  assert.equal(store.writes.length, 5);
  assert.deepEqual(store.doc.progressAccess, { failedCount: 5, lockedUntil: new Date(now + 15 * minute).toISOString(), lockCount: 1 });

  for (const last4 of [WRONG, RIGHT]) {
    const result = await attempt(store, last4, { nowMs: now + minute });
    assert.equal(result.status, 423);
    assert.equal(result.body.retryAfterSeconds, 14 * 60);
    assert.equal(result.cookie, undefined);
  }
  assert.equal(store.writes.length, 5, 'nothing is written while locked');

  // Once the lock has ended, five more misses lock it for twice as long.
  const later = now + 15 * minute + 1;
  for (let miss = 1; miss <= 4; miss += 1) assert.equal((await attempt(store, WRONG, { nowMs: later })).status, 401);
  const fifth = await attempt(store, WRONG, { nowMs: later });
  assert.equal(fifth.status, 423);
  assert.equal(fifth.body.retryAfterSeconds, 30 * 60);

  // The right number after that lock has ended works and starts the escalation over.
  const ok = await attempt(store, RIGHT, { nowMs: later + 30 * minute + 1 });
  assert.equal(ok.status, 200);
  assert.equal(store.doc.progressAccess.lockCount, 0);
});

test('a burst of wrong guesses counts only the one that was recorded; the rest are told to retry', async (t) => {
  quiet(t);
  const store = versionedStore();
  holdReads(store, 8);
  const results = await Promise.all(Array.from({ length: 8 }, () => attempt(store, WRONG)));
  assert.equal(results.filter((result) => result.status === 401).length, 1);
  results.filter((result) => result.status !== 401).forEach(assertRetry);
  assert.equal(store.writes.length, 1);
  assert.equal(store.doc.progressAccess.failedCount, 1);
});

test('in a burst the right number either is the one write that commits or is told to retry, never a cookie without a write', async (t) => {
  quiet(t);
  const outcomes = [];
  for (const position of [0, 3, 7]) {
    const store = versionedStore();
    holdReads(store, 8);
    const guesses = Array.from({ length: 8 }, (_, index) => (index === position ? RIGHT : WRONG));
    const results = await Promise.all(guesses.map((last4) => attempt(store, last4)));

    const committed = results.filter((result) => result.status !== 503);
    assert.equal(committed.length, 1, `position ${position}: exactly one attempt commits`);
    assert.equal(store.writes.length, 1);
    results.filter((result) => result.status === 503).forEach(assertRetry);

    const right = results[position];
    if (right.status === 200) {
      assert.ok(right.cookie);
      assert.equal(store.writes[0].failedCount, 0);
      assert.equal(store.writes[0].lastOkAt, new Date(now).toISOString());
    } else {
      assertRetry(right);
      assert.equal(committed[0].status, 401);
    }
    results.forEach((result, index) => index !== position && assert.equal(result.cookie, undefined));
    outcomes.push(right.status);
  }
  // Both outcomes happen: the first reader commits, a later one is told to retry.
  assert.deepEqual(outcomes, [200, 503, 503]);
});

test('an attempt that read before the lock is told to retry, and the lock stays', async (t) => {
  quiet(t);
  const store = versionedStore({ site: { progressAccess: { failedCount: 4, lockedUntil: '', lockCount: 0 } } });
  const staleRead = await store.readSite('site-1');

  // The fifth miss commits and locks the link.
  assert.equal((await attempt(store, WRONG)).status, 423);
  const lock = store.doc.progressAccess;
  assert.equal(lock.lockedUntil, new Date(now + 15 * minute).toISOString());

  // The right number, checked against the state from before the lock, would clear it; its write is refused instead.
  const readNow = store.readSite;
  store.readSite = async () => structuredClone(staleRead);
  const stale = await attempt(store, RIGHT);
  assertRetry(stale);
  assert.deepEqual(store.doc.progressAccess, lock);

  // Read again, it is locked.
  store.readSite = readNow;
  assert.equal((await attempt(store, RIGHT)).status, 423);
  assert.deepEqual(store.doc.progressAccess, lock);
});

test('a write that fails for any other reason is told to retry, right or wrong, and the guess is never logged', async (t) => {
  const log = quiet(t);
  for (const last4 of [RIGHT, WRONG]) {
    const store = versionedStore();
    store.writeAccess = async () => {
      throw new Error('Firestore unavailable');
    };
    assertRetry(await attempt(store, last4));
  }
  assert.equal(log.mock.callCount(), 2);
  for (const call of log.mock.calls) {
    const logged = inspect(call.arguments, { depth: 5 });
    assert.equal(logged.includes(WRONG), false);
    assert.equal(logged.includes(RIGHT), false);
  }
});

test('a staff edit between the read and the write is told to retry, not counted', async (t) => {
  quiet(t);
  const store = versionedStore();
  const resolvePhone = store.resolvePhone;
  store.resolvePhone = async (site) => {
    store.touch({ title: '수정된 현장명' });
    return resolvePhone(site);
  };
  assertRetry(await attempt(store, WRONG));
  assert.equal(store.writes.length, 0);
  assert.equal(store.doc.title, '수정된 현장명');
});
