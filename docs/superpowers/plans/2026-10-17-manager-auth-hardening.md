# 매니저 인증 강화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 마스터 비밀번호 공유 방식을 개인별 서명 세션 토큰으로 바꾸고, 모든 매니저 API가 서버에서 역할과 탭 권한을 검사하게 한다.

**Architecture:** 화면과 서버가 함께 쓰는 권한 표(`app/lib/manager-permissions.ts`), 서버 전용 토큰·비밀번호 모듈(`_token.ts`, `_password.ts`), 이것들을 묶는 `requireManager`(`_session.ts`)를 만든다. 모든 라우트는 `requireManager`를 거친다. 두 매니저 화면은 공용 세션 저장 모듈(`app/lib/manager-session-storage.ts`)로 탭 세션을 읽고 쓴다.

**Tech Stack:** Next.js 16 App Router (route handlers), TypeScript, `node:crypto`, `node:test`(Node 24가 `.ts`를 직접 import), Sanity, Firebase Auth/Realtime Database REST, Firestore REST.

**Spec:** `docs/superpowers/specs/2026-10-17-manager-auth-hardening-design.md`

## Global Constraints

- 새 npm 패키지를 추가하지 않는다. Node 기본 모듈(`node:crypto`, `node:test`, `node:assert`)만 쓴다.
- 토큰 유효 시간 `28800`초(8시간). 키 파생 라벨 `weve-manager-session-v1`. 헤더 `Authorization: Bearer <token>`.
- scrypt 파라미터: N=`16384`, r=`8`, p=`1`, keylen=`64`, salt `16`바이트. 저장 형식 `scrypt$16384$8$1$<salt base64>$<hash base64>`.
- 탭 세션 키는 기존 `weve-manager-session-v2`를 그대로 쓴다.
- 오류 문구 (정확히 이대로):
  - 401: `로그인이 필요합니다. 다시 로그인해 주세요.`
  - 403: `권한이 없습니다.`
  - admin 전용 403: `총괄 관리자만 사용할 수 있습니다.`
  - 서명 키 없음 500: `세션 서명 키가 설정되지 않았습니다. MANAGER_SESSION_SECRET를 확인해 주세요.`
  - 화면 만료 안내: `로그인이 만료되었습니다. 다시 로그인해 주세요.`
- 마스터 비밀번호는 어떤 API 응답, `sessionStorage`, `localStorage`에도 나타나지 않는다.
- 줄바꿈이 섞인 파일(`app/api/manager/_utils.ts`, `app/api/manager/estimate/route.ts`, `app/api/manager/office/route.ts`, `app/manager-weve-7519/page.tsx`)은 수정 후 `node <scratchpad>/restore-eol.mjs <file>`로 바뀌지 않은 줄의 원래 줄바꿈을 되살린다. 확인 기준은 `git diff --stat`의 변경 줄 수가 실제 수정량과 비슷한 것이다.
- 작업은 이 worktree에서만 한다. 개발 서버 포트는 `3217`(3123은 다른 세션이 사용).
- `.env.local`에는 테스트 값만 넣는다(`.env*`는 gitignore 대상). 실제 비밀값은 쓰지 않는다.
- 커밋 메시지는 영어, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **배포 전에 저장된 세션**(`token`이 마스터 비밀번호이고 `expiresAt`이 없음)으로 F5 → 망가진 대시보드가 아니라 로그인 폼이 나와야 한다. (Task 6 단위 테스트 + 브라우저 단계)
2. **대시보드를 연 채 토큰 만료** → 30초 자동 갱신이 401을 받으면 오류를 반복하지 않고 만료 안내와 함께 로그인 폼으로 돌아가야 한다. (Task 6 브라우저 단계, 짧은 TTL 토큰)
3. **권한이 하나도 없는 직원**(프로필 없이 처음 로그인한 Firebase 사용자) → 로그인은 되고, "사용할 수 있는 메뉴 권한이 없습니다" 안내가 보이며, 403이 날 호출(카카오 동기화 등)을 하지 않아야 한다. (Task 6 브라우저 단계)
4. **Firebase `permissions`가 숫자 키 객체이거나 모르는 값이 섞인 경우** → 오류 없이 정규화돼야 한다. (Task 1 테스트)
5. **견적 화면을 새 탭에서 열기**(세션 없음) → 아이디 + 비밀번호 폼 → 로그인 후 정상 동작, `localStorage`에 비밀번호나 토큰이 남지 않아야 한다. (Task 7 브라우저 단계)

---

### Task 1: 권한 표 모듈

**Files:**
- Create: `app/lib/manager-permissions.ts`
- Create: `tests/manager-permissions.test.mjs`
- Modify: `package.json` (scripts에 `"test": "node --test \"tests/*.test.mjs\""` 추가)

