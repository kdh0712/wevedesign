# 직원 가입 링크와 총괄 승인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 총괄이 1인 1링크를 만들어 보내면, 직원이 이름·휴대폰·아이디·비밀번호로 가입을 요청하고, 총괄이 역할·권한을 골라 승인하면 Firestore 아이디 계정이 생겨 PC·휴대폰 앱에서 로그인한다.

**Architecture:** 입력·링크·보관 규칙은 순수 모듈(`app/lib/staff-signup-rules.ts`), 요청 제출과 승인·거절의 순서(경합 처리 포함)는 저장소를 주입받는 모듈(`app/api/manager/_signup-flow.ts`)에 두고 Node 테스트로 고정한다. Firestore 읽기·쓰기는 서비스 계정으로만(`_staff-accounts.ts`). 로그인·세션은 새 출처 `firestore`를 더한다. 공개 API(`/api/staff-signup`)는 세션 없이, 총괄 API(`/api/manager/signup`)는 `requireManager({ admin: true })`.

**Tech Stack:** Next.js App Router(TypeScript), Firestore REST(서비스 계정), Sanity(옛 아이디 계정 중복 확인), scrypt(`_password.ts`), `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-21-staff-signup-approval-design.md` (반드시 함께 읽는다)

## Global Constraints

- 작업 규칙 `docs/WEVE_WORKING_RULES.md` 'Manager Authentication': 모든 manager API는 `requireManager`, 계정 관리는 총괄만, 비밀번호는 scrypt 해시로만, 권한 표는 `app/lib/manager-permissions.ts` 하나.
- 비밀번호 원문은 저장·로그·응답 어디에도 남기지 않는다. 가입 요청 순간 해시한다.
- 아이디: 앞뒤 공백 제거 후 소문자, `^[a-z0-9._-]{4,20}$`, `admin`·`manager` 불가. 비밀번호: 앞뒤 공백 제거 후 8~72자(로그인도 자름).
- 링크 토큰 32바이트 무작위(base64url), 저장은 SHA-256 hex만. 링크 주소는 `{요청 origin}/manager-weve-7519/join#{토큰}`(토큰은 `#` 뒤).
- 유효기간 1·3·7일(기본 7). 승인되지 않은 요청은 30일 뒤 삭제(목록을 읽을 때). 계정을 끌 때 휴대폰 번호 삭제.
- 가입 화면 안내 문구(그대로): `이름·휴대폰은 직원 계정 확인과 업무 연락에만 씁니다.` / `승인되지 않은 요청은 30일 뒤 지워집니다.`
- 쓸 수 없는 링크 문구(그대로, 이유 구분 없음): `쓸 수 없는 링크입니다. 총괄 관리자에게 새 링크를 받아 주세요.`
- 새 컬렉션 `managerSignupLinks`, `managerSignupRequests`, `managerAccounts`는 서버 서비스 계정만(규칙 문서에 '클라이언트 접근 금지' 명시). 서비스 계정이 없으면 기능 503.
- 화면 색은 관리 화면 설계 체계(주요 `#273541`, 보조 흰 바탕 테두리, 보조 글씨 `#60717d`). 새 글씨에 `#38a9bd`·흐린 회색 금지.
- `page.tsx`와 `app/api/manager/office/route.ts`, `tests/manager-api-matrix.mjs`는 CRLF·LF가 섞여 있다: 고친 뒤 기준 원본 + 줄 끝 무시 diff로 다시 만든다. 다른 파일은 기본 `git add`.
- 커밋 메시지 한국어, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **같은 링크로 두 번 동시에 요청**: 하나만 요청이 되고 다른 하나는 '쓸 수 없는 링크'. → Task 2 flow 테스트(링크 소진이 버전 조건으로 한 번만 성공).
2. **요청 저장 실패**: 링크는 다시 열려 같은 링크로 재시도할 수 있다. → Task 2 flow 테스트.
3. **승인과 거절이 동시에**: 한쪽만 처리되고, 거절된 요청으로 계정이 생기지 않는다. → Task 2 flow 테스트(승인은 요청을 먼저 '승인 중'으로 잡고, 거절은 같은 버전일 때만 지움).
4. **같은 아이디 두 요청을 차례로 승인**: 두 번째는 409 `이미 같은 아이디 계정이 있습니다.`이고 요청은 그대로 남는다. → Task 2 flow 테스트.
5. **꺼진 계정·없는 계정으로 로그인, 서비스 계정 없음**: 꺼진 계정은 '계정 또는 비밀번호가 올바르지 않습니다', 서비스 계정이 없으면 Firestore 조회를 건너뛰고(로그인), 휴대폰 갱신은 장애로 본다(로그아웃 아님). → Task 3 테스트(`reloadSourceOutage`), 단계에 명시.

