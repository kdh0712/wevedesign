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
// its first rows (up to keepTogether) fit together, so a page never ends on a lone 공사 title. tail (the 총합계) follows
// the last group. A row taller than a whole page still gets a page of its own.
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
  tail.forEach(place);
  if (page.length > 0) pages.push(page);
  return pages;
}
