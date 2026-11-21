import test from 'node:test';
import assert from 'node:assert/strict';
import { fillContractTemplate, contractResendRefusal } from '../app/api/integrations/aligo-alimtalk/_contract.ts';

// The 계약 완료 안내 alimtalk is recorded per site; these are the pure parts of its route.

test('fillContractTemplate fills every placeholder form', () => {
  const template = '#{고객명} {고객명} {{customerName}} {{name}} #{연락처} {연락처} {{phone}}';
  assert.equal(
    fillContractTemplate(template, { customerName: '홍길동', customerPhone: '01012345678' }),
    '홍길동 홍길동 홍길동 홍길동 01012345678 01012345678 01012345678',
  );
});

test('a site that already got it needs resend', () => {
  assert.equal(contractResendRefusal({}, false), null);
  assert.equal(contractResendRefusal({ contractAlimtalkSentAt: '' }, false), null);
  assert.match(contractResendRefusal({ contractAlimtalkSentAt: '2026-11-02T00:00:00.000Z' }, false), /다시 보내기/);
  assert.equal(contractResendRefusal({ contractAlimtalkSentAt: '2026-11-02T00:00:00.000Z' }, true), null);
});
