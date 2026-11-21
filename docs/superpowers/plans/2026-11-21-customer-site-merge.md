# 고객·현장 탭 합치기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리 화면의 '고객 관리'·'현장 관리' 두 탭을 현장 중심의 '고객·현장' 탭 하나로 합치고, 계약 완료 알림톡을 현장 단위로 바꾼다.

**Architecture:** 매칭·묶기·반영 대상 고르기는 import가 거의 없는 순수 모듈(`app/lib/customer-match.ts`)에 모아 Node 테스트로 고정한다. 서버는 고객 목록을 필드 마스크로 전부 읽고, 고객 삭제 검사·고객 정보 반영·현장 단위 계약 알림톡을 더한다. 화면은 `page.tsx`에서 새 파일(`customer-site-tab.tsx` 등)로 빼서 만든다. 데이터 옮기기는 없다.

**Tech Stack:** Next.js App Router(TypeScript), Firestore REST(서비스 계정·사용자 토큰), Sanity(옛 데이터 모드), Aligo 알림톡, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-21-customer-site-merge-design.md` (반드시 함께 읽는다)

## Global Constraints

- 작업 규칙 `docs/WEVE_WORKING_RULES.md`를 따른다. 모든 manager API는 `requireManager`를 부른다.
- 권한 표 `OFFICE_READ_PERMISSIONS`·`OFFICE_WRITE_PERMISSIONS`(`app/lib/manager-permissions.ts`)는 바꾸지 않는다.
- 휴대폰 앱(`app/manager-weve-7519/m/`)과 그 검색 함수는 바꾸지 않는다.
- 진행 현황 링크·본인 확인 번호 규칙(`app/api/manager/_customer-phone.ts`)은 바꾸지 않는다.
- 브라우저가 보낸 이름·번호로 알림톡을 보내지 않는다(서버가 현장에서 읽는다).
- 같은 번호 판단은 숫자 9자리 이상, 정확히 일치. 휴대폰은 `normalizeKoreanMobile`로 맞춘 값(`+82 10…` = `010…`)으로 비교한다.
- 이름만 같은 고객에는 절대 자동으로 연결하지 않는다.
- 화면 색은 관리 화면 설계 체계(청회색·청록)를 쓴다. 새로 쓰는 글씨에 `#38a9bd`·흐린 회색(`#87949c`, `#8a98a2`, `#9aa6ad`)을 쓰지 않는다(대비 부족). 보조 글씨는 `#60717d`.
- 문구는 스펙의 한국어 문구를 그대로 쓴다.
- 커밋 메시지는 한국어, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 테스트 파일은 `tests/*.test.mjs`, 순수 모듈을 `.ts` 확장자로 직접 import한다(`import { x } from '../app/lib/customer-match.ts'`).

## Review Focus

1. **연락처가 빈 고객**: 새 고객을 번호 없이 등록해도 저장되고, 같은 번호 경고가 잘못 뜨지 않는다. 반영 대상 고르기에서 번호 빈 현장은 이름·번호를 따라 바뀐다. → Task 1 테스트.
2. **번호 표기 차이**: `+82 10-1234-5678`, `010 1234 5678`, `01012345678`은 같은 번호로 본다. 유선번호(`02-381-0489`)는 숫자 그대로 비교. → Task 1 테스트.
3. **끊긴 연결**: `customerId`가 불러온 고객 목록에 없거나 고객이 휴지통에 있는 현장은 '고객 연결 없음' 묶음에 들어가고, 반영·삭제 검사·개수에서 그 고객의 현장으로 세지 않는다. → Task 1 테스트(묶기), Task 3(삭제 검사는 서버가 휴지통 포함으로 셈).
4. **저장 버튼 두 번 누르기**: 새 현장 저장 중에는 버튼이 꺼지고, 고객·현장이 두 번 만들어지지 않는다. → Task 6 단계에 명시(`savingOffice` 동안 비활성 + 진행 중 플래그 ref).
5. **고치던 현장에서 다른 현장으로 넘어가기**: 바꾼 내용이 있으면 "저장하지 않은 변경이 있습니다. 버리고 넘어갈까요?"를 묻는다. → Task 6 단계에 명시(순수 함수 `isSiteFormDirty`, Task 1 테스트).

---

## File Structure

| 파일 | 역할 |
|---|---|
| `app/lib/customer-match.ts` (새) | 순수 규칙: 번호 키, 후보 찾기, 같은 번호 고객, 현장 검색어, 고객별 묶기, 현장 수, 다른 번호 판단, 반영 대상, 삭제 막기 문구, 폼 변경 여부 |
| `tests/customer-match.test.mjs` (새) | 위 규칙 |
| `app/api/manager/_site-fields.ts` | `contractAlimtalkSentAt`을 서버만 쓰는 필드로 |
| `app/api/integrations/aligo-alimtalk/_contract.ts` (새) | 순수: 계약 템플릿 채우기, 다시 보내기 거절 판단 |
| `app/api/integrations/aligo-alimtalk/send/route.ts` | 현장 단위로 다시 씀 |
| `tests/contract-alimtalk.test.mjs` (새) | `_contract.ts` |
| `app/api/manager/firestore.ts` | 고객 목록 필드 마스크·제한 없음, `patchOfficeRecordFields` 내보내기 |
| `app/api/manager/office/route.ts` | 고객 삭제 검사, `syncCustomerToSites` 동작 |
| `app/manager-weve-7519/office-types.ts` (새) | `Customer`, `Site` 타입(`page.tsx`에서 옮김) |
| `app/manager-weve-7519/office-ui.tsx` (새) | `Panel`, `statusBadgeClass`, `formatPhoneNumber`, `SITE_STATUSES`(옮김) |
| `app/manager-weve-7519/customer-picker.tsx` (새) | 고객 고르기·새 고객 입력 |
| `app/manager-weve-7519/customer-site-form.tsx` (새) | 새 현장/현장 고치기 폼(고객 칸 + 현장 칸) |
| `app/manager-weve-7519/customer-site-tab.tsx` (새) | 탭 전체: 목록(현장별/고객별), 폼 배치 |
| `app/manager-weve-7519/page.tsx` | 탭·메뉴·권한 체크박스, 옛 고객/현장 탭 코드 제거, 알림톡 창·상담 흐름 연결 |
| `docs/WEVE_WORKING_RULES.md` | 스펙 8절 |

