import test from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { PROGRESS_LINK_OFF_MESSAGE, PROGRESS_RETRY_MESSAGE, PROGRESS_UNAVAILABLE_MESSAGE } from '../app/lib/progress-public.ts';
import { PROGRESS_COOKIE_MAX_AGE_SECONDS, progressCookieName, signProgressCookie } from '../app/api/progress/_access.ts';
import { VERIFY_BAD_REQUEST_MESSAGE } from '../app/api/progress/_verify.ts';
import { ACQUISITION_NEEDS_CHECK_MESSAGE, submitAcquisition } from '../app/api/progress/_acquisition.ts';
import { ACQUISITION_OTHER_EMPTY_MESSAGE, ACQUISITION_PICK_MESSAGE, DEFAULT_ACQUISITION_OPTIONS } from '../app/lib/acquisition.ts';

const CODE = 'abcDEF123_-abcDEF123_-';
const PHONE = '010-1234-5678';
const PHONE_DIGITS = '01012345678';
// Not part of any id, message or label, so a log line that contains it can only have come from the answer.
const OTHER_TEXT = '동네 엘리베이터 광고';
const key = Buffer.from('acquisition-test-key');
const now = Date.UTC(2026, 9, 23, 5, 0, 0);
const AT = new Date(now).toISOString();
const goodCookie = signProgressCookie(CODE, PHONE_DIGITS, key, now);

class PreconditionFailed extends Error {}

// A versioned store like Firestore's: a write lands only on the version it was read at.
function versionedStore({ site = {}, phone = PHONE, options = DEFAULT_ACQUISITION_OPTIONS, beforeWrite = null, failRead = false } = {}) {
  let version = 1;
  let doc = { _id: 'site-1', title: '테스트 현장', progressCode: CODE, progressEnabled: true, ...site };
  const calls = { write: 0 };
  return {
    calls,
    get doc() {
      return doc;
    },
    async findSiteByCode(code) {
      if (failRead) throw new Error('store is down');
      return doc.progressCode === code && !doc.deletedAt ? structuredClone(doc) : null;
    },
    async readSite(id) {
      return id === doc._id ? { site: structuredClone(doc), updateTime: `v${version}` } : null;
    },
    async resolvePhone() {
      return phone;
    },
    async readOptions() {
      return structuredClone(options);
    },
    async writeAcquisition(id, acquisition, updateTime) {
      calls.write += 1;
      // Something else (staff, the verify check) wrote the site between our read and our write.
      if (beforeWrite) {
        doc = { ...doc, ...beforeWrite };
        version += 1;
        beforeWrite = null;
      }
      if (id !== doc._id || updateTime !== `v${version}`) throw new PreconditionFailed(`stored version is v${version}, not ${updateTime}`);
      doc = { ...doc, acquisition: structuredClone(acquisition) };
      version += 1;
    },
  };
}

const deps = (store, overrides = {}) => ({
  store,
  storeReady: true,
  key,
  readCookie: (name) => (name === progressCookieName(CODE) ? goodCookie : undefined),
  nowMs: now,
  ...overrides,
});

const instagram = { code: CODE, answer: { optionId: 'instagram' } };

test('a verified customer answer is stored once with who and when', async () => {
  const store = versionedStore();
  const result = await submitAcquisition(instagram, deps(store));
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });
  assert.deepEqual(store.doc.acquisition, { status: 'answered', optionId: 'instagram', label: '인스타그램', by: 'customer', at: AT });
});

test('skipping is stored too, so the customer is not asked again', async () => {
  const store = versionedStore();
  const result = await submitAcquisition({ code: CODE, skip: true }, deps(store));
  assert.equal(result.status, 200);
  assert.deepEqual(store.doc.acquisition, { status: 'skipped', by: 'customer', at: AT });
});

test('기타 keeps the cleaned text', async () => {
  const store = versionedStore();
  await submitAcquisition({ code: CODE, answer: { optionId: 'other', other: ` ${OTHER_TEXT}\n` } }, deps(store));
  assert.deepEqual(store.doc.acquisition, { status: 'answered', optionId: 'other', label: '기타', other: OTHER_TEXT, by: 'customer', at: AT });
});

test('a malformed request is refused before anything is read', async () => {
  for (const body of [null, 'x', { code: 1, skip: true }, { code: CODE }, { code: CODE, answer: 'instagram' }]) {
    const result = await submitAcquisition(body, deps(versionedStore()));
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.deepEqual(result.body, { error: VERIFY_BAD_REQUEST_MESSAGE });
  }
});

test('an unknown, switched-off, rotated or trashed link and a missing store all answer like a link that is off', async () => {
  const cases = [
    [{ code: 'short', skip: true }, versionedStore(), {}],
    [instagram, versionedStore(), { storeReady: false }],
    [instagram, versionedStore({ site: { progressEnabled: false } }), {}],
    [instagram, versionedStore({ site: { progressCode: 'zzzDEF123_-abcDEF123_-' } }), {}],
    [instagram, versionedStore({ site: { deletedAt: '2026-10-22T00:00:00Z' } }), {}],
  ];
  for (const [body, store, overrides] of cases) {
    const result = await submitAcquisition(body, deps(store, overrides));
    assert.equal(result.status, 404);
    assert.deepEqual(result.body, { error: PROGRESS_LINK_OFF_MESSAGE });
    assert.equal(store.calls.write, 0);
  }
});

