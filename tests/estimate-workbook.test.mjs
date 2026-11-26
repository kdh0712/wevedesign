import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateWorkbook, estimateWorkbookFileName } from '../app/lib/estimate-workbook.ts';

// 서류 출력 → 엑셀로 받기: the 갑지 and 세부내역서 as one workbook, the same rows as the printed documents, amounts as
// numbers with formulas so a change made in Excel carries through to the totals.

const line = (name, spec, unit, quantity, customerUnitPrice, note = '') => ({ type: 'line', line: { name, spec, space: '', unit, quantity, customerUnitPrice, note } });

// 1. 철거 공사: two lines. 2. 타일 공사: 거실 욕실 (2 lines, its own 소계) and 현관 (1 line), closing with 합계.
const rows = [
  { type: 'group', groupIndex: 0, category: '철거 공사' },
  line('철거', '주방 상하부장', '식', 1, 400000),
  line('폐기물', '1톤 차량', '대', 3, 350000),
  { type: 'subtotal', amount: 1450000, hasNameSubtotals: false },
  { type: 'group', groupIndex: 1, category: '타일 공사' },
  line('거실 욕실', '벽 600x1200', '식', 1, 1900000),
  line('거실 욕실', '바닥 300x300', '', 1, 600000, '고객 지급'),
  { type: 'nameSubtotal', amount: 2500000 },
  line('현관', '600x600', '식', 1.5, 300000),
  { type: 'subtotal', amount: 2950000, hasNameSubtotals: true },
  { type: 'overhead', amount: 132000, rate: 3 },
  { type: 'total', amount: 4532000 },
];

const book = estimateWorkbook({ siteTitle: '평촌 래미안 32평', customerName: '홍길동', dateText: '2026년 11월 24일', versionLabel: '최종안', rows });
const [summary, detail] = book.sheets;
// The cell at a 1-based row and a column letter.
const at = (sheet, row, column) => sheet.rows[row - 1]?.[column.charCodeAt(0) - 65];

test('the workbook holds the 갑지, then the 세부내역서, and is named after the site and version', () => {
  assert.deepEqual(book.sheets.map((sheet) => sheet.name), ['갑지', '세부내역서']);
  assert.equal(book.fileName, '평촌 래미안 32평_견적서_최종안.xlsx');
});

test('세부내역서: a title, the header, then 공사 rows, lines, 소계 and 총합계 as printed', () => {
  assert.equal(at(detail, 1, 'A'), '내 역 서');
  assert.equal(at(detail, 2, 'A'), '평촌 래미안 32평 · 최종안');
  assert.deepEqual(detail.rows[3], ['품명', '규격', '단위', '수량', '단가', '금액', '비고']);
  assert.equal(at(detail, 5, 'A'), '1. 철거 공사');
  assert.deepEqual(detail.rows[5].slice(0, 4), ['철거', '주방 상하부장', '식', 1]);
  assert.deepEqual(at(detail, 6, 'E'), { t: 'n', v: 400000, z: '#,##0' });
  assert.deepEqual(at(detail, 6, 'F'), { t: 'n', v: 400000, z: '#,##0', f: 'D6*E6' });
  assert.deepEqual(at(detail, 7, 'F'), { t: 'n', v: 1050000, z: '#,##0', f: 'D7*E7' });
  assert.equal(at(detail, 8, 'A'), '소계');
  assert.deepEqual(at(detail, 8, 'F'), { t: 'n', v: 1450000, z: '#,##0', f: 'SUM(F6:F7)' });
  assert.equal(at(detail, 9, 'A'), '2. 타일 공사');
  // A line with no unit reads 식, as on paper; 비고 is kept.
  assert.equal(at(detail, 11, 'C'), '식');
  assert.equal(at(detail, 11, 'G'), '고객 지급');
  assert.equal(at(detail, 12, 'A'), '소계');
  assert.deepEqual(at(detail, 12, 'F'), { t: 'n', v: 2500000, z: '#,##0', f: 'SUM(F10:F11)' });
  assert.equal(at(detail, 13, 'D'), 1.5);
  // The 공사 total counts its lines, not the 품명 소계 between them.
  assert.equal(at(detail, 14, 'A'), '합계');
  assert.deepEqual(at(detail, 14, 'F'), { t: 'n', v: 2950000, z: '#,##0', f: 'SUM(F10:F11,F13)' });
  assert.equal(at(detail, 15, 'A'), '공과잡비 (3%)');
  assert.deepEqual(at(detail, 15, 'F'), { t: 'n', v: 132000, z: '#,##0', f: 'ROUND(ROUND(SUM(F8,F14),0)*3/100,0)' });
  assert.equal(at(detail, 16, 'A'), '총합계');
  assert.deepEqual(at(detail, 16, 'F'), { t: 'n', v: 4532000, z: '#,##0', f: 'ROUND(SUM(F8,F14),0)+F15' });
  assert.equal(detail.rows.length, 16);
  assert.deepEqual(detail.merges, ['A1:G1', 'A2:G2']);
  assert.equal(detail.cols.length, 7);
});

