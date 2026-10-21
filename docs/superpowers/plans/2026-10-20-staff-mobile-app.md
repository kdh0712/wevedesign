# 직원용 휴대폰 웹앱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 직원이 휴대폰 홈 화면 아이콘으로 여는 `/manager-weve-7519/m` 웹앱(오늘, 현장, 보고, 상담)과, 30일 기기 로그인·관리자 기기 끊기를 만든다.

**Architecture:** 기존 8시간 세션 토큰과 `requireManager`는 그대로 둔다. 휴대폰은 30일짜리 기기 토큰(Firestore `managerDevices`, 해시만 저장)으로 1시간 세션 토큰을 받아 기존 API와 새 `mobile/*` API를 부른다. 화면 계산(오늘 현장 고르기, 상담 정리, 탭 권한)은 import 없는 순수 모듈로 두고 `node --test`로 검증한다.

**Tech Stack:** Next.js App Router(React 19, TypeScript), Tailwind 4, Firestore REST(서비스 계정), `node:crypto`, `node --test`(TS 직접 import).

**Spec:** `docs/superpowers/specs/2026-10-20-staff-mobile-app-design.md`

## Global Constraints

- 브랜치: `feature/staff-mobile-app` (설계 문서 커밋 위).
- Firestore 모드에서만 동작: `isProgressStoreReady()`가 false면 휴대폰 API는 503 `휴대폰 앱은 Firestore 설정이 필요합니다.`
- 상수: 기기 로그인 30일(`2592000000`ms, 사용해도 늘지 않음) · 휴대폰 세션 토큰 1시간(`3600`초) · `lastUsedAt` 쓰기 간격 10분 · 세션 갱신은 만료 5분 전 · overview 다시 받기 5분 · 상담 '계약'·'완료'는 최근 30일 · 메모 2000자.
- 상담 상태 목록(순서 그대로): `['신규', '상담중', '견적', '계약', '완료']`. 현장 제외 상태: `'완료'`, `'보류'`.
- 색: 배경 `#fffdf8`, 글씨 `#171512`, 보조 글씨 `#625d54`, 테두리 `#eadfcd`, 진행 막대 `#8f6f43`, 지연 `#c2410c`(글씨) / `#fff4ea`(바탕). 먹색 채운 버튼은 화면당 하나. 누르는 곳 44px 이상. `env(safe-area-inset-*)` 여백.
- 화면 문구(그대로): 앱 이름 `위브 업무` · 권한 없음 `휴대폰에서 볼 수 있는 권한이 없습니다. 관리자에게 권한을 요청해 주세요.` · 연결 오류 `연결이 불안정합니다.` + 버튼 `다시 시도` · 보고 버튼 `올리고 알림톡 보내기` / `올리기만` · 보고 안내 `두 버튼 모두 고객 진행 현황 페이지에 올라갑니다.` · 기기 목록 제목 `휴대폰 로그인 기기` · 끊기 버튼 `로그인 끊기`.
- `app/manager-weve-7519/page.tsx`, `app/api/manager/auth/route.ts` 등은 CRLF/LF가 섞여 있다. 편집 뒤 `git diff --stat`이 실제 변경량과 맞는지 보고, 파일 전체가 바뀌었으면 줄바꿈을 원래대로 되돌린다.
- 새 npm 패키지 없음. 새 환경변수 없음.
- 테스트 `npm test`, 빌드 `npm run build`. `.claude/launch.json`은 커밋하지 않는다.

## Review Focus

