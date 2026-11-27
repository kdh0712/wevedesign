# 시공 사례 삭제: 휴지통으로 옮기고 되돌리기 — design

Asked on 2026-11-27: "시공 사례 삭제 버트" (a delete button for 시공 사례). Offered two ways:
- 되돌릴 수 있게 (recommended): deleting takes it off the homepage and the list at once and puts it in a 휴지통 group on
  the 시공 사례 screen, where it can be restored ([되돌리기]) or removed for good ([완전히 삭제]);
- 바로 완전히 삭제: a confirm box with the name typed in, and no way back.

Chosen: "되돌릴 수 있게". Calls marked *(my call)* were not discussed and may be corrected.

## Why

Today a 시공 사례 can only be hidden, or deleted in Sanity Studio. Staff want to remove one from the manager screen. A
mistake should be recoverable.

## What

- The editor of a project gets [삭제] at the bottom left, away from [저장].
  - It asks first: "'평촌 34평' 시공 사례를 휴지통으로 옮길까요? 홈페이지에서 사라지고, 휴지통에서 되돌릴 수 있습니다."
    When the form has unsaved changes, the question says they will be lost.
  - Then the project leaves the list and the editor closes. The homepage drops it within a minute, the same time a hidden
    project takes (60-second cache).
- The list's 공개 상태 chips get a fourth one: [휴지통 N].
  - It lists trashed projects, newest deletion first, with who deleted them and when.
  - Each row has [되돌리기] and [완전히 삭제]. A trashed project does not open in the editor.
- [되돌리기] puts the project back as it was. A project that was 공개 is 공개 again; its 보이는 순서 and 메인 표시 are
  kept *(my call: "되돌리기" means as before)*.
- [완전히 삭제] asks once more ("되돌릴 수 없습니다"), then deletes the project and its Sanity draft.
  - Only 총괄 관리자 can do it, as in the existing 휴지통 tab. Others see a note instead of the button *(my call)*.
  - The photo files stay in Sanity's asset store *(my call: an asset may be used by another project, and Sanity
    keeps unused assets harmlessly)*.
- Anyone who can edit 시공 사례 can move one to the 휴지통 and restore it.
- Trashed projects are left out of:
  - the homepage (`projectQuery`);
  - [순서 변경];
  - the upload's "same name: replace or new" choice;
  - the duplicate-name note;
  - the CLI `scripts/upload-project-folders.mjs`.
  A folder upload cannot replace a trashed project; the server refuses it.
- Not in the admin 휴지통 tab: that tab lists office records; 시공 사례 have their own on their screen *(my call)*.
- Nothing empties the 휴지통 on its own *(my call)*.

## How

- Sanity `project` documents get `deletedAt` and `deletedBy`, the names the office records' 휴지통 uses. `deletedBy` is
  taken from the signed-in session. Both fields are set on the document and on its draft, so publishing a draft in Studio
  cannot bring a trashed project back. The Studio schema shows them read-only.
- `/api/manager/office` POST `type: 'project'` takes three new actions on `id`: `trash`, `restore` and `deleteForever`.
  - `deleteForever` is admin-only, and only for a project already in the 휴지통.
  - The checks live in `app/lib/project-trash.ts` and are tested.
- The manager list query returns `deletedAt` and `deletedBy`. The page splits active and trashed projects.
- `updatedAt` is not changed by trash or restore. A move to the 휴지통 is not a content change.
