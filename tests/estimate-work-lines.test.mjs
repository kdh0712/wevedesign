import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPhoneWorkLine,
  normalizeWorkLines,
  parsePhoneWorkLine,
  pickWorkLineTarget,
  unseenPhoneLines,
  workLineProcesses,
  workLineTotals,
} from '../app/lib/estimate-work-lines.ts';

// 폰 실행내역서 등록 (spec docs/superpowers/specs/2026-11-24-phone-work-lines-design.md): the shared 실행내역서 line rules.

const author = { name: '김가영', loginId: 'kim' };

test('normalizeWorkLines keeps receipt and phone markers and drops empty lines', () => {
  const lines = normalizeWorkLines([
    { id: 'w1', date: '2026-11-24', process: '타일', expense: '32,000', receiptId: `rc-${'a'.repeat(24)}` },
    { id: 'w2', date: '2026-11-24', process: '철물', expense: 8000, addedFrom: 'phone', addedBy: '김가영', addedAt: '2026-11-24T01:00:00.000Z' },
    { id: 'w3', addedFrom: 'elsewhere', addedBy: 'x', expense: 0 },
    {},
  ]);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].expense, 32000);
  assert.equal(lines[0].receiptId, `rc-${'a'.repeat(24)}`);
  assert.equal('addedFrom' in lines[0], false);
  assert.deepEqual([lines[1].addedFrom, lines[1].addedBy, lines[1].addedAt], ['phone', '김가영', '2026-11-24T01:00:00.000Z']);
  assert.equal(lines[1].executionAmount, 8000);
});

test('workLineTotals: the 실행 원가 and margins an office save stores', () => {
  const totals = workLineTotals([{ expense: 300000 }, { expense: 0, executionAmount: 200000 }], { customerEstimateTotal: 1000000, additionalCostTotal: 100000 });
  assert.deepEqual(totals, {
    actualExecutionCostTotal: 500000,
    actualMarginAmount: 400000,
    actualMarginRate: 40,
    executionCostTotal: 500000,
    marginAmount: 400000,
    marginRate: 40,
  });
  assert.deepEqual(workLineTotals([], { customerEstimateTotal: 1000000, additionalCostTotal: 0 }), {
    actualExecutionCostTotal: 0,
    actualMarginAmount: 0,
    actualMarginRate: 0,
    executionCostTotal: 0,
    marginAmount: 0,
    marginRate: 0,
  });
});

test('pickWorkLineTarget: the newest live 최종안, else the newest live version', () => {
  const a = { _id: 'a', versionType: 'draft', updatedAt: '2026-11-20T00:00:00Z' };
  const b = { _id: 'b', versionType: 'final', updatedAt: '2026-11-10T00:00:00Z' };
  const c = { _id: 'c', versionType: 'final', updatedAt: '2026-11-15T00:00:00Z' };
  const gone = { _id: 'd', versionType: 'final', updatedAt: '2026-11-30T00:00:00Z', deletedAt: '2026-12-01' };
  assert.equal(pickWorkLineTarget([a, b, c, gone])?._id, 'c');
  assert.equal(pickWorkLineTarget([a, { ...b, versionType: 'draft' }])?._id, 'a');
  assert.equal(pickWorkLineTarget([gone]), null);
  assert.equal(pickWorkLineTarget([]), null);
});

test('workLineProcesses: the version 공종 then the 실행 공종, first seen first, no amounts', () => {
  const linesJson = JSON.stringify([
    { process: '철거', customerUnitPrice: 100 },
    { process: '', category: '설비' },
    { process: '철거' },
    { process: '  타일 ' },
  ]);
  const workLinesJson = JSON.stringify([{ process: '타일' }, { process: '청소' }]);
  assert.deepEqual(workLineProcesses(linesJson, workLinesJson), ['철거', '설비', '타일', '청소']);
  assert.deepEqual(workLineProcesses('broken', undefined), []);
});

test('parsePhoneWorkLine: 공종 and 지출 are required, the rest is checked', () => {
  const body = { siteId: 'site-1', date: '2026-11-24', process: ' 타일 ', expense: '32,000원', note: ' 본드 ' };
  assert.deepEqual(parsePhoneWorkLine(body), { ok: true, value: { siteId: 'site-1', date: '2026-11-24', process: '타일', expense: 32000, note: '본드' } });
  const refused = (override) => {
    const result = parsePhoneWorkLine({ ...body, ...override });
    assert.equal(result.ok, false, JSON.stringify(override));
    return result.error;
  };
  assert.match(refused({ siteId: '' }), /현장/);
  assert.match(refused({ process: '' }), /공종/);
  assert.match(refused({ process: '가'.repeat(41) }), /40자/);
  assert.match(refused({ expense: '' }), /지출/);
  assert.match(refused({ expense: '0' }), /지출/);
  assert.match(refused({ expense: '3.2만' }), /숫자/);
  assert.match(refused({ date: '2026-13-01' }), /날짜/);
  assert.match(refused({ note: '가'.repeat(101) }), /100자/);
  assert.equal(parsePhoneWorkLine(null).ok, false);
});

test('newPhoneWorkLine: a normal 실행 line marked as from the phone', () => {
  const line = newPhoneWorkLine({ siteId: 'site-1', date: '2026-11-24', process: '타일', expense: 32000, note: '본드' }, author, '2026-11-24T01:00:00.000Z', 'f'.repeat(24));
  assert.deepEqual(line, {
    id: `work-phone-${'f'.repeat(24)}`,
    sourceLineId: '',
    date: '2026-11-24',
    space: '',
    category: '',
    process: '타일',
    name: '',
    spec: '',
    unit: '',
    quantity: 0,
    executionUnitPrice: 0,
    income: 0,
    expense: 32000,
    payment: 0,
    executionAmount: 32000,
    vendor: '',
    status: '완료',
    note: '본드',
    addedFrom: 'phone',
    addedBy: '김가영',
    addedAt: '2026-11-24T01:00:00.000Z',
  });
});

test('unseenPhoneLines: phone lines the office never saw come back; ones it saw and removed stay removed', () => {
  const stored = JSON.stringify([
    { id: 'w-office', process: '목공', expense: 1 },
    { id: 'p-old', process: '타일', expense: 2, addedFrom: 'phone', addedBy: '김', addedAt: '2026-11-20T00:00:00Z' },
    { id: 'p-new', process: '철물', expense: 3, addedFrom: 'phone', addedBy: '이', addedAt: '2026-11-24T00:00:00Z' },
    { id: 'p-kept', process: '청소', expense: 4, addedFrom: 'phone', addedBy: '박', addedAt: '2026-11-24T00:00:00Z' },
  ]);
  // The office editor loaded w-office and p-old, deleted p-old, kept nothing else, and never saw p-new; p-kept it sends.
  const back = unseenPhoneLines(stored, new Set(['w-office', 'p-kept']), new Set(['w-office', 'p-old']));
  assert.deepEqual(back.map((line) => line.id), ['p-new']);
  assert.equal(back[0].addedFrom, 'phone');
  // Without seen ids (an editor opened before this deploy), every missing phone line comes back.
  assert.deepEqual(unseenPhoneLines(stored, new Set(['w-office']), null).map((line) => line.id), ['p-old', 'p-new', 'p-kept']);
  assert.deepEqual(unseenPhoneLines('broken', new Set(), new Set()), []);
});