1. 끊긴 기기나 비활성화된 계정이 갱신을 시도함 — 401 `signedOut`을 받고 휴대폰 저장값이 지워져야 한다. → Task 1 `deviceRefreshDecision` 테스트, Task 6 `mobile-session` 테스트.
2. 견적이 없거나 `scheduleJson`이 깨진 '시공중' 현장 — 오늘 홈에서 빠지지 않고 공정표만 비어야 한다. → Task 4 테스트.
3. 상담 권한만 있는 직원(현장 권한 없음) — 오늘·현장·보고 탭 없이 상담 탭으로 시작해야 한다. → Task 4 `visibleMobileTabs` 테스트.
4. 전화번호가 없는 고객·상담·거래처 — 전화 버튼이 아예 없어야 한다(빈 `tel:` 금지). → Task 4 테스트(빈 번호는 값에서 빠짐), Task 8 화면 확인.
5. 앱을 두 번 열어 갱신이 겹침 — 갱신은 기기 토큰을 바꾸지 않으므로 둘 다 성공해야 한다. → Task 3 수동 확인 단계.

---

### Task 1: 기기 토큰 규칙과 세션 길이 옵션

**Files:**
- Create: `app/api/manager/_mobile-device-rules.ts` (`node:crypto` 외 import 없음)
- Modify: `app/api/manager/_token.ts`, `app/api/manager/_session.ts`
- Test: `tests/mobile-device.test.mjs`, `tests/manager-token.test.mjs`

**Interfaces:**
- Produces:
  - `type MobileDeviceRecord = { _id: string; userId: string; loginId: string; userName: string; src: 'master' | 'account' | 'firebase'; deviceLabel: string; tokenHash: string; createdAt: string; expiresAt: string; lastUsedAt: string; revokedAt?: string; revokedBy?: string }`
  - `MOBILE_DEVICE_TTL_MS = 2592000000`, `MOBILE_SESSION_TTL_SECONDS = 3600`, `LAST_USED_WRITE_INTERVAL_MS = 600000`
  - `newDeviceSecret(): { deviceId: string; deviceToken: string; tokenHash: string }` — `deviceId` = `md-` + 무작위 12바이트 hex, `deviceToken` = 무작위 32바이트 base64url
  - `hashDeviceToken(token: string): string` — SHA-256 hex
  - `deviceRefreshDecision(device: MobileDeviceRecord | null, token: string, nowMs: number): { ok: true; touch: boolean } | { ok: false; reason: 'missing' | 'revoked' | 'expired' | 'token' }`
  - `deviceLabelFromUserAgent(userAgent: string): string`
  - `signSessionToken(claims, key, nowMs = Date.now(), ttlSeconds = SESSION_TTL_SECONDS)`
  - `issueManagerSession(user, src, ttlSeconds?: number)`

- [ ] **Step 1: 실패하는 테스트 쓰기** — `tests/mobile-device.test.mjs`

```js
test('a new secret matches its own hash and nothing else', () => {
  const s = newDeviceSecret();
  assert.match(s.deviceId, /^md-[0-9a-f]{24}$/);
  assert.equal(hashDeviceToken(s.deviceToken), s.tokenHash);
  assert.notEqual(hashDeviceToken(s.deviceToken + 'x'), s.tokenHash);
});
test('refresh decision', () => {
  const now = Date.UTC(2026, 9, 20);
  const s = newDeviceSecret();
  const device = { _id: s.deviceId, tokenHash: s.tokenHash, expiresAt: new Date(now + 1000).toISOString(),
    lastUsedAt: new Date(now - 11 * 60000).toISOString() /* 나머지 칸 생략 */ };
  assert.deepEqual(deviceRefreshDecision(device, s.deviceToken, now), { ok: true, touch: true });
  assert.deepEqual(deviceRefreshDecision({ ...device, lastUsedAt: new Date(now - 60000).toISOString() }, s.deviceToken, now), { ok: true, touch: false });
  assert.deepEqual(deviceRefreshDecision(null, s.deviceToken, now), { ok: false, reason: 'missing' });
  assert.deepEqual(deviceRefreshDecision({ ...device, revokedAt: 'x' }, s.deviceToken, now), { ok: false, reason: 'revoked' });
  assert.deepEqual(deviceRefreshDecision({ ...device, expiresAt: new Date(now).toISOString() }, s.deviceToken, now), { ok: false, reason: 'expired' });
  assert.deepEqual(deviceRefreshDecision(device, 'wrong', now), { ok: false, reason: 'token' });
});
test('device labels', () => {
  assert.equal(deviceLabelFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) ... Version/18.0 Mobile/15E148 Safari/604.1'), 'iPhone · Safari');
  assert.equal(deviceLabelFromUserAgent('Mozilla/5.0 (Linux; Android 15; SM-S928N) ... Chrome/130.0 Mobile Safari/537.36'), 'Android · Chrome');
  assert.equal(deviceLabelFromUserAgent('Mozilla/5.0 (Linux; Android 15) ... SamsungBrowser/27.0 Chrome/125.0 Mobile Safari/537.36'), 'Android · 삼성 인터넷');
  assert.equal(deviceLabelFromUserAgent(''), '알 수 없는 기기');
});
```

