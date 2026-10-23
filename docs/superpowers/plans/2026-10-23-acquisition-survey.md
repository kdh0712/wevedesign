# 유입 경로 설문 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask a verified customer, once per site, how they first found WEVE DESIGN; let staff enter or fix it; show counts and sales per channel.

**Architecture:**
- Pure rules live in `app/lib/acquisition.ts`: options, answers, stats.
- The customer answer goes through a store-injected handler (`app/api/progress/_acquisition.ts`, same pattern as `_verify.ts`) behind the progress cookie.
- The answer is stored as `officeSites/<id>.acquisition`. The server writes it with a masked patch. It is protected from browser site saves, but it is still sent to the browser, so stats are computed client-side from the already-loaded sites and sales.

**Tech Stack:** Next.js app router (TypeScript, Tailwind), Firestore REST through the service account, node:test (tests import `.ts` directly).

**Spec:** `docs/superpowers/specs/2026-10-23-acquisition-survey-design.md`

## Global Constraints

- **Language:** all user-facing text is Korean and copied exactly from the spec (§2 copy, §5 labels, §7 privacy lines).
- **Libs:** lib modules stay pure. They import only relative `.ts` modules, so `node --test` loads them directly.
- **Line endings:** existing files are CRLF throughout. After editing, keep them CRLF (`python -c "b=open(p,'rb').read(); print(b.count(b'\r\n'), b.count(b'\n'))"` must print two equal numbers) and keep diffs minimal.
- **Limits:**
  - Option label: 1-12 chars after trim. Unique ignoring spaces and case. Never equal to '기타'.
  - At most 20 options. Option ids match `^[a-z0-9-]{1,40}$`.
  - The id `other` is reserved for 기타.
  - '기타' text: 1-40 chars after cleaning.
- **Customer API:** every answer carries `Cache-Control: private, no-store`. Never log the code, the cookie or the answer text.
- **Verification:**
  - `npm test`, `npx tsc --noEmit -p .` and `npm run build` must pass. `npm run lint` does not work in this repo; don't use it.
  - This PC has no Firestore credentials. Check the UI with a local-only page or a browser fetch mock, and never commit those (`.claude/launch.json`, `app/progress-demo/`).
- **Delivery:** two PRs. PR A is Tasks 1-6, PR B is Tasks 7-8.
  - Each PR: branch, PR, then turn on Auto-fix.
  - Merge to main only when the owner says so.

## Review Focus

1. **Stale site form:** a staff member saves a site form that was opened before the customer answered. The answer must survive (`acquisition` is dropped from incoming site data and kept out of the save mask). Test: Task 2.
2. **Double submit:** the customer submits twice, or from two tabs, or the write conflicts. The first answer wins. A conflict re-reads once and reports success if an answer is now there. Tests: Task 3.
3. **Lost cookie:** the cookie expired or the link was rotated while the survey was open. The API answers 401 and the page reloads to the phone check instead of showing a dead end. Tests: Task 3; UI behavior in Task 4.
4. **Option changed after answers:** an option was renamed or hidden after customers answered. Display and stats use the current label. Hidden options stay selectable by staff and stay in stats, and a removed id falls back to the stored `label`. Tests: Tasks 1 and 7.
5. **Messy 기타 text:** newlines, tabs, repeated spaces, 41+ characters, or only spaces. It is cleaned to one line, and empty or too-long text is refused with the exact messages. Tests: Task 1.

---

## PR A — 설문, 현장 상세, 개인정보처리방침

### Task 1: Acquisition rules (`app/lib/acquisition.ts`)

