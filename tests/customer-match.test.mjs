import test from 'node:test';
import assert from 'node:assert/strict';
import {
  phoneKey,
  findSamePhoneCustomers,
  countSitesByCustomer,
  suggestCustomers,
  siteMatchesQuery,
  groupSitesByCustomer,
  isSeparatePhone,
  pickSitesToSync,
  customerDeleteBlockedMessage,
  isSiteFormDirty,
  suggestLinkForUnlinkedSite,
  selectionChange,
  separatePhoneAfterPick,
  customerEditTouchesOpenSite,
} from '../app/lib/customer-match.ts';

// The rules behind the merged 고객·현장 tab: finding a customer, grouping sites, which sites follow a customer edit.

const hong = { _id: 'c-hong', name: '홍길동', phone: '010-1234-5678', createdAt: '2026-01-01' };
const hongSoon = { _id: 'c-soon', name: '홍길순', phone: '010-5555-0000', createdAt: '2026-02-01' };
const kim = { _id: 'c-kim', name: '김철수', phone: '', createdAt: '2026-03-01' };

test('phoneKey treats +82, spaces and hyphens as the same mobile', () => {
  assert.equal(phoneKey('+82 10-1234-5678'), '01012345678');
  assert.equal(phoneKey('010 1234 5678'), '01012345678');
  assert.equal(phoneKey('02-381-0489'), '023810489');
  assert.equal(phoneKey('없음'), '');
  assert.equal(phoneKey(undefined), '');
});

test('findSamePhoneCustomers needs 9+ digits and an exact match', () => {
  assert.deepEqual(findSamePhoneCustomers('+82 10 1234 5678', [hong, hongSoon]).map((c) => c._id), ['c-hong']);
  assert.deepEqual(findSamePhoneCustomers('1234-5678', [hong]), []);
  assert.deepEqual(findSamePhoneCustomers('', [kim]), [], 'a blank phone never matches a blank phone');
  assert.deepEqual(findSamePhoneCustomers('010-1234-5678', [hong], 'c-hong'), [], 'the excluded customer is skipped');
});

test('suggestCustomers puts an exact phone match first, then name, then phone digits, at most 8', () => {
  assert.deepEqual(suggestCustomers('홍길', [kim, hongSoon, hong]).map((c) => c._id), ['c-soon', 'c-hong'], 'same rank keeps input order');
  assert.deepEqual(suggestCustomers('01012345678', [hongSoon, hong]).map((c) => c._id), ['c-hong']);
  assert.deepEqual(suggestCustomers('5678', [hongSoon, hong]).map((c) => c._id), ['c-hong']);
  assert.deepEqual(suggestCustomers('  ', [hong]), []);
  const many = Array.from({ length: 12 }, (_, i) => ({ _id: `c${i}`, name: `홍${i}`, phone: '' }));
  assert.equal(suggestCustomers('홍', many).length, 8);
});

test('suggestCustomers ranks a name that starts with the query above one that only contains it', () => {
  const inner = { _id: 'c-inner', name: '김홍길', phone: '' };
  assert.deepEqual(suggestCustomers('홍길', [inner, hong]).map((c) => c._id), ['c-hong', 'c-inner']);
  const byPhone = { _id: 'c-phone', name: '박', phone: '010-0000-1111' };
  const named = { _id: 'c-named', name: '홍길동1111', phone: '' };
  assert.deepEqual(suggestCustomers('1111', [byPhone, named]).map((c) => c._id), ['c-named', 'c-phone'], 'name matches come before phone digits');
});

test('siteMatchesQuery looks at title, customer name, phone digits and address, ignoring spaces and case', () => {
  const site = { _id: 's1', title: '평촌 어바인퍼스트', customerName: '홍길동', customerPhone: '010-1234-5678', address: '안양시 동안구' };
  for (const q of ['평촌어바인', '홍길동', '1234-5678', '01012345678', '동안구', '']) assert.equal(siteMatchesQuery(site, q), true, q);
  assert.equal(siteMatchesQuery(site, '산본'), false);
  assert.equal(siteMatchesQuery({ _id: 's2', title: 'Raemian A' }, 'raemiana'), true, 'case and spaces are ignored');
});

