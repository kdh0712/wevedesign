import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MY_RECEIPTS_LIMIT,
  RECEIPT_AMOUNT_MAX,
  RECEIPT_MAX_PHOTOS,
  RECEIPT_MEMO_MAX,
  SITE_RECEIPTS_COLLECTION,
  canChangeReceipt,
  isReceiptId,
  isReceiptPhotoPathname,
  lockedReceiptIds,
  newReceiptRecord,
  normalizeReceiptId,
  parseReceiptAction,
  parseReceiptAmount,
  receiptIdsOfWorkLines,
  receiptPhoneLabel,
  receiptPickerGroups,
  receiptVersionStatus,
  receiptWorkLineDraft,
  toReceiptView,
} from '../app/lib/site-receipts.ts';

// 현장 영수증함: receipts snapped on the phone, moved into the 실행내역서 later on the PC.
// Spec: docs/superpowers/specs/2026-11-24-site-receipts-design.md

const RECEIPT_ID = `rc-${'a'.repeat(24)}`;
const OTHER_ID = `rc-${'b'.repeat(24)}`;
const photo = (n = 1) => ({ id: String(n).repeat(16).slice(0, 16).replace(/[^0-9a-f]/g, 'a'), pathname: `receipts/${String(n).repeat(24).slice(0, 24)}.jpg`, width: 1200, height: 1600 });
const uploader = { id: 'uid-kim', loginId: 'kim', name: '김가영', role: 'staff', permissions: ['sites'] };
const otherStaff = { id: 'uid-lee', loginId: 'lee', name: '이나래', role: 'staff', permissions: ['sites'] };
const estimator = { id: 'uid-park', loginId: 'park', name: '박다솜', role: 'staff', permissions: ['estimates'] };
const admin = { id: 'uid-boss', loginId: 'boss', name: '대표', role: 'admin', permissions: [] };

test('constants and ids', () => {
  assert.equal(SITE_RECEIPTS_COLLECTION, 'siteReceipts');
  assert.equal(RECEIPT_MAX_PHOTOS, 3);
  assert.equal(RECEIPT_MEMO_MAX, 100);
  assert.equal(RECEIPT_AMOUNT_MAX, 100_000_000);
  assert.equal(MY_RECEIPTS_LIMIT, 50);
  assert.equal(isReceiptId(RECEIPT_ID), true);
  for (const value of ['rc-abc', `sn-${'a'.repeat(24)}`, `rc-${'A'.repeat(24)}`, 42, null]) assert.equal(isReceiptId(value), false, String(value));
  assert.equal(isReceiptPhotoPathname(`receipts/${'0'.repeat(24)}.jpg`), true);
  assert.equal(isReceiptPhotoPathname(`receipts/${'0'.repeat(24)}.webp`), true);
  for (const value of [`progress/${'0'.repeat(24)}.jpg`, `receipts/${'0'.repeat(23)}.jpg`, `receipts/${'0'.repeat(24)}.gif`, '']) {
    assert.equal(isReceiptPhotoPathname(value), false, value);
  }
  assert.equal(normalizeReceiptId(RECEIPT_ID), RECEIPT_ID);
  assert.equal(normalizeReceiptId('rc-nope'), '');
  assert.equal(normalizeReceiptId(undefined), '');
});

test('parseReceiptAmount: blank is no amount; digits with commas, spaces or 원 are read; anything else is refused', () => {
  for (const value of ['', '   ', null, undefined]) assert.deepEqual(parseReceiptAmount(value), { ok: true, amount: null }, String(value));
  for (const value of ['32000', ' 32,000 ', '32000원', '32,000 원', 32000]) assert.deepEqual(parseReceiptAmount(value), { ok: true, amount: 32000 }, String(value));
  assert.deepEqual(parseReceiptAmount('0'), { ok: true, amount: 0 });
  assert.deepEqual(parseReceiptAmount('100,000,000'), { ok: true, amount: RECEIPT_AMOUNT_MAX });
  for (const value of ['3.2만', '-5', '1e5', '12.5', 1.5, -1, 'abc', '100000001', 100000001, {}]) {
    const result = parseReceiptAmount(value);
    assert.equal(result.ok, false, String(value));
    assert.ok(result.error, String(value));
  }
});

