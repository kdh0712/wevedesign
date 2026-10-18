import test from 'node:test';
import assert from 'node:assert/strict';
import { needsCustomerRecordPhone, pickCustomerPhone } from '../app/api/manager/_customer-phone.ts';

// The number the customer checks in with, the cookie binds and the alimtalk goes to: a mobile wins.

test("the site's own mobile comes first, as normalized digits", () => {
  assert.equal(pickCustomerPhone('010-1234-5678', '010-9999-0000'), '01012345678');
  assert.equal(pickCustomerPhone(' +82 10 1234 5678 ', ''), '01012345678');
  assert.equal(pickCustomerPhone('011-123-4567', undefined), '0111234567');
});

test("a site with a landline uses the linked customer's mobile", () => {
  assert.equal(pickCustomerPhone('02-381-0489', '010-9999-0000'), '01099990000');
  assert.equal(pickCustomerPhone('031-381-0489', '+82-10-9999-0000'), '01099990000');
});

test("a site with no number uses the linked customer's mobile", () => {
  assert.equal(pickCustomerPhone('', '010-9999-0000'), '01099990000');
  assert.equal(pickCustomerPhone(undefined, '010-9999-0000'), '01099990000');
  assert.equal(pickCustomerPhone('없음', '010-9999-0000'), '01099990000');
});

test("with no mobile anywhere the site's own number comes next, as stored", () => {
  assert.equal(pickCustomerPhone(' 02-381-0489 ', '031-111-2222'), '02-381-0489');
  assert.equal(pickCustomerPhone('02-381-0489', ''), '02-381-0489');
});

test("then the customer's number", () => {
  assert.equal(pickCustomerPhone('', ' 031-111-2222 '), '031-111-2222');
  assert.equal(pickCustomerPhone('미정', '031-111-2222'), '031-111-2222');
});

test('no digits anywhere gives an empty string', () => {
  assert.equal(pickCustomerPhone('', ''), '');
  assert.equal(pickCustomerPhone(undefined, undefined), '');
  assert.equal(pickCustomerPhone('없음', null), '');
  assert.equal(pickCustomerPhone(12345678, { phone: '010' }), '', 'values that are not text are ignored');
});

test('the customer record is read only when the site has no mobile of its own', () => {
  assert.equal(needsCustomerRecordPhone('010-1234-5678'), false);
  assert.equal(needsCustomerRecordPhone('+82 10 1234 5678'), false);
  assert.equal(needsCustomerRecordPhone('02-381-0489'), true);
  assert.equal(needsCustomerRecordPhone(''), true);
  assert.equal(needsCustomerRecordPhone(undefined), true);
});