**Files:**
- Create: `app/lib/acquisition.ts`
- Test: `tests/acquisition.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  export const OTHER_OPTION_ID = 'other';
  export const OTHER_OPTION_LABEL = '기타';
  export type AcquisitionOption = { id: string; label: string; hidden?: boolean };
  export type SiteAcquisition = {
    status: 'answered' | 'skipped';
    optionId?: string; label?: string; other?: string;
    by: 'customer' | 'staff'; staffId?: string; at: string;
  };
  export type AcquisitionChoice = { optionId: string; label: string; other?: string };
  export const DEFAULT_ACQUISITION_OPTIONS: readonly AcquisitionOption[]; // spec §3.2 table, in that order
  export const ACQUISITION_PICK_MESSAGE = '보기를 다시 골라 주세요.';
  export const ACQUISITION_OTHER_EMPTY_MESSAGE = "'기타' 내용을 적어 주세요.";
  export const ACQUISITION_OTHER_TOO_LONG_MESSAGE = "'기타' 내용은 40자 이내로 적어 주세요.";
  export function normalizeAcquisitionOptions(input: unknown, makeId: () => string):
    { ok: true; options: AcquisitionOption[] } | { ok: false; error: string };
  export function surveyOptions(options: readonly AcquisitionOption[]): Array<{ id: string; label: string }>;
  export function readSiteAcquisition(value: unknown): SiteAcquisition | null;
  export function needsAcquisitionSurvey(site: { acquisition?: unknown }): boolean;
  export function cleanOtherText(value: unknown): string;
  export function parseAcquisitionChoice(input: unknown, options: readonly AcquisitionOption[], opts: { allowHidden: boolean }):
    { ok: true; choice: AcquisitionChoice } | { ok: false; error: string };
  export function acquisitionAnswerText(acquisition: SiteAcquisition, options: readonly AcquisitionOption[]): string;
  ```

- [ ] **Step 1: Write the failing tests** in `tests/acquisition.test.mjs`.
  - `DEFAULT_ACQUISITION_OPTIONS`:
    - Its labels are `['네이버 플레이스','홈페이지·검색','블로그','인스타그램','유튜브','당근마켓','집닥','카카오톡','지인 소개','예전 고객','지나가다 봤어요']`.
    - Its ids are `['naver-place','homepage','blog','instagram','youtube','daangn','zipdoc','kakaotalk','friend','returning','walk-in']`.
  - `normalizeAcquisitionOptions`:
    - Trims labels, keeps valid ids and `hidden`, and gives a missing or invalid id a `makeId()` value.
    - Refuses:
      - an empty label or a 13-char label with `'보기 이름은 1-12자로 적어 주세요.'`;
      - `'인스타 그램'` next to `'인스타그램'` with `"'인스타 그램' 보기가 이미 있어요."`;
      - `' 기 타 '` with `"'기타'는 따로 둘 수 없어요. 맨 아래에 항상 있어요."`;
      - 21 options with `'보기는 최대 20개까지 둘 수 있어요.'`;
      - id `'other'` with the same reserved message;
      - a non-array input with `'보기 목록 형식이 올바르지 않습니다.'`.
    - Duplicate ids: the second one gets a new `makeId()` id.
  - `surveyOptions`: drops hidden options, keeps order, and appends `{ id: 'other', label: '기타' }`.
  - `readSiteAcquisition`:
    - Returns null for `undefined`, `null`, `'x'`, `{}`, `{ status: 'answered' }` (no `at`), and `{ status: 'weird', by: 'customer', at: 'x' }`.
    - Returns the object for a valid answered or skipped value.
  - `needsAcquisitionSurvey`: true for `{}` and `{ acquisition: null }`, false for a valid skipped value.
  - `cleanOtherText`:
    - `'  친구\n추천\t받음  '` gives `'친구 추천 받음'`.
    - Control characters are removed.
    - A non-string gives `''`.
  - `parseAcquisitionChoice`:
    - `{ optionId: 'instagram' }` gives `{ optionId: 'instagram', label: '인스타그램' }`.
    - A hidden option is refused with `ACQUISITION_PICK_MESSAGE` when `allowHidden: false` and accepted when `true`.
    - An unknown id gives `ACQUISITION_PICK_MESSAGE`.
    - `{ optionId: 'other', other: '  ' }` gives `ACQUISITION_OTHER_EMPTY_MESSAGE`.
    - 41 chars give `ACQUISITION_OTHER_TOO_LONG_MESSAGE`.
    - 40 chars pass with `label: '기타'`.
  - `acquisitionAnswerText`:
    - Uses the current label for a renamed option (stored label `'인스타'`, current `'인스타그램'` gives `'인스타그램'`).
    - Uses the stored label when the id is gone.
    - Gives `'기타 · 친구 추천'` for other and `'건너뜀'` for skipped.

