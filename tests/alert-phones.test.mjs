import test from 'node:test';
import assert from 'node:assert/strict';
import { formatKoreanMobile, maskPhone, normalizeKoreanMobile, parseAlertPhoneList, pickAlertPhones } from '../app/lib/alert-phones.ts';

test('normalizeKoreanMobile keeps digits of a valid mobile number', () => {
  for (const value of ['010-6346-3882', '01063463882', ' 010 6346 3882 ', '+82 10-6346-3882', '+821063463882']) {
    assert.equal(normalizeKoreanMobile(value), '01063463882', value);
  }
  assert.equal(normalizeKoreanMobile('011-234-5678'), '0112345678');
  for (const value of ['031-381-0489', '010-1234', '1234', '', 'abc', '010-1234-56789']) {
    assert.equal(normalizeKoreanMobile(value), null, value);
  }
});

test('formatKoreanMobile and maskPhone', () => {
  assert.equal(formatKoreanMobile('01063463882'), '010-6346-3882');
  assert.equal(formatKoreanMobile('0112345678'), '011-234-5678');
  assert.equal(maskPhone('01083463882'), '010-****-3882');
});

test('parseAlertPhoneList validates, removes duplicates and caps at five', () => {
  assert.deepEqual(parseAlertPhoneList(['010-6346-3882', '01083463882', '010 6346 3882']), { ok: true, phones: ['01063463882', '01083463882'] });
  assert.deepEqual(parseAlertPhoneList([]), { ok: true, phones: [] });
  assert.deepEqual(parseAlertPhoneList(['031-381-0489']), { ok: false, error: '올바른 휴대폰 번호가 아닙니다: 031-381-0489' });
  assert.deepEqual(parseAlertPhoneList('01063463882'), { ok: false, error: '번호 목록 형식이 올바르지 않습니다.' });
  const six = ['01011110001', '01011110002', '01011110003', '01011110004', '01011110005', '01011110006'];
  assert.deepEqual(parseAlertPhoneList(six), { ok: false, error: '번호는 최대 5개까지 등록할 수 있습니다.' });
});

test('pickAlertPhones prefers the manager list and falls back to Vercel values', () => {
  assert.deepEqual(pickAlertPhones(['01063463882'], ['01084463882']), { phones: ['01063463882'], source: 'manager' });
  assert.deepEqual(pickAlertPhones([], ['01084463882']), { phones: ['01084463882'], source: 'env' });
  assert.deepEqual(pickAlertPhones(null, ['01084463882']), { phones: ['01084463882'], source: 'env' });
  assert.deepEqual(pickAlertPhones(null, []), { phones: [], source: 'none' });
});