---

### Task 1: 순수 매칭 규칙

**Files:**
- Create: `app/lib/customer-match.ts`
- Test: `tests/customer-match.test.mjs`

**Interfaces:**
- Consumes: `normalizeKoreanMobile(value: string): string | null` from `app/lib/alert-phones.ts` (import as `'./alert-phones.ts'`).
- Produces (all exported):
  - `type MatchCustomer = { _id: string; name?: string; phone?: string; createdAt?: string }`
  - `type MatchSite = { _id: string; title?: string; customerId?: string; customerName?: string; customerPhone?: string; address?: string; status?: string; createdAt?: string; deletedAt?: unknown }`
  - `phoneKey(value: unknown): string` — 휴대폰이면 `normalizeKoreanMobile` 값, 아니면 숫자만. 숫자 없으면 `''`.
  - `MIN_MATCH_PHONE_DIGITS = 9`
  - `findSamePhoneCustomers<C extends MatchCustomer>(phone: unknown, customers: readonly C[], excludeId?: string): C[]` — `phoneKey` 길이 ≥ 9이고 같은 고객 전부.
  - `countSitesByCustomer(sites: readonly MatchSite[]): Map<string, number>` — 휴지통 아닌 현장의 `customerId`별 개수.
  - `suggestCustomers<C extends MatchCustomer>(query: string, customers: readonly C[], limit?: number): C[]` — 기본 8명.
  - `siteMatchesQuery(site: MatchSite, query: string): boolean`
  - `type CustomerGroup<C, S> = { customer: C | null; sites: S[] }`
  - `groupSitesByCustomer<C extends MatchCustomer, S extends MatchSite>(input: { customers: readonly C[]; sites: readonly S[]; query: string; status: string }): CustomerGroup<C, S>[]` — `status === ''`이면 전체.
  - `isSeparatePhone(sitePhone: unknown, customerPhone: unknown): boolean`
  - `pickSitesToSync<S extends MatchSite>(sites: readonly S[], customerId: string, previousPhone: unknown): S[]`
  - `customerDeleteBlockedMessage(total: number, trashed: number): string | null`
  - `type SiteFormValues = { title: string; siteType: string; address: string; status: string; memo: string; customerId: string; separatePhone: boolean; sitePhone: string }`
  - `isSiteFormDirty(initial: SiteFormValues, current: SiteFormValues): boolean` — 문자열은 앞뒤 공백 무시하고 비교.

- [ ] **Step 1: Write the failing tests** (`tests/customer-match.test.mjs`)

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  phoneKey, findSamePhoneCustomers, countSitesByCustomer, suggestCustomers, siteMatchesQuery,
  groupSitesByCustomer, isSeparatePhone, pickSitesToSync, customerDeleteBlockedMessage, isSiteFormDirty,
} from '../app/lib/customer-match.ts';

const hong = { _id: 'c-hong', name: '홍길동', phone: '010-1234-5678', createdAt: '2026-01-01' };
const hongSoon = { _id: 'c-soon', name: '홍길순', phone: '010-5555-0000', createdAt: '2026-02-01' };
const kim = { _id: 'c-kim', name: '김철수', phone: '', createdAt: '2026-03-01' };

test('phoneKey treats +82, spaces and hyphens as the same mobile', () => {
  assert.equal(phoneKey('+82 10-1234-5678'), '01012345678');
  assert.equal(phoneKey('010 1234 5678'), '01012345678');
  assert.equal(phoneKey('02-381-0489'), '023810489');
  assert.equal(phoneKey('없음'), '');
  assert.equal(phoneKey(undefined), '');
});

test('findSamePhoneCustomers needs 9+ digits and an exact match', () => {
  assert.deepEqual(findSamePhoneCustomers('+82 10 1234 5678', [hong, hongSoon]).map((c) => c._id), ['c-hong']);
  assert.deepEqual(findSamePhoneCustomers('1234-5678', [hong]), []);
  assert.deepEqual(findSamePhoneCustomers('', [kim]), [], 'a blank phone never matches a blank phone');
  assert.deepEqual(findSamePhoneCustomers('010-1234-5678', [hong], 'c-hong'), [], 'the excluded customer is skipped');
});

test('suggestCustomers puts an exact phone match first, then name, then phone digits, at most 8', () => {
  assert.deepEqual(suggestCustomers('홍길', [kim, hongSoon, hong]).map((c) => c._id), ['c-soon', 'c-hong'], 'same rank keeps input order');
  assert.deepEqual(suggestCustomers('01012345678', [hongSoon, hong]).map((c) => c._id), ['c-hong']);
  assert.deepEqual(suggestCustomers('5678', [hongSoon, hong]).map((c) => c._id), ['c-hong']);
  assert.deepEqual(suggestCustomers('  ', [hong]), []);
  const many = Array.from({ length: 12 }, (_, i) => ({ _id: `c${i}`, name: `홍${i}`, phone: '' }));
  assert.equal(suggestCustomers('홍', many).length, 8);
});

test('siteMatchesQuery looks at title, customer name, phone digits and address, ignoring spaces and case', () => {
  const site = { _id: 's1', title: '평촌 어바인퍼스트', customerName: '홍길동', customerPhone: '010-1234-5678', address: '안양시 동안구' };
  for (const q of ['평촌어바인', '홍길동', '1234-5678', '01012345678', '동안구', '']) assert.equal(siteMatchesQuery(site, q), true, q);
  assert.equal(siteMatchesQuery(site, '산본'), false);
});