**Interfaces:**
- Produces (Node 전용 코드 없음, 화면·서버 공용):
  ```ts
  export const MANAGER_PERMISSIONS: readonly ManagerPermission[];
  // 순서: dashboard, consultations, customers, sites, estimates, sales, inventory, vendors, portfolio, integrations, accounts
  export type ManagerPermission = 'dashboard' | 'consultations' | 'customers' | 'sites' | 'estimates' | 'sales'
    | 'inventory' | 'vendors' | 'portfolio' | 'integrations' | 'accounts';
  export type ManagerRole = 'admin' | 'staff';
  export type ManagerIdentity = { role: ManagerRole; permissions: readonly string[] };
  export type OfficeCollection = 'consultations' | 'customers' | 'sites' | 'estimates' | 'sales' | 'inventory'
    | 'vendors' | 'projects' | 'categories' | 'visitStats';
  export type OfficeRecordType = 'consultation' | 'customer' | 'site' | 'sale' | 'inventory' | 'vendor' | 'project' | 'category';
  export const OFFICE_READ_PERMISSIONS: Record<OfficeCollection, readonly ManagerPermission[]>;  // 스펙 3장 읽기 표
  export const OFFICE_WRITE_PERMISSIONS: Record<OfficeRecordType, readonly ManagerPermission[]>; // 스펙 3장 쓰기 표
  export function normalizePermissions(value: unknown): ManagerPermission[];       // 배열 또는 객체 값, 모르는 값 제거, 중복 제거, MANAGER_PERMISSIONS 순서
  export function effectivePermissions(role: ManagerRole, permissions: unknown): ManagerPermission[]; // admin → 전체, staff → normalize 후 'accounts' 제거
  export function hasAnyPermission(user: ManagerIdentity | null | undefined, required: readonly ManagerPermission[]): boolean;
  // user 없음 → false, admin → true, required 빈 배열 → true, 그 외 effectivePermissions와 교집합
  export function canReadOffice(user: ManagerIdentity, collection: OfficeCollection): boolean;
  export function canWriteOffice(user: ManagerIdentity, type: string): boolean;     // 모르는 type → false
  export function filterOfficeData<T extends Record<string, unknown>>(user: ManagerIdentity, data: T): T;
  // 읽을 수 없는 OfficeCollection 키: 배열이면 [], visitStats면 null. 그 외 키(storageWarning 등)는 그대로.
  ```

- [ ] **Step 1: 실패하는 테스트 작성** (`tests/manager-permissions.test.mjs`, `import ... from '../app/lib/manager-permissions.ts'`)

```js
const staff = (permissions) => ({ role: 'staff', permissions });
const admin = { role: 'admin', permissions: [] };

test('admin gets every permission', () => assert.deepEqual(effectivePermissions('admin', []), [...MANAGER_PERMISSIONS]));
test('staff drops unknown values and accounts', () =>
  assert.deepEqual(effectivePermissions('staff', ['sales', 'accounts', 'bogus', 'sales']), ['sales']));
test('normalize accepts RTDB object arrays', () => {
  assert.deepEqual(normalizePermissions({ 0: 'dashboard', 2: 'sales' }), ['dashboard', 'sales']);
  assert.deepEqual(normalizePermissions('dashboard'), []);
  assert.deepEqual(normalizePermissions(null), []);
});
test('read table follows tab dependencies', () => {
  assert.equal(canReadOffice(staff(['sales']), 'estimates'), true);
  assert.equal(canReadOffice(staff(['sales']), 'sites'), true);
  assert.equal(canReadOffice(staff(['sales']), 'customers'), false);
  assert.equal(canReadOffice(staff(['sites']), 'customers'), true);
  assert.equal(canReadOffice(staff(['consultations']), 'visitStats'), false);
});
test('write table', () => {
  assert.equal(canWriteOffice(staff(['customers']), 'site'), true);
  assert.equal(canWriteOffice(staff(['customers']), 'sale'), false);
  assert.equal(canWriteOffice(staff(['portfolio']), 'category'), true);
  assert.equal(canWriteOffice(staff(['consultations']), 'managerAccount'), false);
  assert.equal(canWriteOffice(admin, 'project'), true);
});
test('hasAnyPermission', () => {
  assert.equal(hasAnyPermission(staff([]), []), true);
  assert.equal(hasAnyPermission(staff(['accounts']), ['accounts']), false);
  assert.equal(hasAnyPermission(admin, ['accounts']), true);
  assert.equal(hasAnyPermission(null, []), false);
});
test('filterOfficeData empties unreadable collections only', () => {
  const data = { consultations: [1], customers: [2], sales: [3], visitStats: { todayCount: 1 }, storageWarning: 'w' };
  assert.deepEqual(filterOfficeData(staff(['dashboard', 'consultations']), data),
    { consultations: [1], customers: [], sales: [], visitStats: { todayCount: 1 }, storageWarning: 'w' });
  assert.equal(filterOfficeData(staff(['consultations']), data).visitStats, null);
  assert.deepEqual(filterOfficeData(admin, data), data);
});
```

- [ ] **Step 2: 실패 확인** — Run: `npm test` / Expected: FAIL (`Cannot find module ... manager-permissions.ts`)
- [ ] **Step 3: `app/lib/manager-permissions.ts` 구현** (위 Interfaces 그대로, 표 값은 스펙 3장)
- [ ] **Step 4: 통과 확인** — Run: `npm test` / Expected: 7 tests pass
- [ ] **Step 5: Commit** — `git add app/lib/manager-permissions.ts tests/manager-permissions.test.mjs package.json` / `Add shared manager permission table`