---

## File Structure

| 파일 | 역할 |
|---|---|
| `app/lib/staff-signup-rules.ts` (새) | 순수: 아이디·비밀번호·이름·휴대폰 검사, 링크 기간·사용 가능 여부, 요청 보관 기간, 빠른 선택 묶음, 승인 입력 검사, 링크 주소 |
| `tests/staff-signup-rules.test.mjs` (새) | 위 |
| `app/api/manager/_signup-flow.ts` (새) | 저장소 주입: `submitSignup`, `approveSignup`, `rejectSignup` (순서·경합) |
| `tests/signup-flow.test.mjs` (새) | 가짜 저장소로 위 흐름 |
| `app/api/manager/_staff-accounts.ts` (새) | Firestore 저장소(서비스 계정): 링크·요청·아이디 계정 읽기·쓰기, 문서 id·토큰 해시 |
| `app/api/manager/firestore.ts` | `deleteFirestoreDocument`에 버전 조건 옵션 |
| `app/api/manager/_token.ts`, `_login-rules.ts`, `_login.ts`, `_mobile-device-rules.ts`, `_push.ts` | 출처 `firestore` |
| `tests/manager-login-rules.test.mjs` | `reloadSourceOutage('firestore', …)` |
| `app/api/manager/signup/route.ts` (새) | 총괄 API |
| `app/api/staff-signup/route.ts` (새) | 공개 API |
| `app/api/manager/accounts/route.ts` | 아이디 계정 목록·수정·직접 만들기·끄기 |
| `app/manager-weve-7519/signup-panel.tsx` (새) | 가입 요청 카드, 가입 링크 |
| `app/manager-weve-7519/join/page.tsx` (새) | 가입 페이지 |
| `app/manager-weve-7519/page.tsx` | 계정 탭에 패널, 계정 꼬리표·휴대폰, 사이드바 배지 |
| `next.config.ts`, `tests/next-config.test.mjs` | `/manager-weve-7519/join` no-referrer |
| `app/lib/analytics-scrub.ts`, `app/lib/site-analytics.tsx`, `tests/analytics-scrub.test.mjs` | 가입 주소의 `#` 토큰을 분석 도구로 보내지 않음 |
| `tests/manager-api-matrix.mjs` | 새 경로 권한 |
| `docs/WEVE_WORKING_RULES.md` | 스펙 8절 |

---

### Task 1: 순수 규칙

**Files:** Create `app/lib/staff-signup-rules.ts`, `tests/staff-signup-rules.test.mjs`

