import test from 'node:test';
import assert from 'node:assert/strict';
import { approveSignup, isLoginIdTaken, rejectSignup, submitSignup } from '../app/api/manager/_signup-flow.ts';
import { LOGIN_ID_TAKEN_MESSAGE, UNUSABLE_LINK_MESSAGE } from '../app/lib/staff-signup-rules.ts';

const NOW = Date.parse('2026-11-21T05:00:00Z');
const DAY = 86400000;
const HANDLED = '이미 처리된 요청입니다.';
const SAME_ID = '이미 같은 아이디 계정이 있습니다.';

class Conflict extends Error {}

// In-memory store with Firestore's version rules: every write gives the document a new updateTime, and a write or delete
// with a stale updateTime (or on a missing document) throws a conflict.
function fakeStore({ links = {}, requests = {}, accounts = {}, sanityIds = [] } = {}) {
  let version = 0;
  const nextVersion = () => `v${++version}`;
  const wrap = (table) => Object.fromEntries(Object.entries(table).map(([id, record]) => [id, { record: { _id: id, ...record }, updateTime: nextVersion() }]));
  const state = { links: wrap(links), requests: wrap(requests), accounts: { ...accounts }, sanityIds: [...sanityIds] };
  const hooks = {};
  let requestCount = 0;
  const copy = (entry) => (entry ? { record: { ...entry.record }, updateTime: entry.updateTime } : null);

  const store = {
    async readLink(tokenHash) {
      return copy(state.links[tokenHash]);
    },
    async markLink(id, fields, updateTime) {
      const entry = state.links[id];
      if (!entry || (updateTime && entry.updateTime !== updateTime)) throw new Conflict('link');
      entry.record = { ...entry.record, ...fields };
      entry.updateTime = nextVersion();
    },
    async createRequest(request) {
      if (hooks.createRequest) return hooks.createRequest(request);
      const id = `req-${++requestCount}`;
      state.requests[id] = { record: { _id: id, ...request }, updateTime: nextVersion() };
      return id;
    },
    async readRequest(id) {
      const found = copy(state.requests[id]);
      if (hooks.afterReadRequest) {
        const hook = hooks.afterReadRequest;
        hooks.afterReadRequest = undefined;
        await hook();
      }
      return found;
    },
    async markRequest(id, fields, updateTime) {
      const entry = state.requests[id];
      if (!entry || (updateTime && entry.updateTime !== updateTime)) throw new Conflict('request');
      entry.record = { ...entry.record, ...fields };
      entry.updateTime = nextVersion();
      return entry.updateTime;
    },
    async deleteRequest(id, updateTime) {
      const entry = state.requests[id];
      if (updateTime && (!entry || entry.updateTime !== updateTime)) throw new Conflict('request');
      delete state.requests[id];
    },
    async loginIdInAccounts(loginId) {
      if (hooks.loginIdInAccounts) return hooks.loginIdInAccounts(loginId);
      return Object.values(state.accounts).some((account) => account.loginId === loginId) || state.sanityIds.some((id) => id.toLowerCase() === loginId);
    },
    async loginIdInPendingRequests(loginId, nowMs) {
      return Object.values(state.requests).some(({ record }) => record.loginId === loginId && nowMs - Date.parse(record.createdAt) < 30 * DAY);
    },
    async createAccount(loginId, fields) {
      if (state.accounts[loginId]) throw new Conflict('account');
      state.accounts[loginId] = { ...fields };
    },
    async hashPassword(password) {
      return `hash:${password}`;
    },
    isConflict(error) {
      return error instanceof Conflict;
    },
  };
  return { store, state, hooks };
}

const openLink = (overrides = {}) => ({ status: 'open', expiresAt: new Date(NOW + DAY).toISOString(), memo: '현장팀 박OO', ...overrides });
const fields = (overrides = {}) => ({ name: '박영희', phone: '010-1234-5678', loginId: 'Park01', password: ' pass1234 ', ...overrides });
const pending = (overrides = {}) => ({
  name: '박영희',
  phone: '01012345678',
  loginId: 'park01',
  passwordHash: 'hash:pass1234',
  linkId: 'h1',
  linkMemo: '현장팀 박OO',
  createdAt: new Date(NOW - DAY).toISOString(),
  ...overrides,
});

test('submit stores one request with a hash, never the password, and uses up the link', async () => {
  const { store, state } = fakeStore({ links: { h1: openLink() } });
  const result = await submitSignup({ tokenHash: 'h1', fields: fields() }, store, NOW);

  assert.equal(result.ok, true);
  const requests = Object.values(state.requests).map((entry) => entry.record);
  assert.equal(requests.length, 1);
  assert.deepEqual(
    { ...requests[0], _id: undefined },
    {
      _id: undefined,
      name: '박영희',
      phone: '01012345678',
      loginId: 'park01',
      passwordHash: 'hash:pass1234',
      linkId: 'h1',
      linkMemo: '현장팀 박OO',
      createdAt: new Date(NOW).toISOString(),
    },
  );
  assert.ok(!JSON.stringify(state.requests).includes('"pass1234"'));
  assert.equal(state.links.h1.record.status, 'used');
  assert.equal(state.links.h1.record.usedAt, new Date(NOW).toISOString());
  assert.equal(state.links.h1.record.requestId, result.requestId);
});

