# 견적 작업의 현장 정보 수정 팝업 — design

Approved in conversation on 2026-11-26: the request ("SITE칸 안에 … '현장 정보 수정'이라고 만들어줘 이 글자를 클릭하면 팝업창이
나오고 현장의 정보를 수정할 수 있게 해줘 현장명/고객명/전화번호/주소 등등"), the mockup, and "고객 정보까지" (a 고객 이름·전화번호
change also changes the customer record). Calls marked *(my call)* were not discussed and may be corrected.

## Why

Fixing a site's name, customer or address meant leaving 견적 작업 for 관리자 현장 목록, finding the site there and coming back.

## What

- The SITE box on 견적 작업 gets a small text link '현장 정보 수정' (not a boxed button) at its top right, next to 'SITE'. It
  shows only to staff who may edit sites (permission sites or customers, as the office API requires) and while a site is
  selected. *(my call)*
- It opens a popup with two parts:
  - 고객: 고객 이름 and 전화번호 of the linked customer, and '이 현장은 다른 번호로 연락' with that number, as in the 고객·현장
    tab. A changed name or number saves the customer record and this site together; when the customer has other sites
    that follow the customer (`pickSitesToSync`), a ticked-by-default box '이 고객의 다른 현장 N곳에도 바꾸기' also updates
    them, like the confirm after '고객 정보 고치기'. *(the default tick is my call)*
  - 현장: 현장명 (required), 현장 종류, 주소, 상태, 메모 — the same fields and choices as the 고객·현장 tab's site form.
- A site without a linked customer shows the name and number it carries, read-only, with a note that linking a customer
  is done in 관리자 현장 목록. Changing the customer to another person and the alimtalk stay there too.
- After saving, the SITE box, the site list and the printed heads show the new values at once; the estimate itself is not
  touched and its unsaved-changes state does not change.

## How (my calls)

- `app/lib/site-quick-edit.ts` holds the rules: the popup's starting values from the site and the customer, whether the
  customer changed, the other sites that follow, the save plan (customer record, site record, sync) and the site list
  after the save. Pure, tested in `tests/site-quick-edit.test.mjs`.
- When it opens, the popup reads the site as stored now and its customer with a new
  `GET /api/manager/office?siteEdit=<id>` (read permission for sites; the customer's `name` and `phone` only, with
  customers read permission). The page's site list is read once when 견적 작업 opens, so starting from it could write
  back a 상태 or 메모 changed elsewhere since (review finding). The fields wait for that read. If the customer cannot be
  read, the customer part is read-only with the reason; if the site cannot be read, the popup starts from the page's
  copy.
- Only the fields that changed from where the popup started are saved (`customerName` / `customerPhone` only when the
  customer or this site's own number changed).
- Saving uses the existing office API: the customer (`type: 'customer'`, only `name` and `phone`), then
  `syncCustomerToSites` when the box is ticked, then the site. The site goes last so its own number wins even when it is
  the customer's previous one, which the sync would otherwise overwrite (review finding). A failed customer or site save
  keeps the popup open and says what was saved already; a failed sync is reported after the site is saved.
- A customer save in Firestore is now masked like a site save (nothing kept back): if the read of the stored record fails,
  only the fields sent are written instead of the record being replaced by them (review finding).
- The 견적 작업 editor effects follow whether the selected site exists, not the site list: saving the popup replaces the
  list, and reloading the editor then threw away unsaved estimate edits (review finding).
- A 고객 이름 is required only when the customer is being changed. The popup stays on the site it was opened for. It
  cannot be closed while saving; the backdrop closes it only on a press that started on it.