- [ ] **Step 2: Run the tests and see them fail.** Run: `node --test tests/acquisition.test.mjs`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `app/lib/acquisition.ts`.**
  - Lengths count characters with `Array.from(text).length`.
  - The uniqueness key is `label.replace(/\s/g, '').toLowerCase()`.
  - `cleanOtherText` removes `/[\u0000-\u001f\u007f]/g`, collapses whitespace runs to one space, and trims.

- [ ] **Step 4: Run the tests and see them pass.** Run: `node --test tests/acquisition.test.mjs`. Expected: all pass.

- [ ] **Step 5: Commit.**
  ```bash
  git add app/lib/acquisition.ts tests/acquisition.test.mjs
  git commit -m "유입 경로 규칙: 보기 목록, 답 검사, 표시 이름"
  ```

### Task 2: Protect `acquisition` from browser site saves

**Files:**
- Modify: `app/api/manager/_site-fields.ts`
- Modify: `app/api/manager/firestore.ts:663`, `:681` and `:687`. These are the save mask and the incoming strip in `saveOfficeRecordToFirestore*`.
- Modify: `app/api/manager/office/route.ts:311`. This is the incoming strip; the outgoing strips at `:186` and `:319` stay as they are.
- Test: `tests/site-fields.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  export const SERVER_WRITTEN_SITE_FIELDS = ['acquisition'] as const;      // protected, still sent to browsers
  export const PROTECTED_SITE_FIELDS: readonly string[];                    // SERVER_OWNED_SITE_FIELDS + SERVER_WRITTEN_SITE_FIELDS
  export function dropBrowserSiteFields<T extends Record<string, unknown>>(record: T): Omit<T, ...>; // removes all protected fields
  ```
  `SERVER_OWNED_SITE_FIELDS` and `stripServerOwnedSiteFields` keep their meaning. Outgoing site records keep `acquisition`.

- [ ] **Step 1: Write the failing tests** in `tests/site-fields.test.mjs`.
  - `PROTECTED_SITE_FIELDS` sorted equals `['acquisition','progressAccess','progressCode','progressCodeCreatedAt','progressEnabled']`.
  - `dropBrowserSiteFields({ ...full(), acquisition: { status: 'skipped', by: 'customer', at: 'x' } })` keeps only `_id`, `title`, `customerName`, `customerPhone` and `deletedAt`.
  - `stripServerOwnedSiteFields` of the same record still contains `acquisition`.
- [ ] **Step 2: Run** `node --test tests/site-fields.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Add the constants and `dropBrowserSiteFields` to `_site-fields.ts` and update its header comment.
  - In `firestore.ts`, pass `PROTECTED_SITE_FIELDS` as `preserveFields` at both site saves, and use `dropBrowserSiteFields` for the incoming record.
  - In `office/route.ts:311`, use `dropBrowserSiteFields`.
  - Leave `shouldBumpForPatch(..., { officeSites: SERVER_OWNED_SITE_FIELDS })` unchanged, so an `acquisition` patch still bumps `officeChanges`.
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit -p .`. Expected: all pass, no type errors.
- [ ] **Step 5: Commit.** Message: "현장 저장이 유입 경로를 덮어쓰지 않게 보호".

### Task 3: Store and customer answer API

**Files:**
- Create: `app/api/manager/_acquisition-store.ts`
- Create: `app/api/progress/_acquisition.ts`
- Create: `app/api/progress/acquisition/route.ts`
- Modify: `app/api/progress/_verify.ts`. Export the existing `isOpenFor` as `isProgressLinkOpen`, and the existing `reply` as `progressReply`. The verify behavior must not change.
- Test: `tests/progress-acquisition.test.mjs`