test('two submits on the same link at once: one request, the other is told the link cannot be used', async () => {
  const { store, state } = fakeStore({ links: { h1: openLink() } });
  const results = await Promise.all([
    submitSignup({ tokenHash: 'h1', fields: fields() }, store, NOW),
    submitSignup({ tokenHash: 'h1', fields: fields({ loginId: 'kim02' }) }, store, NOW),
  ]);

  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.deepEqual(results.find((result) => !result.ok), { ok: false, status: 404, error: UNUSABLE_LINK_MESSAGE });
  assert.equal(Object.keys(state.requests).length, 1);
});

test('when the request cannot be saved the link opens again, so the same link can be retried', async () => {
  const { store, state, hooks } = fakeStore({ links: { h1: openLink() } });
  hooks.createRequest = async () => {
    throw new Error('Firestore down');
  };

  await assert.rejects(submitSignup({ tokenHash: 'h1', fields: fields() }, store, NOW), /Firestore down/);
  assert.equal(state.links.h1.record.status, 'open');

  hooks.createRequest = undefined;
  const retry = await submitSignup({ tokenHash: 'h1', fields: fields() }, store, NOW);
  assert.equal(retry.ok, true);
});

test('a missing, expired, revoked or used link gives the same answer, and stores nothing', async () => {
  const { store, state } = fakeStore({
    links: {
      old: openLink({ expiresAt: new Date(NOW - 1).toISOString() }),
      revoked: openLink({ status: 'revoked' }),
      used: openLink({ status: 'used' }),
    },
  });
  for (const tokenHash of ['missing', 'old', 'revoked', 'used']) {
    assert.deepEqual(await submitSignup({ tokenHash, fields: fields() }, store, NOW), { ok: false, status: 404, error: UNUSABLE_LINK_MESSAGE });
  }
  assert.equal(Object.keys(state.requests).length, 0);
});

test('a taken id is refused before the link is used up', async () => {
  const { store, state } = fakeStore({ links: { h1: openLink(), h2: openLink() }, accounts: { kim02: { loginId: 'kim02' } }, sanityIds: ['Lee03'] });
  assert.deepEqual(await submitSignup({ tokenHash: 'h1', fields: fields({ loginId: 'kim02' }) }, store, NOW), {
    ok: false,
    status: 409,
    error: LOGIN_ID_TAKEN_MESSAGE,
  });
  assert.deepEqual(await submitSignup({ tokenHash: 'h1', fields: fields({ loginId: 'lee03' }) }, store, NOW), {
    ok: false,
    status: 409,
    error: LOGIN_ID_TAKEN_MESSAGE,
  });
  assert.equal(state.links.h1.record.status, 'open');

  // A pending request holds its id too.
  assert.equal((await submitSignup({ tokenHash: 'h1', fields: fields() }, store, NOW)).ok, true);
  assert.deepEqual(await submitSignup({ tokenHash: 'h2', fields: fields() }, store, NOW), { ok: false, status: 409, error: LOGIN_ID_TAKEN_MESSAGE });
  assert.equal(state.links.h2.record.status, 'open');
});

test('bad input is a 400 with the rule message, and the link stays open', async () => {
  const { store, state } = fakeStore({ links: { h1: openLink() } });
  assert.deepEqual(await submitSignup({ tokenHash: 'h1', fields: fields({ phone: '02-381-0489' }) }, store, NOW), {
    ok: false,
    status: 400,
    error: '휴대폰 번호를 확인해 주세요.',
  });
  assert.equal(state.links.h1.record.status, 'open');
});

test('isLoginIdTaken counts accounts and pending requests, but not requests past 30 days', async () => {
  const { store } = fakeStore({ requests: { r1: pending({ loginId: 'old01', createdAt: new Date(NOW - 31 * DAY).toISOString() }), r2: pending() } });
  assert.equal(await isLoginIdTaken(store, 'park01', NOW), true);
  assert.equal(await isLoginIdTaken(store, 'old01', NOW), false);
  assert.equal(await isLoginIdTaken(store, 'new01', NOW), false);
});

test('approve creates the account with the chosen access and removes the request', async () => {
  const { store, state } = fakeStore({ requests: { r1: pending() } });
  const result = await approveSignup({ requestId: 'r1', role: 'staff', permissions: ['sites', 'dashboard', 'accounts', 'nope'], approvedBy: 'admin' }, store, NOW);

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(state.accounts.park01, {
    name: '박영희',
    phone: '01012345678',
    loginId: 'park01',
    passwordHash: 'hash:pass1234',
    role: 'staff',
    permissions: ['dashboard', 'sites'],
    isActive: true,
    createdAt: new Date(NOW).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    approvedBy: 'admin',
    approvedAt: new Date(NOW).toISOString(),
    origin: 'signup',
  });
  assert.equal(state.requests.r1, undefined);
});