test('without a valid phone-check cookie nothing is stored and the page is told to check again', async () => {
  const expired = signProgressCookie(CODE, PHONE_DIGITS, key, now - (PROGRESS_COOKIE_MAX_AGE_SECONDS + 60) * 1000);
  const otherPhone = signProgressCookie(CODE, '01099998888', key, now);
  for (const cookie of [undefined, 'garbage', expired, otherPhone]) {
    const store = versionedStore();
    const result = await submitAcquisition(instagram, deps(store, { readCookie: () => cookie }));
    assert.equal(result.status, 401);
    assert.deepEqual(result.body, { error: ACQUISITION_NEEDS_CHECK_MESSAGE });
    assert.equal(store.calls.write, 0);
  }
  // A site whose customer number is gone cannot be checked either.
  const noPhone = versionedStore({ phone: '' });
  assert.equal((await submitAcquisition(instagram, deps(noPhone))).status, 401);
  assert.equal(ACQUISITION_NEEDS_CHECK_MESSAGE, '본인 확인이 필요합니다. 페이지를 새로고침해 주세요.');
});

test('a hidden option or an empty 기타 is refused without a write', async () => {
  const options = DEFAULT_ACQUISITION_OPTIONS.map((option) => (option.id === 'walk-in' ? { ...option, hidden: true } : option));
  const store = versionedStore({ options });
  const hidden = await submitAcquisition({ code: CODE, answer: { optionId: 'walk-in' } }, deps(store));
  assert.equal(hidden.status, 400);
  assert.deepEqual(hidden.body, { error: ACQUISITION_PICK_MESSAGE });
  const empty = await submitAcquisition({ code: CODE, answer: { optionId: 'other', other: '   ' } }, deps(store));
  assert.equal(empty.status, 400);
  assert.deepEqual(empty.body, { error: ACQUISITION_OTHER_EMPTY_MESSAGE });
  assert.equal(store.calls.write, 0);
});

test('the first answer wins: a site that already has one keeps it', async () => {
  const first = { status: 'answered', optionId: 'friend', label: '지인 소개', by: 'staff', staffId: 'kim', at: '2026-10-20T00:00:00.000Z' };
  const store = versionedStore({ site: { acquisition: first } });
  const result = await submitAcquisition(instagram, deps(store));
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });
  assert.equal(store.calls.write, 0);
  assert.deepEqual(store.doc.acquisition, first);
});

test('a write that lost a race to another answer still reports success and keeps that answer', async () => {
  const other = { status: 'skipped', by: 'customer', at: '2026-10-23T04:59:59.000Z' };
  const store = versionedStore({ beforeWrite: { acquisition: other } });
  const result = await submitAcquisition(instagram, deps(store));
  assert.equal(result.status, 200);
  assert.equal(store.calls.write, 1);
  assert.deepEqual(store.doc.acquisition, other);
});

test('a write that lost a race to another kind of edit asks for a retry, after one attempt', async () => {
  const store = versionedStore({ beforeWrite: { progressAccess: { failedCount: 0, lockedUntil: '', lastOkAt: AT } } });
  const result = await submitAcquisition(instagram, deps(store));
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, { error: PROGRESS_RETRY_MESSAGE, retry: true });
  assert.equal(store.calls.write, 1);
  assert.equal(store.doc.acquisition, undefined);
});

test('a store failure or a missing key answers unavailable', async () => {
  assert.deepEqual((await submitAcquisition(instagram, deps(versionedStore({ failRead: true })))).body, { error: PROGRESS_UNAVAILABLE_MESSAGE });
  const noKey = await submitAcquisition(instagram, deps(versionedStore(), { key: null }));
  assert.equal(noKey.status, 500);
  assert.deepEqual(noKey.body, { error: PROGRESS_UNAVAILABLE_MESSAGE });
});

test('every answer is private and the logs never carry the code or the answer', async () => {
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.map((arg) => (typeof arg === 'string' ? arg : inspect(arg, { depth: 5 }))).join(' '));
  try {
    const bodies = [
      [{ code: CODE, answer: { optionId: 'other', other: OTHER_TEXT } }, versionedStore()],
      [{ code: CODE, answer: { optionId: 'other', other: OTHER_TEXT } }, versionedStore({ failRead: true })],
      [{ code: CODE, answer: { optionId: 'other', other: OTHER_TEXT } }, versionedStore({ beforeWrite: { title: '바뀜' } })],
      [{ code: CODE, answer: { optionId: 'other', other: OTHER_TEXT } }, versionedStore()],
    ];
    for (const [index, [body, store]] of bodies.entries()) {
      const result = await submitAcquisition(body, deps(store, index === 3 ? { key: null } : {}));
      assert.equal(result.headers['Cache-Control'], 'private, no-store');
    }
  } finally {
    console.error = original;
  }
  for (const line of logged) {
    assert.ok(!line.includes(CODE), line);
    assert.ok(!line.includes(OTHER_TEXT), line);
  }
});