`tests/manager-token.test.mjs`에 추가: `signSessionToken(claims, key, now, 3600)`의 `exp - iat === 3600`, 인자를 안 주면 `28800`.

- [ ] **Step 2: 실패 확인** — `node --test tests/mobile-device.test.mjs tests/manager-token.test.mjs` → 모듈 없음으로 FAIL.
- [ ] **Step 3: 구현** — 토큰 비교는 길이가 같을 때 `timingSafeEqual`. 순서: 없음 → 끊김 → 만료(`expiresAt <= now`) → 토큰. `touch`는 `lastUsedAt`이 10분 이상 지났을 때 true.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `npm test` 전체 PASS.
- [ ] **Step 5: 커밋** — `휴대폰 기기 토큰 규칙과 세션 길이 옵션`

### Task 2: 로그인 확인 공통 함수

**Files:**
- Create: `app/api/manager/_login.ts`
- Modify: `app/api/manager/auth/route.ts` (확인 로직을 옮기고 응답 모양은 그대로)

**Interfaces:**
- Consumes: 기존 `firebaseSignIn`, `firebaseLookup`, `getFirebaseProfile`, `setFirebaseProfile`, `firebaseAdminDbAuth`, `getFirebaseAdminFlag`, `verifyPasswordOrDummy`, `hashPassword`, `safeEqual`, `loginLimiter`, `clientIp`, `managerClient`.
- Produces:
  - `type LoginUser = { id: string; name: string; loginId: string; role: ManagerRole; permissions: unknown }`
  - `verifyManagerLogin(request: Request, loginId: string, password: string): Promise<{ ok: true; user: LoginUser; src: SessionSource; firebaseIdToken?: string } | { ok: false; status: number; error: string }>` — 시도 제한, 비활성 계정, 비밀번호 재해시까지 지금 `POST /api/manager/auth`와 같은 동작.
  - `reloadManagerUser(src: SessionSource, userId: string): Promise<LoginUser | null>` — 갱신 때 계정을 다시 읽는다. firebase: `firebaseAdminDbAuth()`로 `getFirebaseProfile`, `isActive === false`면 null, 역할은 프로필 `role` 또는 `getFirebaseAdminFlag`. account: `managerClient.fetch('*[_type == "managerAccount" && _id == $id && isActive != false][0]{_id,name,loginId,role,permissions}')`. master: `{ id: 'admin', name: '총괄 관리자', loginId: 'admin', role: 'admin', permissions: [] }`.

- [ ] **Step 1: 옮기기** — `auth/route.ts`는 `verifyManagerLogin`을 부르고 `sessionResponse`만 남긴다. `firebaseToken`을 응답에 넣는 조건(`!isFirestoreServiceAccountConfigured()`)은 route에 둔다.
- [ ] **Step 2: 확인** — `npm test` PASS(특히 `manager-login-limit`, `manager-password`). 로컬 개발 서버에서 `node tests/manager-api-matrix.mjs`가 전과 같은 결과. PC 관리자 화면 로그인이 된다.
- [ ] **Step 3: 커밋** — `로그인 확인을 공통 함수로 분리`