**Interfaces (Produces):** (import는 `./alert-phones.ts`의 `normalizeKoreanMobile`, `./manager-permissions.ts`의 `MANAGER_PERMISSIONS`·`normalizePermissions`만. 둘 다 import 없는 순수 모듈이라 Node 테스트에서 그대로 불러진다. 권한 표를 복사하지 않는다: 작업 규칙 '권한 표는 하나')
```ts
export const RESERVED_LOGIN_IDS: readonly string[];            // ['admin', 'manager']
export const LINK_DAYS: readonly number[];                     // [1, 3, 7]
export const DEFAULT_LINK_DAYS = 7;
export const REQUEST_RETENTION_DAYS = 30;
export const UNUSABLE_LINK_MESSAGE = '쓸 수 없는 링크입니다. 총괄 관리자에게 새 링크를 받아 주세요.';
export const LOGIN_ID_TAKEN_MESSAGE = '이미 사용 중인 아이디입니다.';
export function normalizeLoginId(raw: unknown): string;
export function loginIdError(loginId: string): string | null;  // normalize된 값 기준
export function passwordError(password: string): string | null; // trim 후 8~72
export type SignupInput = { name: string; phone: string; loginId: string; password: string };
export function validateSignupInput(raw: Record<string, unknown>): { ok: true; value: SignupInput } | { ok: false; error: string };
export type SignupLinkState = { status?: unknown; expiresAt?: unknown };
export function isLinkUsable(link: SignupLinkState | null, nowMs: number): boolean;   // status 'open' && expiresAt > now
export function linkExpiresAt(days: unknown, nowMs: number): string | null;            // LINK_DAYS 밖이면 null
export function isRequestExpired(request: { createdAt?: unknown }, nowMs: number): boolean; // 30일 = 30*86400000ms 이상
export const PERMISSION_PRESETS: ReadonlyArray<{ key: string; label: string; permissions: readonly string[] }>;
export function approvalError(decision: { role: unknown; permissions: unknown }): string | null;
export function signupLinkUrl(origin: string, token: string): string;
// 아이디 계정 수정 필드: 끌 때(isActive false)는 phone을 ''로. 켜 있으면 받은 phone(정규화, 빈칸 허용).
export function idAccountUpdate(input: { name: string; phone: string; role: 'admin' | 'staff'; permissions: unknown; isActive: boolean }): { ok: true; fields: { name: string; phone: string; role: 'admin' | 'staff'; permissions: string[]; isActive: boolean } } | { ok: false; error: string };
```

- [ ] **Step 1: Failing tests**
  - `normalizeLoginId('  Park01 ')` → `'park01'`; 숫자·비문자 → `''`.
  - `loginIdError`: `'park01'`·`'a.b-c_d'` → null; `'abc'`(3자)·21자 → `'아이디는 영문 소문자·숫자와 . _ - 로 4~20자입니다.'`; `'park@x.kr'` → 같은 문구; `'admin'`·`'manager'` → `'쓸 수 없는 아이디입니다.'`.
  - `passwordError`: `'1234567'` → `'비밀번호는 8자 이상 72자 이하로 입력해 주세요.'`; `'  12345678  '` → null; 73자 → 같은 문구.
  - `validateSignupInput({ name: ' 박영희 ', phone: '+82 10-1234-5678', loginId: ' Park01 ', password: ' pass1234 ' })` → `{ name: '박영희', phone: '01012345678', loginId: 'park01', password: 'pass1234' }`. 이름 빈칸 → `'이름을 입력해 주세요.'`, 31자 → `'이름은 30자까지 입력할 수 있습니다.'`, 휴대폰 `'02-381-0489'` → `'휴대폰 번호를 확인해 주세요.'`.
  - `isLinkUsable`: open+미래 → true; used·revoked·만료·null → false.
  - `linkExpiresAt(7, Date.parse('2026-11-21T00:00:00Z'))` → `'2026-11-28T00:00:00.000Z'`; `2` → null; `'7'` → null(숫자만).
  - `isRequestExpired`: 29일 23시간 → false, 30일 → true, createdAt 없음 → true.
  - `PERMISSION_PRESETS`: 현장팀 `['dashboard','sites']`, 견적·디자인 `['dashboard','customers','sites','estimates']`, 사무 `['dashboard','consultations','customers','sites','sales']`.
  - `approvalError`: `{role:'admin', permissions:[]}` → null; `{role:'staff', permissions:['sites']}` → null; `{role:'staff', permissions:[]}` → `'권한을 하나 이상 고르거나 총괄 관리자로 승인해 주세요.'`; `{role:'boss'}` → `'역할을 골라 주세요.'`; 모르는 권한만 있으면 0개로 봄(같은 문구).
  - `signupLinkUrl('https://www.wevedesign.co.kr/', 'abc')` → `'https://www.wevedesign.co.kr/manager-weve-7519/join#abc'`.
  - `idAccountUpdate({ name:'박영희', phone:'010-1234-5678', role:'staff', permissions:['sites'], isActive:false })` → `fields.phone === ''`, `isActive:false`; 켜 있으면 `'01012345678'`; 켜 있고 phone 빈칸 → `''`(허용); 켜 있고 `'02-381-0489'` → `'휴대폰 번호를 확인해 주세요.'`; 이름 빈칸 → `'이름을 입력해 주세요.'`; `role:'admin'`이면 permissions는 `normalizePermissions` 결과 그대로(총괄 전부는 세션에서 `effectivePermissions`가 처리).