test('groupSitesByCustomer: linked groups by newest site, then customers without sites, then unlinked', () => {
  const sites = [
    { _id: 's-old', customerId: 'c-hong', title: '평촌', status: '완료', createdAt: '2026-01-05' },
    { _id: 's-new', customerId: 'c-soon', title: '산본', status: '시공중', createdAt: '2026-04-01' },
    { _id: 's-gone', customerId: 'c-deleted', title: '옛 현장', status: '계약', createdAt: '2026-03-01' },
    { _id: 's-none', title: '연결 없음', status: '상담중', createdAt: '2026-02-01' },
  ];
  const groups = groupSitesByCustomer({ customers: [hong, hongSoon, kim], sites, query: '', status: '' });
  assert.deepEqual(groups.map((g) => g.customer?._id ?? null), ['c-soon', 'c-hong', 'c-kim', null]);
  assert.deepEqual(groups.at(-1).sites.map((s) => s._id), ['s-gone', 's-none'], 'a dangling customerId counts as unlinked');
  const filtered = groupSitesByCustomer({ customers: [hong, hongSoon, kim], sites, query: '', status: '시공중' });
  assert.deepEqual(filtered.map((g) => g.customer?._id ?? null), ['c-soon'], 'a status hides customers without such a site');
  const byName = groupSitesByCustomer({ customers: [hong, hongSoon, kim], sites, query: '김철수', status: '' });
  assert.deepEqual(byName.map((g) => g.customer?._id ?? null), ['c-kim'], 'a customer without sites shows when its name matches');
});

test('countSitesByCustomer skips trashed sites', () => {
  const counts = countSitesByCustomer([{ _id: 'a', customerId: 'c-hong' }, { _id: 'b', customerId: 'c-hong', deletedAt: '2026-05-01' }]);
  assert.equal(counts.get('c-hong'), 1);
});

test('isSeparatePhone is true only when the site has its own different number', () => {
  assert.equal(isSeparatePhone('010-9999-0000', '010-1234-5678'), true);
  assert.equal(isSeparatePhone('+82 10 1234 5678', '010-1234-5678'), false);
  assert.equal(isSeparatePhone('', '010-1234-5678'), false);
});

test('pickSitesToSync takes linked, untrashed sites whose phone was the old customer phone or blank', () => {
  const sites = [
    { _id: 'same', customerId: 'c-hong', customerPhone: '010-1234-5678' },
    { _id: 'blank', customerId: 'c-hong', customerPhone: '' },
    { _id: 'other', customerId: 'c-hong', customerPhone: '010-9999-0000' },
    { _id: 'trashed', customerId: 'c-hong', customerPhone: '010-1234-5678', deletedAt: '2026-05-01' },
    { _id: 'someone-else', customerId: 'c-soon', customerPhone: '010-1234-5678' },
  ];
  assert.deepEqual(pickSitesToSync(sites, 'c-hong', '+82 10 1234 5678').map((s) => s._id), ['same', 'blank']);
});

test('customerDeleteBlockedMessage names the count and the trashed ones', () => {
  assert.equal(customerDeleteBlockedMessage(0, 0), null);
  assert.equal(customerDeleteBlockedMessage(2, 0), '현장 2곳이 연결돼 있어 삭제할 수 없습니다.');
  assert.equal(customerDeleteBlockedMessage(2, 1), '현장 2곳(휴지통 1곳 포함)이 연결돼 있어 삭제할 수 없습니다.');
});