test('갑지: one row per 공사 and the 공과잡비, each taken from the 세부내역서, then 합계', () => {
  assert.equal(at(summary, 1, 'A'), '견 적 서');
  assert.deepEqual(summary.rows[2], ['공사명', '평촌 래미안 32평']);
  assert.deepEqual(summary.rows[3], ['고객', '홍길동']);
  assert.deepEqual(summary.rows[4], ['견적일', '2026년 11월 24일']);
  assert.equal(at(summary, 6, 'A'), '견적 금액');
  assert.deepEqual(at(summary, 6, 'B'), { t: 'n', v: 4532000, z: '#,##0', f: "'세부내역서'!F16" });
  assert.deepEqual(summary.rows[7], ['공정', '규격', '산식', '단위', '금액', '세액']);
  assert.deepEqual(summary.rows[8].slice(0, 4), ['1. 철거 공사', '', 1, '식']);
  assert.deepEqual(at(summary, 9, 'E'), { t: 'n', v: 1450000, z: '#,##0', f: "'세부내역서'!F8" });
  assert.equal(at(summary, 10, 'A'), '2. 타일 공사');
  assert.deepEqual(at(summary, 10, 'E'), { t: 'n', v: 2950000, z: '#,##0', f: "'세부내역서'!F14" });
  assert.equal(at(summary, 11, 'A'), '공과잡비 (3%)');
  assert.deepEqual(at(summary, 11, 'E'), { t: 'n', v: 132000, z: '#,##0', f: "'세부내역서'!F15" });
  assert.equal(at(summary, 12, 'A'), '합계 (부가세 별도)');
  assert.deepEqual(at(summary, 12, 'E'), { t: 'n', v: 4532000, z: '#,##0', f: "'세부내역서'!F16" });
  assert.equal(summary.rows.length, 12);
  assert.deepEqual(summary.merges, ['A1:F1', 'A12:D12']);
});

test('no 공과잡비: the 총합계 is the 공사 totals alone and the 갑지 has no 공과잡비 row', () => {
  const plain = estimateWorkbook({ siteTitle: '현장', customerName: '', dateText: '', versionLabel: '', rows: [...rows.slice(0, 4), { type: 'total', amount: 1450000 }] });
  const [sheetSummary, sheetDetail] = plain.sheets;
  assert.deepEqual(sheetDetail.rows[8][5], { t: 'n', v: 1450000, z: '#,##0', f: 'ROUND(SUM(F8),0)' });
  assert.equal(sheetSummary.rows.some((cells) => String(cells[0]).startsWith('공과잡비')), false);
  assert.equal(sheetDetail.rows[1][0], '현장');
});

test('an estimate with no lines still gives a workbook with a 0 total', () => {
  const empty = estimateWorkbook({ siteTitle: '', customerName: '', dateText: '', versionLabel: '', rows: [{ type: 'total', amount: 0 }] });
  assert.deepEqual(empty.sheets[1].rows[4][5], { t: 'n', v: 0, z: '#,##0', f: 'ROUND(0,0)' });
  assert.equal(empty.fileName, '견적서.xlsx');
});