### Task 3: 기기 저장소와 세션·기기 API

**Files:**
- Create: `app/api/manager/_mobile-devices.ts`, `app/api/manager/mobile/session/route.ts`, `app/api/manager/mobile/devices/route.ts`

**Interfaces:**
- Consumes: Task 1 전부, Task 2 `verifyManagerLogin`, `reloadManagerUser`, `issueManagerSession`, `requireManager`, `getFirestoreDocument`, `saveFirestoreDocument`, `patchFirestoreFields`, `listFirestoreCollection`, `isProgressStoreReady`.
- Produces:
  - `_mobile-devices.ts`: `MOBILE_DEVICES_COLLECTION = 'managerDevices'`, `createMobileDevice(user: LoginUser, src, deviceLabel, nowMs): Promise<{ deviceId; deviceToken; expiresAt: string }>`, `getMobileDevice(id): Promise<MobileDeviceRecord | null>`, `touchMobileDevice(id, nowIso)`, `revokeMobileDevice(id, by: string, nowIso)`, `listActiveMobileDevices(nowMs): Promise<MobileDeviceRecord[]>` (끊기지 않고 만료 안 된 것, `lastUsedAt` 최신순)
  - `POST /api/manager/mobile/session` — `login` → `{ deviceId, deviceToken, expiresAt, session }` · `refresh` → `{ session }` 또는 401 `{ error: '다시 로그인해 주세요.', signedOut: true }` · `logout` → `{ ok: true }` (토큰이 맞을 때만 끊음, 틀려도 `ok`). `session` = `issueManagerSession(user, src, MOBILE_SESSION_TTL_SECONDS)`.
  - `GET /api/manager/mobile/devices` (admin) → `{ devices: Array<Omit<MobileDeviceRecord, 'tokenHash'>> }` · `DELETE` `{ deviceId }` (admin) → `{ ok: true }`, `revokedBy`는 세션 `loginId`.

- [ ] **Step 1: 구현** — `refresh`: `deviceRefreshDecision` 실패 또는 `reloadManagerUser`가 null이면 401 `signedOut`(계정이 사라진 경우 기기도 끊는다). `touch`면 `touchMobileDevice`. 기기 토큰은 바꾸지 않는다. 문서 쓰기는 `exists:false`(생성)·`exists:true`(수정) 조건.
- [ ] **Step 2: 수동 확인** — 로컬 개발 서버에서 curl로 login → refresh 두 번 동시에(둘 다 200) → admin 세션으로 devices 목록에 보임, `tokenHash` 없음 → DELETE → refresh 401 `signedOut: true` → staff 세션으로 devices 403.
- [ ] **Step 3: 커밋** — `휴대폰 기기 로그인 API`

### Task 4: 휴대폰 화면 데이터 계산과 overview API

**Files:**
- Create: `app/lib/mobile-overview.ts` (import 없음), `app/api/manager/mobile/overview/route.ts`
- Test: `tests/mobile-overview.test.mjs`