- [ ] **Step 2:** FAIL 확인. **Step 3:** 구현(승인 권한은 `normalizePermissions`로 거른 뒤 `accounts`를 뺀다: 승인으로 계정 관리 권한은 줄 수 없음). **Step 4:** PASS, `npm test`.
- [ ] **Step 5: Commit** `"직원 가입 1: 입력·링크·보관 규칙"` (설계 문서·이 계획 포함)

---

### Task 2: 흐름(저장소 주입)과 Firestore 저장소

**Files:** Create `app/api/manager/_signup-flow.ts`, `tests/signup-flow.test.mjs`, `app/api/manager/_staff-accounts.ts`; Modify `app/api/manager/firestore.ts`

**Interfaces:**
```ts
// _signup-flow.ts (imports: '../../lib/staff-signup-rules.ts' only)
export type Versioned<T> = { record: T; updateTime: string };
export type LinkRecord = { _id: string; status: string; expiresAt: string; memo?: string };
export type RequestRecord = { _id: string; name: string; phone: string; loginId: string; passwordHash: string; linkId: string; linkMemo?: string; createdAt: string; status?: string };
export type SignupStore = {
  readLink(tokenHash: string): Promise<Versioned<LinkRecord> | null>;
  markLink(id: string, fields: { status: 'open' | 'used'; usedAt?: string; requestId?: string }, updateTime?: string): Promise<void>; // updateTime 있으면 조건, 지면 throw conflict
  createRequest(request: Omit<RequestRecord, '_id'>): Promise<string>;   // 새 id
  readRequest(id: string): Promise<Versioned<RequestRecord> | null>;
  markRequest(id: string, fields: Partial<RequestRecord>, updateTime: string): Promise<void>; // 조건, 지면 throw conflict
  deleteRequest(id: string, updateTime?: string): Promise<void>;          // 조건 있으면 지면 throw conflict
  loginIdTaken(loginId: string, exceptRequestId?: string): Promise<boolean>; // 계정(켜짐/꺼짐), 30일 안 된 대기 요청, Sanity 계정(대소문자 무시)
  createAccount(loginId: string, fields: Record<string, unknown>): Promise<void>; // exists:false, 있으면 throw conflict
  hashPassword(password: string): Promise<string>;
  isConflict(error: unknown): boolean;
};
export type FlowResult = { ok: true; requestId?: string } | { ok: false; status: number; error: string };
export function submitSignup(input: { token: string; tokenHash: string; fields: Record<string, unknown> }, store: SignupStore, nowMs: number): Promise<FlowResult>;
export function approveSignup(input: { requestId: string; role: unknown; permissions: unknown; approvedBy: string }, store: SignupStore, nowMs: number): Promise<FlowResult>;
export function rejectSignup(input: { requestId: string }, store: SignupStore): Promise<FlowResult>;
```
- `submitSignup` 순서: `validateSignupInput` → `readLink` → `isLinkUsable` 아니면 404 `UNUSABLE_LINK_MESSAGE` → `loginIdTaken` 이면 409 `LOGIN_ID_TAKEN_MESSAGE` → `hashPassword` → `markLink(id, {status:'used', usedAt}, updateTime)` 충돌이면 404 `UNUSABLE_LINK_MESSAGE` → `createRequest` 실패하면 `markLink(id, {status:'open'})`(실패는 무시) 후 오류 다시 throw(경로가 500 처리) → 성공 `{ok:true, requestId}`. 링크에 `requestId` 기록은 `createRequest` 뒤 `markLink(id, {status:'used', requestId})`(조건 없음, 실패 무시).
- `approveSignup`: `approvalError` → 400; `readRequest` 없음 → 404 `'이미 처리된 요청입니다.'`; `isRequestExpired` → 410 `'30일이 지나 지워진 요청입니다. 새 링크로 다시 받아 주세요.'`; `status === 'approving'` → 409 `'이미 처리된 요청입니다.'`; `loginIdTaken(loginId, requestId)` → 409 `'이미 같은 아이디 계정이 있습니다.'`; `markRequest(id, {status:'approving'}, updateTime)` 충돌 → 409 `'이미 처리된 요청입니다.'`; `createAccount(loginId, {name, phone, loginId, passwordHash, role, permissions(정규화), isActive:true, createdAt, updatedAt, approvedBy, approvedAt, origin:'signup'})` 충돌 → `markRequest`로 status 되돌리기 시도 후 409 `'이미 같은 아이디 계정이 있습니다.'`; `deleteRequest(id)`(조건 없음, 실패 무시: 로그) → ok.
- `rejectSignup`: `readRequest` 없음 → 404 같은 문구; `status === 'approving'` → 409; `deleteRequest(id, updateTime)` 충돌 → 409 → ok.
- `_staff-accounts.ts`: 컬렉션 상수, `accountDocId(loginId)` = `'acct-' + sha256(loginId).hex.slice(0,24)`, `tokenHash(token)` = sha256 hex, `newSignupToken()` = `randomBytes(32).toString('base64url')`, `firestoreSignupStore(): SignupStore`(위 계약을 `getFirestoreDocumentWithVersion`, `patchFirestoreFields`(조건), `deleteFirestoreDocument`(조건), `queryFirestoreCollectionByField`, Sanity `count(*[_type=="managerAccount" && lower(loginId)==$id])`로), 링크 만들기·목록·취소, 요청 목록(30일 지난 것 지우기 포함), 아이디 계정 목록·읽기·고치기·끄기(`isActive:false`, `phone:''`). `isStaffAccountStoreReady()` = `canUseFirestoreOnServer()`.
- `firestore.ts`: `deleteFirestoreDocument(collection, id, idToken?, options?: { precondition?: FirestorePrecondition })` — 조건이 있으면 `?currentDocument.…` 붙이고, 충돌 응답이면 `FirestoreConflictError`.

