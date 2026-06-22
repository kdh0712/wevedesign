# WEVE DESIGN Working Rules

This file records durable product and implementation decisions. Review it before changing the homepage or manager.

## Delivery

- Run `npm run build` after changes, then commit and push `main` so Vercel can deploy.
- Preserve unrelated user changes in a dirty worktree.
- Do not use Firebase Storage. Keep image uploads on the existing Sanity asset/API flow.
- Do not restore the Sanity Studio keyboard shortcut or require operators to use Studio for normal work.

## Manager Authentication

- Never auto-login from local storage or a remembered manager credential.
- Opening or refreshing `/manager-weve-7519` must show the login form.
- Do not render or reveal the manager dashboard until a user explicitly submits valid credentials and initial data loads successfully.
- Keep account permissions aligned across the manager UI, auth API, account API, and Firebase profiles.

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