test('estimateWorkbookFileName keeps the name safe to save on Windows and phones', () => {
  assert.equal(estimateWorkbookFileName('A/B: 101동*?', ''), 'A_B_ 101동___견적서.xlsx');
  assert.equal(estimateWorkbookFileName('  ', '2차안'), '견적서_2차안.xlsx');
  assert.equal(estimateWorkbookFileName('가'.repeat(100), '').length <= 90, true);
});

test('a 품명 소계 sums only its own 품명, not a one-line 품명 before it in the same 공사', () => {
  const book2 = estimateWorkbook({
    siteTitle: '현장',
    customerName: '',
    dateText: '',
    versionLabel: '',
    rows: [
      { type: 'group', groupIndex: 0, category: '욕실 공사' },
      line('철거', '', '식', 1, 100),
      line('거실 욕실', '벽', '식', 1, 1000),
      line('거실 욕실', '바닥', '식', 1, 2000),
      { type: 'nameSubtotal', amount: 3000 },
      { type: 'subtotal', amount: 3100, hasNameSubtotals: true },
      { type: 'total', amount: 3100 },
    ],
  });
  const sheet = book2.sheets[1];
  // Row 9 sums the two 거실 욕실 lines (rows 7-8); the old code took 철거 (row 6) in as well.
  assert.deepEqual(sheet.rows[8][5], { t: 'n', v: 3000, z: '#,##0', f: 'SUM(F7:F8)' });
  assert.deepEqual(sheet.rows[9][5], { t: 'n', v: 3100, z: '#,##0', f: 'SUM(F6:F8)' });
});

test('priced lines with no 품명 (left off the documents, counted in the total) get a row of their own, so Excel totals match the printed ones', () => {
  const book3 = estimateWorkbook({
    siteTitle: '현장',
    customerName: '',
    dateText: '',
    versionLabel: '',
    unnamedAmount: 50000,
    rows: [...rows.slice(0, 4), { type: 'overhead', amount: 45000, rate: 3 }, { type: 'total', amount: 1545000 }],
  });
  const [sheetSummary, sheetDetail] = book3.sheets;
  assert.deepEqual(sheetDetail.rows[8], ['품명 없는 항목', '', '', '', '', { t: 'n', v: 50000, z: '#,##0' }, '']);
  assert.deepEqual(sheetDetail.rows[9][5], { t: 'n', v: 45000, z: '#,##0', f: 'ROUND(ROUND(SUM(F8,F9),0)*3/100,0)' });
  assert.deepEqual(sheetDetail.rows[10][5], { t: 'n', v: 1545000, z: '#,##0', f: 'ROUND(SUM(F8,F9),0)+F10' });
  assert.deepEqual(sheetSummary.rows[9].slice(0, 5), ['품명 없는 항목', '', 1, '식', { t: 'n', v: 50000, z: '#,##0', f: "'세부내역서'!F9" }]);
  // Without any, no such row.
  assert.equal(detail.rows.some((cells) => cells[0] === '품명 없는 항목'), false);
});

test('세부내역서: a 단가 with a fraction (세부내역서 표시 바꾸기) shows its decimals; whole amounts stay #,##0', () => {
  const fractional = estimateWorkbook({
    siteTitle: '현장',
    customerName: '',
    dateText: '',
    versionLabel: '',
    rows: [
      { type: 'group', groupIndex: 0, category: '가구 공사' },
      line('씽크대', '', '식', 7, 316285.714286),
      { type: 'subtotal', amount: 2214000, hasNameSubtotals: false },
      { type: 'total', amount: 2214000 },
    ],
  });
  const sheet = fractional.sheets[1];
  assert.equal(at(sheet, 6, 'E').z, '#,##0.##');
  assert.equal(at(sheet, 6, 'F').z, '#,##0');
});
