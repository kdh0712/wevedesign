# 현장 영수증함 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 폰 앱에서 영수증을 찍어 현장에 저장하고(금액·메모는 선택), PC 견적 작업의 실행내역서에서 한 장씩 실행 항목으로 옮긴다.

**Architecture:** 규칙은 순수 모듈 `app/lib/site-receipts.ts`(Node 테스트가 바로 읽음). 서버는 Firestore `siteReceipts`(한 장에 문서 하나, `siteNotes`처럼)와 진행 사진과 같은 비공개 버킷의 `receipts/` 폴더. API `/api/manager/receipts`는 얇게: 규칙은 lib에. 폰은 영수증 버튼 + 시트, PC는 실행내역서 탭의 영수증 패널. 정리 여부는 저장 데이터가 아니라 실행내역서 줄의 `receiptId`에서 계산한다.

**Tech Stack:** Next.js app router, TypeScript, Tailwind, Firestore REST, @google-cloud/storage, node:test.

**Spec:** docs/superpowers/specs/2026-11-24-site-receipts-design.md

## Global Constraints

- Branch base: `app/lib/site-folders.ts` (`siteStage`) is on PR #49. Before Task 1, put this branch on top of `feat/site-folders` (or on main once #49 is merged). PRs #47/#48 also touch `estimate/page.tsx`; rebase onto main after they merge.
- lib modules: relative `.ts` imports only (Node tests import them directly).
- Collection `siteReceipts`; ids `rc-<24 hex>`; photo pathnames `receipts/<24 hex>.<jpg|png|webp>`; 1–3 photos per receipt; amount: integer won 0–100,000,000 or none; memo ≤ 100 chars; "내 영수증" ≤ 50, newest first.
- Permissions: create / own list / own edit·delete (정리 전) / site search = `sites`; site's full list, edit, skip, move = `estimates`; delete anyone's (not locked) = admin.
- Locked = some saved, non-deleted `siteEstimates` doc of the site has a work line with that `receiptId`. Locked receipts: no amount/memo/site edits and no delete, by anyone.
- PC status is per **open version**; phone status is "any saved version or skipped".
- Never: receipts in customer progress APIs or pages; login ids of others sent to browsers (send `mine: boolean` instead of `createdBy`).
- Mixed-EOL files (`app/manager-weve-7519/page.tsx`, `app/api/manager/office/route.ts`, `app/api/manager/estimate/route.ts`): after editing, restore line endings against the base (scratchpad `restore_eol.py`).
- Copy is Korean, the tone of the existing phone app (…해요).

## Review Focus

1. A receipt deleted (or moved) by its uploader after PC staff pressed [실행 항목으로] but before saving the estimate → the estimate still saves; the line keeps its 🧾 mark; the panel just no longer lists the receipt; nothing crashes. (Task 5 test on `receiptVersionStatus` with an unknown id.)
2. Amount typed as `32,000`, ` 32000 `, `32000원`, `3.2만`, `-5`, `100000001` → first three read as 32000; the rest are refused with a message, never saved as 0. (Task 1.)
3. Photo upload fails on the 2nd of 3 photos → no receipt record, the sheet keeps photos and inputs and says "저장하지 못했어요". (Task 4: uses `shrinkAndUploadPhotos`, record only on `ok`.)
4. Moving or editing a receipt that became locked meanwhile → 409 with "실행내역서에 들어간 영수증은 바꿀 수 없어요"; the phone list refreshes. (Task 1 `canChangeReceipt` + Task 3 route.)
5. A receipt only in another version (e.g. 초안) while 최종안 is open → listed under 정리 안 됨 with "초안에 있음", [실행 항목으로] usable; counts per open version. (Task 1 `receiptVersionStatus`.)

---

### Task 1: 영수증 규칙 (pure)

**Files:**
- Create: `app/lib/site-receipts.ts`
- Test: `tests/site-receipts.test.mjs`