**Interfaces:**
- Consumes: `summarizeSchedule`, `pickScheduleEstimate`, `todayInSeoul` (`app/lib/site-progress.ts`; overview route에서 부르고 결과를 순수 함수에 넘긴다), `hasAnyPermission`.
- Produces (`app/lib/mobile-overview.ts`):
  - `type MobileTab = 'today' | 'sites' | 'report' | 'consultations'`
  - `visibleMobileTabs(perms: { sites: boolean; dashboard: boolean; consultations: boolean }): MobileTab[]` — today·sites는 sites, report는 sites+dashboard, consultations는 consultations
  - `type MobileTask = { id; name; state: 'done' | 'active' | 'upcoming' | 'delayed'; percent: number; startDate; endDate; vendorName?: string; vendorPhone?: string }`
  - `type MobileSite = { id; title; address; status; customerName; customerPhone?: string; schedule: { percent; startDate; endDate; tasks: MobileTask[] } | null }`
  - `type MobileConsultation = { id; name; phone?: string; createdAt; status; siteType; areaRange; reason; timeline; region; message; memo }`
  - `type MobileOverview = { today: string; sites: MobileSite[]; activeSiteIds: string[]; tomorrow: Array<{ siteId; siteTitle; taskName; vendorName?: string }>; consultations?: MobileConsultation[] }`
  - `CONSULTATION_STATUSES = ['신규', '상담중', '견적', '계약', '완료'] as const`
  - `listedSites<T extends { status?: string; deletedAt?: string }>(sites: T[]): T[]`
  - `pickActiveSiteIds(sites: MobileSite[], today: string): string[]` — '시공중'이거나 active/delayed 공정이 있는 현장, 지연 있는 현장 먼저, 그다음 `schedule.startDate` 순(없으면 맨 뒤)
  - `tomorrowTasks(sites: MobileSite[], activeIds: string[], tomorrow: string)`
  - `shortRegion(address: string): string` — "경기 안양시 동안구 평촌동 123" → "안양 평촌동"(시·동만, 시의 '시' 뗌), 못 찾으면 앞 두 단어
  - `listedConsultations(records: Array<Record<string, unknown>>, nowMs: number): MobileConsultation[]` — 휴지통 제외, 계약·완료는 30일 이내, 최신순, 빈 전화번호는 `phone` 없음
  - `toMobileConsultation(record: Record<string, unknown>): MobileConsultation` (Task 5도 씀)
  - `parseConsultationPatch(body: unknown): { ok: true; id: string; fields: { status?: string; memo?: string } } | { ok: false; error: string }`

- [ ] **Step 1: 실패하는 테스트 쓰기** — 이름과 단언:
  - `visibleMobileTabs`: 상담만 → `['consultations']`; sites만 → `['today','sites']`; 전부 → 네 개 순서대로; 없음 → `[]`.
  - `listedSites`: '완료'·'보류'·`deletedAt` 있는 현장 빠짐.
  - `pickActiveSiteIds`: 공정표 없는 '시공중' 현장 포함; '계약' 현장은 오늘 active 공정이 있을 때만; 지연 현장이 첫째.
  - `tomorrowTasks`: 시작일이 내일인 공정만, 오늘 홈 현장만.
  - `shortRegion`: 위 예와 `'의왕시 오리나무1길 12'` → `'의왕'`, `''` → `''`.
  - `listedConsultations`: 31일 전 '완료' 빠짐, 29일 전 '계약' 남음, 오래된 '신규' 남음, 최신순, `phone: ''` → `'phone' in item === false`.
  - `parseConsultationPatch`: 없는 상태 거부, 2001자 메모 거부, id 없으면 거부, status·memo 둘 다 없으면 거부.
- [ ] **Step 2: 실패 확인** — `node --test tests/mobile-overview.test.mjs` FAIL.
- [ ] **Step 3: 순수 함수 구현.**
- [ ] **Step 4: route 구현** — `requireManager`(권한 규칙 없음) 뒤 세션 권한으로 읽을 것만 읽는다. 현장·견적은 sites가 있을 때, 상담은 consultations가 있을 때. 견적은 `listFirestoreCollection('siteEstimates', undefined, 1000, ['siteId','versionType','updatedAt','createdAt','scheduleJson','deletedAt'])`로 필요한 칸만. 거래처 이름·전화는 `estimates` 또는 `vendors` 권한이 있을 때만 `MobileTask`에 넣는다. 현장 `customerPhone`이 비면 `resolveCustomerPhone`을 쓰지 않고 빼 둔다(현장 상세의 progress GET이 이미 알려 줌 — 추가 읽기 방지).
- [ ] **Step 5: 통과 확인** — `npm test` PASS.
- [ ] **Step 6: 커밋** — `휴대폰 화면 데이터 계산과 overview API`