- [ ] **Step 1: Failing tests** (`tests/signup-flow.test.mjs`, 메모리 가짜 저장소로 Review Focus 1~4 전부):
  - 정상 제출 → 요청 1건, 링크 `used`, 저장된 해시는 원문이 아님(가짜 `hashPassword`가 `'hash:'+pw`).
  - 같은 링크 두 번(두 번째 `markLink` 조건 충돌) → 하나만 성공, 두 번째 404 `UNUSABLE_LINK_MESSAGE`.
  - `createRequest`가 throw → 링크 다시 `open`, 오류 throw.
  - 만료·취소 링크 → 404 같은 문구, 아이디 사용 중 → 409 `LOGIN_ID_TAKEN_MESSAGE`, 입력 오류 → 400.
  - 승인 → 계정 생성(권한 정규화, `origin:'signup'`, `approvedBy`), 요청 삭제.
  - 승인 중 거절(요청 `status:'approving'`) → 409; 거절 중 승인(버전 바뀜) → 409, 계정 없음.
  - 같은 아이디 두 번째 승인 → 409 `'이미 같은 아이디 계정이 있습니다.'`, 요청 남음(status 되돌림).
  - 30일 지난 요청 승인 → 410.
- [ ] **Step 2:** FAIL. **Step 3:** `_signup-flow.ts` 구현 → PASS. 그다음 `firestore.ts` 옵션과 `_staff-accounts.ts` 구현(서버 모듈, 단위 테스트 없음; `npx tsc --noEmit -p .`).
- [ ] **Step 4:** `npm test`, tsc. **Step 5: Commit** `"직원 가입 2: 요청·승인·거절 흐름과 Firestore 저장소"`

---

### Task 3: 로그인·세션에 아이디 계정

**Files:** Modify `_token.ts`, `_login-rules.ts`, `_login.ts`, `_mobile-device-rules.ts`, `_push.ts`, `mobile/session/route.ts`(호출부 타입만), `tests/manager-login-rules.test.mjs`

