# 시공 사례 여러 개 한 번에 삭제: [선택] — design

Asked on 2026-11-27: "휴지통과 사례를 선택해서 한번에 삭제할 수 있는 기능" (pick several 시공 사례, in the list and in the
휴지통, and delete them at once). Builds on the 휴지통 (`2026-11-27-project-trash-design.md`).

Offered two ways to pick:
- [선택] 버튼 (recommended): a [선택] button above the list. Every row gets a tick box, a click anywhere on the row ticks it, and
  the editor closes while picking. Works like [순서 변경]: the list is as before until [선택] is pressed, and a project
  cannot be opened by mistake.
- 체크 칸 항상 보이기: a tick box always on each row. The box ticks, the rest of the row opens the editor.

Chosen: "[선택] 버튼". Calls marked *(my call)* were not discussed and may be corrected.

## What

- [선택] sits next to [순서 변경]. Pressed, it becomes [선택 끝내기], and:
  - the editor closes; unsaved changes ask first, as when opening another project;
  - [+ 새 시공 사례 올리기] and [순서 변경] wait until [선택 끝내기]. [선택] itself waits while an upload panel is open
    *(my call: one mode at a time, as [순서 변경])*;
  - each row is a tick box. A "보이는 N개 모두 선택" box ticks or clears every row shown;
  - a bar under the list says "N개 선택". It stays on screen at the bottom while the list scrolls *(my call)*.
- In 전체 / 공개 / 숨김 the bar has [휴지통으로 옮기기] and [선택 해제].
- In 휴지통 the bar has [되돌리기], [완전히 삭제] (총괄 관리자 only, as one at a time) and [선택 해제].
  - Bulk [되돌리기] is included *(my call: picking many in the 휴지통 is as likely to be a mistake undone)*.
  - There is no separate [휴지통 비우기]: 모두 선택 then [완전히 삭제] does it *(my call)*.
- Every bulk action asks first, naming up to five projects and "외 N개":
  - [휴지통으로 옮기기]: they leave the homepage and can be restored;
  - [되돌리기]: how many that were 공개 come back on the homepage *(my call: one [되돌리기] does not ask, but many at once
    can put many on the homepage)*;
  - [완전히 삭제]: it cannot be undone.
- Only the ticked rows still shown count. A search or the 분류 filter that hides a ticked row leaves it out of the action
  and the count *(my call: nothing is deleted that is not on screen)*. Switching between 전체 / 공개 / 숨김 / 휴지통 clears
  the ticks *(my call)*.
- After an action, the ticks clear and [선택] stays on, so staff can go on to the 휴지통 *(my call)*.
- A project another screen already changed is skipped: "2개를 휴지통으로 옮겼습니다. … 1개는 다른 화면에서 이미 바뀌어
  건너뛰었습니다." When none is left, the action is refused, the list reloads and the error says so.

## How

- `/api/manager/office` POST `type: 'project'` with `action` (`trash` / `restore` / `deleteForever`) and `ids` (instead of
  `id`), handled before the branch that creates a new project from a request without an id.
  - `readProjectTrashIds`: 1 to 200 different project ids (the manager list reads at most 200).
  - `planProjectTrashBatch`: `deleteForever` from anyone but 총괄 관리자 is refused (403); each id goes through
    `projectTrashBlock` as stored now; the blocked ones are skipped and counted; none left → 409.
  - The allowed projects and their drafts change in one transaction, as one project does. `updatedAt` stays.
  - The answer is `{ ok, done, skipped }`.
- One at a time ([삭제] in the editor, the row buttons of the 휴지통) is unchanged.
- The rules are in `app/lib/project-trash.ts`, tested in `tests/project-trash.test.mjs`, including that the batch branch
  comes before the create branch.

## Review findings

Nothing Critical or Important. Fixed:
- "보이는 N개 모두 선택" ticks or clears only the rows shown; a tick a search hides stays.
- [선택 해제] clears every tick, also one a search hides (before, it was greyed out when no shown row was ticked).
- [선택] no longer has `aria-pressed`: its label already changes to [선택 끝내기].
- The id test also tries a single id.

Left as they are:
- If someone publishes or discards a draft in Sanity Studio between the read and the write, the whole batch fails with
  Sanity's error and nothing changes; a retry works. One project at a time has the same race.
- The route's transaction (drafts, who deleted it) has no test of its own; it is the single-project code applied to a list.