**Interfaces — Produces:**
- Constants: `SITE_RECEIPTS_COLLECTION = 'siteReceipts'`, `RECEIPT_MAX_PHOTOS = 3`, `RECEIPT_MEMO_MAX = 100`, `RECEIPT_AMOUNT_MAX = 100_000_000`, `MY_RECEIPTS_LIMIT = 50`.
- `isReceiptId(value: unknown): value is string` — `/^rc-[0-9a-f]{24}$/`.
- `isReceiptPhotoPathname(value: unknown): value is string` — `/^receipts\/[0-9a-f]{24}\.(jpg|png|webp)$/`.
- `parseReceiptAmount(value: unknown): { ok: true; amount: number | null } | { ok: false; error: string }` — '' / null / undefined → null; strips spaces, commas and a trailing '원'; whole digits only; 0–max.
- `normalizeReceiptId(value: unknown): string` — the id if `isReceiptId`, else ''. (Used by the server's `normalizeWorkLines` and the page's `hydrateWorkLines`.)
- `type ReceiptAuthor = { loginId: string; name: string; role: string; permissions: readonly string[] }`
- `type ReceiptAction` = `create {siteId, photos, amount, memo}` | `update {id, amount, memo, siteId}` | `setSkipped {id, skipped: boolean}` | `delete {id}`; `parseReceiptAction(body: unknown): ReceiptAction | { ok: false; error }` — photos are rebuilt from known fields (`{id: 16 hex, pathname: receipts/…, width, height}`), a `url` field refuses the photo, like `parseCreateUpdate`.
- `newReceiptRecord(input, author, nowIso, receiptDate): Record<string, unknown>` — top-level `createdBy` (loginId, for the equality query) and `createdByName`.
- `type SiteReceipt = { id; siteId; photos: StoredProgressPhoto[]; amount: number | null; memo; receiptDate; createdAt; createdByName; mine: boolean; skipped: { at: string; byName: string } | null; locked: boolean }`
- `toReceiptView(record, viewer: ReceiptAuthor, lockedIds: ReadonlySet<string>): SiteReceipt | null` (server side; photos keep their pathnames)
- `type SiteReceiptView = Omit<SiteReceipt, 'photos'> & { photos: ProgressPhotoView[] }` — what browsers get: signed URLs, never pathnames.
- `receiptIdsOfWorkLines(workLinesJson: unknown): string[]`; `lockedReceiptIds(estimates: Array<Record<string, unknown>>, siteId?: string): Set<string>` (skips `deletedAt`, other sites when siteId given).
- `canChangeReceipt(receipt: SiteReceipt, author: ReceiptAuthor, change: 'edit' | 'delete'): { ok: true } | { ok: false; status: 403 | 409; error: string }` — locked → 409; edit: uploader & not skipped, or `estimates`/admin; delete: uploader & not skipped, or admin.
- `receiptWorkLineDraft(receipt: Pick<SiteReceipt, 'id' | 'receiptDate' | 'amount' | 'memo'>): { date: string; expense: number; note: string; receiptId: string }` — note = memo or '영수증'.
- `receiptVersionStatus(input: { receiptId: string; skipped: boolean; openLines: ReadonlyArray<{ receiptId?: string }>; openSavedJson: string | undefined; otherVersions: ReadonlyArray<{ label: string; workLinesJson?: string }> }): { state: 'done' | 'open' | 'skipped'; unsaved: boolean; otherLabels: string[] }`
- `receiptPickerGroups<S extends { id: string; status: string }>(sites: readonly S[], lastSiteId: string | null): { recent: S | null; active: S[]; open: S[] }` — uses `siteStage` from `./site-folders.ts`; 완료 sites are not in active/open.

- [ ] **Step 1: Write the failing tests** — one `test()` per function above. Must include: Review Focus 2 inputs; a photo with `url` or a `progress/…` pathname refused; 4 photos refused; memo 101 chars refused; `toReceiptView` never returns `createdBy` and sets `mine` by loginId; `lockedReceiptIds` ignores deleted estimates and bad JSON; `canChangeReceipt` matrix (uploader/other staff/estimates/admin × locked/skipped/plain × edit/delete); `receiptVersionStatus` for: in open lines and saved (done, unsaved false), in open lines not saved (done, unsaved true), only in 초안 (open, otherLabels ['초안']), skipped, unknown id (open); picker: recent pulled to the top and removed from its group, 계약·시공중 → active, 상담중/견적/보류 → open, 완료 dropped.
- [ ] **Step 2:** `node --test tests/site-receipts.test.mjs` → FAIL (module not found).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `영수증 규칙: 금액·메모·사진 검사, 잠김, 버전별 정리 상태`.

### Task 2: 사진 저장소에 receipts 폴더