**Interfaces:**
- Consumes: Task 1 (`parseAcquisitionChoice`, `readSiteAcquisition`, `SiteAcquisition`, `AcquisitionOption`), `verifyProgressCookie`, `progressCookieName` and `progressPhoneDigits` from `_access.ts`.
- Produces:
  ```ts
  // _acquisition-store.ts (server only)
  export async function readAcquisitionOptions(): Promise<{ options: AcquisitionOption[]; updateTime: string }>;
  //   managerSettings/acquisitionOptions; missing doc or unreadable list -> DEFAULT_ACQUISITION_OPTIONS with updateTime ''.
  export async function writeSiteAcquisition(siteId: string, acquisition: SiteAcquisition | null, precondition: FirestorePrecondition): Promise<Record<string, unknown>>;
  //   patchFirestoreFields(officeFirestoreCollections.site, siteId, { acquisition }, { precondition }); null clears it.
  // _acquisition.ts
  export const ACQUISITION_NEEDS_CHECK_MESSAGE = '본인 확인이 필요합니다. 페이지를 새로고침해 주세요.';
  export type AcquisitionStore<S extends VerifySite = VerifySite> = {
    findSiteByCode(code: string): Promise<S | null>;
    readSite(siteId: string): Promise<{ site: S; updateTime: string } | null>;
    resolvePhone(site: S): Promise<string>;
    readOptions(): Promise<AcquisitionOption[]>;
    writeAcquisition(siteId: string, acquisition: SiteAcquisition, updateTime: string): Promise<unknown>; // throws on conflict
  };
  export async function submitAcquisition<S extends VerifySite>(body: unknown, deps: {
    store: AcquisitionStore<S>; storeReady: boolean; key: Buffer | null; cookie: string | undefined; nowMs: number;
  }): Promise<{ status: number; body: Record<string, unknown>; headers: Record<string, string> }>;
  ```
  The route reads the cookie `progressCookieName(code)` from `request.cookies` and wires the store to `findSiteByProgressCode`, `getSiteForProgressWithVersion`, `resolveCustomerPhone`, `readAcquisitionOptions` and `writeSiteAcquisition(id, value, { updateTime })`. It runs on the nodejs runtime.

- [ ] **Step 1: Write the failing tests** in `tests/progress-acquisition.test.mjs`. Reuse the versioned fake-store pattern from `tests/progress-verify.test.mjs`, adding `readOptions` and `writeAcquisition`. Sign a valid cookie with `signProgressCookie(CODE, '01012345678', key, now)`.
  - **Request shape:**
    - A bad body gives 400 `VERIFY_BAD_REQUEST_MESSAGE`.
    - A malformed code, `storeReady: false`, or a link that is off, rotated or trashed gives 404 `PROGRESS_LINK_OFF_MESSAGE`.
  - **Cookie:** a missing cookie, a cookie for another phone, or an expired one gives 401 `ACQUISITION_NEEDS_CHECK_MESSAGE` with no write.
  - **Answers:**
    - `{ code, answer: { optionId: 'instagram' } }` gives 200 `{ ok: true }`. The stored value is `{ status: 'answered', optionId: 'instagram', label: '인스타그램', by: 'customer', at: new Date(now).toISOString() }`.
    - `{ code, skip: true }` stores `{ status: 'skipped', by: 'customer', at }`.
    - A hidden option or an empty 기타 gives 400 with the Task 1 messages and no write.
  - **First answer wins:** a site that already has an answer gives 200 `{ ok: true }`, nothing is written, and the stored answer is unchanged.
  - **Conflicts:**
    - A write that conflicts, then a re-read that shows an answer, gives 200.
    - A write that conflicts with no answer on re-read gives 503 `PROGRESS_RETRY_MESSAGE`. Each request makes at most one write attempt.
    - A store that throws on read gives 500 `PROGRESS_UNAVAILABLE_MESSAGE`. `key: null` also gives 500.
  - **Headers and logs:** every result carries `'Cache-Control': 'private, no-store'`. Capture `console.error`: the code and the 기타 text never appear in it.
