# 시공 사례 올리기: 정보·사진 정리 팝업 — design

Approved in conversation on 2026-11-27:
- "업로드 하는 방식에서 사진들을 원하는 위치에 모으고 넣는 방법은 … 팝업창을 이용해서 쉽게 정하고 넣을 수 있어?";
- the 사진 정리 mockup;
- "그럼 팝업창에 탭을 넣어서 기본 정보를 넣는 칸도 만들어줘 이름, 공간 분류, 지역, 평수, 시공연도, 블로그링크, 짧은 설명 등등";
- the tabbed mockup;
- "사진은 공간마다 한개씩 올릴 수 있어?", answered with a [+ 사진 추가] per space.

Builds on PR #71 (photos uploaded one by one). Calls marked *(my call)* were not discussed and may be corrected.

## What

- After folders are picked in [+ 새 시공 사례 올리기], each folder row gets [정보·사진 정리]. When only one folder is
  picked, the popup opens at once. Each row shows what is still missing, for example "기본 정보 ✓ · 미분류 3장".
- The popup has two tabs:
  - **기본 정보** (new projects only):
    - 이름 (filled with the folder name), 공간 분류 (per folder), 지역, 평수, 시공 연도, 주요 자재, 블로그 링크, 짧은 설명,
      메인에도 보이기;
    - the same rules as the editor (`project-form.ts`).
  - **사진 정리**:
    - photos start sorted by the file-name rules: 대표, 시공전, and a Korean room name with a number;
    - any other name (IMG_2041, DSC…) starts in 미분류 *(my call: a room name with no Korean letter counts as unsorted)*;
    - staff click photos (Shift for a range) and press a space button to move them;
    - [+ 공간 추가] makes a space; [대표 사진으로] and [시공 전 사진으로] work on one photo;
    - photos are dragged to change the order within a space or to move into another;
    - [+ 사진 추가] on each space adds photos from the computer straight into it, so a space can be filled photo by photo
      without a folder;
    - [빼기] drops a photo from the upload.
- [사진 다시 올리기] (replace) opens the same popup with the 사진 정리 tab only; the project's information is not changed.
- 사진 크게 보기 (added later, below): a double click on a photo opens it large, from the picked file, to place it.
- [완료] closes the popup and starts sending that folder's photos, shrunk, in the background (added later, below).
- [올리기] is allowed when:
  - every new folder has 이름 and 공간 분류;
  - every folder has a 대표 사진 (or at least one photo, whose first becomes the cover as before);
  - no photo is left in 미분류. Otherwise the panel says which folder needs what.
- New projects are made with the information entered and stay hidden until [홈페이지에 공개], as now.

## How (my calls)

- Pure rules in `app/lib/project-photo-sort.ts`: the starting sort (from `parseUploadPath`), moves, adding and removing
  photos and spaces, and checks before upload. Tested.
- The upload sends each folder's arrangement instead of file paths:
  `{ folders: [{ title, target, info?, coverAssetId, beforeAssetId, groups: [{ roomType, photos: [{ assetId, caption }] }] }] }`.
  - A replacement's groups are written by `galleryGroupsFromFolder`, in the shape the file-name upload always wrote.
  - New projects also get the information through `buildProjectPatch`.
  - The path-based body of PR #71 is replaced; the page is its only caller.
- Thumbnails are object URLs of the picked files (revoked when the panel closes), lazy-loaded.

## Review findings (fixed)

- File names:
  - Windows bulk renames (`거실 (1).jpg`) count as room + number;
  - a name that is only a number starts in 미분류 rather than a room called 상세.
- Photos dragged from the computer onto the popup go into that room, or into 미분류; before, the browser could open the
  image and lose the work.
- Picking or dropping more folders adds them. A folder of the same name gets the new photos in 미분류. Before, picking
  again wiped everything typed.
- A folder can be taken out of the upload ([빼기] on its row). An emptied folder says so instead of silently blocking.
- The first folder's popup opens at once only when no replace / new choice is waiting.
- The 이름 shows a note when another project has it; this does not block, as in the editor.
- Smaller fixes:
  - [+ 공간 추가] ignores the Korean IME's composing Enter;
  - thumbnails are made once per photo, so an added photo does not reload the rest;
  - a photo tile drag carries a custom type, so it never types into a text field;
  - focus moves into the popup and back.
- A replacement with no 시공 전 photo keeps the stored one (as before), and the popup now says so.
- The server checks a new folder before it makes a typed 공간 분류, so a refused folder leaves none behind. It refuses a
  room with no photos.

Left as they are:
- photos cannot be reordered with the keyboard (drag or the space buttons only);
- Escape closes the popup even while a dropdown in it is open. Nothing is lost: every change is already kept by the panel.

## Large view and upload at [완료] (added 2026-11-27)

Asked: "사진 정리하는 과정에서 사진을 더블 클릭하면 사진의 원본 사진을 크게 보고 공간을 분류하는 형식으로 변경해줘 그리고
완료버튼을 누르면 그때 사진의 용량을 줄여서 업로드 해줘".

- 사진 크게 보기 (`app/manager-weve-7519/project-photo-viewer.tsx`):
  - a double click on a photo in the 사진 정리 tab opens it over the whole screen, from the picked file (not shrunk);
  - the top bar says which photo of how many, its file name and where it is now (미분류 in orange);
  - below: [대표 사진으로], [시공 전 사진으로], each space (numbered 1–9), [미분류로], [빼기], and a new space name with
    [+ 공간 만들고 넣기];
  - placing the photo moves on to the next photo in the order picked *(my call: so a folder can be sorted one photo after
    another)*; on the last photo it stays;
  - ← → move through the photos, number keys 1–9 pick a space, Esc closes the large view only (also while typing a name).
- [완료] in the popup closes it and starts shrinking and sending that folder's placed photos (cover, 시공 전, spaces), three
  at a time with the same retries as [올리기]. The folder row shows "사진 미리 올리는 중 n/N장", then "사진 N장 미리 올림 ✓"
  or "사진 N장을 미리 올리지 못했습니다. [올리기] 때 다시 올립니다."
  - Each photo is sent once: [올리기], and [완료] pressed again, reuse a photo already sent or being sent; a failed one is
    tried again. At most three photos go at a time across both (`createLimiter` in `app/lib/upload-queue.ts`).
  - The project is still made only at [올리기]. A photo sent ahead and then taken out ([빼기]) stays as an unused Sanity
    asset, as a photo stored by a failed [올리기] did before *(my call)*.