- [ ] **Step 1: Failing test** — `reloadSourceOutage('firestore', { firebaseConfigured: true, firestoreConfigured: false })` → `'Firestore 설정이 없어 계정을 확인할 수 없습니다.'`, `firestoreConfigured: true` → null. 기존 호출(`{ firebaseConfigured }`)도 계속 통과하도록 `firestoreConfigured` 기본값은 true로 본다(테스트 추가).
- [ ] **Step 2:** FAIL. **Step 3: Implement**
  - `SessionSource`/`AccountSource`/기기 `src`/`_push` 타입에 `'firestore'`.
  - `verifyManagerLogin`: `@` 없는 아이디는 마스터 확인 다음, `isStaffAccountStoreReady()`이면 `getIdAccount(accountDocId(normalizeLoginId(loginId)))`와 Sanity 조회를 `Promise.all`로 동시에. Firestore 계정이 있고 `isActive !== false`면 그것, 아니면 Sanity 계정. 서비스 계정이 없으면 Sanity만. `verifyPasswordOrDummy`는 한 번. Firestore 계정이면 `src:'firestore'`, `credential: passwordHash`, `user: { id: 문서 id, name, loginId, role, permissions }`. 실패 처리·제한기는 지금과 같다.
  - `reloadManagerUser('firestore', id)`: 서비스 계정 없으면 장애 throw(`reloadSourceOutage`), 문서 없음·꺼짐 → null, 아니면 `{ user, credential: passwordHash }`.
  - `reloadSourceOutage`의 env에 `firestoreConfigured`(호출부는 `canUseFirestoreOnServer()`).
- [ ] **Step 4:** PASS, `npm test`, tsc. **Step 5: Commit** `"직원 가입 3: 아이디 계정 로그인과 휴대폰 세션 갱신"`

---

### Task 4: 총괄 API와 공개 API

**Files:** Create `app/api/manager/signup/route.ts`, `app/api/staff-signup/route.ts`; Modify `tests/manager-api-matrix.mjs`

- [ ] **Step 1: 총괄 API** — `requireManager(request, { admin: true })`, 저장소 준비 안 되면 503 `'가입 링크 기능은 Firestore 서비스 계정 설정이 필요합니다.'`.
  - `GET` → `{ links: [{ id, memo, createdByName, expiresAt }], requests: [{ id, name, phone, loginId, linkMemo, createdAt }] }`(해시 없음, 30일 지난 요청은 이때 지움).
  - `POST { action:'createLink', memo, days }`: memo 1~30자(`'누구에게 보낼지 1~30자로 적어 주세요.'`), `linkExpiresAt` null이면 400 `'유효기간을 골라 주세요.'` → 토큰 만들어 해시로 저장 → `{ link: { id, memo, expiresAt }, url: signupLinkUrl(origin, token) }`. origin은 `new URL(request.url).origin`.
  - `POST { action:'revokeLink', id }`: open인 링크만(버전 조건) `revoked`, 아니면 409 `'이미 쓰였거나 취소된 링크입니다.'`.
  - `POST { action:'approve', requestId, role, permissions }` → `approveSignup(..., approvedBy: session.loginId)`; `{ action:'reject', requestId }` → `rejectSignup`.
- [ ] **Step 2: 공개 API** — 세션 없음. 저장소 준비 안 되면 503 `'지금은 가입할 수 없습니다. 총괄 관리자에게 알려 주세요.'`.
  - 제한기 2개(`createLoginLimiter`): `check`·`checkLoginId`는 주소당 15분 30회, `submit`은 주소당 15분 5회(키는 주소만: `isBlocked(ip, 'signup')`처럼 고정 문자열). 넘으면 429 `'시도가 너무 많습니다. 15분 뒤에 다시 시도해 주세요.'`.
  - `check { token }` → `{ ok }`(실패도 200 `{ ok:false }`, 틀린 토큰은 실패로 셈).
  - `checkLoginId { token, loginId }` → 토큰이 쓸 수 있을 때만 `{ ok, error? }`(형식 오류 문구 또는 `LOGIN_ID_TAKEN_MESSAGE`).
  - `submit { token, name, phone, loginId, password, website, startedAt }` → `looksAutomated({ honeypot: website, startedAt, now })`(`app/lib/consultation-guard.ts`)면 200 `{ ok:true }`로 답하고 저장하지 않음 → `submitSignup` → 결과 그대로(성공 200 `{ ok:true }`).
  - 로그에 주소·토큰·비밀번호·휴대폰을 남기지 않는다. 응답 `Cache-Control: no-store`.
