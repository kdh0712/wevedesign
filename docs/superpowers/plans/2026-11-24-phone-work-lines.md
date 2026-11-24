# 폰 실행내역서 등록 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 폰 [실행내역서 등록] → 영수증 첨부(영수증함) 또는 직접 등록(실행내역서에 바로).

**Spec:** docs/superpowers/specs/2026-11-24-phone-work-lines-design.md

## Global Constraints

- Branch is stacked on `feat/amount-commas-summary-fit` (PR #51, the receipt sheet's comma input); move to main after it merges.
- lib modules: relative `.ts` imports only. Mixed-EOL files (`app/manager-weve-7519/page.tsx`, `app/api/manager/estimate/route.ts`, `app/api/manager/office/route.ts`): restore line endings after edits.
- 공종 ≤ 40 chars, 비고 ≤ 100, 메모 ≤ 100, 지출 via `parseReceiptAmount` (직접 등록: ≥ 1).
- Phone lines: `addedFrom: 'phone'`, `addedBy` (session name), `addedAt` (ISO), id `work-phone-<24 hex>`.

## Review Focus

1. The office saves a version (stale editor) after a phone line was added → the phone line survives; a phone line the office saw and deleted stays deleted.
2. Two phones add lines at once → both lines land (updateTime precondition + retry).
3. A site without any estimate → direct entry refused with a clear message; nothing written.
4. Totals after a phone line: `executionCostTotal` grows by the expense, margins recomputed exactly as an office save would.
5. A receipt saved with skip (no details) still works as before; old receipts without process/note fill the work line as before.

---

### Task 1: 실행 줄 공용 규칙 (`app/lib/estimate-work-lines.ts`)

- Move `normalizeWorkLines` (+ `toNumber`) out of `app/api/manager/estimate/route.ts`; keep `receiptId`, and for phone lines `addedFrom`, `addedBy`, `addedAt`.
- `workLineTotals(workLines, { customerEstimateTotal, additionalCostTotal })` → `{ actualExecutionCostTotal, actualMarginAmount, actualMarginRate, executionCostTotal, marginAmount, marginRate }` (the route's `calculateTotals` uses it).
- `pickWorkLineTarget(estimates)` (live estimates; newest `final`, else newest), `workLineProcesses(linesJson, workLinesJson)`,
  `parsePhoneWorkLine(body)`, `newPhoneWorkLine(input, author, nowIso, hex)`, `unseenPhoneLines(storedWorkLinesJson, incomingIds, seenIds)`.
- Tests first: `tests/estimate-work-lines.test.mjs` (Review Focus 1, 3, 4 at the rule level).

### Task 2: 서버 — 직접 등록 API와 저장 때 합치기

- `GET/POST /api/manager/mobile/work-line` (`sites`): GET `?siteId=` → `{ target: { id, label } | null, processes }`; POST → append with updateTime precondition (3 tries), recompute totals, leave `updatedAt`.
- `saveEstimateIfUnchangedInFirestore` takes an optional `prepare(stored)`; the estimate save re-adds `unseenPhoneLines` (from `body.seenWorkLineIds`) and recomputes totals before writing; the answer's `record` carries them.

### Task 3: 영수증 칸 추가 (공종·비고·날짜)

- `site-receipts.ts`: `process`, `note`, editable `receiptDate` in create/update, view and `receiptWorkLineDraft` (note → memo → '영수증'). Tests first.
- Route passes them through; PC panel edit shows 공종·비고·날짜.

### Task 4: 폰 화면

- Button [실행내역서 등록] → chooser [영수증 첨부] [직접 등록] + 내가 올린 영수증.
- 영수증 첨부: photos → site → details (optional, [건너뛰고 등록]) → 등록.
- 직접 등록: site → GET target/processes → form (날짜, 공종 select + 직접 입력, 지출, 비고) → 등록 (stays on the site for the next line).

### Task 5: PC 실행내역서

- `hydrateWorkLines` keeps `addedFrom/addedBy/addedAt`; rows show 📱 + 이름.
- Save sends `seenWorkLineIds` (ids from the loaded/saved version); after a save, lines in the answer that the editor lacks are added to it and to the saved snapshot.

### Task 6: 문서·검증·검토·PR
