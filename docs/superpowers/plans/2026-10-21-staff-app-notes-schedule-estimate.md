# 직원 앱 설계 1 (현장 기록·할 일, 일정, 견적 보기) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 직원 휴대폰 앱에 현장 기록·할 일(PC에서도), 일정 탭, 고객 금액만 보이는 견적 보기를 더한다.

**Architecture:** 판단은 모두 순수 함수(`app/lib/*.ts`, Node 테스트 대상)에 두고, API 라우트는 권한 확인 → Firestore 읽기·쓰기 → 순수 함수 결과 반환만 한다. 기록·할 일은 새 Firestore 컬렉션 `siteNotes`에 문서 하나씩 저장한다. 일정은 이미 받는 `overview`만으로 화면에서 만든다. 견적은 새 API가 서버에서 원가를 뺀 뒤 보낸다.

**Tech Stack:** Next.js App Router(`app/`), React 클라이언트 컴포넌트, Tailwind, Firestore REST(`app/api/manager/firestore.ts`), `node --test`(Node 24 type stripping으로 `.ts`를 바로 import).

**Spec:** `docs/superpowers/specs/2026-10-21-staff-app-notes-schedule-estimate-design.md`

## Global Constraints

- 작업 폴더 `D:\kim\Desktop\Code\wevedesign-staff-app2`, 브랜치 `feature/staff-app-notes-schedule-estimate`(origin/main 기준). 공유 폴더 `wevedesign`의 브랜치는 바꾸지 않는다.
- 저장소 파일은 작업 트리에서 CRLF다. 편집 후 `git diff --stat`으로 파일 전체가 바뀌지 않았는지 본다.
- Node 테스트가 import하는 `app/lib/*.ts`는 다른 모듈을 `.ts` 확장자를 붙여 import한다(예: `'./site-progress.ts'`). `app/api/**`의 Next 전용 모듈(`_utils`, `firestore`)은 테스트에서 import하지 않는다.
- 화면 문구는 한국어 해요체. 서버 500 응답은 고정 문구, 자세한 오류는 `console.error`만.
- 기록·할 일 글 길이: 앞뒤 공백을 뺀 1~1000자(`SITE_NOTE_MAX = 1000`).
- 기록 id: `^sn-[0-9a-f]{24}$`. 현장 id: `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`.
- 견적 응답에는 `executionUnitPrice`, `executionAmount`, 원가·마진 합계, `workLinesJson`, 발주서, 견적 `memo`가 절대 없다.
- 탭 순서: 오늘 · 현장 · 일정 · 보고 · 상담. 일정은 `sites` 권한, 견적 보기는 `estimates` 권한.
- 고객 진행 현황(`/progress`, `app/api/progress/**`, `app/lib/progress-public.ts`)은 `siteNotes`를 읽지 않는다.
- 커밋 메시지는 한국어, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. 여러 줄·긴 글(1000자, 줄바꿈)이 기록·할 일에 들어오면 줄바꿈을 지키고 화면이 가로로 넘치지 않아야 한다 → Task 3 컴포넌트에 `whitespace-pre-wrap break-words`, Task 1 테스트에서 줄바꿈이 보존되는지 확인.
2. [추가]·[남기기]를 빠르게 두 번 누르면 같은 글이 두 번 저장되면 안 된다 → Task 3에서 저장 중에는 버튼을 막는다(`busyRef`).
3. 끝나는 날이 시작일보다 앞이거나 날짜가 비어 있는 공정은 일정에서 빠져야 한다 → Task 5 테스트 `skips tasks with missing or reversed dates`.
4. 견적 줄의 수량·단가가 빈칸·문자열·음수일 때 화면이 `NaN`을 보이면 안 된다 → Task 6 테스트 `coerces bad numbers to 0`.
5. 현장이 휴지통에 있거나 지워진 뒤 기록을 추가하면 404 "현장을 찾을 수 없습니다."로 거절해야 한다 → Task 2 라우트(테스트는 Task 1의 `siteAcceptsNotes`).

---

### Task 1: 기록·할 일 순수 함수

