import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LINK_DAYS,
  LINK_DAYS,
  LOGIN_ID_TAKEN_MESSAGE,
  PERMISSION_PRESETS,
  REQUEST_RETENTION_DAYS,
  RESERVED_LOGIN_IDS,
  UNUSABLE_LINK_MESSAGE,
  approvalError,
  formStartedAt,
  idAccountUpdate,
  isLinkUsable,
  isRequestExpired,
  linkExpiresAt,
  loginIdError,
  normalizeLoginId,
  passwordError,
  signupLinkUrl,
  validateSignupInput,
} from '../app/lib/staff-signup-rules.ts';

const FORMAT_ERROR = '아이디는 영문 소문자·숫자와 . _ - 로 4~20자입니다.';
const PASSWORD_ERROR = '비밀번호는 8자 이상 72자 이하로 입력해 주세요.';
const DAY = 86400000;

test('constants match the spec', () => {
  assert.deepEqual([...RESERVED_LOGIN_IDS], ['admin', 'manager']);
  assert.deepEqual([...LINK_DAYS], [1, 3, 7]);
  assert.equal(DEFAULT_LINK_DAYS, 7);
  assert.equal(REQUEST_RETENTION_DAYS, 30);
  assert.equal(UNUSABLE_LINK_MESSAGE, '쓸 수 없는 링크입니다. 총괄 관리자에게 새 링크를 받아 주세요.');
  assert.equal(LOGIN_ID_TAKEN_MESSAGE, '이미 사용 중인 아이디입니다.');
});

test('normalizeLoginId trims and lowercases, and anything that is not text becomes empty', () => {
  assert.equal(normalizeLoginId('  Park01 '), 'park01');
  assert.equal(normalizeLoginId(1234), '');
  assert.equal(normalizeLoginId(null), '');
  assert.equal(normalizeLoginId({ loginId: 'x' }), '');
});

test('loginIdError accepts 4-20 lowercase letters, digits and . _ -', () => {
  assert.equal(loginIdError('park01'), null);
  assert.equal(loginIdError('a.b-c_d'), null);
  assert.equal(loginIdError('abcd'), null);
  assert.equal(loginIdError('a'.repeat(20)), null);
  assert.equal(loginIdError('abc'), FORMAT_ERROR);
  assert.equal(loginIdError('a'.repeat(21)), FORMAT_ERROR);
  assert.equal(loginIdError('park@x.kr'), FORMAT_ERROR);
  assert.equal(loginIdError('Park01'), FORMAT_ERROR);
  assert.equal(loginIdError(''), FORMAT_ERROR);
});

test('loginIdError refuses the reserved master ids', () => {
  assert.equal(loginIdError('admin'), '쓸 수 없는 아이디입니다.');
  assert.equal(loginIdError('manager'), '쓸 수 없는 아이디입니다.');
});

test('passwordError checks 8-72 characters after trimming, like the login does', () => {
  assert.equal(passwordError('1234567'), PASSWORD_ERROR);
  assert.equal(passwordError('  1234567  '), PASSWORD_ERROR);
  assert.equal(passwordError('  12345678  '), null);
  assert.equal(passwordError('a'.repeat(72)), null);
  assert.equal(passwordError('a'.repeat(73)), PASSWORD_ERROR);
});

test('validateSignupInput returns the trimmed, normalized values', () => {
  const result = validateSignupInput({ name: ' 박영희 ', phone: '+82 10-1234-5678', loginId: ' Park01 ', password: ' pass1234 ' });
  assert.deepEqual(result, { ok: true, value: { name: '박영희', phone: '01012345678', loginId: 'park01', password: 'pass1234' } });
});

test('validateSignupInput explains the first problem', () => {
  const base = { name: '박영희', phone: '010-1234-5678', loginId: 'park01', password: 'pass1234' };
  assert.deepEqual(validateSignupInput({ ...base, name: '  ' }), { ok: false, error: '이름을 입력해 주세요.' });
  assert.deepEqual(validateSignupInput({ ...base, name: '가'.repeat(31) }), { ok: false, error: '이름은 30자까지 입력할 수 있습니다.' });
  assert.deepEqual(validateSignupInput({ ...base, phone: '02-381-0489' }), { ok: false, error: '휴대폰 번호를 확인해 주세요.' });
  assert.deepEqual(validateSignupInput({ ...base, loginId: 'ab' }), { ok: false, error: FORMAT_ERROR });
  assert.deepEqual(validateSignupInput({ ...base, loginId: 'Admin' }), { ok: false, error: '쓸 수 없는 아이디입니다.' });
  assert.deepEqual(validateSignupInput({ ...base, password: 'short' }), { ok: false, error: PASSWORD_ERROR });
  assert.deepEqual(validateSignupInput({ ...base, password: 12345678 }), { ok: false, error: PASSWORD_ERROR });
});

test('isLinkUsable is true only for an open link that has not expired', () => {
  const now = Date.parse('2026-11-21T00:00:00Z');
  const future = '2026-11-22T00:00:00.000Z';
  const past = '2026-11-20T00:00:00.000Z';
  assert.equal(isLinkUsable({ status: 'open', expiresAt: future }, now), true);
  assert.equal(isLinkUsable({ status: 'used', expiresAt: future }, now), false);
  assert.equal(isLinkUsable({ status: 'revoked', expiresAt: future }, now), false);
  assert.equal(isLinkUsable({ status: 'open', expiresAt: past }, now), false);
  assert.equal(isLinkUsable({ status: 'open', expiresAt: '2026-11-21T00:00:00.000Z' }, now), false);
  assert.equal(isLinkUsable({ status: 'open', expiresAt: 'soon' }, now), false);
  assert.equal(isLinkUsable({ status: 'open' }, now), false);
  assert.equal(isLinkUsable(null, now), false);
});

