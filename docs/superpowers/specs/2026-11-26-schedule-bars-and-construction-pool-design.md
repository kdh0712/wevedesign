# 공정표: 색 막대 출력과 공사 단위 공정 작업 — design

Approved in conversation on 2026-11-26:
- "공정표에서 기존처럼 공사 일정끼리 색으로 표현한 것을 다시 적용해줘 지금 디자인에서", then "이런 식으로 색을 연하게"
  with a screenshot of the on-screen 공정 달력.
- "공정 달력 옆에 견적서에 존재하는 모든 공정을 보여줄 필요없이 공사 단위로 묶어서 공사 밑에 작게 어떤 공정들이 있는지만
  표현해줘 왜냐하면 공사 단위로 공정표를 작성하거든", the mockup, and "공사 단위로 묶어서 진행해줘".

Calls marked *(my call)* were not discussed and may be corrected.

## 1. Printed 공정표: colour bars again

- The printed 공정표 keeps the head of #65 and #66: the address on the left, '공정표' with a double underline in the middle,
  the company on the right, and the big day numbers.
- The days draw the 공정 달력's bars again, replacing the per-day text list:
  - one bar per task across its days, longest on top (`layoutCalendarWeek`);
  - the name and the worker in the middle.
- Colours are the ones chosen for each task in 공정 일정, in the same light shade as on screen (`softenColor`), with dark
  text.
- `tasksOnDay` is no longer used and is removed.

## 2. 공정 작업 list by 공사

- The list beside the 공정 달력 shows one card per 공사 (the line's 분류), in the estimate's order.
- Under the name, in small text, are the 공정 that 공사 holds:
  - each distinct 공종;
  - a 공종 named like the 공사 itself (spaces ignored) shows the 품명 instead;
  - up to six, then five and '외 N개'. *(my call)*
- Dragging or clicking a card makes a task named after the 공사, as dragging a 공종 did before. The name can still be
  changed afterwards.
- 실행 내역서 lines join the 공사 in their 분류. A line without one joins the 공사 of an estimate line with the same 공종,
  else '기타', which comes last. *(my call)*
- The count badge counts 공사.
- Rules: `app/lib/schedule-process-pool.ts`, tested in `tests/schedule-process-pool.test.mjs`.