**Files:**
- Create: `app/lib/site-notes.ts`
- Modify: `app/lib/mobile-overview.ts` (`CONSULTATION_ID`를 `export const isOfficeRecordId = (value: unknown): value is string => …`로 내보내고 `parseConsultationPatch`가 그것을 쓴다)
- Test: `tests/site-notes.test.mjs`

**Interfaces:**
- Produces (`app/lib/site-notes.ts`):
  - `SITE_NOTE_MAX = 1000`, `SITE_NOTES_COLLECTION = 'siteNotes'`
  - `type SiteNoteKind = 'note' | 'todo'`
  - `type SiteNote = { id: string; siteId: string; kind: SiteNoteKind; text: string; createdAt: string; createdBy: string; createdByName: string; done: boolean; doneAt?: string; doneByName?: string }`
  - `type SiteNoteAuthor = { loginId: string; name: string; role: string }`
  - `isSiteNoteId(value: unknown): value is string`
  - `parseSiteNoteAction(body: unknown): { ok: true; action: 'add'; siteId: string; kind: SiteNoteKind; text: string } | { ok: true; action: 'setDone'; id: string; done: boolean } | { ok: true; action: 'delete'; id: string } | { ok: false; error: string }`
  - `newSiteNoteRecord(input: { id: string; siteId: string; kind: SiteNoteKind; text: string }, author: SiteNoteAuthor, nowIso: string): Record<string, unknown>` — 필드는 설계 §2 표 그대로(`todoState`: todo는 `'open'`, note는 `''`)
  - `doneFields(done: boolean, author: SiteNoteAuthor, nowIso: string): Record<string, unknown>` — 풀면 `todoState:'open'`, `doneAt/doneBy/doneByName: ''`
  - `deletedFields(author: SiteNoteAuthor, nowIso: string): Record<string, unknown>` — `{ deletedAt, deletedBy: (name||loginId).slice(0,80), todoState: '' }`
  - `toSiteNoteView(record: Record<string, unknown>): SiteNote | null` — 지웠거나 id·siteId·kind가 이상하면 `null`. 내부 필드(`deletedBy`, `doneBy`, `todoState`)는 담지 않는다
  - `sortSiteNotes(notes: SiteNote[]): SiteNote[]` — 안 한 것 먼저(`done` false), 그다음 `createdAt` 최신순
  - `canDeleteSiteNote(note: { createdBy: string }, author: SiteNoteAuthor): boolean`
  - `siteAcceptsNotes(site: Record<string, unknown> | null): boolean` — 있고 `deletedAt`이 없을 때만
  - `countOpenTodos(records: Array<Record<string, unknown>>): Record<string, number>` — `todoState==='open'`이고 `deletedAt` 없는 것만
  - `shortSeoulDate(iso: string): string` — 서울 시각 기준 `"10/21"`, 잘못된 값은 `''`
- Produces (`app/lib/mobile-overview.ts`): `isOfficeRecordId(value: unknown): value is string`

- [ ] **Step 1: Write the failing tests** in `tests/site-notes.test.mjs`