---

### Task 2: 세션 토큰과 비밀번호 모듈

**Files:**
- Create: `app/api/manager/_token.ts`, `app/api/manager/_password.ts`
- Create: `tests/manager-token.test.mjs`, `tests/manager-password.test.mjs`

**Interfaces:**
- Consumes: `ManagerPermission`, `ManagerRole` (Task 1, `import type`만 사용. Node가 타입 import를 지우므로 테스트에서 경로 문제가 없다)
- Produces:
  ```ts
  // _token.ts
  export type SessionSource = 'master' | 'account' | 'firebase';
  export type SessionPayload = { v: 1; sub: string; name: string; loginId: string; role: ManagerRole;
    perms: ManagerPermission[]; src: SessionSource; iat: number; exp: number };       // iat/exp 초 단위
  export const SESSION_TTL_SECONDS = 28800;
  export function resolveSessionKey(env?: Record<string, string | undefined>): Buffer | null; // 기본값 process.env
  export function signSessionToken(claims: Omit<SessionPayload, 'v' | 'iat' | 'exp'>, key: Buffer, nowMs?: number):
    { token: string; payload: SessionPayload };
  export function verifySessionToken(token: string, key: Buffer, nowMs?: number): SessionPayload | null;
  // _password.ts
  export function hashPassword(password: string): Promise<string>;
  export function isPasswordHash(stored: string): boolean;                          // 'scrypt$' 접두사 + 6조각
  export function verifyPassword(password: string, stored: string): Promise<{ ok: boolean; needsRehash: boolean }>;
  export function safeEqual(a: string, b: string): boolean;                         // 양쪽 sha256 후 timingSafeEqual
  ```
