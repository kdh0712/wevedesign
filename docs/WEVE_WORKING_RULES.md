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
- No Naver analytics on the manager screens (`/manager-weve-7519`, including the phone app; staff use is not a site visit) or on `/progress`, where the code in the URL is the link's credential. Vercel Analytics runs there with the URL scrubbed to `/progress/[code]` (`app/lib/site-analytics.tsx`). Never send the code to analytics or logs. The alimtalk button necessarily carries it to Aligo and Kakao.
- Progress photos are uploaded one per request (Vercel request size limit, near 4.5MB) after the browser shrinks them (long edge 1600px, JPEG), with the width and height the browser measured (whole pixels, 1-20000). They go through the manager API to a private Firebase Storage bucket (`FIREBASE_STORAGE_BUCKET`, default `<projectId>.firebasestorage.app`), written with the existing Firebase service account. The bucket's production-mode rules deny every Firebase client, and the bucket is not public, so Google Cloud IAM refuses any unsigned request. Never grant `allUsers` or `allAuthenticatedUsers` on the bucket, and never create a Firebase download token for a file under `progress/` (opening a file in the Firebase console or "Create new access token" can create one; such a URL skips the rules and never expires). Each is stored as `progress/<24 random hex>.<ext>` and never overwritten; the phone's own file name, which may carry the customer's name, is never used. Records keep only that pathname, never a URL. They are not stored in Sanity: the Sanity Free plan cannot make a dataset private, so anyone could list them there.
- A browser only ever gets a progress photo as a V4 signed GET URL that the server makes after its check: the customer page after the cookie check, the manager API behind the `sites` session (`app/api/manager/_progress-photos.ts`). The only pathname a browser sees is the upload answer, which staff send back with the record. A URL expires at the end of the next full hour and is the same string for that hour, so a copied URL works for at most two hours. If signing fails, the customer page shows the records without photos and "사진을 불러오지 못했습니다. 잠시 후 새로고침해 주세요."; the manager API never turns it into an error, it answers with empty photo URLs and `photosUnavailable: true`. Deleting a record deletes its photos; a failed photo delete is only logged. Never log a Storage error object (its request details can carry the access token); log `storageErrorSummary`.
- Without the service account or a bucket name, photo uploads answer 503 "사진 저장소(Firebase Storage)가 설정되지 않았습니다. 관리자에게 문의해 주세요." before the body is read. A Storage 403 answers "사진 저장소 권한이 없습니다. 관리자에게 문의해 주세요."; the owner then gives the service account the "Storage Object Admin" role on the Google Cloud console IAM page (project-wide). Blaze's no-cost usage covers about 5 GB of storage plus some downloads in US regions; keep a budget alert in Google Cloud Billing.
- The customer alimtalk is never sent automatically. Staff pick it per post or resend it from the record list. Its Aligo settings are in `docs/KAKAO_BIZFORM_SETUP.md`. Set `ALIGO_TEST_MODE=Y` in Vercel's Preview environment only, never in Production.
- The progress API needs the `sites` permission (admins have every permission). Posting progress needs both `dashboard` and `sites`, because the 일일 보고서 window opens from the 대시보드; the server checks both for `createUpdate` and photo uploads. The link panel on the 현장 tab needs only `sites`.
- What a customer record says is chosen before posting: the 일일 보고서 memo is copied into a separate "고객에게 보이는 내용" box that staff may edit, and each report photo can be left out. The report itself is not changed.
- A schedule task past its end date counts as done, except when staff entered a progress of 1-99: then the customer sees it as 지연 with that progress. A task whose progress was never entered keeps the date rule.
- Permanently deleting a site also deletes its `siteProgressUpdates` records and their photos (photos after the answer; a failed photo delete is only logged).
- The link panel shows staff when the customer last got in (`lastOkAt`) and, while wrong numbers have locked the link, until when; never the code or the number.

## Staff Phone App

