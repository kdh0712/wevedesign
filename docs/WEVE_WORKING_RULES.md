# WEVE DESIGN Working Rules

This file records durable product and implementation decisions. Review it before changing the homepage or manager.

## Delivery

- Run `npm run build` after changes, then commit and push `main` so Vercel can deploy.
- Preserve unrelated user changes in a dirty worktree.
- Keep portfolio and other site image uploads on the existing Sanity asset/API flow, not Firebase Storage. The one exception is customer progress photos, which live in a private Firebase Storage bucket (see Customer Progress Page).
- Do not restore the Sanity Studio keyboard shortcut or require operators to use Studio for normal work.

## Manager Authentication

- Never auto-login from local storage or a remembered manager credential.
- Opening `/manager-weve-7519` without a session must show the login form. A refresh may restore the current tab's session (`sessionStorage`, 8 hours).
- While a saved session is being checked (manager or estimate page), show a loading screen instead of the login or password form.
- Do not render or reveal the manager dashboard until valid credentials are confirmed and initial data loads successfully.
- Keep slow background work such as the Kakao BizForm sync off the login and restore path.
- Keep account permissions aligned across the manager UI, auth API, account API, and Firebase profiles. The permission table lives in `app/lib/manager-permissions.ts` and is shared by the UI and the API.
- Manager APIs authenticate only with the signed per-user session token (`Authorization: Bearer`) issued by `/api/manager/auth`. The master password (`MANAGER_PASSWORD`) never leaves the server and is never stored in the browser.
- Every manager API route must call `requireManager` (`app/api/manager/_session.ts`) with the permission its tab needs. Account management and data migration are admin-only.
- Set `MANAGER_SESSION_SECRET` (32+ random bytes) in Vercel. Changing it signs everyone out.
- Store manager account passwords only as scrypt hashes. Staff may not change their own role, permissions, or active state.
- Failed manager logins are limited in server memory (`app/api/manager/_login-limit.ts`): 5 per address and login ID, 30 per address, per 15 minutes. Never limit by login ID alone, or anyone could lock the owner out.
- Deploy `firebase-database.rules.json` to Firebase only after the code that writes profiles with server admin access is live. Merge only its `users` and `launcher_admins` rules into the live rules; another app may share the database.
- Change `MANAGER_PASSWORD` whenever it may have been exposed. Before signed sessions every staff login received it, so it must be rotated when that change ships.
- Production Firestore ERP needs the Firebase service account. Without it the browser holds a Firebase token that can read Firestore directly, and tab permissions are not enforced.
- Any Sanity write that takes a client-supplied id must first confirm the document type (`isSanityIdWritable` / `checkSanityDocumentType` in `app/api/manager/_utils.ts`).

## Manager UX

- Use a quiet, compact ERP layout with the dashboard as the first screen.
- Keep homepage features split into focused tabs. Do not put external reservation/status widgets back on the dashboard or homepage-management screen.
- Keep Kakao, Naver Place, blog, Instagram, and future external-service links in the dedicated external-channel tab.
- Do not show a legacy management-password field in the dashboard.
- Reset project and site-folder upload forms after a successful upload so the next job starts cleanly.

## Customer Progress Page

