# 실행 내역서: 결제/미결제, 공종 고르기, 정렬 — design

Approved in conversation on 2026-11-26 (the request, the mockup, then "표는 기존방식 대로 두고 공종을 선택하면 해당 공종의
리스트만 보여지고 합산은 따로 위에 보이게 진행해줘"). Calls marked *(my call)* were not discussed and may be corrected.

## What

- 결제 is 결제 or 미결제 only (no amount). The input row has a select; in the table the 결제 cell is a button that switches
  it. The top '결제 합계' card becomes '미결제 지출' (the 지출 of lines still 미결제).
- Alignment: 수입 and 지출 right-aligned, header and cells alike; every other column left-aligned. The 결제 column is
  narrower (9%); 비고 gets the room.
- 공종 (PC input row) is a select like the phone's: the estimate's 공종 in estimate order, then 공종 already used in the
  실행 내역서, then '직접 입력…' (a text field with '목록에서 고르기' back). Both use `workLineProcesses`.
- The table stays the date-ordered list. Above it, 공종 buttons ('전체' and each 공종 in the list, with counts); choosing one
  shows only that 공종's lines, and a line above the table shows its 건수, 수입, 지출 and 미결제 sums.
- Excel: export writes 결제/미결제 in the 결제 column; the old-ledger import reads a 결제 cell as 결제 when it holds an amount
  above 0 or a word such as 결제/완료/지급, and as 미결제 otherwise (anything starting with 미). *(my call)*

## How (my calls)

- Each 실행 line stores `paid: boolean` (kept by the estimate save, `normalizeWorkLines`). A line saved before has no
  `paid`; it reads as 결제 when its old `payment` amount is above 0, else 미결제. `payment` stays as it was, unused.
- New PC lines start 미결제; lines from the phone and from a receipt ([실행 항목으로]) start 결제, since they record
  something already bought.
- The 과거 실행 내역서 viewer shows 결제/미결제 the same way.
