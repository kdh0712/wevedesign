import test from 'node:test';
import assert from 'node:assert/strict';
import { COLLAPSED_CATEGORY_CHIPS, visibleCategoryChips } from '../app/lib/category-chips.ts';

// The DB panel's category buttons, folded (the 견적 tab, spec in the 2026-11-24 proposal): a few first, the rest behind
// [카테고리 펼치기 +N]; the chosen category always shows.

const categories = Array.from({ length: 34 }, (_, index) => `카테고리${index + 1}`);

test('folded: the first few, the rest counted for the 펼치기 button', () => {
  const view = visibleCategoryChips(categories, '', false);
  assert.equal(COLLAPSED_CATEGORY_CHIPS, 6);
  assert.deepEqual(view.shown, categories.slice(0, 6));
  assert.equal(view.hiddenCount, 28);
});

test('folded: a chosen category further down still shows, after the first few', () => {
  const view = visibleCategoryChips(categories, '카테고리20', false);
  assert.deepEqual(view.shown, [...categories.slice(0, 6), '카테고리20']);
  assert.equal(view.hiddenCount, 27);
  // One among the first few is not shown twice; a choice not in the list is ignored.
  assert.deepEqual(visibleCategoryChips(categories, '카테고리2', false).shown, categories.slice(0, 6));
  assert.deepEqual(visibleCategoryChips(categories, '없는 것', false).shown, categories.slice(0, 6));
});

test('opened, or too few to fold (a +1 button would save nothing): every category', () => {
  assert.deepEqual(visibleCategoryChips(categories, '', true), { shown: categories, hiddenCount: 0 });
  const seven = categories.slice(0, 7);
  assert.deepEqual(visibleCategoryChips(seven, '', false), { shown: seven, hiddenCount: 0 });
  assert.deepEqual(visibleCategoryChips([], '', false), { shown: [], hiddenCount: 0 });
});
