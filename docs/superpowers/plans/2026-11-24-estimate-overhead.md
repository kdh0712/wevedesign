# 견적 공과잡비 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each estimate version carries a 공과잡비 rate. Its amount is added to the customer estimate total and shown as a line on the 갑지, the 세부내역서 and the phone estimate view. The DB panel shows every category button.

**Architecture:**
- The rules are pure functions in `app/lib/estimate-overhead.ts`, used by the PC editor, the estimate API and the phone view.
- `customerEstimateTotal` becomes 공사비 + 공과잡비 everywhere it is computed. Everything that reads the saved total follows without change.

**Tech Stack:** Next.js (TypeScript), node:test.

**Spec:** `docs/superpowers/specs/2026-11-24-estimate-overhead-design.md`

## Global Constraints

- **Rate:** % from 0 to 20, kept to one decimal. Anything else, or a missing value, reads as 0.
  - A new blank estimate starts at 3.
  - A copied version keeps the source rate.
  - A loaded saved estimate without the field is 0.
- **Amount:** 공과잡비 = `Math.round(공사비 × rate / 100)`. 견적 금액 = 공사비 + 공과잡비.
- **Line label:** `공과잡비 (3%)` (the rate without trailing zeros, e.g. `공과잡비 (2.5%)`). A 0% rate shows no line anywhere.
- **Files:** existing files are CRLF in the working copy with LF blobs. Keep a line-level diff.
- **Checks:** `npm test`, `npx tsc --noEmit -p .` and `npm run build` must pass. `npm run lint` is broken.

## Review Focus

1. Reopening a saved estimate from before this change must show the same 견적 금액 (rate 0, no line). Tests: Tasks 1 and 3.
2. Changing only the rate must mark the estimate as unsaved (snapshot), or the change is lost on leaving. Task 3 adds the rate to the snapshot.
3. A negative 공사비 (discount-heavy estimate) gives a negative 공과잡비. Show it as calculated; never NaN. Test: Task 1.
4. On the 세부내역서 the 공과잡비 line must sit on the same page as the 총합계, and that page must still fit. Test: Task 4 (tail rows paginate together).
5. A rate typed as text (`'3'`, `' 2.5 '`, `'abc'`) must be read safely by the API. Test: Task 1.

---

### Task 1: Overhead rules

**Files:**
- Create: `app/lib/estimate-overhead.ts`
- Test: `tests/estimate-overhead.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  export const DEFAULT_OVERHEAD_RATE = 3;
  export function normalizeOverheadRate(value: unknown): number;       // 0-20, one decimal; invalid or missing → 0
  export function overheadAmount(constructionTotal: number, rate: number): number; // Math.round(total * rate / 100) || 0
  export function overheadLabel(rate: number): string;                 // '공과잡비 (3%)', '공과잡비 (2.5%)'
  ```

- [ ] **Step 1: Write the failing tests.**
  - `normalizeOverheadRate`:
    - `3` → 3, `'2.5'` → 2.5, `' 3 '` → 3.
    - `2.55` → 2.6 (one decimal).
    - `-1` → 0, `21` → 0, `'abc'` → 0, `undefined` → 0, `null` → 0.
  - `overheadAmount`:
    - `(8471000, 3)` → 254130, `(1000, 2.5)` → 25.
    - `(0, 3)` → 0, `(8471000, 0)` → 0.
    - `(-10000, 3)` → -300.
  - `overheadLabel`: `3` → `'공과잡비 (3%)'`, `2.5` → `'공과잡비 (2.5%)'`.
