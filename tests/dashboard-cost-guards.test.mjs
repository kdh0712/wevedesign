import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSULTATION_IP_LIMIT,
  MIN_CONSULTATION_FILL_MS,
  clientAddress,
  consultationFieldError,
  consultationRateDecision,
  isValidKoreanPhone,
  looksAutomated,
  phoneDigits,
} from '../app/lib/consultation-guard.ts';
import { KAKAO_AUTO_SYNC_INTERVAL_MS, countsAsRevenue, salesTotals, shouldAutoSyncKakao } from '../app/lib/dashboard-rules.ts';

const fields = {
  name: '홍길동',
  phone: '010-1234-5678',
  propertyType: '아파트',
  areaRange: '30평대',
  homeStatus: '거주 중',
  reason: '노후',
  budget: '5천만원',
  timeline: '12월',
  postcode: '16000',
  address: '경기도 의왕시',
  detailAddress: '101동 1001호',
  message: '',
};

test('phone numbers are checked by their digits', () => {
  assert.equal(phoneDigits('010-1234-5678'), '01012345678');
  for (const phone of ['010-1234-5678', '01012345678', '031-381-0489', '02-123-4567', '0505-123-4567']) assert.equal(isValidKoreanPhone(phone), true, phone);
  for (const phone of ['', '1234', '12345678901', '010-12', 'abc', '010-1234-56789-0']) assert.equal(isValidKoreanPhone(phone), false, phone);
});

test('consultationFieldError refuses over-long fields and bad numbers', () => {
  assert.equal(consultationFieldError(fields), '');
  assert.match(consultationFieldError({ ...fields, message: 'a'.repeat(2001) }), /요청사항은\(는\) 2000자/);
  assert.match(consultationFieldError({ ...fields, name: '가'.repeat(41) }), /이름/);
  assert.match(consultationFieldError({ ...fields, phone: '12345' }), /연락처/);
});

test('looksAutomated catches the honeypot and instant submits, and lets older pages through', () => {
  const now = 1_000_000;
  assert.equal(looksAutomated({ honeypot: 'http://spam', now }), true);
  assert.equal(looksAutomated({ honeypot: '', startedAt: now - 500, now }), true);
  assert.equal(looksAutomated({ startedAt: now - MIN_CONSULTATION_FILL_MS, now }), false);
  assert.equal(looksAutomated({ startedAt: now - 60_000, now }), false);
  assert.equal(looksAutomated({ now }), false, 'no start time: a page opened before this check');
  assert.equal(looksAutomated({ startedAt: 'x', now }), false);
});

test('the same number within 10 minutes is a duplicate, not a new paid alert', () => {
  const now = Date.parse('2026-10-20T10:00:00.000Z');
  const at = (minutesAgo) => new Date(now - minutesAgo * 60_000).toISOString();
  const current = { phoneDigits: '01012345678', ipHash: 'ip-a', now };
  assert.equal(consultationRateDecision([{ phoneDigits: '01012345678', createdAt: at(3) }], current), 'duplicate');
  assert.equal(consultationRateDecision([{ phone: '010-1234-5678', createdAt: at(3) }], current), 'duplicate', 'older records without phoneDigits');
  assert.equal(consultationRateDecision([{ phoneDigits: '01012345678', createdAt: at(11) }], current), 'ok');
  assert.equal(consultationRateDecision([{ phoneDigits: '01099998888', createdAt: at(1) }], current), 'ok');
});

test('5 or more from one connection within an hour is refused', () => {
  const now = Date.parse('2026-10-20T10:00:00.000Z');
  const at = (minutesAgo) => new Date(now - minutesAgo * 60_000).toISOString();
  const others = (count, minutesAgo) => Array.from({ length: count }, (_, i) => ({ phoneDigits: `0101111000${i}`, ipHash: 'ip-a', createdAt: at(minutesAgo) }));
  const current = { phoneDigits: '01012345678', ipHash: 'ip-a', now };
  assert.equal(consultationRateDecision(others(CONSULTATION_IP_LIMIT - 1, 20), current), 'ok');
  assert.equal(consultationRateDecision(others(CONSULTATION_IP_LIMIT, 20), current), 'too-many');
  assert.equal(consultationRateDecision(others(CONSULTATION_IP_LIMIT, 61), current), 'ok', 'older than an hour');
  assert.equal(consultationRateDecision(others(CONSULTATION_IP_LIMIT, 20), { ...current, ipHash: '' }), 'ok', 'no address: not counted');
});

test('clientAddress takes the first forwarded address', () => {
  const headers = (values) => ({ get: (name) => values[name] ?? null });
  assert.equal(clientAddress(headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' })), '1.2.3.4');
  assert.equal(clientAddress(headers({ 'x-real-ip': '5.6.7.8' })), '5.6.7.8');
  assert.equal(clientAddress(headers({})), '');
});

test('Kakao is checked at most every 5 minutes by the automatic refresh', () => {
  const now = 10 * KAKAO_AUTO_SYNC_INTERVAL_MS;
  assert.equal(shouldAutoSyncKakao(0, now), true, 'first refresh');
  assert.equal(shouldAutoSyncKakao(now - 30_000, now), false);
  assert.equal(shouldAutoSyncKakao(now - KAKAO_AUTO_SYNC_INTERVAL_MS, now), true);
});

test('sales totals leave out 견적 and 취소', () => {
  assert.equal(countsAsRevenue('계약'), true);
  assert.equal(countsAsRevenue(' 입금 완료 '), true);
  assert.equal(countsAsRevenue(''), true, 'older records without a status still count');
  assert.equal(countsAsRevenue('견적'), false);
  assert.equal(countsAsRevenue('취소'), false);
  const sales = [
    { amount: 1000, cost: 600, status: '계약' },
    { amount: 2000, cost: 1500, status: '입금 완료' },
    { amount: 9000, cost: 1, status: '견적' },
    { amount: 5000, cost: 0, status: '취소' },
    { amount: '300', cost: '100', status: '부분 입금' },
  ];
  assert.deepEqual(salesTotals(sales), { revenue: 3300, profit: 1100, excluded: 2 });
});
