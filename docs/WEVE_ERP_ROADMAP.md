# WEVE ERP Extension Roadmap

This document supplements `weve_erp_blueprint.md` with the controls and architecture required for a dependable internal ERP.

## 1. Core Data Model

- Use stable IDs to link consultation, customer, site, estimate, contract, sale, payment, expense, vendor, worker, and material records.
- Treat the site as the central operating unit. A customer may have multiple sites, and each site may have multiple estimate and contract versions.
- Replace free-text customer and site references in sales records with ID references while retaining display snapshots for historical documents.
- Add duplicate detection for phone numbers, addresses, business numbers, and imported reservations.
- Define required fields and validation rules per workflow stage rather than allowing partially completed records to spread.

## 2. Workflow Controls

- Implement explicit state transitions such as consultation, measurement, estimate, contract, construction, completion, and settlement.
- Record the assignee, due date, next action, and blocked reason for every active consultation and site.
- Add checklists for measurement, contract documents, material orders, construction start, completion inspection, and handover.
- Separate original contract, change order, additional work, cancellation, and final settlement amounts.
- Prevent destructive deletion of financial or contract records. Use cancellation, archival, and correction records instead.

## 3. Financial Management

- Track estimate amount, contract amount, VAT, deposit, interim payments, final payment, receivables, actual cost, and expected cost separately.
- Divide actual costs into material, labor, subcontract, transport, waste, equipment, and miscellaneous categories.
- Compare estimate, contract, committed cost, paid cost, and forecast-at-completion by site.
- Add change-order approval and payment schedules so margin changes remain explainable.
- Lock closed accounting periods and require an administrator reason for later corrections.

## 4. Audit And Security

- Store an audit log for create, edit, status change, export, login, and permission changes with user and timestamp.
- Expand roles beyond admin and staff: sales, designer, site manager, accounting, and read-only auditor.
- Add field-level restrictions for margin, payroll, account information, and personal data.
- Use secure server sessions with expiry and optional MFA when the backend moves beyond the current manager-token model.
- Define personal-data retention, masking, export, and deletion policies.

## 5. Integration Reliability

- Receive external reservations through verified APIs or webhooks only when the provider officially supports them.
- Store provider event IDs and process webhooks idempotently to prevent duplicate consultations.
- Use a background queue for notifications, bulk imports, document generation, and image processing.
- Record send status, failure reason, retry count, and provider response for SMS or Kakao BizMessage.
- Keep link shortcuts clearly separated from actual data synchronization.

## 6. Mobile Field Operation

- Build the manager as a responsive PWA before considering separate native apps.
- Provide a site-focused mobile home screen with today's work, contacts, address, drawings, checklist, photos, and issue reporting.
- Compress photos before upload, preserve capture time, and support queued retry on unstable networks.
- Design touch targets for one-hand use and avoid wide tables; use summary cards leading to focused detail screens.
- Add offline drafts for daily briefings and checklists, with conflict warnings when reconnecting.

## 7. Operations And Recovery

- Move operational ERP data from content-oriented storage to PostgreSQL when relationships and transaction volume outgrow the current model.
- Keep marketing content and portfolio assets in Sanity, while financial and operational records live in the transactional database.
- Define automated backups, restore tests, retention periods, and recovery objectives.
- Add application error monitoring, failed-job alerts, API latency metrics, and database health checks.
- Provide controlled CSV/Excel import templates with validation previews and row-level error reports.

## 8. Recommended Delivery Order

1. Stabilize navigation, customer-site IDs, validation, permissions, and audit logging.
2. Connect estimate versions, contracts, sales, payments, expenses, and site margin reporting.
3. Add schedules, workers, checklists, daily briefings, and mobile PWA workflows.
4. Add verified Naver/Kakao ingestion and outbound notification queues.
5. Migrate operational records to PostgreSQL and add backups, monitoring, and analytics.

Do not start with every external integration at once. The first production milestone should make one complete flow reliable: consultation to customer, site, estimate, contract, construction, payment, and settlement.