- [ ] **Step 2: Run** `node --test tests/estimate-overhead.test.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the three functions. Pure, no imports.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit.** Message: "공과잡비 규칙".

### Task 2: Saved totals and the phone view

**Files:**
- Modify: `app/api/manager/estimate/route.ts`
  - `saveEstimate` stores `overheadRate: normalizeOverheadRate(body.overheadRate)`.
  - Its `calculateTotals` takes the rate. `customerEstimateTotal` = construction + `overheadAmount(construction, rate)`, and margins use that total.
  - `estimateProjection` adds `overheadRate`.
- Modify: `app/lib/mobile-estimate.ts`
  - `CustomerEstimateView` gains `overheadRate: number; overhead: number`.
  - `total` = groups total + overhead.
- Modify: `app/manager-weve-7519/m/estimate-view.tsx`: when `overhead !== 0`, show a `overheadLabel(rate)` row above 합계.
- Test: `tests/mobile-estimate.test.mjs`

**Interfaces:**
- Consumes: Task 1.

- [ ] **Step 1: Write the failing tests** in `tests/mobile-estimate.test.mjs`.
  - An estimate with lines summing to 1,000,000 and `overheadRate: 3` gives `overhead` 30000, `total` 1030000 and `overheadRate` 3.
  - Without `overheadRate` it gives `overhead` 0 and `total` 1000000.
- [ ] **Step 2: Run** `node --test tests/mobile-estimate.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** the API, phone-summary and phone-view changes.
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit -p .`. Expected: pass.
- [ ] **Step 5: Commit.** Message: "공과잡비를 저장 금액과 휴대폰 견적 보기에 반영".

### Task 3: PC editor rate and totals; DB category buttons

**Files:**
- Modify: `app/manager-weve-7519/estimate/page.tsx`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `calculateTotals(lines, workLines?, extraItems?, overheadRate = 0)`. It returns the existing fields plus `constructionTotal` and `overheadAmount`, with `customerEstimateTotal` = construction + overhead. It is used by Task 4.

- [ ] **Step 1: State and persistence.**
  - Add `const [overheadRate, setOverheadRate] = useState(DEFAULT_OVERHEAD_RATE)`.
  - Load (where `setConstructionStartDate(estimate?.constructionStartDate || '')` runs): `normalizeOverheadRate(estimate?.overheadRate)`.
  - The no-estimate reset (where `setConstructionStartDate('')` runs at ~line 1003) sets `DEFAULT_OVERHEAD_RATE`.
  - `startNewVersion(copyCurrent)` sets `copyCurrent ? overheadRate : DEFAULT_OVERHEAD_RATE`.
  - Add `overheadRate` to the saved-state snapshot JSON and its deps, and to the save payload next to `constructionStartDate`.
- [ ] **Step 2: Totals.** Thread `overheadRate` into every `calculateTotals(...)` call on the page.
- [ ] **Step 3: UI.** Next to the `견적 금액` metric, add a small field.
  - It is labelled `공과잡비`, with a number input of `step 0.1`, min 0, max 20, and a `%` suffix (no inputMode, see PR #47).
  - Show the amount, e.g. `· 254,130원`.
  - The input passes its value through `normalizeOverheadRate` on blur.
- [ ] **Step 4: DB buttons.** Remove `.slice(0, 10)` from `dbLibraryCategories.slice(0, 10).map` (line ~2800).
- [ ] **Step 5: Run** `npx tsc --noEmit -p .` and `npm test`. Expected: pass.
- [ ] **Step 6: Commit.** Message: "견적 화면 공과잡비 비율과 DB 카테고리 단추 전부 보이기".

### Task 4: Documents

**Files:**
- Modify: `app/manager-weve-7519/estimate/page.tsx`
  - `DetailPrintRow` gains `{ type: 'overhead'; key: string; amount: number; rate: number }`.
  - `buildEstimateDetailPrintPages(lines, totals)` passes tail `[overhead row (if amount ≠ 0), total row]` to `paginateByHeight`.
  - `detailRowHeight` gives the overhead row `DETAIL_LAYOUT.row`.
  - `renderDetailPrintRow` draws it like a 소계 row with label `overheadLabel(rate)`.
  - In `LandscapeEstimateDocumentPreview` summary view, add an `overheadLabel` row (amount in the 금액 column) before the 합계 row.
- Modify: `app/lib/estimate-detail-pages.ts`: `paginateByHeight` keeps the tail rows together.
- Modify: `app/manager-weve-7519/estimate/template-document-preview.tsx`: optional prop `overhead?: { rate: number; amount: number }`; when given with amount ≠ 0, a row above 합계. The site editor passes it; the template screen does not.
- Test: `tests/estimate-detail-pages.test.mjs`

- [ ] **Step 1: Write the failing test.** `paginateByHeight` keeps the tail together. With capacity 50, groups `[['g','a','b','c']]` (heights 10) and tail `['o','t']`, the result is `[['g','a','b','c'], ['o','t']]`. Today it gives `[['g','a','b','c','o'], ['t']]`.
- [ ] **Step 2: Run** `node --test tests/estimate-detail-pages.test.mjs`. Expected: FAIL on the new test.
- [ ] **Step 3: Implement.** Before placing the tail, if `used + sum(tail heights) > capacity` and the page is not empty, start a new page. Then add the document rows above.
- [ ] **Step 4: Check in the browser** with a fetch mock (an estimate with `overheadRate: 3`).
  - The 갑지 shows `공과잡비 (3%)` and the total including it.
  - The 세부내역서's last page shows it above 총합계.
  - The 표지 amount includes it.
  - With print styles applied, every detail page fits within 188 mm.
  - A rate of 0 shows no line.
- [ ] **Step 5: Run** `npm test`, `npx tsc --noEmit -p .` and `npm run build`. Expected: pass.
- [ ] **Step 6: Commit** with a line in `docs/WEVE_WORKING_RULES.md` (Estimate Documents) on the rate rules. Message: "서류에 공과잡비 줄".
- [ ] **Step 7: Push and open the PR**, bind it and turn Auto-fix on.
