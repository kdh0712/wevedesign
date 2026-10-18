# 고객 공사 진행 현황 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 계약 고객이 알림톡 버튼으로 자기 현장의 사진·공정·작업 메모를 보는 `/progress/[code]` 페이지와, 일일 보고서 창에서 진행 기록을 올리고 알림톡을 보내는 관리자 기능을 만든다.

**Architecture:** 진행 기록은 Firestore `siteProgressUpdates`, 사진은 Sanity 에셋(서버 경유 한 장씩 업로드), 현장 링크 상태는 `officeSites` 필드에 둔다. 계산·변환 로직은 순수 함수 모듈(`app/lib/site-progress.ts`, `app/api/progress/_access.ts`)로 분리해 `node --test`로 검증하고, 관리자 API는 보안 브랜치의 `requireManager`, 고객 페이지는 서명 쿠키로 보호한다.

**Tech Stack:** Next.js 16 App Router (React 19, TypeScript), Tailwind 4, Firestore REST(서비스 계정), Sanity asset API(`managerClient`), 알리고 알림톡 REST, `node --test`(TS 직접 import).

**Spec:** `docs/superpowers/specs/2026-10-17-customer-progress-page-design.md`

## Global Constraints

- 시작 지점: 진행 중인 묶음(#7·#8·#9·#10·보안)이 main에 병합된 **뒤의 main**에서 브랜치를 만든다. 이 계획은 다음을 그대로 쓴다.
  - `requireManager(request, { anyOf: ['sites'] })` — `app/api/manager/_session.ts`
  - `resolveSessionKey(env)` — `app/api/manager/_token.ts`
  - `queryFirestoreCollectionByField(collection, fieldPath, value, idToken?)`, `getFirestoreDocument`, `saveFirestoreDocument`,
    `deleteFirestoreDocument`, `officeFirestoreCollections`, `shouldUseFirestoreErp`, `canUseFirestoreOnServer` — `app/api/manager/firestore.ts`
  - 휴지통(#10)이 있으면 `deletedAt`/휴지통 표시가 붙은 현장은 진행 현황 링크를 열지 않는다.
- Firestore 모드에서만 동작: `shouldUseFirestoreErp() && canUseFirestoreOnServer()`가 아니면 503 `진행 현황 기능은 Firestore 설정이 필요합니다.`
- Firebase Storage 금지. 사진은 `managerClient.assets.upload('image', ...)`.
- 고객에게 나가는 데이터에 견적 금액·단가·원가·마진·거래처 이름/연락처·공정 `memo`를 절대 넣지 않는다.
- 상수: 코드 `randomBytes(16).toString('base64url')`(22자) · 쿠키 180일(`15552000`초) · 잠금 5회 실패 시 15분 · 사진 긴 변 1600px JPEG 0.82 · 이미지 CDN `w=800`/`w=1600` · 대표번호 `031-381-0489` · 서명 키 라벨 `weve-progress-v1`.
- 화면 문구(그대로): `링크가 꺼져 있습니다. 위브디자인(031-381-0489)으로 문의해 주세요.` · `휴대폰 번호 뒷자리 4자리` · `{고객명} 고객님의 공사 진행 현황` · `알림톡 템플릿 설정이 필요합니다`.
- 환경 변수: `ALIGO_PROGRESS_TEMPLATE_CODE`, `ALIGO_PROGRESS_MESSAGE_TEMPLATE`, `ALIGO_PROGRESS_BUTTON_JSON`, `ALIGO_PROGRESS_SUBJECT`(기본 `공사 진행 안내`) + 기존 `ALIGO_API_KEY`·`ALIGO_USER_ID`·`ALIGO_SENDER_KEY`·`ALIGO_SENDER_PHONE`·`ALIGO_TEST_MODE`.
- `app/manager-weve-7519/page.tsx` 등은 git에 CRLF/LF가 섞여 있다. 편집 후 `git diff --stat`이 실제 변경량과 맞는지 확인하고, 파일 전체가 바뀌었으면 `git diff --ignore-space-at-eol > p && git checkout -- <file> && git apply --ignore-whitespace p`로 되돌린다.
- 테스트: `npm test` (= `node --test "tests/*.test.mjs"`). 빌드: `npm run build`.

## Review Focus

1. 휴대폰 번호 형식이 제각각(`010-1234-5678`, `01012345678`, `+82 10-1234-5678`, 공백) — 숫자만 남겨 끝 4자리를 비교해야 한다. → Task 1 `phoneLast4` 테스트.
2. 아이폰 HEIC 등 브라우저가 못 여는 사진 — 줄이기에 실패하면 그 사진 이름을 알리고 기록을 만들지 않아야 한다. → Task 5 브라우저 확인 단계.
3. 사진 여러 장을 한 요청으로 보내면 Vercel 4.5MB 제한에 걸린다 — 한 장씩 `uploadPhoto`. → Task 3 `uploadPhoto` 크기 검사 테스트, Task 5 순차 업로드.
4. 공정 일정의 빈 날짜·뒤바뀐 날짜(`endDate < startDate`)·`durationDays` 0 — 진행률이 `NaN`이 되면 안 된다. → Task 1 테스트.
5. 오늘 날짜를 서버(UTC) 기준으로 계산하면 한국 시간 오전 9시 전에 하루 밀린다. → Task 1 `todayInSeoul` 테스트.

---

### Task 1: 진행 현황 계산 모듈

**Files:**
- Create: `app/lib/site-progress.ts`
- Test: `tests/site-progress.test.mjs`

**Interfaces:**
- Produces:
  - `type ProgressScheduleTask = { id: string; name: string; startDate: string; endDate: string; durationDays: number; progress: number }`
  - `type ProgressTaskView = { id: string; name: string; startDate: string; endDate: string; state: 'done' | 'active' | 'upcoming'; percent: number }`
  - `type ScheduleSummary = { percent: number; startDate: string; endDate: string; current: ProgressTaskView[]; next: ProgressTaskView | null; tasks: ProgressTaskView[] }`
  - `type ProgressPhoto = { assetId: string; url: string; width: number; height: number }`
  - `type ProgressUpdate = { _id: string; siteId: string; reportDate: string; designer: string; workDetail: string; photos: ProgressPhoto[]; createdAt: string; createdBy?: string; notifyLog?: NotifyLogEntry[] }`
  - `type NotifyLogEntry = { sentAt: string; ok: boolean; error?: string; by: string }`
  - `type CustomerProgressView = { siteTitle: string; customerName: string; schedule: ScheduleSummary | null; updates: Array<{ id: string; reportDate: string; designer: string; workDetail: string; photos: ProgressPhoto[] }>; contactPhone: '031-381-0489' }`
  - `todayInSeoul(nowMs?: number): string` (`YYYY-MM-DD`)
  - `phoneLast4(phone: string | undefined): string` (숫자 4자리 미만이면 `''`)
  - `pickScheduleEstimate<T extends { versionType?: string; updatedAt?: string; createdAt?: string; scheduleJson?: string }>(estimates: T[]): T | null`
  - `summarizeSchedule(tasks: ProgressScheduleTask[], today: string): ScheduleSummary | null` (유효한 공정이 없으면 `null`)
  - `buildCustomerProgressView(input: { site: { title?: string; customerName?: string; [key: string]: unknown }; updates: ProgressUpdate[]; estimates: Array<Record<string, unknown>>; today: string }): CustomerProgressView` (현장의 다른 필드는 읽지 않는다)
  - `fillProgressTemplate(template: string, values: { customerName: string; siteTitle: string; date: string; code: string }): string` (`#{고객명}`, `#{현장명}`, `#{날짜}`, `#{코드}` 치환)
  - `canNotify(update: Pick<ProgressUpdate, 'notifyLog'>, resend: boolean): boolean` (성공 기록이 있으면 `resend`일 때만 true)

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/site-progress.test.mjs`, `import { ... } from '../app/lib/site-progress.ts'`

```js
test('todayInSeoul uses Korea time', () => {
  assert.equal(todayInSeoul(Date.UTC(2026, 9, 16, 15, 30)), '2026-10-17'); // KST 00:30
  assert.equal(todayInSeoul(Date.UTC(2026, 9, 17, 14, 59)), '2026-10-17');
});
test('phoneLast4 keeps digits only', () => {
  for (const value of ['010-1234-5678', '01012345678', '+82 10-1234-5678', ' 010 1234 5678 ']) assert.equal(phoneLast4(value), '5678');
  assert.equal(phoneLast4('12'), '');
  assert.equal(phoneLast4(undefined), '');
});
test('pickScheduleEstimate prefers the newest final version', () => {
  const picked = pickScheduleEstimate([
    { _id: 'a', versionType: 'revision', updatedAt: '2026-10-10' },
    { _id: 'b', versionType: 'final', updatedAt: '2026-10-01' },
    { _id: 'c', versionType: 'final', updatedAt: '2026-10-05' },
  ]);
  assert.equal(picked._id, 'c');
  assert.equal(pickScheduleEstimate([{ _id: 'x', updatedAt: '2026-10-01' }, { _id: 'y', updatedAt: '2026-10-02' }])._id, 'y');
  assert.equal(pickScheduleEstimate([]), null);
});
test('summarizeSchedule states, weighted percent and next task', () => {
  const tasks = [
    { id: '1', name: '철거', startDate: '2026-10-01', endDate: '2026-10-02', durationDays: 2, progress: 0 },
    { id: '2', name: '목공', startDate: '2026-10-03', endDate: '2026-10-08', durationDays: 6, progress: 0 },
    { id: '3', name: '타일', startDate: '2026-10-09', endDate: '2026-10-10', durationDays: 2, progress: 0 },
  ];
  const s = summarizeSchedule(tasks, '2026-10-05');
  assert.deepEqual(s.tasks.map((t) => t.state), ['done', 'active', 'upcoming']);
  assert.equal(s.percent, 50); // (2*100 + 6*50 + 2*0) / 10
  assert.equal(s.current[0].name, '목공');
  assert.equal(s.next.name, '타일');
  assert.equal(s.startDate, '2026-10-01');
  assert.equal(s.endDate, '2026-10-10');
});
test('summarizeSchedule uses a positive progress value and 100 means done', () => {
  const s = summarizeSchedule([{ id: '1', name: '도배', startDate: '2026-10-20', endDate: '2026-10-21', durationDays: 2, progress: 100 }], '2026-10-05');
  assert.equal(s.tasks[0].state, 'done');
  assert.equal(s.percent, 100);
});
test('summarizeSchedule ignores broken tasks and never returns NaN', () => {
  const s = summarizeSchedule([
    { id: '1', name: '', startDate: '', endDate: '', durationDays: 0, progress: 0 },
    { id: '2', name: '전기', startDate: '2026-10-09', endDate: '2026-10-03', durationDays: 0, progress: 0 },
  ], '2026-10-05');
  assert.ok(s === null || Number.isFinite(s.percent));
  assert.equal(summarizeSchedule([], '2026-10-05'), null);
});
test('buildCustomerProgressView drops prices, vendors and memos', () => {
  const view = buildCustomerProgressView({
    site: { title: '용호마을 24평', customerName: '홍길동', customerPhone: '010-1111-2222' },
    updates: [{ _id: 'u1', siteId: 's', reportDate: '2026-10-05', designer: '김동호 실장', workDetail: '철거 완료', photos: [], createdAt: 'x', notifyLog: [] }],
    estimates: [{ versionType: 'final', updatedAt: '2026-10-01', linesJson: '[{"customerUnitPrice":900000}]',
      scheduleJson: JSON.stringify([{ id: '1', name: '철거', startDate: '2026-10-01', endDate: '2026-10-02', durationDays: 2, progress: 0, vendorName: '거래처', vendorPhone: '010-9999-9999', memo: '내부 메모' }]) }],
    today: '2026-10-05',
  });
  const text = JSON.stringify(view);
  for (const banned of ['900000', '거래처', '010-9999-9999', '내부 메모', '010-1111-2222', 'customerUnitPrice']) assert.ok(!text.includes(banned), banned);
  assert.equal(view.contactPhone, '031-381-0489');
  assert.equal(view.updates[0].workDetail, '철거 완료');
});
test('fillProgressTemplate and canNotify', () => {
  assert.equal(fillProgressTemplate('#{고객명}/#{현장명}/#{날짜}/#{코드}', { customerName: '홍길동', siteTitle: 'A', date: '2026-10-05', code: 'abc' }), '홍길동/A/2026-10-05/abc');
  assert.equal(canNotify({ notifyLog: [] }, false), true);
  assert.equal(canNotify({ notifyLog: [{ sentAt: 'x', ok: false, by: 'a' }] }, false), true);
  assert.equal(canNotify({ notifyLog: [{ sentAt: 'x', ok: true, by: 'a' }] }, false), false);
  assert.equal(canNotify({ notifyLog: [{ sentAt: 'x', ok: true, by: 'a' }] }, true), true);
});
```

- [ ] **Step 2: 실패 확인** — Run: `npm test` · Expected: `site-progress.test.mjs` FAIL (모듈 없음)
- [ ] **Step 3: `app/lib/site-progress.ts` 구현** — 위 Interfaces 그대로. 규칙(스펙 3절):
  - 유효한 공정 = 이름이 있고 `startDate <= endDate`인 날짜 두 개. 가중치 = `max(durationDays, 날짜 차이+1, 1)`.
  - 진행도 = `progress > 0`이면 그 값(0–100으로 자름), 아니면 상태별 `done 100 / active 50 / upcoming 0`. `progress >= 100`이면 상태도 `done`.
  - `percent`는 가중 평균을 반올림한 정수. `current` = active 전부, `next` = 시작일이 가장 이른 upcoming.
  - `buildCustomerProgressView`는 `scheduleJson`을 안전하게 파싱(실패 시 일정 없음)하고, 업데이트는 `reportDate` 내림차순(같으면 `createdAt` 내림차순).
- [ ] **Step 4: 통과 확인** — Run: `npm test` · Expected: 모든 테스트 PASS
- [ ] **Step 5: Commit** — `git add app/lib/site-progress.ts tests/site-progress.test.mjs && git commit -m "Add customer progress calculations"`

### Task 2: 고객 확인 쿠키와 잠금

**Files:**
- Create: `app/api/progress/_access.ts`
- Test: `tests/progress-access.test.mjs`

**Interfaces:**
- Consumes: `resolveSessionKey(env)` (`app/api/manager/_token.ts`)
- Produces:
  - `PROGRESS_COOKIE_MAX_AGE_SECONDS = 15552000`, `PROGRESS_MAX_FAILURES = 5`, `PROGRESS_LOCK_MS = 900000`
  - `resolveProgressKey(env?: Record<string, string | undefined>): Buffer | null` = `HMAC(resolveSessionKey(env), 'weve-progress-v1')`
  - `progressCookieName(code: string): string` = `'wp_' + sha256(code).hex.slice(0, 16)`
  - `signProgressCookie(code: string, last4: string, key: Buffer, nowMs?: number): string` (`<exp>.<base64url HMAC(code|last4|exp)>`)
  - `verifyProgressCookie(value: string | undefined, code: string, last4: string, key: Buffer, nowMs?: number): boolean` (timingSafeEqual)
  - `type ProgressAccessState = { failedCount: number; lockedUntil: string }`
  - `isProgressLocked(state: ProgressAccessState | undefined, nowMs?: number): boolean`
  - `nextProgressAccessState(state: ProgressAccessState | undefined, success: boolean, nowMs?: number): ProgressAccessState` (성공 → `{0,''}`, 5번째 실패 → `lockedUntil = now+15분`, 잠금이 끝난 뒤 첫 실패는 1부터 다시 센다)

- [ ] **Step 1: 실패하는 테스트 작성** — 테스트 이름과 단언:
  - `cookie round trip`: sign → verify true; 180일 + 1초 뒤 false.
  - `cookie fails after code rotation or phone change`: 다른 code 또는 다른 last4로 verify → false; 서명 한 글자 바꾸면 false; `undefined` → false.
  - `key derivation`: `resolveProgressKey({ MANAGER_SESSION_SECRET: 's' })`가 Buffer이고 세션 키 자체와 다르다; 두 값이 모두 없으면 `null`.
  - `lockout after five failures`: 실패 4번 → 잠기지 않음, 5번째 → `isProgressLocked` true, 15분 + 1ms 뒤 false; 성공하면 `{ failedCount: 0, lockedUntil: '' }`.
- [ ] **Step 2: 실패 확인** — Run: `npm test` · Expected: `progress-access.test.mjs` FAIL
- [ ] **Step 3: `app/api/progress/_access.ts` 구현** — Node `crypto`만 사용.
- [ ] **Step 4: 통과 확인** — Run: `npm test` · Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "Add customer progress access cookie and lockout"`

### Task 3: 저장소와 관리자 API

**Files:**
- Create: `app/api/manager/_progress-store.ts`, `app/api/manager/_progress-request.ts`, `app/api/manager/_aligo.ts`, `app/api/manager/progress/route.ts`
- Test: `tests/progress-request.test.mjs`; 수동 매트릭스 `tests/manager-api-matrix.mjs`에 행 추가

**Interfaces:**
- Consumes: Task 1 전부, `requireManager`, Firestore 헬퍼(Global Constraints), `managerClient`
- Produces:
  - `_progress-store.ts`: `SITE_PROGRESS_COLLECTION = 'siteProgressUpdates'`; `type ProgressSite = { _id: string; title?: string; customerName?: string; customerPhone?: string; customerId?: string; progressCode?: string; progressEnabled?: boolean; progressCodeCreatedAt?: string; progressAccess?: ProgressAccessState; [key: string]: unknown }`; `isProgressStoreReady(): boolean`; `getSiteForProgress(siteId: string): Promise<ProgressSite | null>`; `findSiteByProgressCode(code: string): Promise<ProgressSite | null>` (`officeSites`에서 `progressCode` 일치, 휴지통 현장 제외); `resolveCustomerPhone(site: ProgressSite): Promise<string>` (`customerPhone`, 비어 있으면 `officeCustomers/{customerId}`의 `phone`); `listProgressUpdates(siteId: string): Promise<ProgressUpdate[]>`; `saveProgressUpdate(update: Omit<ProgressUpdate, '_id'> & { _id?: string })`; `deleteProgressUpdate(id: string)`; `saveSiteProgressFields(siteId: string, fields: Partial<{ progressCode: string; progressEnabled: boolean; progressCodeCreatedAt: string; progressAccess: ProgressAccessState }>)`; `listSiteEstimates(siteId: string)` (`siteEstimates`를 `siteId`로 조회). 모두 서비스 계정으로 읽고 쓴다(idToken 없음).
  - `_aligo.ts`: `sendAlimtalk(input: { templateCode: string; receiver: string; receiverName: string; subject: string; message: string; buttonJson?: string }): Promise<{ ok: boolean; error?: string }>` (기존 계약 알림 route의 폼 필드·`isAligoSuccess` 규칙과 같게. 기존 route는 고치지 않는다)
  - 순수 검증 함수 (`app/api/manager/_progress-request.ts`, route가 import): `parseCreateUpdate(body: unknown): { ok: true; value: { siteId: string; reportDate: string; designer: string; workDetail: string; photos: ProgressPhoto[]; notify: boolean } } | { ok: false; error: string }`, `MAX_PHOTO_BYTES = 4_000_000`, `checkPhotoUpload(type: string, size: number): { ok: true } | { ok: false; status: 400 | 413; error: string }`
  - HTTP (모두 `requireManager(request, { anyOf: ['sites'] })`, 스토어 미준비 시 503):
    - `GET ?siteId=` → `{ link: { enabled: boolean; code: string; url: string; createdAt: string }, hasCustomerPhone: boolean, notifyConfigured: boolean, updates: ProgressUpdate[] }`
    - `GET ?siteId=&preview=1` → `CustomerProgressView`
    - `POST multipart action=uploadPhoto` (siteId, file) → `{ photo: ProgressPhoto }`; `image/jpeg|png|webp`만, `MAX_PHOTO_BYTES` 초과 413
    - `POST JSON action=createUpdate` → `{ update, notify?: { ok, error? } }`. 사진 0장이면 400 `현장 사진을 첨부해주세요.`, 메모 비면 400 `상세 작업 내역을 입력해주세요.`
    - `POST JSON action=deleteUpdate {id}` · `action=setLink {siteId, mode: 'enable'|'disable'|'rotate'}` (고객 번호 없으면 enable/rotate 400 `고객 연락처가 없어 링크를 켤 수 없습니다.`) · `action=notify {updateId, resend}` (`canNotify` false면 409, 템플릿 env 없으면 400 `알림톡 템플릿 설정이 필요합니다`)
  - 링크 URL: `${NEXT_PUBLIC_SITE_URL || 'https://www.wevedesign.co.kr'}/progress/${code}`

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/progress-request.test.mjs` (`import ... from '../app/api/manager/_progress-request.ts'`):
  - 정상 본문 → `ok: true`, 값이 다듬어짐(trim), `notify` 기본 false.
  - `photos: []` → `{ ok: false, error: '현장 사진을 첨부해주세요.' }`; `workDetail: '  '` → `'상세 작업 내역을 입력해주세요.'`; `reportDate: '2026/10/05'` → 실패; `photos`에 `url`이 `https://cdn.sanity.io/`로 시작하지 않는 항목 → 실패.
  - `checkPhotoUpload('image/jpeg', 500_000)` → `ok: true`; `('image/heic', 500_000)` → `{ ok: false, status: 400 }`; `('image/jpeg', 4_000_001)` → `{ ok: false, status: 413 }`.
- [ ] **Step 2: 실패 확인** — Run: `npm test` · Expected: FAIL
- [ ] **Step 3: 스토어·알리고·route 구현** — `createUpdate`에서 `notify: true`면 저장 후 `notify`와 같은 경로로 발송하고 결과를 `notifyLog`에 추가 저장(실패해도 기록은 유지). 코드 생성은 `randomBytes(16).toString('base64url')`. `rotate`는 새 코드와 `progressAccess` 초기화.
- [ ] **Step 4: 통과 확인** — Run: `npm test` · Expected: PASS
- [ ] **Step 5: 권한 매트릭스** — `tests/manager-api-matrix.mjs`에 `GET /api/manager/progress?siteId=x`를 추가: admin 200 또는 503(로컬 Firestore 없음), `sites` 직원 200/503, `consultations`만 있는 직원 403, 토큰 없음 401. Run: `npm run dev` 후 `node tests/manager-api-matrix.mjs` · Expected: 새 행 모두 기대값
- [ ] **Step 6: 빌드와 Commit** — `npm run build` PASS 후 `git commit -m "Add manager API for customer progress updates"`

### Task 4: 고객 페이지

**Files:**
- Create: `app/api/progress/verify/route.ts`, `app/progress/[code]/page.tsx`, `app/progress/[code]/progress-gate.tsx` (`'use client'`), `app/lib/progress-view.tsx`, `app/lib/progress-photo-gallery.tsx` (`'use client'`)
- Modify: `next.config.ts` (`headers()`에 `/progress/:path*` → `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow`)

**Interfaces:**
- Consumes: Task 1 (`buildCustomerProgressView`, `phoneLast4`, `todayInSeoul`), Task 2 전부, Task 3 스토어
- Produces:
  - `POST /api/progress/verify { code: string; last4: string }` → 200 + `Set-Cookie` (`HttpOnly; Secure; SameSite=Lax; Path=/progress; Max-Age=15552000`) | 401 `번호가 맞지 않습니다.` | 423 `{ error, retryAfterSeconds }` | 404 링크 꺼짐 문구
  - `ProgressView({ view }: { view: CustomerProgressView })` — 관리자 미리보기에서도 쓰는 표시 전용 컴포넌트
  - 페이지: `dynamic = 'force-dynamic'`, `generateMetadata` → `robots: { index: false, follow: false }`, 제목 `공사 진행 현황 | 위브디자인`

- [ ] **Step 1: verify route** — `findSiteByProgressCode` → 꺼짐/없음 404 → 잠금 423 → `phoneLast4` 비교 → `nextProgressAccessState` 저장 → 성공 시 쿠키. 잘못된 `last4` 형식(숫자 4자리 아님)은 실패로 세지 않고 400.
- [ ] **Step 2: page + gate + view + gallery** — 스펙 3절 화면 구성 순서 그대로. 사진은 `${url}?w=800&auto=format` 목록, 크게 보기는 `w=1600`, `loading="lazy"`. 문의는 `tel:0313810489` 버튼.
- [ ] **Step 3: 빌드** — Run: `npm run build` · Expected: PASS, `/progress/[code]`가 `ƒ (Dynamic)`
- [ ] **Step 4: 로컬 확인 (Firestore 없음)** — `npm run dev`, `/progress/anything` → 503 안내가 아니라 링크 꺼짐 문구가 나오는지(스토어 미준비 시 페이지는 꺼짐 문구로 처리), 응답 헤더에 `cache-control: private, no-store`, `x-robots-tag: noindex, nofollow`.
- [ ] **Step 5: Commit** — `git commit -m "Add the customer progress page with phone check"`

### Task 5: 관리자 화면

**Files:**
- Create: `app/lib/resize-image.ts` (`resizeImageFile(file: File, maxEdge = 1600, quality = 0.82): Promise<{ blob: Blob; width: number; height: number }>`; 디코딩 실패 시 `Error('사진을 열 수 없습니다: <파일명>')`)
- Modify: `app/manager-weve-7519/page.tsx` — `DailyReportModal`(현재 `function DailyReportModal`), 현장 상세/편집 영역

**Interfaces:**
- Consumes: Task 3 HTTP API, Task 4 `ProgressView`, 보안 브랜치의 `authHeaders()`(Bearer)
- Produces: 화면 동작만

- [ ] **Step 1: 현장 "고객 진행 현황 링크" 패널** — 켜기/끄기, 링크 복사, 새 링크로 바꾸기(확인창 `이전 링크와 고객 확인 기록이 모두 무효가 됩니다. 계속할까요?`), 미리보기(모달 안에 `ProgressView`), 발송 기록. 고객 번호가 없으면 켜기 버튼 대신 경고.
- [ ] **Step 2: 일일 보고서 창** — 기존 "보고서 이미지 만들기"는 그대로. 아래에 체크박스 `고객 진행 현황에 올리기`(링크 켜짐이면 기본 체크), `고객에게 알림톡 보내기`(기본 해제)와 `올리기` 버튼. 사진을 `resizeImageFile` → `uploadPhoto` **한 장씩 순서대로** → `createUpdate`. 진행 표시(`사진 2/5 올리는 중`), 실패한 사진 이름을 보여주고 기록은 만들지 않는다.
- [ ] **Step 3: 서버 기록 목록** — 날짜, 메모 앞 40자, 사진 수, 알림 상태(보냄/실패/안 보냄), 삭제(확인창), `다시 보내기`.
- [ ] **Step 4: 브라우저 확인 (fetch 모킹)** — 내장 브라우저에서 관리자 페이지 열기, `window.fetch`를 `/api/manager/progress`만 가로채는 모킹으로 교체 후:
  - 사진 3장 올리기 → `uploadPhoto` 3번 순차 + `createUpdate` 1번
  - 두 번째 사진 업로드를 500으로 응답 → 오류 문구에 파일명, `createUpdate` 0번
  - 텍스트 파일(.txt)을 사진으로 넣기 → `사진을 열 수 없습니다` 문구
  - 링크 패널 켜기/바꾸기/끄기 요청 본문 확인, 미리보기 모달 표시
  Expected: 위 요청 횟수와 문구가 정확히 나온다
- [ ] **Step 5: 줄바꿈과 빌드** — `git diff --stat`가 수십 줄 단위인지 확인(Global Constraints 절차), `npm run build` PASS
- [ ] **Step 6: Commit** — `git commit -m "Post daily reports to the customer progress page"`

### Task 6: 문서와 배포 확인

**Files:**
- Modify: `docs/WEVE_WORKING_RULES.md` (Manager UX 또는 새 "Customer Progress" 절: 고객에게 금액·거래처 정보 노출 금지, 링크 끄기/교체 규칙), `docs/KAKAO_BIZFORM_SETUP.md` (`ALIGO_PROGRESS_*` 변수와 템플릿 예시, PC 링크 같은 주소, 채널추가 체크 안 함)

- [ ] **Step 1: 문서 갱신 후 Commit** — `git commit -m "Document the customer progress page setup"`
- [ ] **Step 2: push와 PR** — 브랜치 push, PR 본문(한국어: 요약/변경 사항/테스트/배포 순서). main에 직접 병합하지 않는다.
- [ ] **Step 3: 미리보기 배포에서 실제 데이터 확인 (대표님과 함께)** — `ALIGO_TEST_MODE=Y`인 Preview에서: 테스트 현장 링크 켜기 → 일일 보고서 올리기(사진 2장) → 휴대폰으로 링크 열기 → 뒷자리 틀리게 5번 → 잠금 문구 → 15분 뒤 맞게 입력 → 사진·공정·메모 표시, 금액 없음 → `다시 보내기`로 알림톡 요청 형식 확인. Expected: 각 단계가 스펙 3·4·6절과 같다.

---

## Self-Review 기록

- 스펙 대응: 2절 저장 구조 → Task 3, 3절 페이지·확인·계산 → Task 1·2·4, 4절 관리자 화면 → Task 3·5, 5절 알림톡 → Task 3(`_aligo.ts`, `notify`), 6절 오류 → Task 3·4·5의 문구와 상태 코드, 7절 검증 → 각 Task 테스트 + Task 6 Step 3, 8절 배포 → Task 6.
- 스펙과 다른 점: 사진 업로드를 `uploadPhoto`로 한 장씩 나눴다(Vercel 4.5MB 제한). 스펙 4절도 같이 고쳤다.