- [ ] **Step 2: Run** `node --test tests/progress-acquisition.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `_acquisition.ts`, `_acquisition-store.ts` and the route, plus the two exports in `_verify.ts`. Order of checks:
  1. body shape;
  2. code shape and store ready;
  3. find the site, then check the link is open;
  4. key;
  5. cookie, against the resolved phone;
  6. fresh read with version;
  7. already answered;
  8. parse the choice with `allowHidden: false`, or `skip`;
  9. write;
  10. on conflict, re-read once.
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit -p .`. Expected: all pass.
- [ ] **Step 5: Commit.** Message: "고객 유입 경로 답 받기 API (번호 확인 쿠키, 첫 답만 저장)".

### Task 4: Customer survey screen

**Files:**
- Create: `app/progress/[code]/acquisition-survey.tsx` (client component)
- Modify: `app/progress/[code]/page.tsx`. Add the branch after the cookie check and before the progress records load.

**Interfaces:**
- Consumes: `needsAcquisitionSurvey` and `surveyOptions` (Task 1), `readAcquisitionOptions` (Task 3).
- Produces: `export function AcquisitionSurvey({ code, options }: { code: string; options: Array<{ id: string; label: string }> })`.

- [ ] **Step 1: Branch in `page.tsx`.**
  - If `needsAcquisitionSurvey(site)`, read the options.
    - On success, return `<AcquisitionSurvey code={code} options={surveyOptions(options)} />`.
    - On a read error, log `'Acquisition options read failed:'` with the error and fall through to the progress view (spec §4.3).
  - The manager preview route is untouched.
- [ ] **Step 2: Build the screen.** Use `ProgressShell` and `ProgressBrand`, and the copy from spec §2.
  - **Text:**
    - Kicker: '공사를 맡겨 주셔서 감사합니다'.
    - Title: '위브디자인을 처음 어떻게 알게 되셨나요?'.
    - Description: '더 좋은 서비스를 위해 한 가지만 여쭤볼게요. 답하지 않으셔도 괜찮아요.'.
  - **Options:**
    - Options sit in a `grid-cols-2` grid of `min-h-[46px]` buttons. The selected one is filled `#38a9bd` with white text and `aria-pressed`.
    - Choosing 기타 shows an input with placeholder '어디서 알게 되셨는지 적어 주세요' and `maxLength={40}`.
  - **Buttons:**
    - '답하고 공사 현황 보기' is disabled until a choice is made and, for 기타, until `cleanOtherText` is non-empty.
    - '건너뛰기' is an underlined text button.
  - **Submit result:**
    - POST to `/api/progress/acquisition`.
    - On 200 or 401, call `window.location.reload()`.
    - Otherwise show `data.error` (fallback `PROGRESS_UNAVAILABLE_MESSAGE`) in a `role="alert"` line and keep the selection.
    - A network error shows '네트워크 연결을 확인하고 다시 시도해 주세요.'.
    - Keep the buttons disabled while the request runs.
- [ ] **Step 3: Check locally.** Create `app/progress-demo/page.tsx` (ignored by git through `.git/info/exclude`) rendering `<AcquisitionSurvey code="x" options={surveyOptions(DEFAULT_ACQUISITION_OPTIONS)} />`, then start the dev server.
  - At 375px width the whole card, including both buttons, fits without scrolling.
  - Choosing 기타 opens the input.
  - Submit stays disabled until valid.
  - Delete the demo page afterwards.
- [ ] **Step 4: Run** `npx tsc --noEmit -p .`. Expected: no errors.
- [ ] **Step 5: Commit.** Message: "고객 현황 링크: 번호 확인 다음 유입 경로 설문".

### Task 5: Staff entry on the site detail

