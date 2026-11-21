import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPhoneNumber, shortDate, contractSendConfirmText, registrationNotice } from '../app/lib/office-format.ts';

// Formatting and wording shared by the manager screens' customer and site forms.

test('formatPhoneNumber turns a +82 mobile into its 010 number', () => {
  assert.equal(formatPhoneNumber('+82 10-1234-5678'), '010-1234-5678');
  assert.equal(formatPhoneNumber('+821012345678'), '010-1234-5678');
  assert.equal(formatPhoneNumber('82 10 9999 0000'), '010-9999-0000');
});

test('formatPhoneNumber keeps the existing formats', () => {
  assert.equal(formatPhoneNumber('01012345678'), '010-1234-5678');
  assert.equal(formatPhoneNumber('0111234567'), '011-123-4567');
  assert.equal(formatPhoneNumber('0212345678'), '02-1234-5678');
  assert.equal(formatPhoneNumber('0313810489'), '031-381-0489');
  assert.equal(formatPhoneNumber('050412345678'), '0504-1234-5678');
  assert.equal(formatPhoneNumber('0101'), '010-1', 'a number being typed is formatted as it grows');
  assert.equal(formatPhoneNumber(''), '');
});

test('shortDate gives month/day in Seoul time', () => {
  assert.equal(shortDate('2026-11-02T00:00:00.000Z'), '11/2');
  assert.equal(shortDate('2026-09-14T20:00:00Z'), '9/15');
  assert.equal(shortDate(''), '');
  assert.equal(shortDate('not a date'), '');
});

test('contractSendConfirmText asks before a resend and before sending over an old per-customer record', () => {
  assert.equal(contractSendConfirmText('', ''), null);
  assert.equal(contractSendConfirmText('2026-11-02T00:00:00.000Z', ''), '이미 계약 완료 알림톡을 보낸 현장입니다. 고객에게 다시 보낼까요?');
  assert.equal(
    contractSendConfirmText('', '2026-09-14T00:00:00Z'),
    '이 고객에게 9/14에 고객 단위로 보낸 계약 완료 안내 기록이 있습니다. 이 현장 안내로 보낼까요?',
  );
});

test('registrationNotice reports a consultation that could not be completed', () => {
  assert.deepEqual(registrationNotice(true), { tone: 'status', text: '고객과 현장을 등록하고 상담을 완료했습니다.' });
  assert.deepEqual(registrationNotice(false), {
    tone: 'error',
    text: '현장은 저장했지만 상담을 완료하지 못했습니다. 상담 요청에서 완료로 바꿔 주세요.',
  });
});
