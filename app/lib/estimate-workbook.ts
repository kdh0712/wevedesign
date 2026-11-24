// 서류 출력 → 엑셀로 받기: the 견적서 as one workbook, a 갑지 sheet and a 세부내역서 sheet with the same rows as the printed
// documents. Amounts are numbers (shown 1,234,000) with formulas — a line's 금액 is 수량 × 단가, each 소계 sums its lines, the
// 공과잡비 and 총합계 follow the 공사 totals the way the app computes them, and the 갑지 reads its amounts from the
// 세부내역서 — so a change made in Excel carries through. Cell colours and borders are left out (the free xlsx library does
// not write them). Pure, with relative imports only, so Node tests load it; the page turns the sheets into a file.
import { overheadLabel } from './estimate-overhead.ts';

export type WorkbookMoneyCell = { t: 'n'; v: number; z: string; f?: string };
export type WorkbookCell = string | number | WorkbookMoneyCell;
export type WorkbookSheet = { name: string; rows: WorkbookCell[][]; cols: number[]; merges: string[] };

// The 세부내역서 rows as the estimate page builds them for printing (its DetailPrintRow, minus the React keys).
export type WorkbookDetailRow =
  | { type: 'group'; groupIndex: number; category: string }
  | { type: 'line'; line: { name: string; spec?: string; space?: string; unit?: string; quantity: number; customerUnitPrice: number; note?: string } }
  | { type: 'nameSubtotal'; amount: number }
  | { type: 'subtotal'; amount: number; hasNameSubtotals: boolean }
  | { type: 'overhead'; amount: number; rate: number }
  | { type: 'total'; amount: number };

export type EstimateWorkbookInput = {
  siteTitle: string;
  customerName: string;
  dateText: string;
  versionLabel: string;
  rows: readonly WorkbookDetailRow[];
  // Priced lines with no 품명: the documents leave them out but the total counts them (the editor warns about them). The
  // workbook gives them a row of their own so its totals, once Excel recalculates, match the printed ones.
  unnamedAmount?: number;
};

const MONEY_FORMAT = '#,##0';
const DETAIL_SHEET = '세부내역서';
const DETAIL_HEADER = ['품명', '규격', '단위', '수량', '단가', '금액', '비고'];
const SUMMARY_HEADER = ['공정', '규격', '산식', '단위', '금액', '세액'];

const money = (value: number, formula?: string): WorkbookMoneyCell => ({ t: 'n', v: value, z: MONEY_FORMAT, ...(formula ? { f: formula } : {}) });
const fromDetail = (row: number) => `'${DETAIL_SHEET}'!F${row}`;

// Consecutive row numbers as Excel ranges: [10, 11, 13] → F10:F11,F13.
function amountRanges(rowNumbers: number[]): string {
  const ranges: string[] = [];
  let start = rowNumbers[0];
  let end = start;
  for (const row of rowNumbers.slice(1)) {
    if (row === end + 1) {
      end = row;
      continue;
    }
    ranges.push(start === end ? `F${start}` : `F${start}:F${end}`);
    start = row;
    end = row;
  }
  if (rowNumbers.length > 0) ranges.push(start === end ? `F${start}` : `F${start}:F${end}`);
  return ranges.join(',');
}

export function estimateWorkbookFileName(siteTitle: string, versionLabel: string): string {
  const clean = (text: string) => text.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 60);
  const title = clean(siteTitle);
  const version = clean(versionLabel);
  return `${title ? `${title}_` : ''}견적서${version ? `_${version}` : ''}.xlsx`;
}