- [ ] **Step 3: matrix** — `/api/manager/signup` GET: admin 200/503, consult 403, missing 401. `/api/staff-signup` POST `{action:'check', token:'x'}`: 세션 없이 200(또는 503).
- [ ] **Step 4:** tsc, `npm test`, matrix 파일 줄 끝 복원. **Step 5: Commit** `"직원 가입 4: 총괄 가입 API와 공개 가입 API"`

---

### Task 5: 계정 API에 아이디 계정

**Files:** Modify `app/api/manager/accounts/route.ts`

- [ ] **Step 1:** `GET`: 지금 목록에 `kind`(`firebase`|`sanity`)를 붙이고, `isStaffAccountStoreReady()`면 `managerAccounts`를 `kind:'id'`, `phone` 포함으로 더한다(해시 제외).
- [ ] **Step 2:** `POST`:
  - `kind:'id'`(수정): `idAccountUpdate`(Task 1)로 필드를 만든다(끄면 `phone:''`). 비밀번호가 있으면 `passwordError` 검사 후 새 해시. 문서가 없으면 404.
  - 새 계정이고 아이디에 `@`가 없고 저장소가 준비됐으면 아이디 계정 생성(`loginIdError`, `passwordError`, `loginIdTaken` → 409 `LOGIN_ID_TAKEN_MESSAGE`, `origin:'admin'`, `exists:false`). `@`가 있으면 지금처럼(Firebase 모드면 Firebase).
  - 그 밖은 지금 동작 그대로.
- [ ] **Step 3:** `DELETE { id, kind:'id' }` → `isActive:false`, `phone:''`.
- [ ] **Step 4:** tsc, `npm test`. **Step 5: Commit** `"직원 가입 5: 계정 권한에서 아이디 계정 보기·고치기·끄기"`

---

### Task 6: 관리 화면 — 가입 요청·링크 패널, 계정 목록, 배지

**Files:** Create `app/manager-weve-7519/signup-panel.tsx`; Modify `page.tsx`

**Interfaces:** `export function SignupPanel(props: { authHeaders: () => Record<string, string>; onAccountsChanged: () => Promise<void>; onPendingCountChange: (count: number) => void; setStatus; setError })`

- [ ] **Step 1: 패널** (스펙 3.1·3.3)
  - 요청 카드: `이름 · 휴대폰 · 아이디 {loginId}` / `{M/D HH:mm} 요청 · 링크: {memo}` / 역할 라디오(직원·총괄) / 빠른 선택 버튼(`PERMISSION_PRESETS`) / 권한 체크(`MANAGER_PERMISSIONS`에서 `accounts` 뺀 목록, 이름표는 page의 `PERMISSION_LABELS`를 prop으로) / [거절](confirm `'이 가입 요청을 거절할까요? 요청 정보는 지워집니다.'`) [승인]. 승인 전 `approvalError`.
  - 링크: 목록(`메모 · 만든 사람 · {M/D}까지` + [취소]) + [가입 링크 만들기] → 메모·유효기간(1·3·7, 기본 7) → 만들기 → 링크를 한 번만 보여 주고 [복사](`navigator.clipboard.writeText`) + `이 창을 닫으면 링크를 다시 볼 수 없습니다. 잃어버리면 취소하고 새로 만드세요.`
  - 승인·거절·취소 후 다시 읽고, 승인이면 `onAccountsChanged()`; 요청 수가 바뀔 때마다 `onPendingCountChange`.
  - 진행 중 버튼 비활성 + ref로 두 번 누르기 막기.
- [ ] **Step 2: page.tsx**
  - 계정 탭 맨 위에 `<SignupPanel …/>`(총괄일 때).
  - 계정 목록: 꼬리표 `아이디`/`이메일`(kind로), 아이디 계정은 휴대폰 표시. 수정·삭제 요청에 `kind`를 함께 보냄.
  - 계정 폼 '로그인 이메일' 이름표 → `로그인 아이디 또는 이메일`, 안내 `@ 없이 적으면 아이디 계정으로 만듭니다.`
  - 로그인 화면 이름표 `계정 ID 또는 이메일` → `아이디 또는 이메일`(스펙 3.4).
  - 사이드바 두 곳: `section.key === 'accounts'`이고 대기 수 > 0이면 배지(`ml-auto rounded-full bg-[#b42318] px-2 text-xs text-white`). 총괄 로그인 직후 `GET /api/manager/signup`으로 한 번 읽는다(실패는 무시).
  - 줄 끝 복원.