```js
const author = { loginId: 'staff1', name: '김직원', role: 'staff' };
test('add needs a known kind, a well formed site id and 1 to 1000 characters', () => {
  assert.deepEqual(parseSiteNoteAction({ action: 'add', siteId: 's1', kind: 'todo', text: '  타일 확인  ' }), { ok: true, action: 'add', siteId: 's1', kind: 'todo', text: '타일 확인' });
  assert.equal(parseSiteNoteAction({ action: 'add', siteId: 's1', kind: 'todo', text: '첫 줄\n둘째 줄' }).text, '첫 줄\n둘째 줄');
  for (const bad of [{ text: '   ' }, { text: 'x'.repeat(1001) }, { kind: 'memo' }, { siteId: '../x' }, { siteId: '' }]) {
    assert.equal(parseSiteNoteAction({ action: 'add', siteId: 's1', kind: 'note', text: '글', ...bad }).ok, false);
  }
  assert.equal(parseSiteNoteAction({ action: 'add', siteId: 's1', kind: 'note', text: 'x'.repeat(1000) }).ok, true);
});
test('setDone and delete need a note id we issue', () => {
  const id = 'sn-0123456789abcdef01234567';
  assert.deepEqual(parseSiteNoteAction({ action: 'setDone', id, done: true }), { ok: true, action: 'setDone', id, done: true });
  assert.equal(parseSiteNoteAction({ action: 'setDone', id, done: 'yes' }).ok, false);
  assert.equal(parseSiteNoteAction({ action: 'delete', id: 'sn-xyz' }).ok, false);
  assert.equal(parseSiteNoteAction({ action: 'rename', id }).ok, false);
  assert.equal(parseSiteNoteAction(null).ok, false);
});
test('a new record takes its author from the session and a todo starts open', () => { /* newSiteNoteRecord: createdBy 'staff1', createdByName '김직원', todoState 'open'; note → todoState '' */ });
test('done and undone fields', () => { /* doneFields(true…) → todoState 'done', doneByName '김직원'; doneFields(false…) → todoState 'open', doneAt '' */ });
test('views drop deleted records and internal fields', () => { /* toSiteNoteView of a deleted record → null; view has no deletedBy/doneBy/todoState keys; done true when todoState 'done' */ });
test('open todos first, then newest', () => { /* three notes → ids in expected order */ });
test('only the author or an admin deletes', () => {
  assert.equal(canDeleteSiteNote({ createdBy: 'staff1' }, author), true);
  assert.equal(canDeleteSiteNote({ createdBy: 'staff2' }, author), false);
  assert.equal(canDeleteSiteNote({ createdBy: 'staff2' }, { ...author, role: 'admin' }), true);
});
test('notes go only to a live site', () => {
  assert.equal(siteAcceptsNotes({ _id: 's1' }), true);
  assert.equal(siteAcceptsNotes({ _id: 's1', deletedAt: '2026-10-21T00:00:00Z' }), false);
  assert.equal(siteAcceptsNotes(null), false);
});
test('open todos are counted per site', () => { /* two open on s1, one done, one deleted open, one open on s2 → { s1: 2, s2: 1 } */ });
test('shortSeoulDate', () => {
  assert.equal(shortSeoulDate('2026-10-20T16:30:00.000Z'), '10/21');
  assert.equal(shortSeoulDate('nope'), '');
});
```

(주석으로 적은 테스트는 주석의 값 그대로 `assert`로 쓴다.)

- [ ] **Step 2: Run** `node --test tests/site-notes.test.mjs` — Expected: FAIL (모듈 없음)
- [ ] **Step 3: Implement** `app/lib/site-notes.ts`와 `isOfficeRecordId` (오류 문구: `'내용을 써 주세요.'`, `` `내용은 ${SITE_NOTE_MAX}자까지 쓸 수 있어요.` ``, `'알 수 없는 요청입니다.'`, `'현장을 선택해 주세요.'`, `'기록을 선택해 주세요.'`)
- [ ] **Step 4: Run** `npm test` — Expected: 모두 PASS (`parseConsultationPatch` 기존 테스트 포함)
- [ ] **Step 5: Commit** `현장 기록·할 일 규칙 함수`

### Task 2: 기록·할 일 API와 영구 삭제 정리

**Files:**
- Create: `app/api/manager/_site-notes.ts`, `app/api/manager/site-notes/route.ts`
- Modify: `app/api/manager/office/route.ts:446-450` (현장 영구 삭제 때 기록도 지움)

**Interfaces:**
- Consumes: Task 1 전부. `requireManager(request, { anyOf: ['sites'] })`(`_session.ts`), `getFirestoreDocument`, `patchFirestoreFields(collection, id, fields, { precondition: { exists } })`, `queryFirestoreCollectionByField`, `deleteFirestoreDocument`, `officeFirestoreCollections.site`(`firestore.ts`), `isProgressStoreReady`(`_progress-store.ts`, Firestore 준비 여부).
- Produces (`_site-notes.ts`): `listSiteNotes(siteId: string): Promise<SiteNote[]>`(정렬된 view), `getSiteNoteRecord(id: string): Promise<Record<string, unknown> | null>`, `createSiteNote(input, author, nowIso): Promise<SiteNote>`(id는 `sn-${randomBytes(12).toString('hex')}`, `exists:false`), `updateSiteNote(id, fields): Promise<SiteNote | null>`(`exists:true`), `deleteSiteNotesOfSite(siteId: string): Promise<void>`, `listOpenTodoRecords(): Promise<Array<Record<string, unknown>>>`(`todoState == 'open'`).
- Produces (HTTP): `GET /api/manager/site-notes?siteId=` → `{ notes: SiteNote[] }`; `POST` add/setDone → `{ note: SiteNote }`, delete → `{ ok: true }`.