test('parseReceiptAction: create rebuilds photos and checks site, photos, amount and memo', () => {
  const body = { action: 'create', siteId: 'site-1', photos: [photo(1), photo(2)], amount: '32,000', memo: '  타일 본드 2통 ' };
  const blank = { process: '', note: '', receiptDate: '' };
  assert.deepEqual(parseReceiptAction(body), { ok: true, action: 'create', siteId: 'site-1', photos: [photo(1), photo(2)], amount: 32000, memo: '타일 본드 2통', ...blank });
  assert.deepEqual(parseReceiptAction({ ...body, amount: '', memo: '' }), { ok: true, action: 'create', siteId: 'site-1', photos: [photo(1), photo(2)], amount: null, memo: '', ...blank });
  // 공종 · 비고 · 날짜 (spec 2026-11-24-phone-work-lines) are optional and checked.
  assert.deepEqual(parseReceiptAction({ ...body, process: ' 타일 ', note: ' 본드 ', receiptDate: '2026-11-20' }), {
    ok: true,
    action: 'create',
    siteId: 'site-1',
    photos: [photo(1), photo(2)],
    amount: 32000,
    memo: '타일 본드 2통',
    process: '타일',
    note: '본드',
    receiptDate: '2026-11-20',
  });
  // Extra fields on a photo are dropped, not stored.
  assert.deepEqual(parseReceiptAction({ ...body, photos: [{ ...photo(1), extra: 'x' }] }).photos, [photo(1)]);

  const refused = (override) => {
    const result = parseReceiptAction({ ...body, ...override });
    assert.equal(result.ok, false, JSON.stringify(override));
    return result.error;
  };
  assert.match(refused({ siteId: '' }), /현장/);
  assert.match(refused({ photos: [] }), /사진/);
  assert.match(refused({ photos: [photo(1), photo(2), photo(3), photo(4)] }), /3장/);
  // A photo the browser was shown (a signed url) or a progress photo is not a receipt photo it uploaded.
  assert.match(refused({ photos: [{ ...photo(1), url: 'https://x' }] }), /사진/);
  assert.match(refused({ photos: [{ ...photo(1), pathname: `progress/${'1'.repeat(24)}.jpg` }] }), /사진/);
  assert.match(refused({ photos: [{ ...photo(1), width: 0 }] }), /사진/);
  assert.match(refused({ amount: '3.2만' }), /금액/);
  assert.match(refused({ memo: '가'.repeat(101) }), /100자/);
  assert.match(refused({ process: '가'.repeat(41) }), /40자/);
  assert.match(refused({ note: '가'.repeat(101) }), /100자/);
  assert.match(refused({ receiptDate: '2026-02-30' }), /날짜/);
  assert.equal(parseReceiptAction({ ...body, memo: '가'.repeat(100) }).ok, true);
});

test('parseReceiptAction: update, setSkipped and delete need a receipt id', () => {
  assert.deepEqual(parseReceiptAction({ action: 'update', id: RECEIPT_ID, siteId: 'site-2', amount: '5000', memo: '철물', process: '목공', note: '', receiptDate: '' }), {
    ok: true,
    action: 'update',
    id: RECEIPT_ID,
    siteId: 'site-2',
    amount: 5000,
    memo: '철물',
    process: '목공',
    note: '',
    receiptDate: '',
  });
  assert.deepEqual(parseReceiptAction({ action: 'setSkipped', id: RECEIPT_ID, skipped: true }), { ok: true, action: 'setSkipped', id: RECEIPT_ID, skipped: true });
  assert.deepEqual(parseReceiptAction({ action: 'delete', id: RECEIPT_ID }), { ok: true, action: 'delete', id: RECEIPT_ID });
  for (const body of [
    { action: 'update', id: 'nope', siteId: 'site-2', amount: '', memo: '' },
    { action: 'update', id: RECEIPT_ID, siteId: '', amount: '', memo: '' },
    { action: 'setSkipped', id: RECEIPT_ID, skipped: 'yes' },
    { action: 'delete' },
    { action: 'drop', id: RECEIPT_ID },
    null,
    'create',
  ]) {
    assert.equal(parseReceiptAction(body).ok, false, JSON.stringify(body));
  }
});