- [ ] **Step 3:** tsc, `npm test`, `npm run build`. **Step 4: Commit** `"직원 가입 6: 계정 권한에 가입 요청·링크, 계정 꼬리표, 사이드바 배지"`

---

### Task 7: 가입 페이지

**Files:** Create `app/manager-weve-7519/join/page.tsx`; Modify `next.config.ts`, `tests/next-config.test.mjs`, `app/lib/analytics-scrub.ts`, `app/lib/site-analytics.tsx`, `tests/analytics-scrub.test.mjs`

- [ ] **Step 1: Failing tests**
  - `next-config.test.mjs`: `/manager-weve-7519/join` 규칙의 `Referrer-Policy`가 `no-referrer`이고, 사이트 전체 규칙 뒤에 온다.
  - `analytics-scrub.test.mjs`: 새 `scrubAnalyticsUrl(url)` — `'https://x.kr/manager-weve-7519/join#tok'` → `'https://x.kr/manager-weve-7519/join'`(해시·쿼리 버림), `/progress/abc`는 `scrubProgressUrl`과 같은 결과, 다른 주소는 그대로. (Vercel Analytics의 `event.url`은 `location.href`라 `#` 뒤가 실릴 수 있다: 스펙 6절 '빌더 확인'의 답)
- [ ] **Step 2:** FAIL → `next.config.ts` 규칙, `scrubAnalyticsUrl`, `site-analytics.tsx`의 `beforeSend`를 `scrubAnalyticsUrl`로 → PASS.
- [ ] **Step 3: 페이지**(클라이언트, 관리 화면 코드 불러오지 않음): 처음에 `location.hash`에서 토큰을 읽고 `check` → 쓸 수 없으면 `UNUSABLE_LINK_MESSAGE` 한 줄. 쓸 수 있으면 폼(이름·휴대폰·아이디·비밀번호·비밀번호 확인 + 안내 문구 2줄 + 숨은 `website` 칸 + 열린 시각 `startedAt`). 아이디 칸을 벗어날 때 `checkLoginId`로 그 자리에서 알림. 비밀번호 확인 불일치는 화면에서 막음(`'비밀번호가 서로 다릅니다.'`). 보내면 `'가입 요청을 보냈습니다. 총괄 관리자가 승인하면 이 아이디로 로그인할 수 있습니다.'` + [로그인 화면으로](`/manager-weve-7519`). 휴대폰 화면 기준 배치, 관리 화면 색.
- [ ] **Step 4:** tsc, `npm test`, `npm run build`. 가짜 응답으로 페이지만 그려 보는 확인은 개발 서버에서 `fetch`를 막을 수 없으므로 생략하고, 빌드와 화면 구조만 확인(임시 미리보기에서 `check`가 실패하면 '쓸 수 없는 링크' 문구가 보이는지).
- [ ] **Step 5: Commit** `"직원 가입 7: 가입 페이지와 주소 보호 머리글"`

---

### Task 8: 작업 규칙 문서와 마무리

- [ ] **Step 1:** `docs/WEVE_WORKING_RULES.md` 'Manager Authentication'에 스펙 8절(A안 보관 규칙 포함), 새 출처 `firestore`의 다시 읽기·장애 규칙, 세 컬렉션 클라이언트 접근 금지(콘솔 규칙에 합칠 것), 배포 순서(코드 → Firestore 규칙 → 운영 테스트 가입).
- [ ] **Step 2:** `npm test`, `npm run build`. **Step 3: Commit** `"직원 가입 8: 작업 규칙 문서"`
- [ ] **Step 4: PR 확인 목록**: 총괄이 링크 만들기 → 휴대폰으로 열어 가입 요청 → 같은 링크 다시 열면 '쓸 수 없는 링크' → 승인(권한 고르기) → PC·휴대폰 앱 로그인 → 계정 끄기 → 휴대폰 1시간 안에 로그아웃·휴대폰 번호 지워짐 → 거절한 요청은 목록에서 사라짐 → Firestore 콘솔 규칙 반영.
