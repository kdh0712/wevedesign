# WEVE DESIGN Working Rules

This file records durable product and implementation decisions. Review it before changing the homepage or manager.

## Delivery

- Run `npm run build` after changes, then commit and push `main` so Vercel can deploy.
- Preserve unrelated user changes in a dirty worktree.
- Do not use Firebase Storage. Keep image uploads on the existing Sanity asset/API flow.
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

## Homepage

- Keep the current visual design unless a request explicitly changes it.
- Maintain separate settings for the header safe number and footer company number.
- Keep SNS destinations configurable in the manager.
- Homepage popups may be multiple and must remain non-blocking. They must not appear on portfolio, section-route, or search-focused pages.
- Popup controls and UI labels must not leak into search snippets.

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