test('groupSitesByCustomer: linked groups by newest site, then customers without sites, then unlinked', () => {
  const sites = [
    { _id: 's-old', customerId: 'c-hong', title: '평촌', status: '완료', createdAt: '2026-01-05' },
    { _id: 's-new', customerId: 'c-soon', title: '산본', status: '시공중', createdAt: '2026-04-01' },
    { _id: 's-gone', customerId: 'c-deleted', title: '옛 현장', status: '계약', createdAt: '2026-03-01' },
    { _id: 's-none', title: '연결 없음', status: '상담중', createdAt: '2026-02-01' },
  ];
  const groups = groupSitesByCustomer({ customers: [hong, hongSoon, kim], sites, query: '', status: '' });
  assert.deepEqual(groups.map((g) => g.customer?._id ?? null), ['c-soon', 'c-hong', 'c-kim', null]);
  assert.deepEqual(groups.at(-1).sites.map((s) => s._id), ['s-gone', 's-none'], 'a dangling customerId counts as unlinked');
  const filtered = groupSitesByCustomer({ customers: [hong, hongSoon, kim], sites, query: '', status: '시공중' });
  assert.deepEqual(filtered.map((g) => g.customer?._id ?? null), ['c-soon'], 'a status hides customers without such a site');
  const byName = groupSitesByCustomer({ customers: [hong, hongSoon, kim], sites, query: '김철수', status: '' });
  assert.deepEqual(byName.map((g) => g.customer?._id ?? null), ['c-kim'], 'a customer without sites shows when its name matches');
});

test('groupSitesByCustomer: include (a 현장 폴더) filters like a status and hides customers without such a site', () => {
  const sites = [
    { _id: 's-old', customerId: 'c-hong', title: '평촌', status: '완료', createdAt: '2026-01-05' },
    { _id: 's-new', customerId: 'c-soon', title: '산본', status: '시공중', createdAt: '2026-04-01' },
    { _id: 's-none', title: '연결 없음', status: '계약', createdAt: '2026-02-01' },
  ];
  const active = (site) => site.status === '계약' || site.status === '시공중';
  const groups = groupSitesByCustomer({ customers: [hong, hongSoon, kim], sites, query: '', include: active });
  assert.deepEqual(groups.map((g) => g.customer?._id ?? null), ['c-soon', null]);
  assert.deepEqual(groups.at(-1).sites.map((s) => s._id), ['s-none']);
  const byName = groupSitesByCustomer({ customers: [hong, hongSoon, kim], sites, query: '홍길동', include: active });
  assert.deepEqual(byName.map((g) => g.customer?._id ?? null), [], 'a matching customer with no site in the folder is hidden');
});

test('groupSitesByCustomer: a matching customer keeps all its sites, a site match keeps only that site', () => {
  const sites = [
    { _id: 'a', customerId: 'c-hong', title: '평촌', status: '완료', createdAt: '2026-01-05' },
    { _id: 'b', customerId: 'c-hong', title: '산본', status: '계약', createdAt: '2026-02-05' },
  ];
  const byCustomer = groupSitesByCustomer({ customers: [hong], sites, query: '홍길동', status: '' });
  assert.deepEqual(byCustomer[0].sites.map((s) => s._id), ['b', 'a'], 'newest site first');
  const bySite = groupSitesByCustomer({ customers: [hong], sites, query: '산본', status: '' });
  assert.deepEqual(bySite[0].sites.map((s) => s._id), ['b']);
  const trashed = groupSitesByCustomer({ customers: [hong], sites: [{ ...sites[0], deletedAt: '2026-05-01' }], query: '', status: '' });
  assert.deepEqual(trashed[0].sites, [], 'trashed sites are left out');
});

test('countSitesByCustomer skips trashed sites', () => {
  const counts = countSitesByCustomer([
    { _id: 'a', customerId: 'c-hong' },
    { _id: 'b', customerId: 'c-hong', deletedAt: '2026-05-01' },
    { _id: 'c' },
  ]);
  assert.equal(counts.get('c-hong'), 1);
  assert.equal(counts.size, 1);
});

test('isSeparatePhone is true only when the site has its own different number', () => {
  assert.equal(isSeparatePhone('010-9999-0000', '010-1234-5678'), true);
  assert.equal(isSeparatePhone('+82 10 1234 5678', '010-1234-5678'), false);
  assert.equal(isSeparatePhone('', '010-1234-5678'), false);
  assert.equal(isSeparatePhone('010-9999-0000', ''), true, 'a customer without a number makes any site number separate');
});