test('newReceiptRecord and toReceiptView: the writer comes from the session and a browser never sees login ids', () => {
  const record = newReceiptRecord({ id: RECEIPT_ID, siteId: 'site-1', photos: [photo(1)], amount: 32000, memo: '본드', process: '타일', note: '거실' }, uploader, '2026-11-24T01:00:00.000Z', '2026-11-24');
  assert.deepEqual(record, {
    _id: RECEIPT_ID,
    siteId: 'site-1',
    photos: [photo(1)],
    amount: 32000,
    memo: '본드',
    process: '타일',
    note: '거실',
    receiptDate: '2026-11-24',
    createdAt: '2026-11-24T01:00:00.000Z',
    createdBy: 'kim',
    createdById: 'uid-kim',
    createdByName: '김가영',
  });

  const mine = toReceiptView(record, uploader, new Set());
  assert.deepEqual(mine, {
    id: RECEIPT_ID,
    siteId: 'site-1',
    photos: [photo(1)],
    amount: 32000,
    memo: '본드',
    process: '타일',
    note: '거실',
    receiptDate: '2026-11-24',
    createdAt: '2026-11-24T01:00:00.000Z',
    createdByName: '김가영',
    mine: true,
    skipped: null,
    locked: false,
  });
  assert.equal('createdBy' in mine, false);
  assert.equal('createdById' in mine, false);
  // "Mine" follows the account, not the login id: a Firebase account's login id can be its auth email at login and its
  // profile email (or uid) after the phone's hourly session trade.
  assert.equal(toReceiptView(record, { ...uploader, loginId: 'kim@other-mail' }, new Set()).mine, true);
  assert.equal(toReceiptView(record, { ...otherStaff, loginId: 'kim' }, new Set()).mine, false);
  assert.equal(toReceiptView(record, otherStaff, new Set()).mine, false);
  assert.equal(toReceiptView(record, otherStaff, new Set([RECEIPT_ID])).locked, true);

  const skipped = toReceiptView({ ...record, skippedAt: '2026-11-25T00:00:00.000Z', skippedBy: 'park', skippedByName: '박다솜' }, uploader, new Set());
  assert.deepEqual(skipped.skipped, { at: '2026-11-25T00:00:00.000Z', byName: '박다솜' });
  assert.equal('skippedBy' in skipped, false);

  // No amount is stored as null; broken records are not shown.
  assert.equal(toReceiptView({ ...record, amount: null }, uploader, new Set()).amount, null);
  assert.equal(toReceiptView({ ...record, _id: 'nope' }, uploader, new Set()), null);
  assert.equal(toReceiptView({ ...record, siteId: '' }, uploader, new Set()), null);
  assert.deepEqual(toReceiptView({ ...record, photos: [photo(1), { pathname: 'progress/x.jpg' }] }, uploader, new Set()).photos, [photo(1)]);
});

test('receiptIdsOfWorkLines and lockedReceiptIds: receipts in saved, live estimates of the site', () => {
  const json = JSON.stringify([{ id: 'w1', receiptId: RECEIPT_ID }, { id: 'w2' }, { id: 'w3', receiptId: 'bad' }]);
  assert.deepEqual(receiptIdsOfWorkLines(json), [RECEIPT_ID]);
  for (const value of ['', 'not json', '{}', null, undefined, 42]) assert.deepEqual(receiptIdsOfWorkLines(value), [], String(value));

  const estimates = [
    { siteId: 'site-1', workLinesJson: json },
    { siteId: 'site-1', workLinesJson: JSON.stringify([{ receiptId: OTHER_ID }]), deletedAt: '2026-11-20' },
    { siteId: 'site-2', workLinesJson: JSON.stringify([{ receiptId: OTHER_ID }]) },
    { siteId: 'site-1', workLinesJson: '{broken' },
  ];
  assert.deepEqual([...lockedReceiptIds(estimates, 'site-1')], [RECEIPT_ID]);
  assert.deepEqual([...lockedReceiptIds(estimates)].sort(), [RECEIPT_ID, OTHER_ID]);
});

test('canChangeReceipt: locked receipts are frozen; the uploader edits until 정리; estimates edit; only the uploader or an admin deletes', () => {
  const base = { id: RECEIPT_ID, siteId: 'site-1', photos: [], amount: null, memo: '', receiptDate: '', createdAt: '', createdByName: '' };
  const plain = (mine) => ({ ...base, mine, skipped: null, locked: false });
  const skipped = (mine) => ({ ...base, mine, skipped: { at: 'x', byName: 'y' }, locked: false });
  const locked = (mine) => ({ ...base, mine, skipped: null, locked: true });
  const ok = (receipt, author, change) => canChangeReceipt(receipt, author, change).ok;

  assert.equal(ok(plain(true), uploader, 'edit'), true);
  assert.equal(ok(plain(true), uploader, 'delete'), true);
  assert.equal(ok(skipped(true), uploader, 'edit'), false);
  assert.equal(ok(skipped(true), uploader, 'delete'), false);
  assert.equal(ok(plain(false), otherStaff, 'edit'), false);
  assert.equal(ok(plain(false), otherStaff, 'delete'), false);
  assert.equal(ok(plain(false), estimator, 'edit'), true);
  assert.equal(ok(skipped(false), estimator, 'edit'), true);
  assert.equal(ok(plain(false), estimator, 'delete'), false);
  assert.equal(ok(plain(false), admin, 'edit'), true);
  assert.equal(ok(skipped(false), admin, 'delete'), true);

  for (const author of [uploader, estimator, admin]) {
    for (const change of ['edit', 'delete']) {
      const result = canChangeReceipt(locked(author === uploader), author, change);
      assert.equal(result.ok, false);
      assert.equal(result.status, 409);
      assert.match(result.error, /실행내역서/);
    }
  }
  assert.equal(canChangeReceipt(plain(false), otherStaff, 'edit').status, 403);
});