- The staff app lives at `/manager-weve-7519/m` (spec `docs/superpowers/specs/2026-10-20-staff-mobile-app-design.md`). Staff open it in the phone browser, log in once and add it to the home screen (iPhone: Safari share button → 홈 화면에 추가; Android: Chrome menu → 홈 화면에 추가 or 앱 설치, or the staff APK, see below). Its service worker (`public/manager-weve-7519/m/sw.js`) handles push alerts only, with no cache, so the app works only online and every deploy shows at once. Everything under `/manager-weve-7519/` is `noindex, nofollow` and `Cache-Control: private, no-store` (`next.config.ts`).
- Login lasts 30 days from the login and is not extended by use. The phone keeps a device token in `localStorage`; the server keeps only its SHA-256 hash in Firestore `managerDevices`. The device token is never sent to any other API: the phone trades it at `POST /api/manager/mobile/session` for an ordinary signed session token that lasts 1 hour, so every other manager API keeps checking the usual session. Each trade reads the account again: a deactivated or removed account signs the phone out, and permission changes reach the phone within an hour.
- An admin ends a phone's login in 계정 권한 → 휴대폰 로그인 기기 ("로그인 끊기"). The phone is signed out at its next trade, within an hour. Logging out on the phone ends its own device the same way, and so does logging in again on that phone (the old device is named in the login). When a data API refuses the session (401), the phone trades its device once more and retries; refused again, it logs out, ending its device.
- Each `managerDevices` record is signed by the server (HMAC with the session key over its id, account, login type, token hash, expiry and credential stamp, `app/api/manager/_mobile-device-rules.ts`), so a record the server did not write is never accepted. Keep the Firestore security rules denying every client read and write on `managerDevices`; only the server service account uses it.
- A device also carries a stamp of the credential its login used: the master password, or the ID account's stored password hash. Changing `MANAGER_PASSWORD` or an ID account's password, or removing `MANAGER_PASSWORD`, signs those phones out at their next trade. A Firebase-email account's password change is not seen; deactivate the account or end its phones in 휴대폰 로그인 기기.
- Before staff use the app, check on the deployed site that a Firebase-email account still works more than an hour after logging in. Each trade reads `/users/<uid>` and `/launcher_admins/<uid>` from the Realtime Database with the server service account; if the service account lacks that right, the phone shows "서버에서 계정을 확인하지 못했습니다…" once its first hour is over. A deploy without the Firebase settings gives the same answer and keeps those phones' devices: a missing setting is an outage, never a removed account.
- Tabs follow permissions: 오늘, 현장 and 일정 need `sites`; 보고 needs `sites` and `dashboard` (the same rule as posting from the PC); 상담 needs `consultations`. Vendor names and phones in the schedule need `estimates` or `vendors`. The overview API (`GET /api/manager/mobile/overview`) does not read lists the session may not see, and reads estimates with a field mask, never their lines.
- The phone 보고 is the customer progress record itself: whatever is posted, with 알림톡 or without, appears on the customer's progress page. The phone 보고 has no internal memo (the PC daily report's own memo lives only in that PC's browser); staff-only notes go in the site's 현장 기록.
- The phone changes a consultation's status and memo only through `POST /api/manager/mobile/consultation`, which writes just those fields (and `updatedAt`). 계약 and 완료 consultations show for 30 days after their last change.
- 일정 lists every listed site's schedule tasks by day, one week at a time, from the overview the phone already has (no extra reads).
- 할 일 and 현장 기록 (spec `docs/superpowers/specs/2026-10-21-staff-app-notes-schedule-estimate-design.md`) are staff only: the PC site screen and the phone site detail show them, the customer progress page never does. Anyone with `sites` reads, writes and ticks them through `/api/manager/site-notes`; only the writer or an admin deletes. Each note is its own document in Firestore `siteNotes`, so two people writing at once never overwrite each other. Keep the Firestore security rules denying every client read and write on `siteNotes`, as on `managerDevices`. Permanently deleting a site deletes its notes too.
- 견적 보기 on the phone needs `estimates`. `GET /api/manager/mobile/estimate` picks the same estimate as the schedule (newest final, else newest) and sends customer figures only; execution prices, costs, margins, work lines, purchase orders and the estimate memo never leave the server.
- 새 상담 알림 (spec `docs/superpowers/specs/2026-10-21-staff-push-android-design.md`, setup `docs/STAFF_APP_ANDROID_SETUP.md`) is web push for iPhone (home screen app, iOS 16.4+) and Android alike. Only people with `consultations` who turned it on in 상담 on their phone get it; the subscription is tied to that phone login (Firestore `pushSubscriptions`, one per device, client access denied like `managerDevices`) and goes when the login ends. Before every alert the server checks the phone login is still live and the account still has `consultations`. The alert never carries the customer's name, phone or message, only region, space and size; several at once become "새 상담 N건", and only consultations from the last 24 hours alert. A failed alert never changes saving the consultation, the 알림톡 or the email.
- Kakao BizForm+ responses are also imported every 10 minutes by `.github/workflows/kakao-bizform-sync.yml` calling `POST /api/cron/kakao-bizform` with `CRON_SECRET` (closed when the secret is not set), so they arrive and alert even when no PC dashboard is open. GitHub pauses scheduled workflows of a public repository after 60 days without commits; re-enable it in the Actions tab.
- The Android staff app is a TWA APK around `/manager-weve-7519/m` (package `kr.co.wevedesign.staff`), made with PWABuilder and shared by link, not a store app. `/.well-known/assetlinks.json` (from `ANDROID_APP_SHA256`) lets it open without an address bar. Keep its signing key safe and out of the repository.

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

## Estimate Templates

- 견적 템플릿 live in the Firestore collection `estimateTemplates`, read and written by the server service account only (`app/api/manager/_estimate-templates.ts`). They are Firestore-only: without Firestore ERP the template API answers 400. Templates never appear among sites, estimates, sales, the dashboard, the staff phone app or the customer progress page.
- Every template action needs the `estimates` permission. Names are 1–60 characters after trimming and unique ignoring spaces and case; a template holds at most 2,000 lines (`app/lib/estimate-templates.ts`).
- A template is saved only if it is still the version that was opened (`updateTime` precondition; `exists: false` for a new one). A conflict answers 409 `changed` or `deleted`; never overwrite another person's save.
- A line picked from the 자재 DB keeps `materialId`, in templates and in site estimates (the estimate save keeps it). Loading a template sets both 고객 단가 and 실행 단가 to the current DB 단가 of that item; a line without one is matched only when exactly one DB item has the same 품명·규격·단위 (never for a 공통 line); anything else keeps the template 단가 and is reported as not found.
- Before a load the page reads only the material version (`part=materialsMeta`, one read) and rereads every material only when that version differs from the cached one. A failed check stops the load; never load with prices that may be stale.
- Loaded lines get new ids. Replacing lines unlinks the 실행 내역 rows that pointed at the removed lines, as deleting a line does.

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