- 토큰 = `base64url(JSON payload)` + `.` + `base64url(HMAC-SHA256(key, payload 부분 문자열))`. 검증은 정확히 2조각, 서명 길이 확인 후 `timingSafeEqual`, JSON 파싱, `v === 1`, `role`이 admin/staff, `exp > floor(now/1000)`.
- `resolveSessionKey`: `MANAGER_SESSION_SECRET.trim()`이 있으면 그 UTF-8 바이트. 없으면 `SANITY_WRITE_TOKEN.trim()`을 키로 `weve-manager-session-v1`의 HMAC-SHA256(32바이트). 둘 다 없으면 `null`.
- `verifyPassword`: 해시면 저장된 파라미터로 scrypt 후 비교(`needsRehash: false`), 깨진 해시는 `ok: false`. 해시가 아니면 평문 저장값으로 보고 `stored !== '' && safeEqual(...)`, 맞으면 `needsRehash: true`.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/manager-token.test.mjs
const key = Buffer.from('test-key');
const claims = { sub: 'u1', name: '직원', loginId: 'staff1', role: 'staff', perms: ['consultations'], src: 'account' };
const now = Date.UTC(2026, 9, 17, 0, 0, 0);
test('round trip', () => {
  const { token, payload } = signSessionToken(claims, key, now);
  assert.equal(payload.exp - payload.iat, 28800);
  assert.deepEqual(verifySessionToken(token, key, now + 1000), payload);
});
test('rejects a payload edited to admin', () => {
  const { token } = signSessionToken(claims, key, now);
  const [, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(token.split('.')[0], 'base64url')), role: 'admin' })).toString('base64url');
  assert.equal(verifySessionToken(`${forged}.${sig}`, key, now), null);
});
test('rejects wrong key, expiry and garbage', () => {
  const { token } = signSessionToken(claims, key, now);
  assert.equal(verifySessionToken(token, Buffer.from('other'), now), null);
  assert.equal(verifySessionToken(token, key, now + 28801 * 1000), null);
  for (const bad of ['', 'abc', 'a.b.c', 'local-test-master-7519']) assert.equal(verifySessionToken(bad, key, now), null);
});
test('key resolution', () => {
  assert.deepEqual(resolveSessionKey({ MANAGER_SESSION_SECRET: ' s ' }), Buffer.from('s'));
  const derived = resolveSessionKey({ SANITY_WRITE_TOKEN: 't' });
  assert.equal(derived.length, 32);
  assert.equal(resolveSessionKey({}), null);
});
// tests/manager-password.test.mjs
test('hash format and salt', async () => {
  const a = await hashPassword('pw'); const b = await hashPassword('pw');
  assert.match(a, /^scrypt\$16384\$8\$1\$[^$]+\$[^$]+$/); assert.notEqual(a, b); assert.equal(isPasswordHash(a), true);
});
test('verify hash', async () => {
  const h = await hashPassword('pw');
  assert.deepEqual(await verifyPassword('pw', h), { ok: true, needsRehash: false });
  assert.equal((await verifyPassword('nope', h)).ok, false);
  assert.equal((await verifyPassword('pw', 'scrypt$broken')).ok, false);
});
test('legacy plaintext', async () => {
  assert.deepEqual(await verifyPassword('pw', 'pw'), { ok: true, needsRehash: true });
  assert.equal((await verifyPassword('pw', '')).ok, false);
  assert.equal((await verifyPassword('x', 'pw')).ok, false);
});
test('safeEqual', () => { assert.equal(safeEqual('a', 'a'), true); assert.equal(safeEqual('a', 'aa'), false); });
```

- [ ] **Step 2: 실패 확인** — Run: `npm test` / Expected: 새 파일 2개 FAIL (모듈 없음), Task 1 테스트는 PASS
- [ ] **Step 3: `_token.ts`, `_password.ts` 구현** (scrypt는 `util.promisify(scrypt)`에 `{ N, r, p }` 전달)
- [ ] **Step 4: 통과 확인** — Run: `npm test` / Expected: 전체 PASS
- [ ] **Step 5: Commit** — `Add signed manager session tokens and scrypt password hashing`

---

### Task 3: `requireManager`와 로그인 API (마스터·ID 계정)

**Files:**
- Create: `app/api/manager/_session.ts`
- Modify: `app/api/manager/auth/route.ts`
- Create: `tests/mint-manager-session.mjs` (검증용 도구, `npm test` 대상 아님)
- Local only: `.env.local` (`MANAGER_PASSWORD=local-test-master-7519`, `MANAGER_SESSION_SECRET=local-test-session-secret-0123456789abcdef`), `.claude/launch.json`(포트 3217, 커밋하지 않음)

**Interfaces:**
- Consumes: Task 1 `effectivePermissions`, `hasAnyPermission`; Task 2 `resolveSessionKey`, `signSessionToken`, `verifySessionToken`, `verifyPassword`, `hashPassword`, `safeEqual`
- Produces:
  ```ts
  export type ManagerSession = SessionPayload & { permissions: ManagerPermission[] };   // effectivePermissions 결과
  export type ManagerRule = { anyOf?: readonly ManagerPermission[]; admin?: boolean };
  export type SessionUser = { id: string; name: string; loginId: string; role: ManagerRole; permissions: ManagerPermission[] };
  export function requireManager(request: Request, rule?: ManagerRule):
    { session: ManagerSession; error: null } | { session: null; error: Response };
  export function issueManagerSession(user: { id: string; name: string; loginId: string; role: ManagerRole; permissions: unknown },
    src: SessionSource): { token: string; expiresAt: number; user: SessionUser } | null;   // expiresAt = exp * 1000 (ms), 키 없으면 null
  ```
- `requireManager` 순서: 키 없음 → 500 / `Authorization: Bearer` 없음 또는 검증 실패 → 401 / `rule.admin`인데 admin 아님 → 403(admin 전용 문구) / `rule.anyOf`를 만족 못 함 → 403. 응답은 `Response.json({ error }, { status })`. DB 조회 없음.
- 로그인 응답: `{ token, expiresAt, user, firebaseToken? }`.
- `tests/mint-manager-session.mjs <role> <perms,comma> [ttlSeconds]`: `MANAGER_SESSION_SECRET` 환경변수로 토큰을 만들어 `sessionStorage`에 넣을 JSON(`{ token, user, expiresAt, savedAt }`)을 출력한다. `ttlSeconds`가 있으면 `nowMs`를 조정해 남은 시간이 그만큼인 토큰을 만든다.

- [ ] **Step 1: 로컬 실행 준비** — worktree에 `node_modules`가 없으므로 `npm ci`(백그라운드). `.env.local`과 `.claude/launch.json` 작성.
- [ ] **Step 2: `_session.ts` 구현, 로그인 API 수정**
  - 마스터: `MANAGER_PASSWORD`가 있을 때만, `(loginId === 'admin' || loginId === 'manager') && safeEqual(loginPassword, managerPassword)` → `src: 'master'`, role admin.
  - ID 계정: `verifyPassword`. `needsRehash`이고 `SANITY_WRITE_TOKEN`이 있으면 `hashPassword` 결과로 `password`를 patch(실패는 `console.warn`만). `src: 'account'`.
  - Firebase 경로: 이 Task에서는 `token: managerPassword`만 `issueManagerSession(..., 'firebase')`로 바꾼다(나머지는 Task 5).
  - `MANAGER_PASSWORD`가 없을 때 전체 로그인을 500으로 막던 검사는 없애고, 마스터 경로만 건너뛴다.
- [ ] **Step 3: 로그인 확인** — 개발 서버 시작 후:
  - `curl -s -X POST localhost:3217/api/manager/auth -H "Content-Type: application/json" -d '{"loginId":"admin","password":"local-test-master-7519"}'` → 200. `token`은 `.`로 나뉜 2조각이고, 응답 어디에도 `local-test-master-7519`가 없다.
  - 틀린 비밀번호 → 401
- [ ] **Step 4: Commit** — `.env.local`, `.claude/launch.json`은 제외. `Issue signed per-user sessions from the manager login API`

---

### Task 4: 모든 매니저 API에 권한 검사 적용

**Files:**
- Modify: `app/api/manager/_utils.ts` (`assertManager` 삭제, 아래 헬퍼 추가)
- Modify: `app/api/manager/{office,estimate,settings,settings-image,bulk-upload,project-main-image,migrate-firestore,accounts}/route.ts`
- Modify: `app/api/integrations/aligo-alimtalk/send/route.ts`, `app/api/integrations/kakao-bizform/sync/route.ts`
- Create: `tests/manager-api-matrix.mjs` (실행 중인 서버 대상 검증 도구, `npm test` 대상 아님)

**Interfaces:**
- Consumes: Task 3 `requireManager`; Task 1 `canWriteOffice`, `filterOfficeData`
- Produces (`_utils.ts`):
  ```ts
  export async function checkSanityDocumentType(id: string, expectedType: string): Promise<'ok' | 'missing' | 'mismatch'>;
  // '*[_id == $id][0]{_type}' 조회만 한다 (쓰기 토큰 불필요)
  ```
- 라우트별 규칙은 스펙 3장 표 그대로. `accounts`, `migrate-firestore`는 `{ admin: true }`. `accounts`의 기존 `assertAccountAdmin` 내부는 Task 5에서 정리하고, 이 Task에서는 맨 앞 `assertManager`만 `requireManager(request, { admin: true })`로 바꾼다.
- office:
  - GET은 응답 세 곳(Firestore 성공, Firestore 실패 후 Sanity, Sanity)을 모두 `filterOfficeData(session, payload)`로 감싼다.
  - POST는 `typeMap` 확인 직후 `canWriteOffice`를 검사해 403.
  - DELETE는 `type`이 `typeMap` 키가 아니면 400 `삭제할 항목 유형이 올바르지 않습니다.`, 이어서 `canWriteOffice` 검사. Sanity 경로는 **쓰기 토큰 확인보다 먼저** `checkSanityDocumentType(id, typeMap[type])`를 호출해 `missing` → 404 `삭제할 항목을 찾을 수 없습니다.`, `mismatch` → 400(같은 유형 문구).
- estimate: GET/POST 모두 `{ anyOf: ['estimates'] }`. Sanity 경로 삭제는 `deleteEstimate` → `siteEstimate`, `deleteMaterial` → `estimateMaterial`인지 같은 헬퍼로 확인한다.
- 이 Task가 끝나면 `grep -rn "assertManager\|x-manager-password" app/api`의 결과가 없어야 한다.

- [ ] **Step 1: 검증 도구 작성** — `tests/manager-api-matrix.mjs <baseUrl>`. `MANAGER_SESSION_SECRET`로 토큰을 만들고(`signSessionToken` import), 아래 표의 각 요청 결과를 PASS/FAIL로 출력한다. 하나라도 FAIL이면 exit 1.
  - 토큰 종류: `admin`, `none`(staff, []), `consult`(staff, dashboard·consultations), `estimates`, `sales`, `portfolio`
  - 위조 토큰: consult 토큰의 payload를 role admin으로 바꾸고 서명은 그대로
  - 만료 토큰: `nowMs`를 9시간 전으로

  | 요청 | 토큰 | 기대 |
  |---|---|---|
  | GET /api/manager/office | 없음 / 위조 / 만료 | 401 |
  | GET /api/manager/office | admin | 200, `customers.length ≥ 1` (공개 데이터셋에 1건) |
  | GET /api/manager/office | consult | 200, `consultations.length ≥ 1`, `customers`·`sites`·`estimates`·`sales`·`projects`가 [] |
  | GET /api/manager/office | sales | 200, `estimates.length ≥ 1`, `customers` [] |
  | GET /api/manager/estimate | consult / estimates / admin | 403 / 200 / 200 |
  | POST /api/manager/office `{type:'sale',data:{}}` | consult / sales | 403 / 401·403이 아님 |
  | DELETE /api/manager/office `{id:'siteSettings',type:'consultation'}` | admin | 400 |
  | DELETE /api/manager/office `{id:'x',type:'managerAccount'}` | admin | 400 |
  | GET / PATCH /api/manager/settings | none / consult / portfolio | 200 / 403 / 401·403이 아님 |
  | GET /api/manager/accounts | consult / admin | 403 / 200 |
  | POST /api/manager/migrate-firestore | consult | 403 |
  | POST /api/manager/bulk-upload, /settings-image, /project-main-image | consult | 403 |
  | POST /api/integrations/aligo-alimtalk/send | consult | 403 |
  | POST /api/integrations/kakao-bizform/sync | none / consult | 403 / 200 |
  | POST /api/manager/auth (테스트 마스터 / 틀린 값) | – | 200이고 응답에 비밀번호 없음 / 401 |

- [ ] **Step 2: 실패 확인** — Run: `MANAGER_SESSION_SECRET=... node tests/manager-api-matrix.mjs http://localhost:3217` / Expected: 권한 관련 행 다수 FAIL (아직 예전 `assertManager`)
- [ ] **Step 3: 라우트 수정** (위 규칙). 줄바꿈이 섞인 파일은 `restore-eol.mjs` 실행.
- [ ] **Step 4: 통과 확인** — 같은 명령 / Expected: 전체 PASS. `grep` 결과 없음. `npm test` PASS.
- [ ] **Step 5: Commit** — `Enforce manager roles and tab permissions in every manager API`