### Task 5: 상담 상태·메모 바꾸기 API

**Files:**
- Create: `app/api/manager/mobile/consultation/route.ts`

**Interfaces:**
- Consumes: `parseConsultationPatch`, `listedConsultations`의 한 건 변환(같은 모듈에 `toMobileConsultation(record)`로 export해서 Task 4와 함께 쓴다), `patchFirestoreFields`, `getFirestoreDocument`, `officeFirestoreCollections.consultation`, `requireManager(request, { anyOf: ['consultations'] })`.
- Produces: `POST /api/manager/mobile/consultation` `{ id, status?, memo? }` → `{ consultation: MobileConsultation }`; 없음·휴지통 404 `상담을 찾을 수 없습니다.`

- [ ] **Step 1: 구현** — 먼저 문서를 읽어 `deletedAt`이면 404, 그다음 받은 칸과 `updatedAt`만 `exists: true` 조건으로 쓴다.
- [ ] **Step 2: 확인** — `npm test` PASS. 로컬에서 테스트용 상담 하나의 상태를 바꾸고 PC 화면에서 다른 칸(이름, 주소, 메시지)이 그대로인지 본다. consultations 권한 없는 세션 403.
- [ ] **Step 3: 커밋** — `휴대폰 상담 상태·메모 변경 API`

### Task 6: 휴대폰 로그인 유지(브라우저 쪽)

**Files:**
- Create: `app/manager-weve-7519/m/mobile-session.ts`
- Test: `tests/mobile-session.test.mjs`

**Interfaces:**
- Consumes: `POST /api/manager/mobile/session`, `StoredManagerUser` 타입.
- Produces:
  - `MOBILE_DEVICE_STORAGE_KEY = 'weve-mobile-device-v1'`
  - `parseStoredDevice(raw: string | null, nowMs: number): { deviceId: string; deviceToken: string; expiresAt: number } | null` — 모양이 틀리거나 만료면 null
  - `needsRefresh(session: { expiresAt: number } | null, nowMs: number): boolean` — 없거나 5분 안에 만료
  - `createMobileSession(fetcher = fetch)`: `{ login(loginId, password), current(): Promise<{ token; user } | null>, logout(), authHeaders(): Record<string,string> }` — `current()`는 필요할 때만 갱신하고 동시에 불려도 요청은 하나. 401 `signedOut`이면 저장값을 지우고 null, 네트워크 오류면 throw(저장값 유지).

- [ ] **Step 1: 실패하는 테스트** — `parseStoredDevice`(정상, 깨진 JSON, 만료), `needsRefresh`(null → true, 4분 남음 → true, 6분 남음 → false), `createMobileSession`에 가짜 `fetcher`와 메모리 저장소를 넣어: 동시에 `current()` 두 번 → fetch 한 번; `signedOut` 응답 → 저장값 삭제·null; 네트워크 오류 → throw·저장값 유지. (저장소는 생성 인자로 받아 테스트에서 바꿀 수 있게 한다: `createMobileSession({ fetcher, storage })`.)
- [ ] **Step 2: 실패 확인 → Step 3: 구현 → Step 4: 통과 확인** (`node --test tests/mobile-session.test.mjs`)
- [ ] **Step 5: 커밋** — `휴대폰 로그인 유지`

### Task 7: 앱 껍데기(설치 정보·헤더·아이콘)

**Files:**
- Create: `app/manager-weve-7519/m/layout.tsx`, `app/manager-weve-7519/m/manifest.webmanifest/route.ts`, `public/staff-app/icon-192.png`, `public/staff-app/icon-512.png`, `public/staff-app/icon-maskable-512.png`, `public/staff-app/apple-touch-icon.png`
- Modify: `next.config.ts`
- Test: `tests/next-config.test.mjs`