**Files:**
- Create: `app/api/manager/acquisition/route.ts`
- Create: `app/manager-weve-7519/acquisition-api.ts`
- Create: `app/manager-weve-7519/acquisition-panel.tsx`
- Modify: `app/manager-weve-7519/page.tsx`. Add `acquisition?: unknown` to `type Site`, and render the panel right after `<ProgressLinkPanel …/>` (line 2673).

**Interfaces:**
- Consumes: Task 1 and Task 3 store functions; `requireManager(request, { anyOf: ['sites'] })`, `getSiteForProgress` and `isProgressStoreReady`.
- Produces:
  ```ts
  // route: GET -> { options, updateTime }
  //        POST { action: 'setSite', siteId, optionId, other? } -> { acquisition }   (parseAcquisitionChoice allowHidden: true;
  //             by: 'staff', staffId: session.loginId, at: now; precondition { exists: true })
  //        POST { action: 'clearSite', siteId } -> { acquisition: null }
  //        Firestore missing -> 503 '유입 경로 기능은 Firestore 설정이 필요합니다.'; trashed/missing site -> 404 '현장을 찾을 수 없습니다.'
  // acquisition-api.ts
  export function createAcquisitionApi(authHeaders: () => Record<string, string>): {
    load(): Promise<{ options: AcquisitionOption[]; updateTime: string }>;
    setSite(siteId: string, choice: { optionId: string; other?: string }): Promise<SiteAcquisition>;
    clearSite(siteId: string): Promise<void>;
  };
  // acquisition-panel.tsx
  export function AcquisitionPanel(props: { site: { _id: string; acquisition?: unknown }; authHeaders: () => Record<string, string>;
    onChange: (acquisition: SiteAcquisition | null) => void }): JSX.Element;
  ```
  All responses use `Cache-Control: private, no-store`, like `/api/manager/progress`.

- [ ] **Step 1: Write the route and the API client.** Follow the error-text style of `progress-manager.ts` (`errorText`).
- [ ] **Step 2: Build the panel** (spec §5.1). It has the title '유입 경로'.
  - **No answer:** '아직 답이 없어요' and [직원이 입력].
  - **Answered:** `acquisitionAnswerText`, a pill ('고객 답변', or `직원 입력 · ${staffId}`), the date, and [고치기] [지우기].
  - **Skipped:** a '건너뜀' pill and [직원이 입력] [지우기].
  - **Edit form:** a select of all options including hidden ones and 기타, a 기타 input (`maxLength={40}`), and [저장] [취소].
  - **지우기:** confirm first with `window.confirm('지우면 고객이 다음에 링크를 열 때 다시 묻습니다. 지울까요?')`.
  - **Wiring:**
    - Every action calls `onChange`.
    - `page.tsx` updates `officeData.sites` for that `_id`.
    - The panel shows with the same condition as `ProgressLinkPanel` (`editingSiteId && sites` permission), using the site from `officeData.sites`.
