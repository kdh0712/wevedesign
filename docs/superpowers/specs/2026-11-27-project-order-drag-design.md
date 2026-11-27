# 시공 사례 순서 변경 (끌어서) — design

Approved in conversation on 2026-11-27: "만들어진 시공 사례의 순서변경 버튼을 누르면 각 사례를 마우스로 잡고 움직이면 순서가
알아서 변경 되도록 해줘", the mockup, and "정한 순서대로" (the homepage shows the set order only, no longer the main ones
first). Calls marked *(my call)* were not discussed and may be corrected.

## What

- The 시공 사례 list (관리자 > 홈페이지 > 시공 사례) gets a [순서 변경] button. In that mode:
  - every project is listed in the current order, the search, 분류 and 공개 filters set aside;
  - each row has a handle (⋮⋮) and a number;
  - rows are dragged up and down with the mouse;
  - [순서 저장] stores 1, 2, 3 … from the top as each project's 보이는 순서 (`displayOrder`), and [취소] puts the order back.
- Starting the mode closes the editor (asking first when it has unsaved changes). An open form still holds the old 보이는
  순서 and would put it back on [저장]. *(my call)*
- The homepage lists (시공 사례 page and the main page's 메인 시공 사례) order by 보이는 순서 only (missing last), then
  newest. 메인 표시 now only decides whether a project is also on the main page. The manager list uses the same order.
  The homepage cache refreshes within 60 seconds.

## How (my calls)

- `app/lib/project-order.ts` (pure, tested):
  - `sortProjectsByOrder`, the shared list order;
  - `moveInOrder`, one drag;
  - `readProjectOrder`, which checks the request: unique project ids, no drafts, up to 1000.
- `POST /api/manager/office` with `{ type: 'project', action: 'setOrder', ids }`:
  - permission: 시공 사례 (portfolio);
  - checks every id is a project, else refuses: "목록이 바뀌었습니다";
  - in one Sanity transaction, sets `displayOrder` = position + 1 and `updatedAt` on each project and its draft, if one
    exists.
- `projectQuery` (`app/lib/portfolio-data.ts`) orders `coalesce(displayOrder, 1000000) asc, _createdAt desc`.
- The 보이는 순서 field stays in the editor.