---

### Task 5: Firebase 계정 관리, 규칙, Firebase 로그인

**Files:**
- Modify: `app/api/manager/firestore.ts` (`googleAccessToken`에 scope 인자 추가, export)
- Modify: `app/api/manager/firebase.ts`
- Modify: `app/api/manager/accounts/route.ts`, `app/api/manager/auth/route.ts` (Firebase 경로)
- Modify: `firebase-database.rules.json`

**Interfaces:**
- Consumes: Task 1 `normalizePermissions`, `effectivePermissions`, `MANAGER_PERMISSIONS`; Task 2 `hashPassword`; Task 3 `issueManagerSession`, `requireManager`; Task 4 `checkSanityDocumentType`
- Produces:
  ```ts
  // firestore.ts
  export async function googleAccessToken(scope?: string): Promise<string>;  // 기본 datastore scope, 서비스 계정 없으면 '', scope별 캐시
  // firebase.ts
  export type FirebaseDbAuth = { idToken: string } | { accessToken: string };
  export async function firebaseAdminDbAuth(adminIdToken?: string): Promise<FirebaseDbAuth | null>;
  // 서비스 계정 토큰(scope 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email')
  // → 없으면 { idToken: adminIdToken } → 둘 다 없으면 null
  getFirebaseProfile(uid: string, auth: FirebaseDbAuth)
  getFirebaseAdminFlag(uid: string, auth: FirebaseDbAuth)
  getFirebaseAccounts(auth: FirebaseDbAuth)
  setFirebaseProfile(uid: string, auth: FirebaseDbAuth, profile: Omit<FirebaseProfile, 'uid'>)
  // 쿼리 파라미터: idToken → auth=…, accessToken → access_token=…
  ```