- [ ] **Step 1: Implement `_site-notes.ts`** — Firestore 입출력만, 판단은 Task 1 함수.
- [ ] **Step 2: Implement the route.** 순서: `requireManager(anyOf ['sites'])` → `isProgressStoreReady()` 아니면 503 `MOBILE_STORE_MISSING` → GET은 `isOfficeRecordId(siteId)` 아니면 400. POST는 `parseSiteNoteAction` 실패 400. add: `siteAcceptsNotes(await getFirestoreDocument(site))` 아니면 404 `'현장을 찾을 수 없습니다.'`. setDone: 기록이 없거나 지워졌으면 404 `'기록을 찾을 수 없습니다.'`, `kind!=='todo'`면 400 `'할 일만 체크할 수 있어요.'`. delete: 없으면 404, `canDeleteSiteNote` 아니면 403 `'쓴 사람이나 총괄 관리자만 지울 수 있어요.'`. `author`는 `{ loginId: session.loginId, name: session.name, role: session.role }`. 예외는 `console.error` 후 500 `'기록을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'`(GET은 `'기록을 불러오지 못했습니다.…'`). 응답 헤더 `Cache-Control: no-store`.
- [ ] **Step 3: 영구 삭제 정리** — `office/route.ts`의 `type === 'site' && isProgressStoreReady()` 블록 안, 진행 기록을 지운 뒤 `await deleteSiteNotesOfSite(id)`.
- [ ] **Step 4: Run** `npx tsc --noEmit -p .` 와 `npm test` — Expected: 오류 없음, PASS
- [ ] **Step 5: Commit** `현장 기록·할 일 API, 현장 영구 삭제 때 함께 정리`

### Task 3: 공용 기록·할 일 화면과 PC 패널

**Files:**
- Create: `app/manager-weve-7519/site-notes-api.ts`, `app/manager-weve-7519/site-notes-section.tsx`
- Modify: `app/manager-weve-7519/page.tsx:2671` (`ProgressLinkPanel` 옆)

**Interfaces:**
- Consumes: Task 1 타입·`SITE_NOTE_MAX`·`shortSeoulDate`, Task 2 HTTP.
- Produces:
  - `type SiteNotesRequest = (url: string, init?: RequestInit) => Promise<Record<string, unknown>>` — 실패는 throw(메시지는 서버 `error`)
  - `createSiteNotesApi(request: SiteNotesRequest): { list(siteId: string): Promise<SiteNote[]>; add(siteId: string, kind: SiteNoteKind, text: string): Promise<SiteNote>; setDone(id: string, done: boolean): Promise<SiteNote>; remove(id: string): Promise<void> }`
  - `type SiteNotesApi = ReturnType<typeof createSiteNotesApi>`
  - `fetchWithHeaders(authHeaders: () => Record<string, string>): SiteNotesRequest` — PC용, `fetch` + JSON, `!ok`면 `Error(data.error || '요청을 처리하지 못했어요.')`
  - `SiteNotesSection({ siteId, api, viewer, onOpenTodoCountChange? }: { siteId: string; api: SiteNotesApi; viewer: { loginId: string; role: string }; onOpenTodoCountChange?: (siteId: string, count: number) => void })`

