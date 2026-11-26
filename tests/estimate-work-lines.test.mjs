import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendMissingLines,
  newPhoneWorkLine,
  normalizeWorkLines,
  parsePhoneWorkLine,
  pickWorkLineTarget,
  parsePaidCell,
  unseenPhoneLines,
  workLedgerFilterOptions,
  workLedgerSums,
  workLinePaid,
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
    paid: true,
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

test('appendMissingLines: lines the editor lacks are added after what it has now', () => {
  const current = [{ id: 'a', note: 'typed during the save' }, { id: 'b' }];
  const merged = appendMissingLines(current, [{ id: 'b', note: 'server copy' }, { id: 'p' }]);
  assert.deepEqual(merged.map((line) => line.id), ['a', 'b', 'p']);
  assert.equal(merged[0].note, 'typed during the save');
  assert.equal(merged[1], current[1]);
  assert.equal(appendMissingLines(current, []), current);
});

test('normalizeWorkLines reads empty text cells as before: 0 or false in a text column is blank', () => {
  // Legacy workbook rows (normalizeLegacyWorkSites) can carry numbers or booleans in text columns.
  const [line] = normalizeWorkLines([{ id: 'w', name: '목공', space: 0, vendor: false, note: null, status: '' }]);
  assert.deepEqual([line.space, line.vendor, line.note, line.status], ['', '', '', '예정']);
  assert.equal(normalizeWorkLines([{ id: 'w', space: 0, vendor: false }]).length, 0);
});

// 실행 내역서 결제/미결제와 공종 고르기 (spec docs/superpowers/specs/2026-11-26-work-ledger-paid-filter-design.md).

test('workLinePaid: a saved choice wins; a line from before reads 결제 when its old 결제 amount is above 0', () => {
  assert.equal(workLinePaid({ paid: true }), true);
  assert.equal(workLinePaid({ paid: false, payment: 50000 }), false);
  assert.equal(workLinePaid({ payment: 50000 }), true);
  assert.equal(workLinePaid({ payment: '30,000' }), true);
  assert.equal(workLinePaid({ payment: 0 }), false);
  assert.equal(workLinePaid({}), false);
});

test('workLinePaid: an old line paid only in part stays 미결제, so what is still owed is not lost', () => {
  assert.equal(workLinePaid({ expense: 5_000_000, payment: 2_000_000 }), false);
  assert.equal(workLinePaid({ expense: 5_000_000, payment: 5_000_000 }), true);
  assert.equal(workLinePaid({ quantity: 2, executionUnitPrice: 100, payment: 150 }), false);
  assert.equal(workLinePaid({ income: 10_000_000, payment: 10_000_000 }), true);
});

test('workLinePaid: phone and receipt lines saved before the choice existed read 결제', () => {
  assert.equal(workLinePaid({ addedFrom: 'phone', expense: 32_000, payment: 0 }), true);
  assert.equal(workLinePaid({ receiptId: 'receipt-1', expense: 5_000 }), true);
  assert.equal(workLinePaid({ addedFrom: 'phone', expense: 32_000, paid: false }), false);
  const stored = JSON.stringify([{ id: 'work-phone-1', process: '타일', expense: 32_000, addedFrom: 'phone', addedBy: '김가영', addedAt: '2026-11-24T01:00:00Z' }]);
  assert.equal(unseenPhoneLines(stored, new Set(), null)[0].paid, true);
});

test('normalizeWorkLines keeps 결제/미결제 and reads it for lines saved before', () => {
  const lines = normalizeWorkLines([
    { id: 'a', process: '목공', expense: 100, paid: true },
    { id: 'b', process: '목공', expense: 100, paid: false, payment: 100 },
    { id: 'c', process: '전기', expense: 100, payment: 100 },
    { id: 'd', process: '전기', expense: 100 },
  ]);
  assert.deepEqual(lines.map((line) => line.paid), [true, false, true, false]);
});

test('newPhoneWorkLine records something already bought: 결제', () => {
  const line = newPhoneWorkLine({ siteId: 'site-1', date: '2026-11-24', process: '타일', expense: 32000, note: '' }, author, '2026-11-24T01:00:00.000Z', 'ab12');
  assert.equal(line.paid, true);
});

test('workLineProcesses also takes the lines themselves (the PC 견적 page)', () => {
  const lines = [{ process: '철거' }, { process: '', category: '설비' }, { process: '철거' }];
  assert.deepEqual(workLineProcesses(lines, [{ process: '청소' }, { process: '' }]), ['철거', '설비', '청소']);
});

test('workLedgerSums adds 건수, 수입, 지출 and 미결제 지출, for one 공종 or all', () => {
  const lines = [
    { process: '목공', expense: 1_850_000, paid: true },
    { process: ' 목공 ', expense: 920_000, paid: false },
    { process: '전기', quantity: 2, executionUnitPrice: 240_000, paid: false },
    { process: '', income: 10_000_000, paid: true },
  ];
  assert.deepEqual(workLedgerSums(lines, '목공'), { count: 2, income: 0, expense: 2_770_000, unpaid: 920_000 });
  assert.deepEqual(workLedgerSums(lines, '전기'), { count: 1, income: 0, expense: 480_000, unpaid: 480_000 });
  assert.deepEqual(workLedgerSums(lines, ''), { count: 1, income: 10_000_000, expense: 0, unpaid: 0 });
  assert.deepEqual(workLedgerSums(lines), { count: 4, income: 10_000_000, expense: 3_250_000, unpaid: 1_400_000 });
  assert.deepEqual(workLedgerSums([{ process: '목공', expense: 100, payment: 100 }], '목공').unpaid, 0);
});

test('workLedgerFilterOptions: the 공종 the ledger uses, in the given order, then the rest, a blank 공종 last', () => {
  const lines = [{ process: '청소' }, { process: '목공' }, { process: '' }, { process: '목공 ' }, { process: '철거' }, { process: '도배' }];
  assert.deepEqual(workLedgerFilterOptions(lines, ['철거', '전기', '목공']), [
    { process: '철거', count: 1 },
    { process: '목공', count: 2 },
    { process: '청소', count: 1 },
    { process: '도배', count: 1 },
    { process: '', count: 1 },
  ]);
});

test('parsePaidCell reads an old ledger 결제 cell: anything written (an amount, a date, 카드, 완료…) is 결제; blank, 0, -, X or 미… is 미결제', () => {
  for (const value of [30000, '30,000', '결제', '완료', '지급', '결제완료', 'O', 'y', '카드', '현금', '계좌이체', '완납', '2026-11-20', new Date(2026, 10, 20)]) {
    assert.equal(parsePaidCell(value), true, String(value));
  }
  for (const value of ['', 0, '0', '0원', '-', '미결제', '미지급', 'X', 'n', '없음', null, undefined]) assert.equal(parsePaidCell(value), false, String(value));
});