- [ ] **Step 3: Check with the browser fetch mock** (the pattern from earlier tasks): log in locally with mocked `/api/manager/*` and open a site.
  - Enter, edit and clear work.
  - After the panel saves, saving the site form keeps `acquisition` in the mocked record.
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit -p .`. Expected: pass.
- [ ] **Step 5: Commit.** Message: "현장 상세에 유입 경로 보기·직원 입력".

### Task 6: Privacy policy, working rules, PR A

**Files:**
- Modify: `app/privacy/page.tsx:10-11`. Append the spec §7 sentences to '수집하는 개인정보' and '이용 목적', exactly as written.
- Modify: `docs/WEVE_WORKING_RULES.md`. Add a "## Acquisition Survey" section after "## Customer Progress Page" with these rules:
  - asked once after the phone check;
  - the first answer wins;
  - staff entries stop the question, and clearing asks again;
  - `acquisition` is protected but sent to browsers;
  - the options doc is `managerSettings/acquisitionOptions`, hide only, 기타 fixed last;
  - never log answers.

- [ ] **Step 1: Make both edits** and keep CRLF.
- [ ] **Step 2: Run the full checks:** `npm test`, `npx tsc --noEmit -p .` and `npm run build`. Expected: all pass. If `.next/dev/types` still points at a deleted demo page, remove that folder.
- [ ] **Step 3: Commit, push, open PR A** with a Korean body that ends with the Claude Code footer. Bind the PR and turn Auto-fix on.

---

## PR B — 유입 경로 탭 (통계, 보기 관리)

### Task 7: Stats rules and saving options

**Files:**
- Modify: `app/lib/acquisition.ts`
- Modify: `app/api/manager/_acquisition-store.ts`
- Modify: `app/api/manager/acquisition/route.ts`
- Modify: `app/manager-weve-7519/acquisition-api.ts`
- Test: `tests/acquisition.test.mjs`

**Interfaces:**
- Consumes: `countsAsRevenue` from `app/lib/dashboard-rules.ts`; `todayInSeoul(ms)` from `app/lib/site-progress.ts` for createdAt to a Seoul date.
- Produces:
  ```ts
  export type AcquisitionPeriod = 'month' | '3months' | 'year' | 'all';
  export function periodRange(period: AcquisitionPeriod, today: string): { from: string; to: string } | null; // 'all' -> null
  export type AcquisitionStatsRow = {
    key: string;                       // option id, 'other', 'skipped', 'none'
    label: string;                     // current label / stored label / '기타' / '건너뜀' / '미응답'
    kind: 'option' | 'other' | 'skipped' | 'none';
    sites: Array<{ _id: string; title: string; customerName: string; answer: string; by: 'customer' | 'staff' | ''; at: string }>;
    siteCount: number; salesTotal: number; average: number;
  };
  export function acquisitionStats(input: {
    sites: ReadonlyArray<Record<string, unknown>>; sales: ReadonlyArray<Record<string, unknown>>;
    options: readonly AcquisitionOption[]; range: { from: string; to: string } | null;
  }): AcquisitionStatsRow[];
  // store
  export async function saveAcquisitionOptions(options: AcquisitionOption[], updatedBy: string, baseUpdateTime: string):
    Promise<{ options: AcquisitionOption[]; updateTime: string }>;
  //   patchFirestoreFields('managerSettings','acquisitionOptions',{ options, updatedAt, updatedBy },
  //     { precondition: baseUpdateTime ? { updateTime: baseUpdateTime } : { exists: false } })
  // route POST { action: 'saveOptions', options, baseUpdateTime } -> { options, updateTime };
  //   conflict -> 409 '다른 사람이 먼저 보기를 고쳤어요. 다시 불러온 뒤 고쳐 주세요.'; invalid -> 400 with the Task 1 message.
  // api: saveOptions(options: AcquisitionOption[], baseUpdateTime: string): Promise<{ options; updateTime }>
  ```

- [ ] **Step 1: Write the failing tests.**
  - **`periodRange`** with today `'2026-10-23'`:
    - `month` gives `{ from: '2026-10-01', to: '2026-10-23' }`.
    - `3months` gives `{ from: '2026-08-01', to: '2026-10-23' }`.
    - `year` gives `{ from: '2026-01-01', to: '2026-10-23' }`.
    - `all` gives `null`.
  - **`acquisitionStats`:**
    - **Which sites count:**
      - A '상담중' site without an answer is not counted.
      - A '상담중' site with an answer is counted.
      - '계약', '시공중' and '완료' sites without an answer count as `none` '미응답'.
      - Trashed sites are skipped.
      - A site whose `createdAt` is `'2026-09-30T16:00:00Z'` (Seoul 10-01) counts in `month`.
    - **Sales totals:**
      - `salesTotal` sums `amount` of sales with that `siteId` whose `countsAsRevenue(status)` is true. '견적' and '취소' are excluded, and trashed sales are skipped.
      - `average` is `Math.round(total / count)`.
    - **Labels:**
      - A renamed option shows its current label.
      - An id no longer in the list shows the stored `label`.
      - All `other` answers make one '기타' row, and each site's `answer` carries its text.
    - **Order:**
      - Option rows sort by `siteCount` descending, then by option-list order, with removed ids after listed ones.
      - Then '기타', '건너뜀' and '미응답' always come last, in that order.
      - Only rows with `siteCount > 0` appear.
- [ ] **Step 2: Run** `node --test tests/acquisition.test.mjs`. Expected: FAIL on the new tests.
- [ ] **Step 3: Implement** the stats functions, `saveAcquisitionOptions`, the `saveOptions` action (ids from `randomBytes(4).toString('hex')` prefixed `opt-`, conflict through `isFirestoreConflictError`) and the API client method.
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit -p .`. Expected: pass.
- [ ] **Step 5: Commit.** Message: "유입 경로 통계 규칙과 보기 목록 저장".

