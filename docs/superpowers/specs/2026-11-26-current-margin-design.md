# 현재 마진과 수금 카드 — design

Approved in conversation on 2026-11-26 ("실제 마진이 현재 마진으로 표현해야하는거 아니야?", the 수금 proposal, "부가세가
포함된 금액이라 따로 구분할 필요는 없어보여", then the mockup). Calls marked *(my call)* were not discussed.

## Why

'실제 마진' was 견적 금액 − 지출 so far, shown as soon as the 실행 내역서 had any line: with only a 계약금 (수입) line it read
100% of the 견적 금액. During the works it is the margin at that moment, not a final one. 수입 (계약금, 중도금) is about
collecting, not about margin.

## What

- '실제 마진' is now **현재 마진** = 견적 금액 − 실행 내역서 지출 − 추가 사항 비용, shown only once a 지출 is recorded
  ('미작성' before). Its line shows the rate and **예산 N% 사용** (지출 ÷ 견적 예상원가) *(my call)*.
- Above the 실행 내역서: **받은 금액** (수입 합계), **남은 받을 금액** (견적 금액 × 1.1 − 받은 금액: what comes in includes
  부가세; minus when more came in), **지출 합계** (with 미결제), **현장 잔액** (받은 금액 − 지출), **현재 마진**.
- The estimate save stores the 현재 마진 the same way (`workLineTotals`), so a version without 지출 stores 0, not the 견적 금액.
- The office page's '예상 마진' cards (현장 card, 견적 기준 예상 sum) and '실행 원가 · 자재·공정 예상 비용' showed that stored
  실행 내역서 margin and cost; they now show the estimate's own 예상 마진 and 예상 원가 (`estimatedMarginAmount`,
  `estimateExecutionCostTotal`, kept on every save), falling back to the old fields for a version saved before those
  existed *(my call)*. Sales still take the 실행 내역서 cost.

## How

- `workLedgerMoney` and `workLineTotals` in `app/lib/estimate-work-lines.ts`; the page's `calculateTotals` uses the same
  "a 지출 is recorded" rule.
