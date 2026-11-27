# 시공 사례 사진 나눠 올리기 — design

Approved in conversation on 2026-11-27. The improvement list named "한 번에 올리는 용량 제한" first, and the user chose
"나눠 올리기부터". Calls marked *(my call)* were not discussed and may be corrected.

## Why

[+ 새 시공 사례 올리기] and [사진 다시 올리기] send every photo of every chosen folder in one request. To stay under
Vercel's request limit, the whole set must fit 3.8MB after shrinking:
- photos go down to 1280px at quality 0.7 when there are many;
- past roughly 20–30 photos the upload fails with "사진 용량이 아직 큽니다".

## What

- Each photo is shrunk on its own and uploaded on its own to the existing `/api/manager/project-asset`. There is no
  limit on the number of photos, and photos keep more detail: up to 2048px wide at quality 0.85, and if one is still over
  3.9MB, 1600px at 0.8. *(my call)*
- The button shows progress ("사진 올리는 중 12/32장"). Three photos go at a time; a failed photo is tried twice more.
  *(my call)*
- If any photo still fails, no project is made or changed. The error says how many failed, and [올리기] can be pressed
  again. Photos already uploaded come back as the same Sanity asset (Sanity keys assets by content), so nothing piles up
  twice.
- Then one small JSON request to `/api/manager/bulk-upload` carries each photo's folder path and asset id. The server
  makes or replaces the projects as before:
  - the same file-name rules: 대표 / 시공전 / 거실1·주방2 groups in number order;
  - the same `new` / `replace:<id>` targets;
  - new projects hidden;
  - replace changes photos only.

## How

- `app/lib/project-upload-rules.ts` (pure) gets:
  - `parseUploadPath` — the old route's file-name rules;
  - `planProjectPhotos` — groups photos per folder into cover, before and the room groups, sorted as before;
  - `galleryGroupsFromPhotos` — the Sanity gallery objects;
  - `isImageAssetId`.
- `app/lib/upload-queue.ts` (pure): `runUploadQueue` runs a worker over the items, a few at a time, with retries and
  progress.
- The route checks that every asset id has the shape of a Sanity image asset and exists (one query) before it writes
  anything. A folder without a cover photo or detail photo is skipped as before.
- The old multipart form of the route goes; the page is its only caller (`scripts/upload-project-folders.mjs` talks to
  Sanity directly).
- Photos uploaded for an upload that then fails stay as unused Sanity assets, the same as a new 대표 사진 uploaded in the
  editor and never saved.