- accounts 라우트:
  - `assertAccountAdmin`과 라우트 안의 `normalizePermissions`를 지우고 `requireManager(request, { admin: true })` + Task 1 함수를 쓴다.
  - Firebase 모드 판단은 `isFirebaseManagerConfigured()` 하나로 통일한다. `firebaseAdminDbAuth(x-firebase-token)`가 null이면 400 `Firebase 계정 관리에는 서비스 계정 설정이 필요합니다.`
  - 새 계정: `firebaseSignUp` 후 프로필은 `dbAuth`로 쓴다. 새 사용자의 `idToken`으로 쓰지 않는다.
  - Sanity 모드: `password`는 `hashPassword` 결과만 저장하고, 삭제 전 `checkSanityDocumentType(id, 'managerAccount')`로 유형을 확인한다.
- 로그인 Firebase 경로:
  - 프로필, `launcher_admins`는 사용자 본인 토큰으로 읽는다.
  - 프로필이 없으면 `{ name, email, createdAt, updatedAt }`만 쓴다(`firebaseAdminDbAuth()` 우선, 없으면 본인 토큰). 역할 staff, 권한 [].
  - `firebaseToken`은 `!isFirestoreServiceAccountConfigured()`일 때만 응답에 넣는다.
- `firebase-database.rules.json` 전체 내용:

```json
{
  "rules": {
    "launcher_admins": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": false
      }
    },
    "users": {
      ".read": "auth != null && (root.child('launcher_admins').child(auth.uid).val() === true || root.child('users').child(auth.uid).child('role').val() === 'admin')",
      "$uid": {
        ".read": "auth != null && (auth.uid === $uid || root.child('launcher_admins').child(auth.uid).val() === true || root.child('users').child(auth.uid).child('role').val() === 'admin')",
        ".write": "auth != null && (root.child('launcher_admins').child(auth.uid).val() === true || root.child('users').child(auth.uid).child('role').val() === 'admin')",
        "name": { ".write": "auth != null && auth.uid === $uid" },
        "email": { ".write": "auth != null && auth.uid === $uid" },
        "updatedAt": { ".write": "auth != null && auth.uid === $uid" },
        "createdAt": { ".write": "auth != null && auth.uid === $uid && !data.exists()" }
      }
    }
  }
}
```

- [ ] **Step 1: 수정 구현** (위 내용)
- [ ] **Step 2: 정적 확인**
  - `node -e "JSON.parse(require('fs').readFileSync('firebase-database.rules.json','utf8'))"` → 오류 없음
  - `grep -rn "createdUser.idToken\|firebaseUser.idToken, profile\|assertAccountAdmin" app/api` → 결과 없음
- [ ] **Step 3: 회귀 확인** — `npm test`와 API 매트릭스 전체 PASS (로컬은 Firebase 미설정이라 Sanity 경로)
- [ ] **Step 4: Commit** — `Manage Firebase accounts with server admin access and lock roles in RTDB rules`

---

### Task 6: 매니저 화면 (세션 저장, 헤더, 권한 표시)

**Files:**
- Create: `app/lib/manager-session-storage.ts`, `tests/manager-session-storage.test.mjs`
- Modify: `app/manager-weve-7519/page.tsx`