- [ ] **Step 1: Implement `site-notes-api.ts`** (순수 래퍼, 상태 없음).
- [ ] **Step 2: Implement `SiteNotesSection`** — 설계 §2 휴대폰 화면 그대로: "할 일"(체크 상자, 글, `createdByName · shortSeoulDate`, 끝낸 일은 "끝낸 일 N개" 접기, 입력칸+[추가]), "현장 기록"(최신 5개+[더 보기], 입력칸+[남기기]), 본인·admin에게만 [지우기]+`window.confirm('이 글을 지울까요?')`. 체크는 화면 먼저 바꾸고 실패하면 되돌린 뒤 오류 표시. 저장 중에는 해당 버튼 `disabled`와 `busyRef`. 실패 시 입력 글 유지. 글은 `whitespace-pre-wrap break-words`. 입력칸 `maxLength={SITE_NOTE_MAX}`. 불러오기 실패는 [다시 시도]. 안 한 할 일 수가 바뀔 때마다 `onOpenTodoCountChange`.
- [ ] **Step 3: PC 연결** — `{editingSiteId && hasAnyPermission(currentUser, ['sites']) && <SiteNotesSection key={editingSiteId} siteId={editingSiteId} api={…fetchWithHeaders(() => authHeaders())…} viewer={currentUser} />}`. 새 현장 작성 중(`!editingSiteId`)에는 같은 자리에 "저장한 뒤에 할 일과 기록을 쓸 수 있어요." 한 줄. `viewer`에는 PC의 `currentUser`(`ManagerUser`, `page.tsx:78`, `loginId`·`role` 있음)를 그대로 넘긴다.
- [ ] **Step 4: Run** `npx tsc --noEmit -p .` — Expected: 오류 없음
- [ ] **Step 5: Commit** `PC 현장 화면에 할 일·현장 기록`

### Task 4: overview 보강과 휴대폰 현장 상세의 기록·할 일

**Files:**
- Modify: `app/lib/mobile-overview.ts` (`MobileSite.memo?`, `MobileOverview.openTodoCounts`, `MobileOverview.canViewEstimates`, `buildMobileSites`가 `memo`를 담음)
- Modify: `app/api/manager/mobile/overview/route.ts` (`canSites`일 때 `listOpenTodoRecords()` → `countOpenTodos`; `canViewEstimates: hasAnyPermission(session, ['estimates'])`)
- Modify: `app/manager-weve-7519/m/sites-tab.tsx`, `today-tab.tsx`, `page.tsx`
- Test: `tests/mobile-overview.test.mjs`

**Interfaces:**
- Consumes: Task 1 `countOpenTodos`, Task 2 `listOpenTodoRecords`, Task 3 `createSiteNotesApi`, `SiteNotesSection`.
- Produces: `MobileOverview = { …; openTodoCounts: Record<string, number>; canViewEstimates: boolean }`, `MobileSite.memo?: string`.

- [ ] **Step 1: Failing test** `buildMobileSites keeps the PC memo only when it has text` — `memo: '  열쇠 경비실  '` → `'열쇠 경비실'`, 빈 memo는 키 없음.
- [ ] **Step 2: Run** `node --test tests/mobile-overview.test.mjs` — Expected: FAIL
- [ ] **Step 3: Implement** 타입·`buildMobileSites`·overview 라우트.
- [ ] **Step 4: 휴대폰 화면** — `page.tsx`에서 `const notesApi = useMemo(() => createSiteNotesApi(authedFetch), [authedFetch])`, `onOpenTodoCountChange`로 `overview.openTodoCounts`를 바로 고친다. `SiteDetail`에 PC 메모(있을 때, "PC 메모" 제목, 읽기 전용)를 버튼 줄 아래에, `SiteNotesSection`을 공정표 아래·최근 보고 위에. `viewer`는 `user`. `TodayTab`의 진행 현장 카드에 `openTodoCounts[site.id] > 0`이면 "할 일 N" 표시.
- [ ] **Step 5: Run** `npm test` 와 `npx tsc --noEmit -p .` — Expected: PASS, 오류 없음
- [ ] **Step 6: Commit** `휴대폰 현장 상세에 PC 메모·할 일·현장 기록, 오늘 화면에 할 일 수`

### Task 5: 일정 탭

