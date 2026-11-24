// The DB panel's category buttons on the 견적 tab, folded: with many categories the buttons filled the panel and pushed the
// price list out of sight. Folded, the first few show and the rest wait behind [카테고리 펼치기 +N]; the chosen category
// shows either way (the 전체 카테고리 select above still lists them all). Pure, with no imports, so tests load it directly.

export const COLLAPSED_CATEGORY_CHIPS = 6;

export function visibleCategoryChips(
  categories: readonly string[],
  selected: string,
  expanded: boolean,
  limit = COLLAPSED_CATEGORY_CHIPS,
): { shown: string[]; hiddenCount: number } {
  // Folding away a single button would save nothing, so up to limit + 1 all show.
  if (expanded || categories.length <= limit + 1) return { shown: [...categories], hiddenCount: 0 };
  const shown = categories.slice(0, limit);
  if (selected && categories.includes(selected) && !shown.includes(selected)) shown.push(selected);
  return { shown, hiddenCount: categories.length - shown.length };
}
