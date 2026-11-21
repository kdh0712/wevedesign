import test from 'node:test';
import assert from 'node:assert/strict';
import { findSiteCustomer } from '../app/lib/site-customer.ts';

// The customer the manager screens show for a site (the dashboard's 알림톡 button and the daily report window). The site's
// own link decides; phone and name only stand in when the link cannot be followed, and never pick between several records.

const linked = { _id: 'customer-old', name: '홍길동', phone: '010-1234-5678' };
// The same person registered again for a second site (the 고객 tab and 상담 → 고객 never look for an existing customer),
// loaded first because the list is newest first.
const secondRecord = { _id: 'customer-new', name: '홍길동', phone: '010-1234-5678', contractAlimtalkSentAt: '2026-11-01T00:00:00.000Z' };
// Another person with the same name.
const namesake = { _id: 'customer-namesake', name: '홍길동', phone: '010-9999-0000' };

test("the site's linked customer wins over another record with the same phone", () => {
  const site = { _id: 'site-a', customerId: 'customer-old', customerName: '홍길동', customerPhone: '010-1234-5678' };
  assert.equal(findSiteCustomer(site, [secondRecord, linked])?._id, 'customer-old');
});

test("the site's linked customer wins over a namesake listed first", () => {
  const site = { _id: 'site-a', customerId: 'customer-old', customerName: '홍길동', customerPhone: '' };
  assert.equal(findSiteCustomer(site, [namesake, linked])?._id, 'customer-old');
});

test('a site without a link uses the one customer with its phone number', () => {
  const site = { _id: 'site-a', customerName: '홍길동', customerPhone: '01012345678' };
  assert.equal(findSiteCustomer(site, [namesake, linked])?._id, 'customer-old');
});

test('a link to a customer that is not loaded falls back to the one customer with its phone number', () => {
  const site = { _id: 'site-a', customerId: 'customer-gone', customerName: '홍길동', customerPhone: '010-1234-5678' };
  assert.equal(findSiteCustomer(site, [namesake, linked])?._id, 'customer-old');
});

test('several customers with the phone number are not guessed between', () => {
  const site = { _id: 'site-a', customerName: '홍길동', customerPhone: '010-1234-5678' };
  assert.equal(findSiteCustomer(site, [secondRecord, linked]), undefined);
});

test('a site with a phone number is never matched by name alone', () => {
  const site = { _id: 'site-a', customerName: '홍길동', customerPhone: '010-5555-6666' };
  assert.equal(findSiteCustomer(site, [namesake]), undefined);
});

test('a site without any number uses the one customer with its name', () => {
  const site = { _id: 'site-a', customerName: ' 홍길동 ', customerPhone: '없음' };
  assert.equal(findSiteCustomer(site, [namesake])?._id, 'customer-namesake');
  assert.equal(findSiteCustomer(site, [namesake, linked]), undefined, 'two customers with the name are not guessed between');
});

test('nothing to go on finds nothing', () => {
  assert.equal(findSiteCustomer({ _id: 'site-a' }, [linked, namesake]), undefined);
  assert.equal(findSiteCustomer({ _id: 'site-a', customerId: 'customer-old' }, []), undefined);
});