**Files:**
- Create: `app/lib/mobile-schedule.ts`, `app/manager-weve-7519/m/schedule-tab.tsx`
- Modify: `app/lib/mobile-overview.ts` (`MobileTab`에 `'schedule'`, `visibleMobileTabs` 순서), `app/manager-weve-7519/m/mobile-ui.tsx` (`TAB_INFO.schedule = { label: '일정', icon: CalendarDays }`), `app/manager-weve-7519/m/page.tsx`
- Test: `tests/mobile-schedule.test.mjs`, `tests/mobile-overview.test.mjs` (탭 테스트 갱신)

**Interfaces:**
- Consumes: `MobileSite`, `MobileTask`(`mobile-overview.ts`).
- Produces (`mobile-schedule.ts`):
  - `type ScheduleEntry = { siteId: string; siteTitle: string; taskId: string; taskName: string; vendorName?: string; dayIndex: number; dayCount: number; starts: boolean; ends: boolean; delayed: boolean }`
  - `type ScheduleDay = { date: string; weekday: string; isToday: boolean; entries: ScheduleEntry[] }`
  - `mondayOf(date: string): string`, `addDays(date: string, days: number): string`, `weekLabel(weekStart: string): string`
  - `buildWeekSchedule(sites: MobileSite[], weekStart: string, today: string): ScheduleDay[]` — 7일, 정렬은 지연 먼저 → 현장 이름(`localeCompare(…, 'ko')`) → 공정 시작일

- [ ] **Step 1: Failing tests**

```js
test('weeks start on Monday, also across the new year', () => {
  assert.equal(mondayOf('2026-10-21'), '2026-10-19');
  assert.equal(mondayOf('2026-10-19'), '2026-10-19');
  assert.equal(mondayOf('2026-10-25'), '2026-10-19');
  assert.equal(mondayOf('2027-01-01'), '2026-12-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
test('week labels', () => {
  assert.equal(weekLabel('2026-10-19'), '10월 19일 ~ 25일');
  assert.equal(weekLabel('2026-10-26'), '10월 26일 ~ 11월 1일');
});
test('a task appears on every day it covers, with start, end and day n of m', () => {
  // 공정 2026-10-20 ~ 2026-10-22: 20일 { dayIndex 1, dayCount 3, starts true, ends false }, 22일 { dayIndex 3, ends true }, 19일·23일엔 없음
});
test('skips tasks with missing or reversed dates', () => { /* startDate '' 또는 endDate < startDate → 어느 날에도 없음 */ });
test('delayed first, then site title', () => { /* 같은 날 '나' 현장 일반, '가' 현장 일반, '다' 현장 지연 → ['다','가','나'] */ });
test('today is marked and weekdays are Korean', () => { /* buildWeekSchedule(..., '2026-10-19', '2026-10-21') → days[2].isToday, days.map(d => d.weekday) = ['월','화','수','목','금','토','일'] */ });
```

그리고 `tests/mobile-overview.test.mjs`의 `tabs follow permissions`를 `['today','sites','schedule','report','consultations']` 순서로 갱신.

- [ ] **Step 2: Run** `node --test tests/mobile-schedule.test.mjs tests/mobile-overview.test.mjs` — Expected: FAIL
- [ ] **Step 3: Implement** `mobile-schedule.ts`(날짜는 `YYYY-MM-DD` 문자열을 UTC 자정으로 계산), `visibleMobileTabs`, `TAB_INFO`.
- [ ] **Step 4: `ScheduleTab({ overview, onOpenSite })`** — 설계 §3 화면. 주 상태는 탭 안(`useState(() => mondayOf(overview.today))`). 날짜 머리 `"${일}일 (${weekday})"`, 오늘 강조, 빈 날 "일정 없음". 줄: 현장 이름 · 공정 이름, 보조줄 `n/m일`·거래처·"시작"/"마감" 표시, 지연은 주황. 누르면 `onOpenSite(siteId)`.
- [ ] **Step 5: 페이지 연결과 돌아가기** — `page.tsx`에 `siteOrigin: MobileTab | null` 상태. `openSite(id, from)`가 `from`을 기록(`TodayTab`→`'today'`, `ScheduleTab`→`'schedule'`). 뒤로 가기(popstate)로 상세를 닫을 때 `siteOrigin`이 `'today'|'schedule'`이면 그 탭으로 돌아간다. 화면의 "현장 목록" 버튼은 지금처럼 현장 목록. 로그아웃 초기화(`signedOut`)에서 `siteOrigin`도 `null`.
- [ ] **Step 6: Run** `npm test`, `npx tsc --noEmit -p .` — Expected: PASS
- [ ] **Step 7: Commit** `일정 탭: 주 단위 날짜별 공정 목록`

