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
  - The server builds the project from it with the same Sanity shapes (`galleryGroupsFromPhotos`).
  - New projects also get the information through `buildProjectPatch`.
  - The path-based body of PR #71 is replaced; the page is its only caller.
- Thumbnails are object URLs of the picked files (revoked when the panel closes), lazy-loaded.
