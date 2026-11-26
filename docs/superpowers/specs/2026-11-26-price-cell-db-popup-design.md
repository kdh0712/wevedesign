# 단가 칸 → 자재 DB 수정 팝업 — design

Approved in conversation on 2026-11-26: the request ("견적단가, 실행단가를 클릭을 하면 해당 자재 DB 내용을 수정할 수 있게
팝업창을 띄워줘", then "현장마다 금액이 다를 수 있으니 서버DB에 저장을 할 것인지 해당 현장에만 적용할 것인지 선택권을 줘야해"),
the mockup, and "품명·규격도 수정". Calls marked *(my call)* were not discussed and may be corrected.

## Why

Staff see a wrong or outdated price while writing an estimate and want to fix the 자재 DB item right there. But one site
may get a special price, so each change must say whether it is for this site only or for the DB too.

## What

- In the 견적서 tab's table, a mouse click on a 견적단가 or 실행단가 cell opens a 단가 수정 popup; the clicked field gets
  the focus. Moving into the cell with the keyboard (arrows, Tab, Enter) still types into the cell as before. *(my call)*
- The popup shows, for 품명, 규격, 단위, 견적단가 and 실행단가: this estimate's value now, the linked 자재 DB item's value now,
  and a field with the value to apply (filled with the line's values). It also shows the line's amount and margin before
  → after.
- Two choices, '이 현장에만 적용' selected first:
  - 이 현장에만 적용: only this line changes (like typing in the table; the estimate still needs 저장).
  - 자재 DB에도 저장: the line changes and the linked DB item is saved with the new 품명·규격·단위·견적단가·실행단가 at once.
    Other sites' estimates keep their own lines; the next pick or template load from the DB uses the new values.
- 단위 is editable too, with 품명 and 규격. *(my call)*
- A line with no DB item found (`findTemplateMaterial`: its remembered item, else the one item with the same
  품명·규격·단위) can only use 이 현장에만 적용; a note points to the line menu's 'DB에 저장' to add it as a new item.
- A '공통' line (its DB item is the 공통 item with 공통 항목s): its 품명 is the line's own, so 자재 DB에도 저장 keeps the DB
  item's 품명 (공통) and saves the rest; the popup says so. *(my call)*

## How (my calls)

- `app/lib/estimate-price-edit.ts` holds the rules: the draft from a line, applying a draft to a line, and the material
  save payload for a draft.
- The DB save sends the item's `_id` with its own 분류/공종/비고/source unchanged and never sends 공통 항목s (the server keeps
  stored ones). A 실행단가 equal to the 견적단가 is saved as 0, the DB's "견적단가와 같게".
- 자재 DB에도 저장 needs a 품명 (the server refuses a blank one). A failed save keeps the popup open with the line
  unchanged.
- Either choice stores the found DB item's id on the line (`materialId`), so a line that was only found by
  품명·규격·단위 stays linked after those change, also when they now differ from the DB for this site. A 품명 change drops the line's
  '세부내역서 한 줄로' and '서류 표시 변경' as they are tied to the 품명 they were set for (existing rule).
- The template manager's table does not get the popup.

## Review findings (fixed)

- A line priced 실행 = 견적 (what a DB item without its own 실행단가 gives) keeps its 실행단가 equal to a new 견적단가 until
  the 실행단가 is typed (`executionFollowsCustomer`, `withCustomerPrice`), so a 견적단가-only DB save keeps the item's
  "견적단가와 같게" instead of pinning the old price.
- With 자재 DB에도 저장 chosen, the popup lists the DB values the save would change and marks them in the DB column
  (`priceEditDbChanges`), so a value that differs only for this site is not pushed unseen.
- A line matched to the 공통 item counts as a 공통 line even without `commonName` (`isPriceEditCommon`).
- The second press of a double-click on the cell is ignored by the popup it opened; the backdrop closes it only on a press
  that started on the backdrop; it cannot be closed while a DB save is on its way.
- `saveMaterial` counts a saved item whose list reload fails as saved (with a message to refresh), so the popup never says
  the save failed when the DB did change.

Left as they are: the save sends the 분류·공종·비고·source of the page's cached item (the 자재 DB edit form does the same);
the old Sanity store, which replaces whole documents, would drop a 공통 item's 공통 항목 on a popup save (Firestore keeps
them); focus is not given back to the clicked cell when the popup closes.