test('receiptWorkLineDraft: date, 공종, 지출 and 비고 for the 실행 항목 입력 row', () => {
  // A receipt without 공종·비고 (saved before they existed, or skipped): 비고 falls back to the memo, then '영수증'.
  assert.deepEqual(receiptWorkLineDraft({ id: RECEIPT_ID, receiptDate: '2026-11-24', amount: 32000, memo: '타일 본드', process: '', note: '' }), {
    date: '2026-11-24',
    process: '',
    expense: 32000,
    note: '타일 본드',
    receiptId: RECEIPT_ID,
  });
  assert.deepEqual(receiptWorkLineDraft({ id: RECEIPT_ID, receiptDate: '2026-11-24', amount: null, memo: '', process: '', note: '' }), {
    date: '2026-11-24',
    process: '',
    expense: 0,
    note: '영수증',
    receiptId: RECEIPT_ID,
  });
  assert.deepEqual(receiptWorkLineDraft({ id: RECEIPT_ID, receiptDate: '2026-11-20', amount: 8000, memo: '사무실 참고', process: '철물', note: '나사' }), {
    date: '2026-11-20',
    process: '철물',
    expense: 8000,
    note: '나사',
    receiptId: RECEIPT_ID,
  });
});

test('receiptVersionStatus: judged against the open version, with other versions as a hint', () => {
  const saved = JSON.stringify([{ receiptId: RECEIPT_ID }]);
  const status = (input) => receiptVersionStatus({ receiptId: RECEIPT_ID, skipped: false, openLines: [], openSavedJson: undefined, otherVersions: [], ...input });

  assert.deepEqual(status({ openLines: [{ receiptId: RECEIPT_ID }], openSavedJson: saved }), { state: 'done', unsaved: false, otherLabels: [] });
  // Added on screen, not saved yet.
  assert.deepEqual(status({ openLines: [{ receiptId: RECEIPT_ID }], openSavedJson: '[]' }), { state: 'done', unsaved: true, otherLabels: [] });
  assert.deepEqual(status({ openLines: [{ receiptId: RECEIPT_ID }] }), { state: 'done', unsaved: true, otherLabels: [] });
  // Only in 초안 while 최종안 is open: still to do here.
  assert.deepEqual(status({ openLines: [{}], otherVersions: [{ label: '초안', workLinesJson: saved }, { label: '2차', workLinesJson: '[]' }] }), {
    state: 'open',
    unsaved: false,
    otherLabels: ['초안'],
  });
  // Removed on screen from a version where it was saved.
  assert.deepEqual(status({ openLines: [], openSavedJson: saved }), { state: 'open', unsaved: true, otherLabels: [] });
  assert.deepEqual(status({ skipped: true }), { state: 'skipped', unsaved: false, otherLabels: [] });
  // A receipt nobody knows (deleted after it was moved into a line) is simply open; nothing throws.
  assert.deepEqual(receiptVersionStatus({ receiptId: OTHER_ID, skipped: false, openLines: [{ receiptId: RECEIPT_ID }], openSavedJson: 'broken', otherVersions: [{ label: 'x' }] }), {
    state: 'open',
    unsaved: false,
    otherLabels: [],
  });
});

test('receiptPickerGroups: the last site first, then 진행중, then 미체결; 완료 only by search', () => {
  const sites = [
    { id: 's1', status: '시공중', title: 'A' },
    { id: 's2', status: '견적', title: 'B' },
    { id: 's3', status: '계약', title: 'C' },
    { id: 's4', status: '완료', title: 'D' },
    { id: 's5', status: '', title: 'E' },
    { id: 's6', status: '보류', title: 'F' },
  ];
  const ids = (list) => list.map((site) => site.id);
  const plain = receiptPickerGroups(sites, null);
  assert.equal(plain.recent, null);
  assert.deepEqual(ids(plain.active), ['s1', 's3']);
  assert.deepEqual(ids(plain.open), ['s2', 's5', 's6']);

  const withRecent = receiptPickerGroups(sites, 's2');
  assert.equal(withRecent.recent.id, 's2');
  assert.deepEqual(ids(withRecent.open), ['s5', 's6']);
  // A remembered site that is gone, or 완료, is not offered on top.
  assert.equal(receiptPickerGroups(sites, 'gone').recent, null);
  assert.equal(receiptPickerGroups(sites, 's4').recent, null);
});

test('receiptPhoneLabel: what the phone shows for one of my receipts', () => {
  assert.equal(receiptPhoneLabel({ locked: true, skipped: null }), '정리됨');
  assert.equal(receiptPhoneLabel({ locked: true, skipped: { at: 'x', byName: 'y' } }), '정리됨');
  assert.equal(receiptPhoneLabel({ locked: false, skipped: { at: 'x', byName: 'y' } }), '정리 안 해도 됨');
  assert.equal(receiptPhoneLabel({ locked: false, skipped: null }), '정리 전');
});