### Task 6: 견적 보기 (서버)

**Files:**
- Create: `app/lib/mobile-estimate.ts`, `app/api/manager/mobile/estimate/route.ts`
- Test: `tests/mobile-estimate.test.mjs`

**Interfaces:**
- Consumes: `pickScheduleEstimate`(`app/lib/site-progress.ts`), `isOfficeRecordId`(Task 1), `readSiteEstimatesFromFirestore(request, siteId)`(`firestore.ts`), `requireManager(anyOf ['estimates'])`.
- Produces:
  - `type CustomerEstimateLine = { name: string; spec: string; unit: string; quantity: number; unitPrice: number; amount: number; note: string }`
  - `type CustomerEstimateGroup = { category: string; subtotal: number; lines: CustomerEstimateLine[] }`
  - `type CustomerEstimateView = { versionLabel: string; versionType: string; updatedAt: string; total: number; vatNote: '부가세 별도'; groups: CustomerEstimateGroup[] }`
  - `toCustomerEstimateView(estimate: Record<string, unknown>): CustomerEstimateView`
  - HTTP `GET /api/manager/mobile/estimate?siteId=` → `{ estimate: CustomerEstimateView | null }`

- [ ] **Step 1: Failing tests**

```js
const estimate = {
  versionLabel: '2차 확정', versionType: 'final', updatedAt: '2026-10-20T01:00:00Z', memo: '내부', executionCostTotal: 9, marginAmount: 1,
  linesJson: JSON.stringify([
    { category: '목공', name: '천장', spec: '석고', unit: 'm2', quantity: 10, customerUnitPrice: 1000, executionUnitPrice: 700, executionAmount: 7000, note: '우물천장' },
    { process: '전기', name: '조명', unit: '', quantity: 2, customerUnitPrice: 5000 },
    { category: '목공', name: '', quantity: 1, customerUnitPrice: 999 },
    { name: '기타', quantity: 'x', customerUnitPrice: -5 },
  ]),
};
test('groups by category, then process, then 기타 공사, and skips nameless lines', () => {
  const view = toCustomerEstimateView(estimate);
  assert.deepEqual(view.groups.map((g) => [g.category, g.subtotal]), [['목공', 10000], ['전기', 10000], ['기타 공사', 0]]);
  assert.equal(view.total, 20000);
  assert.equal(view.groups[1].lines[0].unit, '식');
  assert.equal(view.vatNote, '부가세 별도');
});
test('never carries costs, margins or internal notes', () => {
  const json = JSON.stringify(toCustomerEstimateView(estimate));
  for (const word of ['execution', 'margin', 'workLines', 'purchase', '내부', '700', '7000']) assert.ok(!json.includes(word), word);
});
test('coerces bad numbers to 0', () => { /* '기타' 줄: quantity 0, unitPrice 0, amount 0; 어떤 값도 NaN 아님 */ });
test('broken lines JSON gives an empty estimate', () => { /* linesJson '{oops' → groups [], total 0 */ });
```