**Interfaces:**
- Produces: manifest `{ name: '위브 업무', short_name: '위브 업무', start_url: '/manager-weve-7519/m', scope: '/manager-weve-7519/m', display: 'standalone', background_color: '#fffdf8', theme_color: '#fffdf8', icons: [...] }` (`Content-Type: application/manifest+json`). layout `metadata`: `title: '위브 업무'`, `manifest`, `appleWebApp: { capable: true, title: '위브 업무', statusBarStyle: 'default' }`, `icons.apple`, `robots: { index: false, follow: false }`; `viewport`: `themeColor: '#fffdf8'`, `viewportFit: 'cover'`.

- [ ] **Step 1: 실패하는 테스트** — `next-config.test.mjs`에 `/manager-weve-7519/:path*` 규칙이 `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow`를 갖고 `/:path*` 규칙보다 뒤에 있는지.
- [ ] **Step 2: 실패 확인 → Step 3: 헤더 규칙 추가 → Step 4: 통과 확인.**
- [ ] **Step 5: 아이콘 만들기** — Pillow(`python -I`)로 `public/weve-symbol.png`에서 192·512·180, 마스크용은 `#fffdf8` 바탕에 로고를 가운데 60% 크기로. 스크립트는 scratchpad에 두고 커밋하지 않는다.
- [ ] **Step 6: layout·manifest 구현 후 확인** — `npm run build` 통과, 개발 서버에서 `/manager-weve-7519/m/manifest.webmanifest` 응답 확인.
- [ ] **Step 7: 커밋** — `휴대폰 앱 설치 정보와 관리자 경로 검색 제외`

### Task 8: 앱 화면 — 로그인, 오늘, 현장

**Files:**
- Create: `app/manager-weve-7519/m/page.tsx` (`'use client'`, 탭 전환과 데이터 불러오기), `app/manager-weve-7519/m/mobile-ui.tsx` (공통 조각: `TabBar`, `Card`, `ProgressBar`, `StatePill`, `CallButton`, `InstallGuide`), `app/manager-weve-7519/m/login-screen.tsx`, `app/manager-weve-7519/m/today-tab.tsx`, `app/manager-weve-7519/m/sites-tab.tsx` (목록 + 상세)

**Interfaces:**
- Consumes: Task 6 `createMobileSession`, Task 4 타입과 `visibleMobileTabs`, `GET /api/manager/mobile/overview`, `createProgressApi(authHeaders).load(siteId)`(최근 보고 3개), `formatReportDay`, `memoPreview`.
- Produces: `page.tsx`가 자식에 넘기는 `openReport(siteId: string)` (Task 9 보고 탭이 받음), `overview: MobileOverview`, `reload(): Promise<void>`.

- [ ] **Step 1: 구현** — 시안 그대로. 첫 탭은 `visibleMobileTabs`의 첫 값. 탭이 없으면 권한 없음 문구. overview는 메모리에 두고 `visibilitychange`로 앞에 나왔을 때 5분 지났으면 다시 받는다. 맨 위에서 아래로 당기면 `reload`. 불러오기가 네트워크 오류면 마지막 화면을 두고 `연결이 불안정합니다.` + `다시 시도`를 띄운다. 길 안내는 `https://map.kakao.com/link/search/<주소>`. `InstallGuide`는 `matchMedia('(display-mode: standalone)')`이나 `navigator.standalone`이면 숨기고, 닫으면 `localStorage`(try/catch)에 기억.
- [ ] **Step 2: 확인** — 개발 서버를 휴대폰 크기(375×812)로 열어: 로그인 → 오늘(새 상담 카드, 지연 경고, 현장 카드) → 현장 검색 → 상세(전화·길 안내·공정표·최근 보고). 상담 권한만 있는 세션으로 상담 탭만 보이는지. 콘솔 오류 없음.
- [ ] **Step 3: 커밋** — `휴대폰 앱 로그인·오늘·현장 화면`