export function estimateWorkbook(input: EstimateWorkbookInput): { fileName: string; sheets: [WorkbookSheet, WorkbookSheet] } {
  const detailRows: WorkbookCell[][] = [
    ['내 역 서'],
    [[input.siteTitle, input.versionLabel].filter(Boolean).join(' · ')],
    [],
    DETAIL_HEADER,
  ];
  // Where each 공사 total landed (for the 갑지 and the 총합계), and the rows of the lines summed by the open 소계.
  const groupTotals: Array<{ label: string; row: number; amount: number }> = [];
  let groupLabel = '';
  let groupLineRows: number[] = [];
  // The lines of the 품명 being read (a 품명 소계 sums only them): a new 품명 starts a new run.
  let nameLineRows: number[] = [];
  let lineName: string | null = null;
  let unnamedRow = 0;
  let overhead: { row: number; amount: number; rate: number } | null = null;
  let totalRow = 0;
  let totalAmount = 0;
  const constructionCells = () => [...groupTotals.map((group) => group.row), ...(unnamedRow ? [unnamedRow] : [])];
  const constructionSum = () => {
    const cells = constructionCells();
    return cells.length > 0 ? `SUM(${cells.map((row) => `F${row}`).join(',')})` : '0';
  };
  // The 품명 없는 항목 row, once, after the last 공사 and before the closing rows.
  const addUnnamedRow = () => {
    if (unnamedRow || !input.unnamedAmount) return;
    unnamedRow = detailRows.length + 1;
    detailRows.push(['품명 없는 항목', '', '', '', '', money(input.unnamedAmount), '']);
  };

  for (const row of input.rows) {
    // The 1-based sheet row this row lands on.
    const rowNumber = detailRows.length + 1;
    if (row.type === 'group') {
      groupLabel = `${row.groupIndex + 1}. ${row.category}`;
      groupLineRows = [];
      nameLineRows = [];
      lineName = null;
      detailRows.push([groupLabel]);
    } else if (row.type === 'line') {
      const { line } = row;
      if (line.name.trim() !== lineName) nameLineRows = [];
      lineName = line.name.trim();
      groupLineRows.push(rowNumber);
      nameLineRows.push(rowNumber);
      detailRows.push([
        line.name,
        line.spec || line.space || '',
        line.unit || '식',
        line.quantity,
        money(line.customerUnitPrice),
        money(line.quantity * line.customerUnitPrice, `D${rowNumber}*E${rowNumber}`),
        line.note || '',
      ]);
    } else if (row.type === 'nameSubtotal') {
      detailRows.push(['소계', '', '', '', '', money(row.amount, nameLineRows.length > 0 ? `SUM(${amountRanges(nameLineRows)})` : undefined), '']);
      nameLineRows = [];
      lineName = null;
    } else if (row.type === 'subtotal') {
      const formula = groupLineRows.length > 0 ? `SUM(${amountRanges(groupLineRows)})` : undefined;
      detailRows.push([row.hasNameSubtotals ? '합계' : '소계', '', '', '', '', money(row.amount, formula), '']);
      groupTotals.push({ label: groupLabel, row: rowNumber, amount: row.amount });
      nameLineRows = [];
      lineName = null;
    } else if (row.type === 'overhead') {
      addUnnamedRow();
      overhead = { row: detailRows.length + 1, amount: row.amount, rate: row.rate };
      detailRows.push([overheadLabel(row.rate), '', '', '', '', money(row.amount, `ROUND(ROUND(${constructionSum()},0)*${row.rate}/100,0)`), '']);
    } else {
      addUnnamedRow();
      totalRow = detailRows.length + 1;
      const formula = `ROUND(${constructionSum()},0)${overhead ? `+F${overhead.row}` : ''}`;
      detailRows.push(['총합계', '', '', '', '', money(row.amount, formula), '']);
      totalAmount = row.amount;
    }
  }

  const totalCell = () => (totalRow ? money(totalAmount, fromDetail(totalRow)) : money(totalAmount));
  const summaryRows: WorkbookCell[][] = [
    ['견 적 서'],
    [],
    ['공사명', input.siteTitle],
    ['고객', input.customerName],
    ['견적일', input.dateText],
    ['견적 금액', totalCell(), '원 (부가세 별도)'],
    [],
    SUMMARY_HEADER,
    ...groupTotals.map((group): WorkbookCell[] => [group.label, '', 1, '식', money(group.amount, fromDetail(group.row)), '']),
    ...(unnamedRow ? [['품명 없는 항목', '', 1, '식', money(input.unnamedAmount || 0, fromDetail(unnamedRow)), ''] as WorkbookCell[]] : []),
    ...(overhead ? [[overheadLabel(overhead.rate), '', 1, '식', money(overhead.amount, fromDetail(overhead.row)), ''] as WorkbookCell[]] : []),
  ];
  summaryRows.push(['합계 (부가세 별도)', '', '', '', totalCell(), '']);

  return {
    fileName: estimateWorkbookFileName(input.siteTitle, input.versionLabel),
    sheets: [
      { name: '갑지', rows: summaryRows, cols: [26, 16, 7, 7, 16, 10], merges: ['A1:F1', `A${summaryRows.length}:D${summaryRows.length}`] },
      { name: DETAIL_SHEET, rows: detailRows, cols: [22, 30, 7, 8, 13, 15, 18], merges: ['A1:G1', 'A2:G2'] },
    ],
  };
}