- The customer page lives at `/progress/<code>`. It is `noindex, nofollow`, `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer`, so the URL (the code) is never passed on as a referrer (`next.config.ts` and the page metadata). Keep it out of the sitemap and RSS.
- The customer confirms the last 4 digits of the customer phone number. That number prefers a mobile: the site's mobile, then the linked customer's mobile, then the site's number, then the customer's number (`app/api/manager/_customer-phone.ts`). The last-4 check, the cookie and the alimtalk all use that same number. The signed cookie is valid for 180 days and is bound to the code and the whole customer number (every digit, not only the last four), so a new link or any change to the number invalidates it.
- Every check that an active lock does not refuse records its result before it answers (`app/api/progress/_verify.ts`). If the record cannot be saved, the answer is 503 "잠시 후 다시 시도해 주세요." for right and wrong numbers alike, and no cookie is issued. Never issue the cookie without a committed write.
- The lock escalates. 5 misses lock the link for 15 minutes. Each further lock since the last correct answer doubles the time: 30 minutes, 1 hour, and so on, up to 24 hours. A correct answer or a new code resets it. The lock message shows hours and minutes.
- Never send estimate prices, unit costs, margins, vendor names or phone numbers, or schedule memos to customers. `buildCustomerProgressView` (`app/lib/site-progress.ts`) copies only the allowed fields; keep it that way.
- `progressCode`, `progressEnabled`, `progressCodeCreatedAt` and `progressAccess` are server-owned. Only server routes write them, each writing only those fields with masked Firestore writes (`updateMask`), so none of them can revert other edits to the site: `/api/manager/progress` (setLink and the first-upload creation), `/api/progress/verify` (`progressAccess`) and the 완료 auto-close that runs after an office site save (`progressEnabled`). `progressAccess` has two writers: verify, and `/api/manager/progress`, which resets it whenever it issues a new code (a rotate, or the first creation). The office site save itself leaves these fields out of its own write. They are stripped from every site record sent to the browser, and dropped from every site record received from it (`stripServerOwnedSiteFields`).
- The link is created automatically on the first "고객 진행 현황에 올리기" when the customer has a phone number (not for a site that is already '완료'). It closes automatically when the site status changes to '완료'. A link that is off, switched off by staff or closed by 완료, is never re-enabled by an upload; staff turn it on with "링크 켜기". Rotating the link ("새 링크로 바꾸기") invalidates the old link and the customer cookies, and starts the failed-attempt record and the lock over.
- No Naver analytics on `/progress`: the code in the URL is the link's credential. Vercel Analytics runs there with the URL scrubbed to `/progress/[code]` (`app/lib/site-analytics.tsx`). Never send the code to analytics or logs. The alimtalk button necessarily carries it to Aligo and Kakao.
- Progress photos are uploaded one per request (Vercel request size limit, near 4.5MB) after the browser shrinks them (long edge 1600px, JPEG), with the width and height the browser measured (whole pixels, 1-20000). They go through the manager API to a private Firebase Storage bucket (`FIREBASE_STORAGE_BUCKET`, default `<projectId>.firebasestorage.app`), written with the existing Firebase service account. The bucket's production-mode rules deny every Firebase client, and the bucket is not public, so Google Cloud IAM refuses any unsigned request. Never grant `allUsers` or `allAuthenticatedUsers` on the bucket, and never create a Firebase download token for a file under `progress/` (opening a file in the Firebase console or "Create new access token" can create one; such a URL skips the rules and never expires). Each is stored as `progress/<24 random hex>.<ext>` and never overwritten; the phone's own file name, which may carry the customer's name, is never used. Records keep only that pathname, never a URL. They are not stored in Sanity: the Sanity Free plan cannot make a dataset private, so anyone could list them there.
- A browser only ever gets a progress photo as a V4 signed GET URL that the server makes after its check: the customer page after the cookie check, the manager API behind the `sites` session (`app/api/manager/_progress-photos.ts`). The only pathname a browser sees is the upload answer, which staff send back with the record. A URL expires at the end of the next full hour and is the same string for that hour, so a copied URL works for at most two hours. If signing fails, the customer page shows the records without photos and "사진을 불러오지 못했습니다. 잠시 후 새로고침해 주세요."; the manager API never turns it into an error, it answers with empty photo URLs and `photosUnavailable: true`. Deleting a record deletes its photos; a failed photo delete is only logged. Never log a Storage error object (its request details can carry the access token); log `storageErrorSummary`.
- Without the service account or a bucket name, photo uploads answer 503 "사진 저장소(Firebase Storage)가 설정되지 않았습니다. 관리자에게 문의해 주세요." before the body is read. A Storage 403 answers "사진 저장소 권한이 없습니다. 관리자에게 문의해 주세요."; the owner then gives the service account the "Storage Object Admin" role on the Google Cloud console IAM page (project-wide). Blaze's no-cost usage covers about 5 GB of storage plus some downloads in US regions; keep a budget alert in Google Cloud Billing.
- The customer alimtalk is never sent automatically. Staff pick it per post or resend it from the record list. Its Aligo settings are in `docs/KAKAO_BIZFORM_SETUP.md`. Set `ALIGO_TEST_MODE=Y` in Vercel's Preview environment only, never in Production.
- The progress API needs the `sites` permission (admins have every permission). Posting progress needs both `dashboard` and `sites`, because the 일일 보고서 window opens from the 대시보드; the server checks both for `createUpdate` and photo uploads. The link panel on the 현장 tab needs only `sites`.
- What a customer record says is chosen before posting: the 일일 보고서 memo is copied into a separate "고객에게 보이는 내용" box that staff may edit, and each report photo can be left out. The report itself is not changed.
- A schedule task past its end date counts as done, except when staff entered a progress of 1-99: then the customer sees it as 지연 with that progress. A task whose progress was never entered keeps the date rule.
- Permanently deleting a site also deletes its `siteProgressUpdates` records and their photos (photos after the answer; a failed photo delete is only logged).
- The link panel shows staff when the customer last got in (`lastOkAt`) and, while wrong numbers have locked the link, until when; never the code or the number.

