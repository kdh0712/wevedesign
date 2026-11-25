# 세부내역서 품명 한 줄로 합치기 — design

Approved in conversation on 2026-11-25 ("품명마다 따로 (추천)으로 진행 해줘", then the mockup with one correction: "품명을
합친 경우 초록색으로 표시할 필요는 없음"). Calls marked *(my call)* were not discussed with the owner and may be corrected.

## Why

Staff split one piece of furniture into several 자재 DB items (냉장고장 = 상부장 + 롱 EP) to price it, but the customer's
세부내역서 should show it as one line: 냉장고장 with the summed amount, no 규격, and no 품명 소계 under it.

## What

- Per 품명, per 공사, per estimate version: the 견적서 tab's line menu (⋯) offers '세부내역서에서 한 줄로 합치기' on a line
  whose 품명 has two or more lines in the same 공사; when on, it reads '세부내역서에서 나눠 보이기' and turns it off.
  Lines of a merged 품명 show a '서류에 한 줄' note under the 품명 cell.
- On the 세부내역서 (print, batch print, the 견적서 tab's live preview and 엑셀로 받기) the 품명's lines become one plain
  line, drawn like any other line (no colour): 품명, empty 규격, 단위 '식', 수량 1, 단가 = 금액 = the lines' summed
  amount, 비고 = their distinct notes joined with ' · ' *(my call)*. No 품명 소계 for it; the 공사 closes with 소계 unless
  another 품명 still has one.
- Unchanged: every amount (견적 금액, 공과잡비, 갑지), the 견적서 input table, 실행 내역서, the 자재 DB, the phone views.

## How (my calls)

- Stored as `detailOneLine: true` on the estimate lines (kept by the estimate save, `normalizeLines`). Turning it on marks
  every line of that 공사 + 품명; a 품명 is merged when any of its lines is marked and it has two or more lines, so a line
  added later with the same 품명 joins. Turning it off clears them all. 품명 and 공사 match as the documents do (trimmed
  품명, `templateGroupLabel`).
- One pure function (`app/lib/estimate-detail-one-line.ts`) replaces a merged 품명's lines with one line before the
  documents group and cluster them, so all renderers agree.
- Templates do not keep the mark (template save has its own line fields); saving an estimate as a template drops it.

## Approaches

1. Per 품명 switch in the line menu (chosen): only the 품명 that need it are merged; 욕실 and the like stay detailed.
2. One switch per estimate: simpler, but merges every multi-line 품명.
