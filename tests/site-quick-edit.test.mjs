import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySiteQuickEdit,
  siteQuickEditCustomerChanged,
  siteQuickEditFields,
  siteQuickEditOtherSites,
  siteQuickEditPlan,
} from '../app/lib/site-quick-edit.ts';

// 견적 작업의 현장 정보 수정 팝업 (spec docs/superpowers/specs/2026-11-26-site-quick-edit-design.md).

const site = (extra = {}) => ({
  _id: 's1', title: '당동 무지개마을 210동 1002호', customerId: 'c1', customerName: '승이', customerPhone: '010-8895-1855',
  siteType: '아파트', address: '', status: '견적', memo: '', ...extra,
});
const customer = (extra = {}) => ({ _id: 'c1', name: '승이', phone: '010-8895-1855', ...extra });

test('siteQuickEditFields starts from the site and its customer', () => {
  assert.deepEqual(siteQuickEditFields(site(), customer()), {
    title: '당동 무지개마을 210동 1002호', siteType: '아파트', address: '', status: '견적', memo: '',
    customerName: '승이', customerPhone: '010-8895-1855', separatePhone: false, sitePhone: '010-8895-1855',
  });
});

test('siteQuickEditFields sees a site number that is not the customer one as its own', () => {
  const fields = siteQuickEditFields(site({ customerPhone: '010-1111-2222' }), customer());
  assert.equal(fields.separatePhone, true);
  assert.equal(fields.sitePhone, '010-1111-2222');
  assert.equal(fields.customerPhone, '010-8895-1855');
});

test('siteQuickEditFields gives a site without 종류 or 상태 the form defaults, and an unlinked site its own name', () => {
  const fields = siteQuickEditFields(site({ siteType: '', status: '', customerId: '', customerName: '가' }), null);
  assert.equal(fields.siteType, '아파트');
  assert.equal(fields.status, '상담중');
  assert.equal(fields.customerName, '가');
  assert.equal(fields.separatePhone, false);
});

test('siteQuickEditCustomerChanged compares the trimmed name and number', () => {
  const fields = siteQuickEditFields(site(), customer());
  assert.equal(siteQuickEditCustomerChanged(customer(), fields), false);
  assert.equal(siteQuickEditCustomerChanged(customer(), { ...fields, customerName: ' 승이 ' }), false);
  assert.equal(siteQuickEditCustomerChanged(customer(), { ...fields, customerName: '김승이' }), true);
  assert.equal(siteQuickEditCustomerChanged(customer(), { ...fields, customerPhone: '010-8895-1856' }), true);
  assert.equal(siteQuickEditCustomerChanged(null, { ...fields, customerName: '김승이' }), false);
});

test('siteQuickEditOtherSites lists the customer’s other sites that follow a customer edit', () => {
  const sites = [
    site(),
    site({ _id: 's2', customerPhone: '010-8895-1855' }),
    site({ _id: 's3', customerPhone: '' }),
    site({ _id: 's4', customerPhone: '010-1111-2222' }),
    site({ _id: 's5', customerId: 'c2' }),
  ];
  assert.deepEqual(siteQuickEditOtherSites(sites, site(), customer()).map((item) => item._id), ['s2', 's3']);
});

const start = () => siteQuickEditFields(site(), customer());

test('siteQuickEditPlan sends only the site fields that changed (review finding: a stale copy must not write back)', () => {
  const fields = { ...start(), title: ' 당동 210동 1002호 ', address: ' 군포시 당동 ' };
  assert.deepEqual(siteQuickEditPlan(site(), customer(), start(), fields, { syncOthers: true, otherCount: 1 }), {
    site: { id: 's1', data: { title: '당동 210동 1002호', address: '군포시 당동' } },
  });
});

test('siteQuickEditPlan with nothing changed has nothing to save', () => {
  assert.deepEqual(siteQuickEditPlan(site(), customer(), start(), start(), { syncOthers: true, otherCount: 1 }), { site: { id: 's1', data: {} } });
});

