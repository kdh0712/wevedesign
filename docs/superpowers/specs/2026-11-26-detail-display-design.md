# 세부내역서 표시 바꾸기 — design

Approved in conversation on 2026-11-26 (the request, then the mockup: "견적단가와 같게" answered the open question of
the same batch). Calls marked *(my call)* were not discussed and may be corrected.

## Why

The estimate sometimes prices a line in a unit staff need (싱크대: 5.4 M × 410,000), while the customer's 세부내역서 should
show it another way (식 1 × 2,214,000). The amount must stay the estimate's.

## What

- The 견적서 tab's line menu (⋯) offers '세부내역서 표시 바꾸기…' on a line with a 품명. A dialog shows the estimate's
  품명·규격·단위·수량·단가·금액 beside the values the 세부내역서 will show: 품명, 규격, 단위 and 수량 can be changed; the 금액
  is fixed; the 단가 is 금액 ÷ the shown 수량 (a fraction is allowed, with a note). 원래대로 removes it.
- A line with a display shows '서류 표시 변경' under its 품명 (it opens the dialog).
- It applies wherever the 세부내역서 is drawn: print, batch print, the 견적서 tab's live preview and 엑셀로 받기.
  Amounts, the 갑지, the input table and the 실행 내역서 do not change.
- A 품명 set to '세부내역서에서 한 줄로' is drawn merged; its lines' own displays do not apply while it is merged, and the
  menu item is not offered then. *(my call)*

## How (my calls)

- Stored as `detailDisplay: { name?, spec?, unit?, quantity?, for }` on the estimate line, only the fields that differ
  from the line (`detailDisplayChanges`); kept by the estimate save (`normalizeDetailDisplay` in `normalizeLines`).
  `for` is the 품명 it was set for: a line re-picked or retyped to another 품명 no longer shows it (review finding).
  A blank 품명 or 단위 never counts (the first would drop the line, the second prints 식 anyway); 규격 may be blank on
  purpose and then prints blank (the 공간 that would stand in for it is cleared); 수량 must be above 0.
- The shown 단가 keeps 12 significant digits, so 수량 × 단가 on the documents comes back to the amount; the Excel export
  shows a fractional 단가 with its decimals (`#,##0.##`).
- A display 품명 equal to another 품명 in the same 공사 is drawn with that 품명's rows, as any line with that name would
  be; the 한 줄로 merge still works on the real 품명. *(my call, review finding left as is)*
- `detailDocumentLines` (`app/lib/estimate-detail-display.ts`) merges the 한 줄로 품명 first, then applies each other
  line's display; every 세부내역서 path uses it.
- Templates do not keep it (template save has its own line fields).