test('pickSitesToSync takes linked, untrashed sites whose phone was the old customer phone or blank', () => {
  const sites = [
    { _id: 'same', customerId: 'c-hong', customerPhone: '010-1234-5678' },
    { _id: 'blank', customerId: 'c-hong', customerPhone: '' },
    { _id: 'other', customerId: 'c-hong', customerPhone: '010-9999-0000' },
    { _id: 'trashed', customerId: 'c-hong', customerPhone: '010-1234-5678', deletedAt: '2026-05-01' },
    { _id: 'someone-else', customerId: 'c-soon', customerPhone: '010-1234-5678' },
  ];
  assert.deepEqual(pickSitesToSync(sites, 'c-hong', '+82 10 1234 5678').map((s) => s._id), ['same', 'blank']);
  assert.deepEqual(pickSitesToSync(sites, 'c-hong', '').map((s) => s._id), ['blank'], 'with no old number only blank sites follow');
});

test('customerDeleteBlockedMessage names the count and the trashed ones', () => {
  assert.equal(customerDeleteBlockedMessage(0, 0), null);
  assert.equal(customerDeleteBlockedMessage(2, 0), '현장 2곳이 연결돼 있어 삭제할 수 없습니다.');
  assert.equal(customerDeleteBlockedMessage(2, 1), '현장 2곳(휴지통 1곳 포함)이 연결돼 있어 삭제할 수 없습니다.');
});

test('isSiteFormDirty ignores surrounding spaces only', () => {
  const base = { title: '평촌', siteType: '아파트', address: '', status: '상담중', memo: '', customerId: 'c-hong', separatePhone: false, sitePhone: '' };
  assert.equal(isSiteFormDirty(base, { ...base, title: ' 평촌 ' }), false);
  assert.equal(isSiteFormDirty(base, { ...base, memo: '메모' }), true);
  assert.equal(isSiteFormDirty(base, { ...base, customerId: 'c-soon' }), true);
  assert.equal(isSiteFormDirty(base, { ...base, separatePhone: true }), true);
});

test('suggestLinkForUnlinkedSite offers only the one customer with the site number, never a namesake', () => {
  assert.equal(suggestLinkForUnlinkedSite({ _id: 's', customerName: '홍길동', customerPhone: '' }, [hong]), undefined, 'a site without a number gets no suggestion');
  assert.equal(suggestLinkForUnlinkedSite({ _id: 's', customerName: '홍길동', customerPhone: '+82 10 1234 5678' }, [hongSoon, hong])?._id, 'c-hong');
  const twin = { _id: 'c-twin', name: '홍', phone: '01012345678' };
  assert.equal(suggestLinkForUnlinkedSite({ _id: 's', customerPhone: '010-1234-5678' }, [hong, twin]), undefined, 'two customers with the number are not guessed between');
});

test('selectionChange: reopening the open site changes nothing, leaving a dirty form asks', () => {
  assert.equal(selectionChange({ mode: 'edit', siteId: 'a' }, { mode: 'edit', siteId: 'a' }, true), 'stay');
  assert.equal(selectionChange({ mode: 'edit', siteId: 'a' }, { mode: 'edit', siteId: 'b' }, true), 'confirm');
  assert.equal(selectionChange({ mode: 'edit', siteId: 'a' }, { mode: 'edit', siteId: 'b' }, false), 'go');
  assert.equal(selectionChange({ mode: 'new', key: 1 }, { mode: 'new', key: 2 }, true), 'confirm', 'a new blank form over a dirty one asks');
});

test('separatePhoneAfterPick: a new customer takes over the site number', () => {
  assert.equal(separatePhoneAfterPick('010-5555-1111', null), false);
  assert.equal(separatePhoneAfterPick('010-5555-1111', '010-1234-5678'), true);
  assert.equal(separatePhoneAfterPick('', '010-1234-5678'), false);
});

test('customerEditTouchesOpenSite only for the customer the site is saved with', () => {
  assert.equal(customerEditTouchesOpenSite('c-hong', 'c-hong'), true);
  assert.equal(customerEditTouchesOpenSite('c-hong', 'c-soon'), false, 'a customer picked but not saved yet');
  assert.equal(customerEditTouchesOpenSite('', 'c-soon'), false);
});