test('siteQuickEditPlan saves the customer, the site and, when asked, the other sites', () => {
  const fields = { ...start(), customerName: '김승이', customerPhone: '010-9999-0000' };
  const plan = siteQuickEditPlan(site(), customer(), start(), fields, { syncOthers: true, otherCount: 2 });
  assert.deepEqual(plan.customer, { id: 'c1', data: { name: '김승이', phone: '010-9999-0000' } });
  assert.deepEqual(plan.site.data, { customerName: '김승이', customerPhone: '010-9999-0000' });
  assert.deepEqual(plan.sync, { customerId: 'c1', previousPhone: '010-8895-1855' });
  assert.equal(siteQuickEditPlan(site(), customer(), start(), fields, { syncOthers: false, otherCount: 2 }).sync, undefined);
  assert.equal(siteQuickEditPlan(site(), customer(), start(), fields, { syncOthers: true, otherCount: 0 }).sync, undefined);
});

test('siteQuickEditPlan gives the site its own number when it is contacted on another one', () => {
  const fields = { ...start(), separatePhone: true, sitePhone: ' 010-1111-2222 ' };
  const plan = siteQuickEditPlan(site(), customer(), start(), fields, { syncOthers: true, otherCount: 1 });
  assert.equal(plan.customer, undefined);
  assert.deepEqual(plan.site.data, { customerName: '승이', customerPhone: '010-1111-2222' });
});

test('siteQuickEditPlan leaves the customer fields of an unlinked site alone', () => {
  const unlinked = site({ customerId: '', customerName: '가', customerPhone: '010-1234-5678' });
  const unlinkedStart = siteQuickEditFields(unlinked, null);
  const plan = siteQuickEditPlan(unlinked, null, unlinkedStart, { ...unlinkedStart, customerName: '나', memo: '메모' }, { syncOthers: true, otherCount: 0 });
  assert.deepEqual(plan.site.data, { memo: '메모' });
  assert.equal('customerName' in plan.site.data, false);
  assert.equal('customerPhone' in plan.site.data, false);
  assert.equal(plan.customer, undefined);
});

test('siteQuickEditPlan asks for a 현장명, and for a 고객 이름 only when the customer is changed (review finding)', () => {
  assert.deepEqual(siteQuickEditPlan(site(), customer(), start(), { ...start(), title: '  ' }, { syncOthers: true, otherCount: 0 }), { error: '현장명을 입력해 주세요.' });
  assert.deepEqual(siteQuickEditPlan(site(), customer(), start(), { ...start(), customerName: ' ', customerPhone: '010-1' }, { syncOthers: true, otherCount: 0 }), { error: '고객 이름을 입력해 주세요.' });
  // A customer saved without a name (old data) does not block a site-only save.
  const nameless = customer({ name: '' });
  const namelessStart = siteQuickEditFields(site(), nameless);
  assert.deepEqual(siteQuickEditPlan(site(), nameless, namelessStart, { ...namelessStart, address: '군포시' }, { syncOthers: true, otherCount: 0 }), { site: { id: 's1', data: { address: '군포시' } } });
});

test('applySiteQuickEdit puts the saved values on the site and the synced name and number on the other sites', () => {
  const sites = [site(), site({ _id: 's2' }), site({ _id: 's4', customerPhone: '010-1111-2222' })];
  const fields = { ...start(), title: '새 현장명', customerName: '김승이', customerPhone: '010-9999-0000' };
  const plan = siteQuickEditPlan(site(), customer(), start(), fields, { syncOthers: true, otherCount: 1 });
  const next = applySiteQuickEdit(sites, plan, ['s2']);
  assert.equal(next[0].title, '새 현장명');
  assert.equal(next[0].customerName, '김승이');
  assert.deepEqual([next[1].customerName, next[1].customerPhone, next[1].title], ['김승이', '010-9999-0000', site().title]);
  assert.deepEqual(next[2], sites[2]);
});

test('the estimate editor is not reloaded by a change to the site list (review finding: saving the popup lost unsaved edits)', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('../app/manager-weve-7519/estimate/page.tsx', import.meta.url), 'utf8');
  assert.equal(/\bsites\]\);/.test(page), false);
});