### Task 9: 앱 화면 — 보고, 상담

**Files:**
- Create: `app/manager-weve-7519/m/report-tab.tsx`, `app/manager-weve-7519/m/consultations-tab.tsx`

**Interfaces:**
- Consumes: `createProgressApi`, `shrinkAndUploadPhotos`, `uploadShrunkPhoto`, `photoFailureMessages`, `postResultMessages`, `photoProgressLabel`, `resizeImageFile`, `jpegFileName`, `todayInSeoul`, `POST /api/manager/mobile/consultation`, Task 8 `openReport`.

- [ ] **Step 1: 보고 구현** — 입력 두 개(촬영 `capture="environment"`, 앨범 `multiple`), 사진마다 빼기, "고객에게 보이는 내용" 한 칸, 버튼 두 개와 안내 문구. `designer`는 로그인한 직원 이름. 글이나 사진이 있으면 탭을 바꾸거나 닫기 전에 확인(`beforeunload` + 탭 전환 confirm). 업로드 실패 시 글과 사진은 그대로 두고 `photoFailureMessages`를 보여 준다. 성공하면 비우고 `reload`.
- [ ] **Step 2: 상담 구현** — 신규 / 진행(상담중·견적) / 끝남(계약·완료) 구분과 개수, 카드(전화 버튼은 번호 있을 때만), 카드를 누르면 상태 버튼과 메모 칸, 저장 후 목록의 그 카드만 바꾼다.
- [ ] **Step 3: 확인** — 휴대폰 크기에서: 테스트 현장에 사진 2장으로 [올리기만] → 현장 상세 최근 보고에 보임 → PC 진행 현황에도 보임. 테스트 상담 상태 변경 → PC 상담 탭에 반영. 사진 없이 글만, 글 없이 사진만도 저장되는지(서버 규칙과 같게).
- [ ] **Step 4: 커밋** — `휴대폰 앱 보고·상담 화면`

### Task 10: PC 관리자 '계정' 탭의 휴대폰 로그인 기기

**Files:**
- Create: `app/manager-weve-7519/mobile-devices-panel.tsx`
- Modify: `app/manager-weve-7519/page.tsx` (계정 탭, `activeTab === 'accounts' && currentUser?.role === 'admin'` 블록 맨 아래에 패널 하나)

**Interfaces:**
- Consumes: `GET`/`DELETE /api/manager/mobile/devices`, 페이지의 기존 인증 헤더 함수.
- Produces: `<MobileDevicesPanel authHeaders={...} />`

- [ ] **Step 1: 구현** — 표: 직원 이름(아이디), 기기, 로그인한 날, 마지막 사용, 만료일, [로그인 끊기](확인창: `이 기기는 늦어도 1시간 안에 로그아웃됩니다. 끊을까요?`). 휴대폰 앱 주소와 설치 방법 한 줄 안내.
- [ ] **Step 2: 확인** — Task 3의 기기가 목록에 보이고 끊으면 사라진다. `git diff --stat`으로 `page.tsx` 변경량 확인.
- [ ] **Step 3: 커밋** — `계정 탭에 휴대폰 로그인 기기 목록`

### Task 11: 문서와 전체 확인

**Files:**
- Modify: `docs/WEVE_WORKING_RULES.md` ("직원 휴대폰 웹앱" 절: 주소, 설치 방법, 30일 로그인과 끊기, 1시간 안 반영, 권한 표, 보고는 고객 기록만)

- [ ] **Step 1: 문서 쓰기.**
- [ ] **Step 2: 전체 확인** — `npm test` PASS, `npm run build` PASS, `node tests/manager-api-matrix.mjs`(개발 서버) 기존과 같음, 휴대폰 크기로 Task 8·9 흐름 한 번 더.
- [ ] **Step 3: 커밋** — `직원 휴대폰 웹앱 사용 규칙 문서`