### Task 8: '유입 경로' tab, PR B

**Files:**
- Create: `app/manager-weve-7519/acquisition-tab.tsx`
- Modify: `app/manager-weve-7519/page.tsx`
  - Add `'acquisition'` to `TabKey`.
  - Add the `tabs` entry `{ key: 'acquisition', label: '유입 경로', icon: <Megaphone size={16} /> }` after 'sales'.
  - Add it to the `customer-work` section tabs after 'sales'.
  - `visibleTabs` maps a tab to its permission through `const TAB_PERMISSION: Partial<Record<TabKey, string>> = { acquisition: 'sites' }` (`granted.includes(TAB_PERMISSION[tab.key] ?? tab.key)`).
  - Render the tab when it is active.
- Modify: `docs/WEVE_WORKING_RULES.md`. Add to the Acquisition Survey section the stats rules from spec §6 and the rule that sales columns need the `sales` permission.

**Interfaces:**
- Consumes: `acquisitionStats`, `periodRange`, `normalizeAcquisitionOptions` (Tasks 1 and 7), `createAcquisitionApi` (Tasks 5 and 7), `todayInSeoul()`.
- Produces: `export function AcquisitionTab(props: { sites: Site-like[]; sales: Sale-like[]; canSeeSales: boolean; authHeaders: () => Record<string, string> }): JSX.Element`. `page.tsx` passes `officeData.sites`, `officeData.sales` and `hasAnyPermission(currentUser, ['sales'])`.

- [ ] **Step 1: Build the stats half** (spec §5.2 left).
  - Period buttons: 이번 달, 최근 3개월, 올해, 전체. The default is 올해.
  - Table columns: 유입 경로, 현장 수 with a bar, 매출 합계, 현장당 평균. The two money columns render only when `canSeeSales`.
  - '건너뜀' and '미응답' rows are grey.
  - Clicking a row toggles its site list: 현장명, 고객명, answer text, 고객/직원, date.
  - Money is shown with the manager's existing money format.
- [ ] **Step 2: Build the options half** (spec §5.2 right).
  - Each row has an editable label input (`maxLength={12}`), ↑ ↓, and 숨기기/보이기.
  - [＋ 보기 추가] adds a row without an id. A fixed last row reads '기타 (직접 입력)'.
  - [저장] runs `normalizeAcquisitionOptions` client-side to show errors early, then calls `saveOptions`.
  - On 409, show the message and reload.
  - Note text: '숨겨도 예전 답은 통계에 남아요. 이름을 바꾸면 예전 답도 새 이름으로 묶여요.'
- [ ] **Step 3: Check with the browser fetch mock.** Mock sites with mixed statuses and answers, and sales with '취소'.
  - Totals and order match the Task 7 rules.
  - A staff account without `sales` sees no money columns.
  - Renaming or hiding an option and saving updates the table.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit -p .` and `npm run build`. Expected: pass.
- [ ] **Step 5: Commit, push, open PR B**, bind it and turn Auto-fix on. Commit message: "유입 경로 탭: 경로별 통계와 설문 보기 관리".
