// 공과잡비 (overhead) on a customer estimate: a rate stored on each estimate version, added on top of the construction total
// and shown as its own line on the documents (spec docs/superpowers/specs/2026-11-24-estimate-overhead-design.md). Pure, with
// no imports, so the PC editor, the estimate API and the phone view share one rule and tests load it directly.

// A blank new estimate starts here; an estimate saved before 공과잡비 existed has no rate and reads as 0.
export const DEFAULT_OVERHEAD_RATE = 3;

const MAX_RATE = 20;

// A rate in %, 0-20, kept to one decimal. Anything else (or nothing) is 0: no 공과잡비.
export function normalizeOverheadRate(value: unknown): number {
  const text = typeof value === 'string' ? value.trim() : value;
  if (text === '' || text === null || text === undefined) return 0;
  const rate = Number(text);
  if (!Number.isFinite(rate) || rate < 0 || rate > MAX_RATE) return 0;
  return Math.round((rate + Number.EPSILON) * 10) / 10;
}

// The construction total times the rate, rounded to the won (`|| 0` turns -0 into 0).
export function overheadAmount(constructionTotal: number, rate: number): number {
  return Math.round((constructionTotal * rate) / 100) || 0;
}

export function overheadLabel(rate: number): string {
  return `공과잡비 (${rate}%)`;
}

// The rate the editor opens with: the saved estimate's own (0 if it predates 공과잡비), or 3% when the site has no
// estimate yet and a blank new one opens.
export function initialOverheadRate(estimate: { overheadRate?: unknown } | null | undefined): number {
  return estimate ? normalizeOverheadRate(estimate.overheadRate) : DEFAULT_OVERHEAD_RATE;
}
