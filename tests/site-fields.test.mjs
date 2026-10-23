import test from 'node:test';
import assert from 'node:assert/strict';
import { PROTECTED_SITE_FIELDS, SERVER_OWNED_SITE_FIELDS, dropBrowserSiteFields, stripServerOwnedSiteFields } from '../app/api/manager/_site-fields.ts';

const full = () => ({
  _id: 'site-1',
  title: '테스트 현장',
  customerName: '홍길동',
  customerPhone: '010-1234-5678',
  deletedAt: null,
  progressCode: 'abcDEF123_-abcDEF123_-',
  progressEnabled: true,
  progressCodeCreatedAt: '2026-10-17T00:00:00.000Z',
  progressAccess: { failedCount: 2, lockedUntil: '' },
});

test('the server-owned site fields are exactly the four progress fields', () => {
  assert.deepEqual([...SERVER_OWNED_SITE_FIELDS].sort(), ['progressAccess', 'progressCode', 'progressCodeCreatedAt', 'progressEnabled']);
});

test('stripServerOwnedSiteFields removes the four fields and keeps everything else', () => {
  assert.deepEqual(stripServerOwnedSiteFields(full()), {
    _id: 'site-1',
    title: '테스트 현장',
    customerName: '홍길동',
    customerPhone: '010-1234-5678',
    deletedAt: null,
  });
});

test('stripServerOwnedSiteFields returns a copy and leaves the input untouched', () => {
  const input = full();
  const output = stripServerOwnedSiteFields(input);
  assert.notEqual(output, input);
  assert.deepEqual(input, full());
  const plain = { _id: 'site-2', title: '진행 필드 없음' };
  const copy = stripServerOwnedSiteFields(plain);
  assert.notEqual(copy, plain);
  assert.deepEqual(copy, plain);
});

test('stripServerOwnedSiteFields drops the fields whatever their value (a stale form may send empty ones)', () => {
  const stale = { _id: 'site-1', progressCode: '', progressEnabled: false, progressCodeCreatedAt: null, progressAccess: undefined, memo: 'x' };
  const output = stripServerOwnedSiteFields(stale);
  assert.deepEqual(output, { _id: 'site-1', memo: 'x' });
  for (const key of SERVER_OWNED_SITE_FIELDS) assert.equal(Object.hasOwn(output, key), false, key);
});

test('stripServerOwnedSiteFields does not touch similarly named fields', () => {
  const input = { progressNote: '메모', progressCodeHint: 'x', Progresscode: 'y', progress: 50 };
  assert.deepEqual(stripServerOwnedSiteFields(input), input);
});

const answer = { status: 'skipped', by: 'customer', at: '2026-10-23T05:00:00.000Z' };

test('the protected site fields are the four progress fields and the 유입 경로 answer', () => {
  assert.deepEqual([...PROTECTED_SITE_FIELDS].sort(), ['acquisition', 'progressAccess', 'progressCode', 'progressCodeCreatedAt', 'progressEnabled']);
});

test('dropBrowserSiteFields removes every protected field from a site a browser sent', () => {
  assert.deepEqual(dropBrowserSiteFields({ ...full(), acquisition: answer }), {
    _id: 'site-1',
    title: '테스트 현장',
    customerName: '홍길동',
    customerPhone: '010-1234-5678',
    deletedAt: null,
  });
});

test('a site sent to a browser keeps its 유입 경로 answer', () => {
  assert.deepEqual(stripServerOwnedSiteFields({ ...full(), acquisition: answer }).acquisition, answer);
});