test('isSiteFormDirty ignores surrounding spaces only', () => {
  const base = { title: '평촌', siteType: '아파트', address: '', status: '상담중', memo: '', customerId: 'c-hong', separatePhone: false, sitePhone: '' };
  assert.equal(isSiteFormDirty(base, { ...base, title: ' 평촌 ' }), false);
  assert.equal(isSiteFormDirty(base, { ...base, memo: '메모' }), true);
  assert.equal(isSiteFormDirty(base, { ...base, customerId: 'c-soon' }), true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/customer-match.test.mjs`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` for `app/lib/customer-match.ts`.

- [ ] **Step 3: Implement `app/lib/customer-match.ts`**

Rules not fixed by the tests:
- 검색어 정규화: 소문자, 모든 공백 제거. 검색어에 숫자가 4자리 이상이면 그 숫자를 `phoneKey(customerPhone)` 안에서도 찾는다.
- `suggestCustomers` 순위: (0) 검색어 `phoneKey` 길이 ≥ 9이고 고객 `phoneKey`와 같음 → (1) 이름이 검색어로 시작 → (2) 이름에 포함 → (3) 검색어 숫자(4자리 이상)가 고객 번호 숫자에 포함. 같은 순위는 입력 순서. 휴지통(`deletedAt`) 고객은 빼지 않는다(서버가 이미 뺌).
- `groupSitesByCustomer`: 휴지통 현장은 뺀다. 고객별 그룹 정렬은 그룹 안 가장 최근 현장 `createdAt` 내림차순, 현장 없는 고객은 고객 `createdAt` 내림차순으로 그 뒤, '연결 없음'(customer `null`) 그룹은 맨 끝(현장이 있을 때만). 그룹 안 현장은 `createdAt` 내림차순. `status`가 있으면 그 상태 현장만 남기고 현장이 0개가 된 그룹(현장 없는 고객 포함)은 숨긴다. `query`가 있으면 고객 이름·번호가 맞거나 `siteMatchesQuery`가 맞는 현장이 있는 그룹만; 고객이 맞으면 그 고객의 현장은 상태 필터만 적용.

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/customer-match.test.mjs` → all pass. Then `npm test` → 0 fail.

- [ ] **Step 5: Commit**

```bash
git add app/lib/customer-match.ts tests/customer-match.test.mjs docs/superpowers/specs/2026-11-21-customer-site-merge-design.md docs/superpowers/plans/2026-11-21-customer-site-merge.md
git commit -m "고객·현장 합치기 1: 고객 고르기·묶기·반영 대상 순수 규칙"
```

---

### Task 2: 계약 완료 알림톡을 현장 단위로

**Files:**
- Modify: `app/api/manager/_site-fields.ts` (`SERVER_WRITTEN_SITE_FIELDS`)
- Modify: `tests/site-fields.test.mjs` (보호 필드 목록 기대값)
- Create: `app/api/integrations/aligo-alimtalk/_contract.ts`
- Rewrite: `app/api/integrations/aligo-alimtalk/send/route.ts`
- Modify: `app/api/manager/firestore.ts` (add export `patchOfficeRecordFields`)
- Test: `tests/contract-alimtalk.test.mjs`

**Interfaces:**
- Consumes: `getSiteForProgress(siteId)`, `resolveCustomerPhone(site)`, `isProgressStoreReady()` from `app/api/manager/_progress-store.ts`; `normalizeKoreanMobile` from `app/lib/alert-phones.ts`; `requireManager`.
- Produces:
  - `SERVER_WRITTEN_SITE_FIELDS = ['acquisition', 'contractAlimtalkSentAt'] as const`
  - `fillContractTemplate(template: string, data: { customerName: string; customerPhone: string }): string` (지금 route의 `fillTemplate`를 그대로 옮김, 자리표시 7종 동일)
  - `contractResendRefusal(site: { contractAlimtalkSentAt?: unknown }, resend: boolean): string | null` → 이미 보낸 현장이고 `resend !== true`면 `'이미 계약 완료 알림톡을 보낸 현장입니다. 다시 보내려면 다시 보내기를 선택해 주세요.'`
  - `patchOfficeRecordFields(type: PrivateOfficeType, id: string, fields: Record<string, unknown>): Promise<Record<string, unknown>>` — 서비스 계정으로 `patchFirestoreFields(…, { precondition: { exists: true } })` 후 `bumpOfficeChanges(collection)`.
  - API: `POST /api/integrations/aligo-alimtalk/send` body `{ action: 'contract-complete', siteId: string, resend?: boolean }` → 200 `{ ok: true, sentAt, trackingWarning? }` | 400/404/409/502/503 `{ error }`.

- [ ] **Step 1: Failing tests**
  - `tests/site-fields.test.mjs`: 보호 필드 기대값을 `['acquisition', 'contractAlimtalkSentAt', 'progressAccess', 'progressCode', 'progressCodeCreatedAt', 'progressEnabled']`로 바꾸고, `dropBrowserSiteFields({ _id: 's', contractAlimtalkSentAt: 'x', memo: 'm' })`가 `{ _id: 's', memo: 'm' }`, `stripServerOwnedSiteFields`는 `contractAlimtalkSentAt`을 남긴다는 테스트를 더한다.
  - `tests/contract-alimtalk.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { fillContractTemplate, contractResendRefusal } from '../app/api/integrations/aligo-alimtalk/_contract.ts';

test('fillContractTemplate fills every placeholder form', () => {
  const t = '#{고객명} {고객명} {{customerName}} {{name}} #{연락처} {연락처} {{phone}}';
  assert.equal(fillContractTemplate(t, { customerName: '홍길동', customerPhone: '01012345678' }), '홍길동 홍길동 홍길동 홍길동 01012345678 01012345678 01012345678');
});

test('a site that already got it needs resend', () => {
  assert.equal(contractResendRefusal({}, false), null);
  assert.equal(contractResendRefusal({ contractAlimtalkSentAt: '' }, false), null);
  assert.match(contractResendRefusal({ contractAlimtalkSentAt: '2026-11-02T00:00:00.000Z' }, false), /다시 보내기/);
  assert.equal(contractResendRefusal({ contractAlimtalkSentAt: '2026-11-02T00:00:00.000Z' }, true), null);
});
```

- [ ] **Step 2: Run** `node --test tests/site-fields.test.mjs tests/contract-alimtalk.test.mjs` → FAIL.
- [ ] **Step 3: Implement**
  - `_site-fields.ts`: 목록에 더하고 파일 머리 주석에 "contractAlimtalkSentAt: `/api/integrations/aligo-alimtalk/send`"를 적는다.
  - `_contract.ts`: import 없음.
  - `route.ts` 흐름(옛 Sanity·고객 목록 코드 삭제):
    1. `requireManager(request, { anyOf: ['customers', 'sites'] })`.
    2. `isProgressStoreReady()`가 아니면 503 `'계약 완료 알림톡은 Firestore 설정이 필요합니다.'` (Sanity 데이터 모드는 지원하지 않음 — 스펙 5.5의 "지금 동작 유지"에서 벗어나는 결정, PR에 적는다).
    3. body 검사: `action === 'contract-complete'`, `siteId` 필수.
    4. `getSiteForProgress(siteId)` 없으면 404 `'현장을 찾을 수 없습니다.'`.
    5. `contractResendRefusal(site, body.resend === true)` → 409.
    6. `receiver = normalizeKoreanMobile(await resolveCustomerPhone(site))` 없으면 400 `'고객 휴대폰 번호가 없어 알림톡을 보낼 수 없습니다.'`.
    7. `customerName = text(site.customerName) || '고객'`. 템플릿·버튼·제목 환경변수와 Aligo 폼은 지금과 같다(`receiver_1`에 `receiver`).
    8. 성공하면 `patchOfficeRecordFields('site', siteId, { contractAlimtalkSentAt: sentAt })`. 실패하면 `trackingWarning` `'알림톡은 발송됐지만 전송 완료 상태를 저장하지 못했습니다.'`(로그 남김, 응답은 200).
    9. 받는 번호·이름은 로그에 남기지 않는다.
- [ ] **Step 4: Run** the two test files → pass; `npm test` → 0 fail. 수동 확인용으로 `tests/manager-api-matrix.mjs`에 `POST /api/integrations/aligo-alimtalk/send {action:'contract-complete', siteId:'nonexistent'}`를 더한다: `consult` 세션은 403, `sites` 세션은 401/403이 아님.
- [ ] **Step 5: Commit** `"고객·현장 합치기 2: 계약 완료 알림톡을 현장 단위로, 받는 번호는 서버가 현장에서"`

---

### Task 3: 사무 API — 고객 목록 전부 읽기, 고객 삭제 검사, 고객 정보 반영

**Files:**
- Modify: `app/api/manager/firestore.ts` (`officeListReaders.officeCustomers`)
- Modify: `app/api/manager/office/route.ts` (POST 앞부분, DELETE)

**Interfaces:**
- Consumes: Task 1 `pickSitesToSync`, `customerDeleteBlockedMessage`; Task 2 `patchOfficeRecordFields`; `queryFirestoreCollectionByField`, `getFirestoreDocument`, `officeFirestoreCollections`.
- Produces:
  - `CUSTOMER_LIST_FIELDS = ['_id', 'name', 'phone', 'chatRoomUrl', 'memo', 'createdAt', 'deletedAt', 'contractAlimtalkSentAt']` (firestore.ts, exported)
  - `POST /api/manager/office` body `{ action: 'syncCustomerToSites', customerId: string, previousPhone: string }` → 200 `{ updated: number }` | 400/403/404.
  - `DELETE /api/manager/office` type `customer` → 연결 현장이 있으면 409 `{ error: customerDeleteBlockedMessage(...) }`.

- [ ] **Step 1: Firestore customer reader** — `listFirestoreCollection('officeCustomers', idToken, 1000, CUSTOMER_LIST_FIELDS)`, `notTrashed`, `byNewest(['createdAt'])`, **`.slice` 없음**. 같은 리더가 전체·변경분 읽기 모두에 쓰이므로 다른 곳은 고치지 않는다. Sanity 쿼리(`office/route.ts`의 `customers` 100개)는 그대로 둔다.
- [ ] **Step 2: DELETE guard** — `type === 'customer'`이면(영구 삭제 포함) 연결 현장을 센다.
  - Firestore: `queryFirestoreCollectionByField('officeSites', 'customerId', id, requestIdToken)` 결과 전체가 total, 그중 `deletedAt` 있는 것이 trashed.
  - Sanity: `count(*[_type == "officeSite" && customerId == $id])`와 `count(*[_type == "officeSite" && customerId == $id && defined(deletedAt)])`.
  - `customerDeleteBlockedMessage(total, trashed)`가 있으면 409.
  - `requestIdToken`이 route에 없으면 `request.headers.get('x-firebase-token') || ''`.
- [ ] **Step 3: syncCustomerToSites** — POST에서 `body.action === 'syncCustomerToSites'`를 type 처리보다 먼저 분기.
  1. `canWriteOffice(session, 'site')` 아니면 403.
  2. Firestore ERP가 아니면 400 `'고객 정보 반영은 Firestore에서만 할 수 있습니다.'`.
  3. 고객을 id로 읽고(없거나 휴지통이면 404 `'고객을 찾을 수 없습니다.'`) 새 `name`, `phone`.
  4. `queryFirestoreCollectionByField('officeSites', 'customerId', customerId)` → `pickSitesToSync(rows, customerId, previousPhone)`.
  5. 각 현장 `patchOfficeRecordFields('site', id, { customerName: name, customerPhone: phone })`. 하나가 실패하면 그때까지 개수와 함께 500 `'일부 현장에 반영하지 못했습니다. 다시 시도해 주세요.'`(이미 바뀐 현장은 그대로, 다시 불러도 안전).
  6. 200 `{ updated }`.
- [ ] **Step 4: Verify** — `npm test` 0 fail; `npx tsc --noEmit -p .` 통과(또는 Task 8의 build로 확인). 수동 확인용으로 `tests/manager-api-matrix.mjs`에 다음을 더한다: `POST /api/manager/office {action:'syncCustomerToSites', customerId:'nonexistent', previousPhone:''}` — `sites` 세션은 401/403이 아님, `consult` 세션은 403.
- [ ] **Step 5: Commit** `"고객·현장 합치기 3: 고객 목록 전부 읽기, 연결 현장 있는 고객 삭제 막기, 고객 정보 다른 현장 반영"`

---

### Task 4: 화면 준비 — 공용 타입·부품 옮기기, 탭·권한 정리, 대시보드 알림톡 현장 단위

**Files:**
- Create: `app/manager-weve-7519/office-types.ts`, `app/manager-weve-7519/office-ui.tsx`
- Modify: `app/manager-weve-7519/page.tsx`

**Interfaces:**
- Produces:
  - `office-types.ts`: `export type Customer`(지금 page.tsx 149–160 그대로), `export type Site`(162–176에 `contractAlimtalkSentAt?: string` 추가).
  - `office-ui.tsx`: `export function Panel`, `export function statusBadgeClass(status: string): string`, `export function formatPhoneNumber(value: string): string`, `export const SITE_STATUSES` (지금 코드 그대로 옮김). `statusBadgeClass`는 '상담완료'를 '완료'보다 먼저 검사해 파랑 계열(`bg-[#eef6ff] text-[#286da8]`)로 둔다.
  - `page.tsx`: `PERMISSION_LABELS: Record<ManagerPermission, string>` — `customers: '고객 정보'`, 나머지는 지금 탭 이름(`sites: '고객·현장'` 포함).

- [ ] **Step 1: Move** types and helpers; `page.tsx`는 import해서 쓴다(동작 변화 없음). `npm run build`로 확인.
- [ ] **Step 2: Tabs and menu**
  - `tabs`에서 `customers` 항목 삭제. `sites` 라벨 `'고객·현장'`.
  - `managerSections`의 '고객·현장' 묶음: `['consultations', 'sites', 'sales', 'acquisition']`.
  - `TAB_PERMISSION`을 `Partial<Record<TabKey, readonly ManagerPermission[]>>`로 바꾸고 `sites: ['sites', 'customers']`, `acquisition: ['sites']`. `visibleTabs`는 `(TAB_PERMISSION[tab.key] ?? [tab.key]).some((p) => granted.includes(p))`.
  - `TabKey`에서 `'customers'` 제거. `setActiveTab('customers')`(상담 흐름)는 Task 7에서 바꾸므로 여기서는 `'sites'`로만 바꾼다.
  - 계정 권한 체크박스: `MANAGER_PERMISSIONS.filter((p) => p !== 'accounts')`를 돌며 `PERMISSION_LABELS[p]`를 쓴다(아이콘은 탭에 있으면 그 아이콘, 없으면 생략). `sites` 옆 '유입 경로 포함' 문구 유지.
  - 대시보드 `access.alimtalk`(지금 `['customers']`) → `['customers', 'sites']`.
- [ ] **Step 3: Alimtalk modal per site**
  - 상태 `alimtalkCustomer` → `alimtalkSite: Site | null`.
  - `AlimtalkActionModal` props: `{ site: Site; customer?: Customer; sending: boolean; kakaoManagerUrl?: string; onClose; onSendContract: (resend: boolean) => void; onOpenChat }`. 머리글: `{site.title} · {site.customerName} · {site.customerPhone}`. 계약 버튼: 현장 `contractAlimtalkSentAt`이 있으면 '전송 완료 {날짜}' + [다시 보내기](확인 후 `onSendContract(true)`), 없으면 '계약 완료 안내' → `onSendContract(false)`. 현장 기록이 없고 `customer?.contractAlimtalkSentAt`이 있으면 회색 줄 `이전 기록: 고객 단위로 {M/D} 발송`(막지 않음). 채팅방은 `customer?.chatRoomUrl || kakaoManagerUrl`. 비활성 '3. 공사 완료 안내' 버튼은 지운다.
  - `sendContractAlimtalk(site: Site, resend: boolean)`: body `{ action: 'contract-complete', siteId: site._id, resend }`. 성공하면 `officeData.sites`의 그 현장 `contractAlimtalkSentAt`을 바꾸고 상태 문구 `'{고객명}님에게 계약 완료 안내 알림톡을 발송했습니다.'`.
  - 대시보드 `onOpenAlimtalk(site: Site)`로 바꾸고 `selectedSite`를 넘긴다. 버튼 비활성 조건은 `!selectedSite.customerPhone && !selectedCustomer?.phone` 그대로.
- [ ] **Step 4: Verify** `npm test`, `npm run build` 통과.
- [ ] **Step 5: Commit** `"고객·현장 합치기 4: 탭 하나로, 권한 체크박스는 권한 목록에서, 대시보드 알림톡은 현장 단위"`

---

### Task 5: '고객·현장' 탭 — 목록

**Files:**
- Create: `app/manager-weve-7519/customer-site-tab.tsx`
- Modify: `app/manager-weve-7519/page.tsx` (`activeTab === 'sites'` 자리를 `<CustomerSiteTab …/>`로; 옛 '고객 관리' 탭 블록 삭제)

**Interfaces:**
- Consumes: Task 1 `groupSitesByCustomer`, `siteMatchesQuery`, `countSitesByCustomer`; Task 4 types/helpers.
- Produces: `export function CustomerSiteTab(props: CustomerSiteTabProps)` with

```ts
type CustomerSiteTabProps = {
  customers: Customer[];
  sites: Site[];
  canEditCustomers: boolean;        // customers 또는 sites 권한 (쓰기 권한 표와 같음)
  canSeeSiteExtras: boolean;        // sites 권한: 진행 현황 링크·유입 경로·할 일
  saving: boolean;
  saveOfficeRecord: (type: 'customer' | 'site', data: Record<string, unknown>, id?: string) => Promise<{ _id: string } | null>;
  deleteOfficeRecord: (id: string, type: 'customer' | 'site') => Promise<void>;
  syncCustomerToSites: (customerId: string, previousPhone: string) => Promise<number | null>;
  renderSiteExtras: (siteId: string) => React.ReactNode;   // ProgressLinkPanel·AcquisitionPanel·SiteNotesSection 묶음
  onOpenContractAlimtalk: (site: Site) => void;
  estimateLink?: (siteId: string) => void;                 // 견적 권한이 있을 때만
  consultationDraft: ConsultationDraft | null;             // Task 7에서 채움, 이 Task에서는 null만 넘김
  onConsultationRegistered: (consultationId: string) => Promise<void>;  // Task 7
  setStatus: (text: string) => void;
  setError: (text: string) => void;
};

export type ConsultationDraft = { consultationId: string; name: string; phone: string; siteType: string; address: string; memo: string };
```

- [ ] **Step 1: List panel (right column)** per spec 4.1:
  - 검색칸(placeholder `현장명·고객명·연락처·주소`), [현장별 | 고객별] 전환, 상태 칩(`전체` + `SITE_STATUSES`, 하나만). 칩과 보기 방식은 `localStorage` 키 `weve-customer-site-view`에 저장(try/catch, 없어도 동작).
  - 현장별: 줄마다 `현장명 · 고객명 · 연락처`, 아랫줄 `종류 · 주소`, 상태 배지, [수정], ⋯ 메뉴(삭제). 현장 검색은 `siteMatchesQuery`.
  - 고객별: `groupSitesByCustomer` 결과. 머리줄 `이름 · 연락처 · [채팅방](chatRoomUrl 있을 때) · 현장 N곳 / 현장 없음 · [고객 정보 고치기] · ⋯(삭제)`. '고객 연결 없음' 머리줄은 이름만. 고객 삭제는 `confirm` 후 `deleteOfficeRecord(id, 'customer')`(서버 409 문구가 그대로 오류로 보임). 화면에서도 불러온 현장 수가 1 이상이면 미리 `customerDeleteBlockedMessage(count, 0)`를 보여 주고 부르지 않는다.
  - [수정]과 현장 줄 클릭은 Task 6의 편집으로 연다(이 Task에서는 `editingSiteId` 상태만 세팅).
- [ ] **Step 2: Wire into page.tsx** — `activeTab === 'sites'` 블록을 `CustomerSiteTab`로 바꾸고, `activeTab === 'customers'` 블록과 `customerForm`·`editingCustomerId`·`customerFormRef`·`editCustomer`·`resetCustomerForm` 상태/함수를 지운다(상담 흐름에서 쓰는 부분은 Task 7까지 임시로 남겨도 됨). 이 Task 끝에는 왼쪽에 지금의 현장 폼이 그대로 있어도 된다(Task 6에서 교체).
- [ ] **Step 3: Verify** `npm run build` 통과, `npm test` 0 fail.
- [ ] **Step 4: Commit** `"고객·현장 합치기 5: 합친 탭 목록(검색·상태·고객별 보기)"`

---

### Task 6: '고객·현장' 탭 — 새 현장·현장 고치기 폼

**Files:**
- Create: `app/manager-weve-7519/customer-picker.tsx`, `app/manager-weve-7519/customer-site-form.tsx`
- Modify: `app/manager-weve-7519/customer-site-tab.tsx`, `app/manager-weve-7519/page.tsx` (옛 현장 폼·`findMatchingCustomer`·`openSiteCustomerConfirm`·`submitSiteWithCustomer`·`SiteCustomerConfirmModal`·`siteForm`·`editingSiteId`·`editSite`·`resetSiteForm` 삭제; `syncCustomerToSites` 헬퍼 추가)

**Interfaces:**
- Consumes: Task 1 `suggestCustomers`, `findSamePhoneCustomers`, `isSeparatePhone`, `isSiteFormDirty`, `pickSitesToSync`, `countSitesByCustomer`, `phoneKey`; `findSiteCustomer` from `app/lib/site-customer.ts` (연결 없음 현장의 제안에만).
- Produces:
  - `CustomerPicker` props: `{ customers: Customer[]; siteCounts: Map<string, number>; value: PickedCustomer | null; onChange: (value: PickedCustomer | null) => void; disabled?: boolean }`, `type PickedCustomer = { kind: 'existing'; customer: Customer } | { kind: 'new'; name: string; phone: string; chatRoomUrl: string; memo: string }`.
  - `CustomerSiteForm` props: `{ mode: 'new' | 'edit'; site?: Site; …CustomerSiteTabProps에서 필요한 것 }`.
  - page.tsx `syncCustomerToSites(customerId, previousPhone): Promise<number | null>` → `POST /api/manager/office {action:'syncCustomerToSites', …}` 후 `loadOfficeData` 조용히.

- [ ] **Step 1: CustomerPicker** (스펙 4.2)
  - 입력칸 placeholder `고객 이름 또는 연락처`. 입력하면 `suggestCustomers` 최대 8명: `이름 · 연락처 · 현장 N곳` + [이 고객으로]. 맨 아래 `+ 새 고객으로 등록`.
  - 고른 뒤: 고객 카드 `이름 · 연락처 · [채팅방]` + [다른 고객].
  - 새 고객: 이름·연락처(`formatPhoneNumber`)·카카오 채팅방 URL·고객 메모. 연락처 `findSamePhoneCustomers` 결과가 있으면 그 자리에 `같은 번호의 고객 {이름}님이 있습니다` + [이 고객으로] [그래도 새 고객]. '그래도 새 고객'을 누르면 그 번호에 대해서는 다시 묻지 않는다(상태로 기억).
- [ ] **Step 2: CustomerSiteForm — 새 현장** (스펙 4.2)
  - 고객 칸(`CustomerPicker`) + 현장 칸(현장명* · 현장 종류[아파트·주택·상가·오피스·기타] · 주소 · 상태[`SITE_STATUSES`, 기본 '상담중'] · 메모) + [저장].
  - 검사: 현장명 비면 `'현장명을 입력해 주세요.'`, 고객 없으면 `'고객을 고르거나 새 고객으로 등록해 주세요.'`.
  - 저장 순서: 새 고객이고 같은 번호 확인을 안 거쳤으면 한 번 더 확인 → `saveOfficeRecord('customer', { name, phone, chatRoomUrl, memo })` → `saveOfficeRecord('site', { title, siteType, address, status, memo, customerId, customerName, customerPhone, ...(consultationId ? { consultationId } : {}) })`.
  - 현장 저장이 실패하면: 폼을 비우지 않고, 고객 칸을 방금 만든 고객(`existing`)으로 바꾸고, `setError('현장을 저장하지 못했습니다. 고객 {이름}님은 등록됐으니 다시 저장해 주세요.')`. 상담 완료는 하지 않는다.
  - 성공: 폼 비우기, `setStatus('현장을 저장했습니다.')` + 견적 권한이 있으면 문구 옆 [견적 작성하기](`estimateLink(siteId)`). 자동 이동 없음.
  - 두 번 누르기: `saving` 동안 버튼 비활성, 그리고 컴포넌트 안 `useRef` 플래그로 진행 중이면 무시.
- [ ] **Step 3: CustomerSiteForm — 현장 고치기** (스펙 4.3)
  - 머리: 현장명 + 상태 배지.
  - 고객 칸: 연결 고객(`customers.find((c) => c._id === site.customerId)`)이 있으면 카드 + [고객 정보 고치기] + `이 고객의 다른 현장: …`(같은 `customerId`의 다른 현장, 휴지통 제외, 클릭하면 그 현장 열기) + [다른 고객으로 바꾸기](→ `CustomerPicker`) + 계약 완료 줄(`contractAlimtalkSentAt` 있으면 `{M/D} 전송 완료`, 버튼은 `onOpenContractAlimtalk(site)`).
  - 연결 고객이 없으면 `연결된 고객 없음` + `findSiteCustomer(site, customers)` 결과가 있으면 `같은 번호의 고객 {이름}님과 연결할까요?` [연결] + [고객 고르기].
  - 현장 칸: 현장명·종류·주소·상태·메모 + ☐ `이 현장은 다른 번호로 연락`(켜면 번호 입력). 처음 값은 `isSeparatePhone(site.customerPhone, customer?.phone)`. 켜진 채로 열렸으면 안내 `연결된 고객 {이름}({연락처})과 번호가 다릅니다. 다른 사람이면 [다른 고객으로 바꾸기]`.
  - 저장: `saveOfficeRecord('site', { title, siteType, address, status, memo, customerId, customerName: customer.name, customerPhone: separatePhone ? sitePhone : customer.phone }, site._id)`. **고객을 다시 찾지 않는다.**
  - 고객 정보 고치기: 이름·연락처·채팅방·메모 → `saveOfficeRecord('customer', {...}, customerId)` → 열린 현장도 위 저장 규칙으로 함께 저장(다른 번호면 연락처 유지) → `pickSitesToSync(sites, customerId, previousPhone)`에서 열린 현장을 뺀 수가 1 이상이면 `confirm('{이름}님의 다른 현장 {N}곳에도 바꿀까요?')`(확인=다른 현장도 바꾸기, 취소=이 현장만) → 확인이면 `syncCustomerToSites(customerId, previousPhone)`.
  - 아래에 `renderSiteExtras(site._id)`(`canSeeSiteExtras`일 때).
  - 다른 현장으로 넘어가거나 새 현장을 누를 때 `isSiteFormDirty`가 참이면 `confirm('저장하지 않은 변경이 있습니다. 버리고 넘어갈까요?')`.
- [ ] **Step 4: page.tsx cleanup** — 위 Files에 적은 옛 코드 삭제, `renderSiteExtras`에 지금의 `ProgressLinkPanel`·`AcquisitionPanel`·`SiteNotesSection` 묶음(지금 2683–2712행 코드)을 옮긴다. `EstimateSitesPanel`의 `onCreateSite`는 `setActiveTab('sites')` 그대로.
- [ ] **Step 5: Verify** `npm test` 0 fail, `npm run build` 통과. 로컬 개발 서버를 띄울 수 있으면(Firestore 설정이 있을 때만) 새 현장 등록·고치기를 눌러 본다. 없으면 Task 8의 미리보기 확인으로 넘긴다.
- [ ] **Step 6: Commit** `"고객·현장 합치기 6: 새 현장 등록과 현장 고치기 폼(고객 고르기, 같은 번호 확인, 다른 번호, 고객 정보 반영)"`

---

### Task 7: 상담에서 '고객·현장 등록'

**Files:**
- Modify: `app/manager-weve-7519/page.tsx` (`prepareCustomerFromConsultation`, `completeConsultation`, 상담 목록 버튼, `ConsultationDetailModal`, `ConsultationCompleteModal`)
- Modify: `app/manager-weve-7519/customer-site-tab.tsx`, `customer-site-form.tsx`

**Interfaces:**
- Consumes: `ConsultationDraft` (Task 5, `customer-site-tab.tsx`), Task 1 `findSamePhoneCustomers`.

- [ ] **Step 1: Start from a consultation** — `startRegistrationFromConsultation(c: Consultation)`: `setConsultationDraft({ consultationId: c._id, name: c.name || '', phone: c.phone || '', siteType: c.propertyType || c.siteType || '아파트', address: c.fullAddress || c.address || '', memo: c.message || '' })`, 상세·완료 창 닫기, `setActiveTab('sites')`. 상담 목록의 [고객으로 등록], 상세 창의 등록 버튼, 완료 창의 등록 버튼이 모두 이것을 부른다. 버튼 이름은 모두 **'고객·현장 등록'**. 권한: `customers` 또는 `sites`.
- [ ] **Step 2: Prefill** — 탭이 `consultationDraft`를 받으면 새 현장 폼을 연다: 고객 칸은 `findSamePhoneCustomers(draft.phone)`이 정확히 1명이면 그 고객을 고른 상태로 열고 위에 `같은 번호의 기존 고객으로 연결했습니다. 다른 고객이면 [다른 고객]을 누르세요.`, 아니면 새 고객(이름·번호 채움). 현장 칸: 종류·주소·메모 채움, 상태 '상담완료'. 상단 안내 `상담 요청에서 가져왔습니다. 저장하면 상담은 완료로 바뀝니다.`
- [ ] **Step 3: On save** — 현장 데이터에 `consultationId`, 저장 성공 후 `onConsultationRegistered(consultationId)` → page.tsx가 `saveOfficeRecord('consultation', { status: '완료' }, id)`. 상태 문구 `'고객과 현장을 등록하고 상담을 완료했습니다.'`. 초안을 비운다.
- [ ] **Step 4: Completion modal** — 버튼 [취소] [등록 없이 완료] [고객·현장 등록](권한 있을 때). 설명 `{이름}님의 상담을 완료합니다.`. 옛 `completeConsultation(c, true)` 경로와 `pendingConsultationForCustomer`는 지운다.
- [ ] **Step 5: Verify** `npm test`, `npm run build`.
- [ ] **Step 6: Commit** `"고객·현장 합치기 7: 상담에서 고객·현장 등록 하나로, 저장하면 상담 완료와 consultationId"`

---

### Task 8: 작업 규칙 문서와 마무리 확인

**Files:**
- Modify: `docs/WEVE_WORKING_RULES.md`

- [ ] **Step 1: Rules** — 스펙 8절을 'Manager UX'에 더한다: '고객·현장' 탭 하나(현장 목록, 고객은 폼에서 고르거나 새로), 현장 저장은 고객을 다시 찾지 않음, 같은 번호(9자리 이상, `+82` 같게 봄) 경고, 이름만 같은 고객 자동 연결 금지, 고객 정보 반영은 같은 번호였거나 빈 현장만, 연결 현장(휴지통 포함)이 있는 고객은 삭제 불가, 고객 목록은 필드 마스크로 전부 읽음. 계약 완료 알림톡: 현장 단위 `contractAlimtalkSentAt`(서버만 씀, 사무 저장이 받지 않음), 받는 번호는 진행 현황과 같은 규칙, 브라우저 값 무시, 다시 보내기는 명시적으로, Firestore 전용. 앞서 넣은 `findSiteCustomer` 줄은 그대로 둔다.
- [ ] **Step 2: Full verification** — `npm test` (전부 통과, 개수 기록), `npm run build` 통과.
- [ ] **Step 3: Commit** `"고객·현장 합치기 8: 작업 규칙 문서"`
- [ ] **Step 4: Manual check list for the PR** (Vercel 미리보기에서 사람이 확인): 새 고객+현장 등록 / 기존 고객에 현장 추가 / 같은 번호 경고 / 이름만 같은 고객이 자동으로 붙지 않음 / 고객 정보 고치기와 다른 현장 반영 / 연결 현장 있는 고객 삭제 막힘 / 같은 고객 두 번째 현장 계약 알림톡(`ALIGO_TEST_MODE=Y`인 미리보기) / 상담에서 등록하면 상담 완료 / 고객 권한만 있는 계정으로 탭이 보이는지.
