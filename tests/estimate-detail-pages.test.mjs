import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTextLines, paginateByHeight } from '../app/lib/estimate-detail-pages.ts';

const ten = () => 10;

test('paginateByHeight fills a page up to its height and starts the next one when a row would not fit', () => {
  const pages = paginateByHeight([['g1', 'a', 'b', 's1'], ['g2', 'c', 's2']], ['total'], ten, 70);
  assert.deepEqual(pages, [
    ['g1', 'a', 'b', 's1', 'g2', 'c', 's2'],
    ['total'],
  ]);
});

test('a row that exactly fills the page stays on it', () => {
  assert.deepEqual(paginateByHeight([['g', 'a', 's']], ['t'], ten, 40), [['g', 'a', 's', 't']]);
});

test('a 공사 does not start at the foot of a page: its first rows (up to four) must fit together', () => {
  // After the first group 40 of 60 are used; the second group's first three rows need 30, so it moves to a new page.
  const pages = paginateByHeight([['g1', 'a', 'b', 's1'], ['g2', 'c', 's2']], [], ten, 60);
  assert.deepEqual(pages, [['g1', 'a', 'b', 's1'], ['g2', 'c', 's2']]);
  // A long group needs only its first four rows to fit; the rest may continue on the next page.
  const long = paginateByHeight([['g1', 'a'], ['g2', 'b', 'c', 'd', 'e', 'f', 's2']], [], ten, 70);
  assert.deepEqual(long, [['g1', 'a', 'g2', 'b', 'c', 'd', 'e'], ['f', 's2']]);
});

test('a taller row (wrapped text) counts its real height', () => {
  const heightOf = (row) => (row === 'tall' ? 30 : 10);
  assert.deepEqual(paginateByHeight([['g', 'a', 'tall', 's']], [], heightOf, 50), [['g', 'a', 'tall'], ['s']]);
});

test('a row taller than a whole page still gets a page of its own, and nothing gives an empty page', () => {
  const heightOf = (row) => (row === 'huge' ? 999 : 10);
  assert.deepEqual(paginateByHeight([['g', 'huge', 's']], ['t'], heightOf, 50), [['g'], ['huge'], ['s', 't']]);
  assert.deepEqual(paginateByHeight([], ['t'], ten, 50), [['t']]);
  assert.deepEqual(paginateByHeight([], [], ten, 50), []);
});

test('estimateTextLines counts wrapped lines from the text width at a font size', () => {
  assert.equal(estimateTextLines('난방공사', 200, 14), 1);
  assert.equal(estimateTextLines('', 200, 14), 1);
  // 30 Hangul characters at 14px are about 420px wide: three lines in a 200px cell.
  assert.equal(estimateTextLines('가'.repeat(30), 200, 14), 3);
  // Latin letters and digits are narrower than Hangul.
  assert.equal(estimateTextLines('XL-15/수도/전체철거', 230, 14), 1);
  assert.equal(estimateTextLines('a'.repeat(40), 200, 14), 2);
  assert.equal(estimateTextLines('text', 0, 14), 1, 'a cell with no width never divides by zero');
});

test('the closing rows (공과잡비 and 총합계) stay together on one page', () => {
  assert.deepEqual(paginateByHeight([['g', 'a', 'b', 'c']], ['o', 't'], ten, 50), [['g', 'a', 'b', 'c'], ['o', 't']]);
  assert.deepEqual(paginateByHeight([['g', 'a', 'b']], ['o', 't'], ten, 50), [['g', 'a', 'b', 'o', 't']]);
});

// 갑지 (summary) on one A4 landscape page: at least 13 rows (blank rows fill), and the rows get tighter when a site has
// more 공정 than that, so the 갑지 never spills onto a second page.
test('summaryLayout: blank rows fill to 13, density tightens past 13 and 15 rows', async () => {
  const { SUMMARY_MIN_ROWS, summaryLayout } = await import('../app/lib/estimate-detail-pages.ts');
  assert.equal(SUMMARY_MIN_ROWS, 13);
  assert.deepEqual(summaryLayout(8, false), { blankRows: 5, density: 'normal' });
  assert.deepEqual(summaryLayout(8, true), { blankRows: 4, density: 'normal' });
  assert.deepEqual(summaryLayout(13, false), { blankRows: 0, density: 'normal' });
  assert.deepEqual(summaryLayout(12, true), { blankRows: 0, density: 'normal' });
  assert.deepEqual(summaryLayout(13, true), { blankRows: 0, density: 'tight' });
  assert.deepEqual(summaryLayout(14, true), { blankRows: 0, density: 'tight' });
  // Measured: 16 rows at the tight spacing come to 192mm, past the 188mm page.
  assert.deepEqual(summaryLayout(15, true), { blankRows: 0, density: 'tightest' });
  assert.deepEqual(summaryLayout(16, false), { blankRows: 0, density: 'tightest' });
  assert.deepEqual(summaryLayout(17, false), { blankRows: 0, density: 'tightest' });
  assert.deepEqual(summaryLayout(0, false), { blankRows: 13, density: 'normal' });
});