test('approve checks the decision first', async () => {
  const { store, state } = fakeStore({ requests: { r1: pending() } });
  assert.deepEqual(await approveSignup({ requestId: 'r1', role: 'staff', permissions: [], approvedBy: 'admin' }, store, NOW), {
    ok: false,
    status: 400,
    error: '권한을 하나 이상 고르거나 총괄 관리자로 승인해 주세요.',
  });
  assert.deepEqual(state.accounts, {});
});

test('a request past 30 days cannot be approved', async () => {
  const { store, state } = fakeStore({ requests: { r1: pending({ createdAt: new Date(NOW - 30 * DAY).toISOString() }) } });
  assert.deepEqual(await approveSignup({ requestId: 'r1', role: 'admin', permissions: [], approvedBy: 'admin' }, store, NOW), {
    ok: false,
    status: 410,
    error: '30일이 지나 지워진 요청입니다. 새 링크로 다시 받아 주세요.',
  });
  assert.deepEqual(state.accounts, {});
});

test('approving a request that is gone says it was already handled', async () => {
  const { store } = fakeStore();
  assert.deepEqual(await approveSignup({ requestId: 'r9', role: 'admin', permissions: [], approvedBy: 'admin' }, store, NOW), {
    ok: false,
    status: 404,
    error: HANDLED,
  });
});

test('reject while an approval is in progress is refused', async () => {
  const { store, state } = fakeStore({ requests: { r1: pending({ status: 'approving', approvingAt: new Date(NOW - 1000).toISOString() }) } });
  assert.deepEqual(await rejectSignup({ requestId: 'r1' }, store, NOW), { ok: false, status: 409, error: HANDLED });
  assert.ok(state.requests.r1);
});

test('approve while a reject removes the request: only the reject lands, and no account is made', async () => {
  const { store, state, hooks } = fakeStore({ requests: { r1: pending() } });
  let rejected;
  hooks.afterReadRequest = async () => {
    rejected = await rejectSignup({ requestId: 'r1' }, store, NOW);
  };

  const approved = await approveSignup({ requestId: 'r1', role: 'staff', permissions: ['sites'], approvedBy: 'admin' }, store, NOW);
  assert.deepEqual(rejected, { ok: true });
  assert.deepEqual(approved, { ok: false, status: 409, error: HANDLED });
  assert.deepEqual(state.accounts, {});
});

test('reject while an approval finishes: only the approval lands', async () => {
  const { store, state, hooks } = fakeStore({ requests: { r1: pending() } });
  let approved;
  hooks.afterReadRequest = async () => {
    approved = await approveSignup({ requestId: 'r1', role: 'staff', permissions: ['sites'], approvedBy: 'admin' }, store, NOW);
  };

  const rejected = await rejectSignup({ requestId: 'r1' }, store, NOW);
  assert.deepEqual(approved, { ok: true });
  assert.deepEqual(rejected, { ok: false, status: 409, error: HANDLED });
  assert.ok(state.accounts.park01);
});

test('two requests for the same id: the second approval is refused and its request stays', async () => {
  const { store, state } = fakeStore({ requests: { r1: pending(), r2: pending({ name: '박영수', linkId: 'h2' }) } });
  assert.deepEqual(await approveSignup({ requestId: 'r1', role: 'staff', permissions: ['sites'], approvedBy: 'admin' }, store, NOW), { ok: true });
  assert.deepEqual(await approveSignup({ requestId: 'r2', role: 'staff', permissions: ['sites'], approvedBy: 'admin' }, store, NOW), {
    ok: false,
    status: 409,
    error: SAME_ID,
  });
  assert.equal(state.accounts.park01.name, '박영희');
  assert.ok(state.requests.r2);
  assert.notEqual(state.requests.r2.record.status, 'approving');
});

test('when the account appears between the check and the create, the request is released for a later decision', async () => {
  const { store, state, hooks } = fakeStore({ requests: { r1: pending() }, accounts: { park01: { loginId: 'park01', name: '먼저' } } });
  hooks.loginIdInAccounts = async () => false;

  assert.deepEqual(await approveSignup({ requestId: 'r1', role: 'staff', permissions: ['sites'], approvedBy: 'admin' }, store, NOW), {
    ok: false,
    status: 409,
    error: SAME_ID,
  });
  assert.equal(state.accounts.park01.name, '먼저');
  assert.notEqual(state.requests.r1.record.status, 'approving');
  assert.deepEqual(await rejectSignup({ requestId: 'r1' }, store, NOW), { ok: true });
});

test('an approval that stopped half way does not lock the request for good', async () => {
  const { store, state } = fakeStore({ requests: { r1: pending({ status: 'approving', approvingAt: new Date(NOW - 5 * 60000).toISOString() }) } });
  assert.deepEqual(await rejectSignup({ requestId: 'r1' }, store, NOW), { ok: true });
  assert.equal(state.requests.r1, undefined);
});

test('rejecting a request that is gone says it was already handled', async () => {
  const { store } = fakeStore();
  assert.deepEqual(await rejectSignup({ requestId: 'r9' }, store, NOW), { ok: false, status: 404, error: HANDLED });
});