test('linkExpiresAt accepts only 1, 3 or 7 days as numbers', () => {
  const now = Date.parse('2026-11-21T00:00:00Z');
  assert.equal(linkExpiresAt(7, now), '2026-11-28T00:00:00.000Z');
  assert.equal(linkExpiresAt(1, now), '2026-11-22T00:00:00.000Z');
  assert.equal(linkExpiresAt(3, now), '2026-11-24T00:00:00.000Z');
  assert.equal(linkExpiresAt(2, now), null);
  assert.equal(linkExpiresAt('7', now), null);
  assert.equal(linkExpiresAt(undefined, now), null);
});

test('isRequestExpired: a request is kept for 30 days, and one without a date counts as expired', () => {
  const created = Date.parse('2026-11-01T00:00:00Z');
  const createdAt = new Date(created).toISOString();
  assert.equal(isRequestExpired({ createdAt }, created + 30 * DAY - 3600000), false);
  assert.equal(isRequestExpired({ createdAt }, created + 30 * DAY), true);
  assert.equal(isRequestExpired({}, created), true);
  assert.equal(isRequestExpired({ createdAt: 'yesterday' }, created), true);
});

test('PERMISSION_PRESETS are the spec starting sets', () => {
  const byLabel = Object.fromEntries(PERMISSION_PRESETS.map((preset) => [preset.label, [...preset.permissions]]));
  assert.deepEqual(byLabel, {
    현장팀: ['dashboard', 'sites'],
    '견적·디자인': ['dashboard', 'customers', 'sites', 'estimates'],
    사무: ['dashboard', 'consultations', 'customers', 'sites', 'sales'],
  });
});

test('approvalError needs a role, and a staff approval needs at least one known permission', () => {
  const NONE = '권한을 하나 이상 고르거나 총괄 관리자로 승인해 주세요.';
  assert.equal(approvalError({ role: 'admin', permissions: [] }), null);
  assert.equal(approvalError({ role: 'staff', permissions: ['sites'] }), null);
  assert.equal(approvalError({ role: 'staff', permissions: [] }), NONE);
  assert.equal(approvalError({ role: 'staff', permissions: ['boss', 'everything'] }), NONE);
  assert.equal(approvalError({ role: 'staff', permissions: ['accounts'] }), NONE);
  assert.equal(approvalError({ role: 'staff' }), NONE);
  assert.equal(approvalError({ role: 'boss', permissions: ['sites'] }), '역할을 골라 주세요.');
  assert.equal(approvalError({ role: undefined, permissions: ['sites'] }), '역할을 골라 주세요.');
});

test('signupLinkUrl puts the token after # on the join page', () => {
  assert.equal(signupLinkUrl('https://www.wevedesign.co.kr/', 'abc'), 'https://www.wevedesign.co.kr/manager-weve-7519/join#abc');
  assert.equal(signupLinkUrl('http://localhost:3000', 'x-y_z'), 'http://localhost:3000/manager-weve-7519/join#x-y_z');
});

test('idAccountUpdate clears the phone number when the account is turned off', () => {
  const result = idAccountUpdate({ name: '박영희', phone: '010-1234-5678', role: 'staff', permissions: ['sites'], isActive: false });
  assert.equal(result.ok, true);
  assert.equal(result.fields.phone, '');
  assert.equal(result.fields.isActive, false);
});

test('idAccountUpdate keeps a valid phone (or none) on an active account', () => {
  const on = idAccountUpdate({ name: ' 박영희 ', phone: '010-1234-5678', role: 'staff', permissions: ['sites', 'nope'], isActive: true });
  assert.deepEqual(on, { ok: true, fields: { name: '박영희', phone: '01012345678', role: 'staff', permissions: ['sites'], isActive: true } });
  const empty = idAccountUpdate({ name: '박영희', phone: ' ', role: 'staff', permissions: ['sites'], isActive: true });
  assert.equal(empty.ok, true);
  assert.equal(empty.fields.phone, '');
});

test('idAccountUpdate refuses a bad phone or an empty name', () => {
  assert.deepEqual(idAccountUpdate({ name: '박영희', phone: '02-381-0489', role: 'staff', permissions: [], isActive: true }), {
    ok: false,
    error: '휴대폰 번호를 확인해 주세요.',
  });
  assert.deepEqual(idAccountUpdate({ name: ' ', phone: '', role: 'staff', permissions: [], isActive: true }), { ok: false, error: '이름을 입력해 주세요.' });
  assert.deepEqual(idAccountUpdate({ name: '가'.repeat(31), phone: '', role: 'staff', permissions: [], isActive: true }), {
    ok: false,
    error: '이름은 30자까지 입력할 수 있습니다.',
  });
});

test('idAccountUpdate keeps the normalized permissions for an admin (the session grants all of them)', () => {
  const admin = idAccountUpdate({ name: '김동호', phone: '', role: 'admin', permissions: ['sites', 'x'], isActive: true });
  assert.deepEqual(admin.fields.permissions, ['sites']);
  assert.equal(admin.fields.role, 'admin');
});

// The phone measures how long the form was open with its own clock; the server turns that into a start time on its clock,
// so a phone whose clock is off is never mistaken for a bot.
test('formStartedAt turns the time the form was open into a server start time', () => {
  const now = Date.parse('2026-11-22T00:00:00Z');
  assert.equal(formStartedAt(45000, now), now - 45000);
  assert.equal(formStartedAt(0, now), now);
  assert.equal(formStartedAt(-5, now), undefined);
  assert.equal(formStartedAt('45000', now), undefined);
  assert.equal(formStartedAt(Number.NaN, now), undefined);
  assert.equal(formStartedAt(undefined, now), undefined);
});
