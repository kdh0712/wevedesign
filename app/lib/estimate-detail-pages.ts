// Page breaks for the printed 세부내역서 (detail sheet), by height rather than by a fixed number of rows, so every page fits
// the A4 landscape print area whatever the line count or wrapped text. Pure, with no imports, so tests load it directly.

// The printed page: A4 landscape (297 x 210 mm) inside the 10 mm / 8 mm print margins, with 6 mm of the 194 mm height kept
// free so rounding in the browser never pushes a row onto an extra sheet. The screen preview uses the same box.
export const DETAIL_PAGE_WIDTH_MM = 277;
export const DETAIL_PAGE_HEIGHT_MM = 188;
export const PX_PER_MM = 96 / 25.4;

// Width of one character in em: Hangul and other CJK are a full em, Latin letters and digits about half.
function charEm(char: string): number {
  if (/[ᄀ-ᇿ㄰-㆏가-힣　-〿一-鿿＀-￯]/.test(char)) return 1;
  if (char === ' ') return 0.28;
  if (/[A-Z0-9]/.test(char)) return 0.62;
  if (/[a-z]/.test(char)) return 0.55;
  if (/[.,:;'"|!()\-/]/.test(char)) return 0.4;
  return 0.62;
}

// How many lines the text takes in a cell widthPx wide at fontPx, with 8% to spare (rendering differs a little between
// fonts and browsers; overestimating only moves a row to the next page early).
export function estimateTextLines(text: string, widthPx: number, fontPx: number): number {
  if (!text || widthPx <= 0) return 1;
  const width = Array.from(text).reduce((sum, char) => sum + charEm(char), 0) * fontPx * 1.08;
  return Math.max(1, Math.ceil(width / widthPx));
}

// Packs rows onto pages of the given height. Each group (a 공사: its header row, lines and 소계) starts on a new page unless
// its first rows (up to keepTogether) fit together, so a page never ends on a lone 공사 title. tail (공과잡비 and 총합계)
// follows the last group and stays on one page. A row taller than a whole page still gets a page of its own.
export function paginateByHeight<T>(groups: T[][], tail: T[], heightOf: (row: T) => number, capacity: number, keepTogether = 4): T[][] {
  const pages: T[][] = [];
  let page: T[] = [];
  let used = 0;

  const place = (row: T) => {
    const height = heightOf(row);
    if (page.length > 0 && used + height > capacity) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(row);
    used += height;
  };

  for (const group of groups) {
    const lead = group.slice(0, keepTogether).reduce((sum, row) => sum + heightOf(row), 0);
    if (page.length > 0 && used + lead > capacity) {
      pages.push(page);
      page = [];
      used = 0;
    }
    group.forEach(place);
  }
  // The closing rows (공과잡비, 총합계) go together: if they do not all fit, they start a new page.
  const tailHeight = tail.reduce((sum, row) => sum + heightOf(row), 0);
  if (page.length > 0 && tail.length > 0 && used + tailHeight > capacity) {
    pages.push(page);
    page = [];
    used = 0;
  }
  tail.forEach(place);
  if (page.length > 0) pages.push(page);
  return pages;
}

// The height to plan a row with: its printed height as measured on the page (the estimate page lays an unseen copy of the
// rows out at print size) when there is one, else the estimate. The estimate counts a Hangul character as a full em, about
// a fifth wider than the fonts really draw it, so it saw wraps that do not happen and left gaps a whole 공사 would fit in.
export function measuredHeightOr<T extends { key: string }>(measured: ReadonlyMap<string, number>, estimate: (row: T) => number): (row: T) => number {
  return (row) => {
    const height = measured.get(row.key);
    return height !== undefined && Number.isFinite(height) && height > 0 ? height : estimate(row);
  };
}

// Whether a new measurement changes anything (to half a pixel), so measuring again after every edit re-splits the pages
// only when a row really grew or shrank.
export function sameRowHeights(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, height] of a) {
    const other = b.get(key);
    if (other === undefined || Math.abs(other - height) >= 0.5) return false;
  }
  return true;
}

// The 견적 갑지 on one A4 landscape page (the same DETAIL_PAGE_WIDTH_MM × DETAIL_PAGE_HEIGHT_MM box as the 세부내역서).
// Its table always shows at least SUMMARY_MIN_ROWS rows (blank rows fill it, as in the old workbook). Rows are the 공정
// plus the 공과잡비 row; past 13 they are drawn tighter, and past 15 tighter still, so the sheet keeps to one page (measured:
// 13 normal rows 186mm, 15 tight rows 186mm, 22 tightest rows 185mm of the 188mm page).
export const SUMMARY_MIN_ROWS = 13;
export type SummaryDensity = 'normal' | 'tight' | 'tightest';

export function summaryLayout(groupCount: number, hasOverhead: boolean): { blankRows: number; density: SummaryDensity } {
  const filled = groupCount + (hasOverhead ? 1 : 0);
  return {
    blankRows: Math.max(0, SUMMARY_MIN_ROWS - filled),
    density: filled <= SUMMARY_MIN_ROWS ? 'normal' : filled <= 15 ? 'tight' : 'tightest',
  };
}