**Interfaces:**
- Consumes: Task 1 `effectivePermissions`, `hasAnyPermission`, `ManagerPermission`, `ManagerRole`; 로그인 응답 `{ token, expiresAt, user, firebaseToken? }`
- Produces (`manager-session-storage.ts`, 화면 전용):
  ```ts
  export const MANAGER_SESSION_STORAGE_KEY = 'weve-manager-session-v2';
  export type StoredManagerUser = { id: string; name: string; loginId: string; role: ManagerRole; permissions: ManagerPermission[] };
  export type StoredManagerSession = { token: string; firebaseToken: string; user: StoredManagerUser; expiresAt: number; savedAt: number };
  export function parseStoredSession(raw: string | null, nowMs: number): StoredManagerSession | null;
  // JSON 오류, token에 '.'이 정확히 1개가 아님, user 없음, expiresAt 없음·지남 → null
  export function readStoredSession(): StoredManagerSession | null;   // 실패하면 저장값도 지운다
  export function saveStoredSession(result: { token: string; expiresAt: number; user: StoredManagerUser; firebaseToken?: string }): StoredManagerSession;
  export function clearStoredSession(): void;   // sessionStorage 키 + 예전 localStorage 'weve-manager-session', 'weve-manager-password' 삭제
  ```
- `page.tsx`:
  - `password` 상태와 `managerPassword` 인자 이름은 diff를 작게 하려고 그대로 둔다. 선언부에 "서명된 세션 토큰을 담는다"는 주석 한 줄을 단다.
  - `authHeaders`는 `Authorization: Bearer`와(있을 때만) `x-firebase-token`을 보낸다. `x-manager-user`는 없앤다. `loadAccounts`도 `authHeaders`를 쓴다.
  - 복원·로그인·로그아웃은 위 모듈을 쓴다. `loadOfficeData`와 `refreshOfficeData`가 401을 받으면 `clearStoredSession()` 후 로그아웃 상태로 돌리고 만료 안내를 보여준다.
  - `visibleTabs`는 staff일 때 `effectivePermissions('staff', currentUser.permissions)` 기준으로 거른다.
  - `syncKakaoBizForm`은 `hasAnyPermission(user, ['consultations'])`일 때만 호출한다. 로그인·복원 직후에는 상태가 아직 바뀌지 않았으므로 사용자를 인자로 넘긴다. `loadAccounts`는 admin일 때만 호출한다.
  - `DashboardOverview`에 `access: { sales: boolean; estimates: boolean; estimateWorkspace: boolean; alimtalk: boolean }` prop을 추가한다. 값은 각각 `['sales']`, `['estimates','sales']`, `['estimates']`, `['customers']`에 대한 `hasAnyPermission`이다.
    - 숨기는 것: 등록 매출 SummaryMetric과 현장 MiniMetric(`!sales`), 견적 예상 SummaryMetric과 최신 견적·실행 원가 MiniMetric(`!estimates`), 견적 작업 버튼(`!estimateWorkspace`), 매출 등록 버튼(`!sales`), 알림톡 버튼(`!alimtalk`)
  - `visibleTabs`가 비어 있으면 탭 내용 자리에 `이 계정에는 사용할 수 있는 메뉴 권한이 없습니다. 총괄 관리자에게 권한을 요청해 주세요.`를 보여준다.

- [ ] **Step 1: 실패하는 테스트 작성** (`parseStoredSession`)

```js
const now = Date.UTC(2026, 9, 17);
const user = { id: 'admin', name: '총괄 관리자', loginId: 'admin', role: 'admin', permissions: [] };
test('valid session', () => {
  const s = { token: 'p.s', firebaseToken: '', user, expiresAt: now + 1000, savedAt: now };
  assert.deepEqual(parseStoredSession(JSON.stringify(s), now), s);
});
test('legacy session with master password token is rejected', () =>
  assert.equal(parseStoredSession(JSON.stringify({ token: 'local-test-master-7519', user, savedAt: now }), now), null));
test('expired, malformed, empty', () => {
  assert.equal(parseStoredSession(JSON.stringify({ token: 'p.s', user, expiresAt: now - 1, savedAt: now }), now), null);
  assert.equal(parseStoredSession('{', now), null);
  assert.equal(parseStoredSession(null, now), null);
});
```

- [ ] **Step 2: 실패 확인** — `npm test` / Expected: 새 파일 FAIL
- [ ] **Step 3: 모듈과 화면 수정** (`page.tsx`는 수정 후 `restore-eol.mjs`)
- [ ] **Step 4: 단위 테스트 통과** — `npm test` / Expected: 전체 PASS
- [ ] **Step 5: 브라우저 확인** (내장 브라우저, `http://localhost:3217/manager-weve-7519`)
  - admin: 테스트 마스터 비밀번호로 로그인 → 매출·견적 카드가 보인다. `sessionStorage` 값에 테스트 마스터 비밀번호 문자열이 없다. F5 → 로딩 화면 → 대시보드.
  - consult 직원: `node tests/mint-manager-session.mjs staff dashboard,consultations` 출력을 `sessionStorage`에 넣고 F5 → 탭은 업무 현황·상담 요청만, 매출·견적 카드와 견적 작업·매출 등록·알림톡 버튼이 없다.
  - 권한 없는 직원(`staff ""`) → 안내 문구가 보이고, 네트워크에 kakao-bizform 요청이 없다.
  - 예전 세션(`{"token":"local-test-master-7519","user":{...},"savedAt":<now>}`) → 로그인 폼
  - TTL 40초 토큰 → 대시보드가 열리고, 만료 뒤 30초 갱신에서 만료 안내와 함께 로그인 폼으로 돌아간다.