## Homepage

- Keep the current visual design unless a request explicitly changes it.
- Maintain separate settings for the header safe number and footer company number.
- Keep SNS destinations configurable in the manager.
- Homepage popups may be multiple and must remain non-blocking. They must not appear on portfolio, section-route, or search-focused pages.
- Popup controls and UI labels must not leak into search snippets.

## Consultation Form

- Every consultation saves a record and sends a paid alimtalk to every admin phone plus an email, so `/api/send-consultation` guards against abuse (`app/lib/consultation-guard.ts`): field length caps and a phone number check, a hidden honeypot field (`website`) and a minimum fill time (`startedAt`, 3 seconds), the same number within 10 minutes answered as a duplicate without saving or sending, and 5 submissions per connection per hour.
- The connection is stored only as `ipHash`, an HMAC of the address keyed with `CONSULTATION_RATE_SECRET` (or `MANAGER_SESSION_SECRET`). Never store or log the address itself. Records also keep `phoneDigits` for the duplicate check.
- If the duplicate check cannot read recent records, the submission goes through. Never turn a real customer away because the check failed.
- The dashboard's 30-second refresh checks Kakao BizForm+ at most every 5 minutes (`app/lib/dashboard-rules.ts`); the 동기화 button checks right away.

## Portfolio

- Project cards must remain real anchor links with crawlable `/portfolio/...` URLs while normal clicks may open the modal experience.
- Use the project name as the project view's H1 and avoid duplicate H1 elements.
- Do not add separate visible detail-page button rows below the project cards.
- Preserve image aspect ratios in detail galleries. Do not crop portrait or landscape detail photos.
- Use arrows and centered dots for multi-image navigation. Do not show filenames, numeric counters, or an original-image viewer.
- Keep representative-image selection and 16:9 crop-position controls available in project create/edit workflows.
- Preserve entered line breaks in project descriptions.

## SEO

- Lead titles and visible brand copy naturally with the Korean name `위브디자인`.
- Keep project URLs in the dynamic sitemap and maintain RSS, robots, canonical metadata, breadcrumbs, and project structured data.
- Avoid thin location landing pages unless there is genuinely distinct local content.
- Do not change the homepage's appearance solely to create SEO pages when metadata and route structure are sufficient.

## External Services

- Verify current capabilities in official provider documentation before promising API integration.
- A saved public/admin URL is a shortcut, not an API data integration. Label it accordingly.
- Do not display fabricated unread counts or reservation statuses. Kakao BizMessage, phone verification, and other paid/approved-provider features require a separate implementation decision.