**Files:**
- Modify: `app/api/manager/_progress-request.ts` (add `receiptPhotoPathname(contentType, randomHex)`; reuse `PHOTO_EXTENSIONS`)
- Modify: `app/api/manager/_progress-photos.ts` (`createProgressPhotoStore({ …, folder?: 'progress' | 'receipts' })`: `upload` uses the folder's pathname, `remove` keeps only that folder's pathnames; default `'progress'`)
- Modify: `app/api/manager/_progress-photo-storage.ts` (export `uploadReceiptPhoto`, `signReceiptPhotos`, `deleteReceiptPhotos` from a second store with `folder: 'receipts'`)
- Test: `tests/progress-photos.test.mjs`

- [ ] **Step 1:** Tests: a receipts store's `upload` writes `receipts/<24 hex>.jpg`; its `remove` ignores `progress/…` pathnames and a progress store's `remove` ignores `receipts/…`; existing progress tests unchanged.
- [ ] **Step 2:** `node --test tests/progress-photos.test.mjs` → the new tests FAIL.
- [ ] **Step 3:** Implement. **Step 4:** PASS (whole file). **Step 5:** Commit.

### Task 3: 서버 저장소와 API

**Files:**
- Create: `app/api/manager/_site-receipts.ts` — `createReceipt`, `getReceiptRecord`, `updateReceipt(id, fields)` (exists:true), `deleteReceiptRecord`, `listReceiptsOfSite(siteId)`, `listReceiptsByCreator(loginId)`, `deleteReceiptsOfSite(siteId): Promise<string[]>` (returns photo pathnames), `readLockedIds(siteId?)` (site: `queryFirestoreCollectionByField('siteEstimates','siteId',…)`; all: `listFirestoreCollection('siteEstimates', undefined, 1000, ['siteId','workLinesJson','deletedAt'])`).
- Create: `app/api/manager/receipts/route.ts`
- Modify: `app/api/manager/estimate/route.ts` — `normalizeWorkLines` keeps `receiptId: normalizeReceiptId(line.receiptId)` (omit the key when '').
- Modify: `app/api/manager/office/route.ts` — permanent site delete also runs `deleteReceiptsOfSite` and removes the photos in `after()`, next to `deleteSiteNotesOfSite`.
- Modify: `tests/manager-api-matrix.mjs` — receipts GET/POST rows (manual script).

**Route contract** (`requireManager`, `no-store`, `MOBILE_STORE_MISSING` 503 when the store is not ready, like site-notes):
- `GET ?mine=1` (`sites`) → `{ receipts: SiteReceipt[] (≤50, newest), sites: Record<siteId, title> }` with signed photo URLs (`signReceiptPhotos`; on signing failure photos keep their place with `url: ''` and `photosUnavailable: true`).
- `GET ?siteId=` (`estimates`) → `{ receipts }` for the site, signed.
- `GET ?sites=1` (`sites`) → `{ sites: [{ id, title, address, status }] }`, all live sites.
- `POST multipart action=uploadPhoto` (`sites`) → same checks as progress `uploadPhoto` (`checkPhotoUpload`, `parsePhotoSize`, site must exist) → `{ photo }`.
- `POST JSON` (`sites`): `create` (site exists, not trashed; `receiptDate = todayInSeoul(now)`) → `{ receipt }`; `update` / `setSkipped` / `delete` → read record, compute lock, `canChangeReceipt` (`setSkipped` needs `estimates`); moving checks the new site; delete removes photos in `after()`.

- [ ] **Step 1:** No route unit tests exist in this repo; the rules are covered by Task 1. Add one Task 1-style test if any new pure helper appears here.
- [ ] **Step 2:** `npx tsc --noEmit -p .` → clean; `npm test` → all pass.
- [ ] **Step 3:** Commit `영수증 API: 사진 올리기, 만들기·고치기·지우기, 정리 안 해도 됨`.

### Task 4: 폰 앱 영수증 버튼과 시트