- [ ] **Step 6: Commit** — `Use signed sessions and server permissions in the manager dashboard`

---

### Task 7: 견적 작업 화면과 작업 규칙 문서

**Files:**
- Modify: `app/manager-weve-7519/estimate/page.tsx`
- Modify: `docs/WEVE_WORKING_RULES.md`

**Interfaces:**
- Consumes: Task 6 `readStoredSession`, `saveStoredSession`, `clearStoredSession`; Task 1 `hasAnyPermission`
- 화면 상태: 로딩 / 로그인 폼 / 권한 없음 / 작업 화면
  - 마운트: `localStorage.removeItem('weve-manager-password')`. `readStoredSession()` 결과가 없으면 로그인 폼, `estimates` 권한이 없으면 권한 없음 화면(API 호출 없음), 그 외에는 `loadData`.
  - 로그인 폼: 아이디 + 비밀번호. `/api/manager/auth`로 로그인하고 `saveStoredSession`으로 저장한 뒤, 권한을 확인하고 `loadData`를 부른다.
  - `loadData`: `localStorage` 저장을 없앤다. 401이면 `clearStoredSession()` 후 만료 안내와 함께 로그인 폼, 403이면 권한 없음 화면.
  - 권한 없음 화면: 제목 `견적 작업 권한이 없습니다`, 안내 `총괄 관리자에게 '견적 작업' 권한을 요청해 주세요.`, `/manager-weve-7519` 링크 `매니저로 돌아가기`. 스타일은 기존 로그인 카드와 같게 한다.
  - `authHeaders`는 `Authorization: Bearer`를 보낸다. `MANAGER_PASSWORD_STORAGE_KEY`와 `MANAGER_SESSION_STORAGE_KEY` 로컬 상수는 삭제한다.
- `WEVE_WORKING_RULES.md` Manager Authentication 섹션에 추가할 규칙:
  - 매니저 API는 개인별 서명 세션 토큰(`Authorization: Bearer`)으로만 인증한다. 마스터 비밀번호는 서버를 떠나지 않는다.
  - 권한 표는 `app/lib/manager-permissions.ts`에 있다. 모든 매니저 API 라우트는 `requireManager`(`app/api/manager/_session.ts`)를 호출해야 한다.
  - Vercel에 `MANAGER_SESSION_SECRET`(무작위 32바이트 이상)를 설정한다. 이 값을 바꾸면 전원이 로그아웃된다.
  - `firebase-database.rules.json`은 서버 관리자 접근을 쓰는 코드가 배포된 뒤에 반영한다.

- [ ] **Step 1: 수정 구현**
- [ ] **Step 2: 브라우저 확인** (`http://localhost:3217/manager-weve-7519/estimate`)
  - 새 탭(세션 없음) → 아이디 + 비밀번호 폼 → admin 테스트 계정으로 로그인 → 작업 화면. `localStorage`에 `weve-manager-password`가 없다.
  - 매니저 대시보드에서 견적 작업으로 이동 → 다시 로그인하지 않고 열린다. F5 → 로딩 화면 → 작업 화면.
  - consult 직원 세션 → 권한 없음 화면, `/api/manager/estimate` 요청 없음.
  - estimates 직원 세션 → 작업 화면이 열리고 원가·마진이 보인다.
  - 미리 `localStorage`에 `weve-manager-password`를 넣고 열기 → 값이 지워지고 자동 로그인되지 않는다.
- [ ] **Step 3: Commit** — `Remove the stored master password from the estimate workspace`

---

### Task 8: 전체 검증과 PR

- [ ] **Step 1:** `npm test` → 전체 PASS
- [ ] **Step 2:** `node tests/manager-api-matrix.mjs http://localhost:3217` → 전체 PASS
- [ ] **Step 3:** `npm run build` → 성공
- [ ] **Step 4:** `git diff --stat main...HEAD` 확인. 줄바꿈이 섞인 4개 파일의 변경 줄 수가 실제 수정량 수준인지 본다.
- [ ] **Step 5:** 저장소 전체 확인: `grep -rn "x-manager-password\|weve-manager-password\|MANAGER_PASSWORD" app` → `auth/route.ts`의 서버 비교와 `clearStoredSession`의 예전 키 삭제만 남는다.
- [ ] **Step 6:** 새 리뷰 에이전트가 브랜치 전체를 보안 관점에서 리뷰하고, 지적 사항을 반영한다. 반영 후 Step 1~3을 다시 실행한다.
- [ ] **Step 7:** push 후 PR 생성. 본문은 한국어로 쓰고, 스펙 8장의 배포 순서와 대표님이 실제 직원 계정으로 확인할 체크리스트를 넣는다.