- [ ] **Step 2: Run** `node --test tests/mobile-estimate.test.mjs` — Expected: FAIL
- [ ] **Step 3: Implement** `toCustomerEstimateView`(음수 단가도 0으로) 와 라우트(형식 검사 400 `'현장을 선택해 주세요.'`, 지운 견적 제외 후 `pickScheduleEstimate`, 없으면 `{ estimate: null }`, 예외는 500 `'견적을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'`, `Cache-Control: no-store`).
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit -p .` — Expected: PASS
- [ ] **Step 5: Commit** `견적 보기 API: 고객 금액만`

### Task 7: 견적 화면과 두 단계 뒤로 가기

**Files:**
- Create: `app/manager-weve-7519/m/estimate-view.tsx`
- Modify: `app/manager-weve-7519/m/mobile-screen.ts` (`createBackGuard`를 깊이 기반으로), `app/manager-weve-7519/m/sites-tab.tsx`, `app/manager-weve-7519/m/page.tsx`
- Test: `tests/mobile-screen.test.mjs`

**Interfaces:**
- Consumes: Task 6 `CustomerEstimateView`, HTTP.
- Produces: `createBackGuard(history): { sync(depth: number): void; onPopState(): boolean }` — `depth`만큼 history 항목을 쌓거나 되돌린다. `onPopState()`가 `true`면 화면을 한 단계 닫는다(자기 `back()`으로 생긴 popstate는 `false`).

- [ ] **Step 1: Failing tests** — 기존 back guard 테스트를 `sync(1)`/`sync(0)`으로 바꾸고 추가:

```js
test('estimate on top of the site detail: back closes the estimate first, then the detail', () => {
  // sync(1) → index 1, sync(2) → index 2. pressBack → onPopState true (견적 닫힘) → sync(1)은 아무것도 안 함(index 1).
  // pressBack → true (상세 닫힘) → sync(0) 아무것도 안 함, index 0.
});
test('closing both on screen takes both entries back', () => {
  // sync(2) 후 sync(0) → back() 두 번, flush 동안 onPopState 모두 false, index 0.
});
```

- [ ] **Step 2: Run** `node --test tests/mobile-screen.test.mjs` — Expected: FAIL
- [ ] **Step 3: Implement** 깊이 기반 `createBackGuard`.
- [ ] **Step 4: 화면** — `page.tsx`에 `siteView: 'detail' | 'estimate'`(현장이 바뀌거나 상세를 닫으면 `'detail'`), `depth = detailOpen ? (siteView === 'estimate' ? 2 : 1) : 0`. popstate가 `true`면 `siteView==='estimate'`이면 `'detail'`로, 아니면 상세를 닫는다(Task 5의 돌아가기 포함). `loadEstimate = (siteId) => authedFetch('/api/manager/mobile/estimate?siteId=' + encodeURIComponent(siteId))`. 현장 상세 버튼 줄에 `overview.canViewEstimates`일 때 [견적](아이콘 `FileText`). `EstimateView({ siteId, load, onBack })`: 설계 §4 화면(위 버전 이름 — 없으면 `versionType==='final' ? '확정 견적' : '최근 견적'` — · 수정일 · 총액 · "(부가세 별도)", 묶음은 처음에 접힘, 줄은 품명·규격 / `수량 단위 × 단가 = 금액` / 비고, `null`이면 "이 현장에는 견적이 없어요.", 실패는 [다시 시도], 금액은 `toLocaleString('ko-KR')`원).
- [ ] **Step 5: Run** `npm test`, `npx tsc --noEmit -p .`, `npm run build` — Expected: 모두 통과
- [ ] **Step 6: Commit** `현장 상세에서 견적 보기, 뒤로 가기 두 단계`

### Task 8: 문서와 마무리 확인

**Files:**
- Modify: `docs/WEVE_WORKING_RULES.md` (Staff Phone App 절)

- [ ] **Step 1: 문서** — 일정 탭(`sites`), 현장 기록·할 일(읽기·쓰기 `sites`, 지우기는 쓴 사람·admin, 고객 페이지에 안 나옴, Firestore `siteNotes`는 클라이언트 접근 금지 규칙 유지), 견적 보기(`estimates`, 고객 금액만·원가는 서버에서 뺌), 현장 영구 삭제 때 기록도 지움.
- [ ] **Step 2: Run** `npm test`, `npx tsc --noEmit -p .`, `npm run build`, `git diff --stat origin/main` — Expected: 통과, 파일 전체가 바뀐 줄 수 없음
- [ ] **Step 3: Commit, push, PR** — `git push -u origin feature/staff-app-notes-schedule-estimate`, `gh pr create --base main`, 본문 한국어 + 확인 목록(미리보기에서 PC↔휴대폰 할 일 주고받기, Firebase 콘솔 `siteNotes` 규칙) + `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