**Files:**
- Create: `app/manager-weve-7519/receipt-api.ts` — `createReceiptApi(authHeaders)` with `mine()`, `ofSite(siteId)`, `searchSites()`, `uploadPhoto(siteId, blob, fileName, size)`, `create(…)`, `update(…)`, `setSkipped(…)`, `remove(id)`; errors like `createProgressApi` (server message as is, network → `NETWORK_ERROR_MESSAGE`).
- Create: `app/manager-weve-7519/m/receipt-sheet.tsx` — full-screen sheet: [촬영] (`capture="environment"`) / [앨범에서] (multiple), up to 3 photos with remove; site picker from `receiptPickerGroups` + [다른 현장 찾기] (`searchSites`, filter by title/address); 금액 (`inputMode="numeric"`) and 메모; [저장] → `shrinkAndUploadPhotos` + `create`; success notice "<현장명>에 영수증을 저장했어요" and reset; below, '내 영수증' list (`mine()`), each 정리 전 item can change 금액·메모·현장 or be deleted (confirm).
- Modify: `app/manager-weve-7519/m/page.tsx` — round [📷 영수증] button fixed above the TabBar when `tabs.includes('sites')`; sheet open state counts as one back level (`backDepth`); last picked site in `localStorage` key `weve-receipt-last-site` (try/catch).

- [ ] **Step 1:** Pure parts are in Task 1; no new test unless a helper is added (then test it first).
- [ ] **Step 2:** `npx tsc --noEmit -p .`, `npm test`.
- [ ] **Step 3:** Browser check with the fetch mock (phone width 375): button visible on every tab, picker groups, save success, upload failure on photo 2 keeps inputs (Review Focus 3), 내 영수증 edit/move/delete, locked item has no edit buttons.
- [ ] **Step 4:** Commit `폰 앱 영수증: 촬영·현장 고르기·금액 메모, 내 영수증`.

### Task 5: PC 실행내역서 영수증 패널

**Files:**
- Create: `app/manager-weve-7519/estimate/receipt-panel.tsx` — loads `ofSite(siteId)` when the 실행 내역서 tab opens or the site changes; header "영수증 정리 안 됨 N · 정리됨 M" (per open version), 정리 안 됨 list newest first, 정리됨/정리 안 해도 됨 folded; thumbnail opens a large viewer (arrows for several photos); buttons [실행 항목으로] (calls `onUseReceipt(receiptWorkLineDraft(r))`), [정리 안 해도 됨]/[되돌리기] (`setSkipped`), [고치기] for a receipt that is not locked (금액·메모, and 현장 from the page's site list; `update`); "초안에 있음" and "저장 전" hints from `receiptVersionStatus`.
- Modify: `app/manager-weve-7519/estimate/page.tsx` — `WorkLine.receiptId?: string`; `hydrateWorkLines` keeps it via `normalizeReceiptId`; `onUseReceipt` sets `workLineDraft` (date, expense, note, receiptId) and clears `editingWorkLineId`; ledger rows with `receiptId` show 🧾 (title "영수증에서 옮김"); panel placed above '실행 항목 입력' in the `activeTab === 'work'` section; passes `estimates` (saved versions with `workLinesJson`, `versionLabel`), the open `estimateId`, and `workLines`.
- Ruling (spec leaves it to the builder): version copy keeps `receiptId` (`cloneWorkLines` spreads the line); 엑셀 내보내기 does not write it and 과거 엑셀 불러오기 lines have none.

- [ ] **Step 1:** Review Focus 1 and 5 are covered by Task 1 tests; add a test first for any new pure helper.
- [ ] **Step 2:** `npx tsc --noEmit -p .`, `npm test`.
- [ ] **Step 3:** Browser check with the estimate fetch mock: 실행 항목으로 fills the draft, 항목 추가 → "저장 전", after save → 정리됨; a receipt only in 초안 shows "초안에 있음" while 최종안 is open; skip/undo; 🧾 mark; the receipt survives a reload (receiptId kept by hydrate and the server).
- [ ] **Step 4:** Commit `견적 작업 실행내역서: 영수증 패널과 실행 항목으로 옮기기`.

### Task 6: 문서와 마무리

**Files:**
- Modify: `docs/WEVE_WORKING_RULES.md` — rules: collection, permissions, lock, per-version status, never on the customer page, Firestore rules deny `siteReceipts` to clients like `siteNotes`, permanent site delete removes receipts.
- [ ] **Step 1:** Write the rules. **Step 2:** `npm test`, `npx tsc --noEmit -p .`, `npm run build`. **Step 3:** Commit.
- [ ] **Owner step (report, do not do):** confirm in the Firebase console that client reads/writes of `siteReceipts` are denied (as for `siteNotes`).
