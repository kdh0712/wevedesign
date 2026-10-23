# 매니저 사용 설명서 PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 통합 매니저와 견적 작업 페이지의 PDF 사용 설명서를 도구로 만들고, 로그인한 직원이 각 화면의 버튼으로 내려받게 한다.

**Architecture:** 서버는 `manuals/*.pdf`를 로그인·권한 확인 뒤 내주는 얇은 라우트이고, 설명서 표(권한·파일 이름·오류 문구)는
순수 모듈 `app/lib/manager-manuals.ts`에 둔다. 설명서는 `scripts/manuals/`의 Node 도구가 만든다. 크롬을 CDP로 직접 조종해
가짜 로그인·가짜 `fetch` 응답을 끼운 실제 매니저 화면을 캡처하고, 내용 파일과 합친 인쇄용 HTML을 PDF로 인쇄한 뒤
쪽·링크·크기를 스스로 확인한다.

**Tech Stack:** Next.js app router, TypeScript, Tailwind, lucide-react, Node 24(기본 `WebSocket`·`fetch`), Chrome DevTools Protocol, node:test.

**Spec:** `docs/superpowers/specs/2026-10-23-manager-manuals-design.md`

## Global Constraints

- 화면·PDF 문구는 한국어. 버튼 이름 `사용 설명서`, 받는 동안 `받는 중…`.
- 오류 문구(스펙 그대로): 401 "로그인이 끝났습니다. 다시 로그인해 주세요.", 403 "이 설명서를 받을 권한이 없습니다.",
  그 밖 "설명서를 내려받지 못했습니다. 잠시 후 다시 시도해 주세요.", 라우트의 잘못된 `book` 400 "알 수 없는 설명서입니다.",
  파일 없음 404 "설명서 파일이 없습니다. 관리자에게 문의해 주세요."
- 파일 이름: `WEVE 통합 매니저 사용 설명서.pdf` / `WEVE 견적 작업 사용 설명서.pdf`, ASCII 대체 `weve-office-manual.pdf` /
  `weve-estimate-manual.pdf`.
- 권한: `office`는 로그인만, `estimate`는 `anyOf: ['estimates']`. 응답 머리 `Cache-Control: private, no-store`.
- PDF 한 개 4,000,000바이트 이하. PDF는 `manuals/`(저장소 루트, `public/` 밖)에 커밋한다.
- 캡처에는 가짜 데이터만: 이름은 홍길동·김예시·이샘플·박보기·최견본처럼 지어낸 이름, 전화 `010-0000-xxxx`,
  이메일 `@example.com`, 주소 '가나시 ○○동'. 실제 고객·현장·업체 이름 금지.
- 새 npm 패키지를 더하지 않는다. 도구는 순수 ESM `.mjs`.
- 기존 소스 파일은 CRLF. 고친 뒤 `git diff --stat` 줄 수가 실제 변경과 맞는지 본다. 새 파일도 CRLF로 쓴다.
- `.claude/launch.json`과 데모 페이지는 커밋하지 않는다. 가짜 응답은 도구가 페이지에 끼울 뿐 앱 코드에 넣지 않는다.
- 개발 서버 포트는 3000(3001은 다른 세션이 쓴다).
- 확인 명령: `npm test`, `npx tsc --noEmit -p .`, `npm run build`. `npm run lint`는 이 저장소에서 깨져 있으니 쓰지 않는다.
- 커밋 메시지는 한국어, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Vercel 배포에 PDF 파일이 빠짐 → 운영에서만 404. `next.config.ts`의 `outputFileTracingIncludes`가 `./manuals/*.pdf`를
   담는지 테스트한다(Task 2). 배포 미리보기에서 한 번 내려받아 본다(Task 7).
2. 가짜 응답이 빠진 API를 페이지가 부름 → 그 요청이 진짜 서버로 가면, `.env.local`이 있는 PC에서는 실제 고객 정보가 캡처될
   수 있다. `/api/manager/*`·`/api/integrations/*`는 어떤 경로든 절대 통과시키지 않아야 한다(Task 4 테스트).
3. 한글 파일 이름 → 브라우저마다 깨질 수 있다. `filename="ascii"; filename*=UTF-8''<퍼센트 인코딩>`을 정확히 내야 한다(Task 2 테스트).
4. 견적 페이지에서 저장 안 된 변경이 있을 때 세션이 끝난 채 버튼 누름 → 페이지를 떠나거나 다시 그리면 변경이 사라진다.
   버튼은 오류 문구만 내고 아무 데도 이동하지 않는다(Task 3 확인 단계).
5. 목차가 길어져 한 쪽을 넘침 → 링크 쪽 번호가 하나씩 밀린다. 목차는 정해진 줄 수마다 쪽을 나누고, 도구가 쪽 수와 링크
   목적지를 맞춰 본다(Task 1·Task 4 테스트).

---

### Task 1: PDF 링크 해석기

**Files:**
- Create: `scripts/manuals/pdf-links.mjs`
- Test: `tests/manual-pdf-links.test.mjs`

**Interfaces:**
- Produces: `readPdfLinks(bytes: Buffer | Uint8Array): { pageCount: number; links: Array<{ page: number; dest: string | null; targetPage: number | null; uri: string | null }> }`
  — `page`·`targetPage`는 1부터. 크롬(Skia) PDF는 쪽·주석·`/Dests`를 압축하지 않고 쓴다(시험으로 확인): 카탈로그의
  `/Pages` 트리를 `/Kids` 순서대로 재귀로 펼쳐 쪽 순서를 얻고, `/Subtype /Link` 주석의 `/Dest /이름`을 카탈로그 `/Dests`
  사전(`/이름 [N 0 R /XYZ …]`)으로 풀어 쪽 번호로 바꾼다. 이름의 `#xx` 이스케이프를 푼다. `/A << /S /URI /URI (…) >>`는 `uri`.

- [ ] **Step 1: 실패하는 테스트 작성** — 테스트 안에서 작은 PDF 문자열을 직접 만든다(카탈로그, 중첩 `/Pages` 2단, 쪽 3개,
  `/Dests << /sec-a [쪽2 0 R /XYZ 0 842 0] /A-1 [쪽3 …] >>`, 1쪽에 `/Dest /sec-a`·`/Dest /A#2D1` 링크, 3쪽에 URI 링크).
  - `readPdfLinks(buf).pageCount === 3`
  - 링크 `{ page: 1, dest: 'sec-a', targetPage: 2 }`, `{ page: 1, dest: 'A-1', targetPage: 3 }`, `{ page: 3, uri: 'https://example.com' }`
  - 없는 이름을 가리키는 링크는 `targetPage: null`
- [ ] **Step 2: 실패 확인** — `node --test tests/manual-pdf-links.test.mjs` → 모듈 없음으로 FAIL
- [ ] **Step 3: `readPdfLinks` 구현**
- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS
- [ ] **Step 5: 커밋** — `사용 설명서: PDF 링크 해석기`

### Task 2: 설명서 표와 다운로드 라우트

**Files:**
- Create: `app/lib/manager-manuals.ts`, `app/api/manager/_manual.ts`, `app/api/manager/manual/route.ts`
- Modify: `next.config.ts` (`outputFileTracingIncludes` 추가)
- Test: `tests/manager-manuals.test.mjs`, `tests/next-config.test.mjs`(한 개 추가)

**Interfaces:**
- Produces (`app/lib/manager-manuals.ts`, 브라우저와 서버가 같이 쓰므로 Node 전용 import 금지):
  - `type ManualBook = 'office' | 'estimate'`
  - `const MANAGER_MANUALS: Record<ManualBook, { file: string; downloadName: string; asciiName: string; anyOf?: readonly ManagerPermission[] }>`
  - `isManualBook(value: unknown): value is ManualBook`
  - `manualContentDisposition(book: ManualBook): string` → `attachment; filename="weve-office-manual.pdf"; filename*=UTF-8''WEVE%20%ED%86%B5…pdf`
  - `manualDownloadErrorMessage(status: number): string` (Global Constraints의 문구)
- Produces (`app/api/manager/_manual.ts`):
  - `handleManualRequest(request: Request, readManual: (file: string) => Promise<Uint8Array | null>): Promise<Response>`
    — `book`을 먼저 검사(400)한 뒤 `requireManager(request, { anyOf })`, 그다음 파일(404). 200은 `Content-Type: application/pdf`,
    `Content-Disposition`, `Cache-Control: private, no-store`.
  - `readManualFile(file: string): Promise<Uint8Array | null>` — `path.join(process.cwd(), 'manuals', file)`, ENOENT면 `null`.
- `route.ts`: `export const runtime = 'nodejs'`, `GET(request)`는 `handleManualRequest(request, readManualFile)`만 부른다
  (라우트 파일에는 Next가 허락하는 export만 둔다).

- [ ] **Step 1: 실패하는 테스트 작성** (`tests/manager-manuals.test.mjs`) — `process.env.MANAGER_SESSION_SECRET = 'x'.repeat(32)`,
  토큰은 `signSessionToken(claims, Buffer.from('x'.repeat(32)))`, `readManual`은 `%PDF-1.4 test`를 돌려주는 가짜.
  - `book=office` 토큰 없음 → 401
  - `book=nope` → 400 `{ error: '알 수 없는 설명서입니다.' }` (토큰 있어도)
  - `perms: ['consultations']` 직원: `estimate` → 403, `office` → 200
  - 관리자: 둘 다 200, 본문이 `%PDF-`로 시작, `Content-Type`·`Cache-Control`·`Content-Disposition`이 위 값
  - `readManual`이 `null` → 404 문구
  - `MANAGER_MANUALS.estimate.anyOf`가 `['estimates']`, `office`에는 `anyOf` 없음
  - `manualDownloadErrorMessage(401|403|500)` 문구
  - (`tests/next-config.test.mjs`) `nextConfig.outputFileTracingIncludes['/api/manager/manual']`에 `'./manuals/*.pdf'`가 있다
- [ ] **Step 2: 실패 확인** — `npm test` → 새 테스트 FAIL
- [ ] **Step 3: 세 파일 구현과 `next.config.ts` 수정**
- [ ] **Step 4: 통과 확인** — `npm test` PASS, `npx tsc --noEmit -p .` 오류 없음
- [ ] **Step 5: 커밋** — `사용 설명서: 로그인 확인 후 내려받는 라우트`

### Task 3: 다운로드 버튼

**Files:**
- Create: `app/manager-weve-7519/manual-download-button.tsx`
- Modify: `app/manager-weve-7519/page.tsx` (머리글 로그아웃 버튼 앞, 지금 2382줄 근처),
  `app/manager-weve-7519/estimate/page.tsx` (머리글 제목 블록 뒤, 지금 2567줄 근처)

**Interfaces:**
- Consumes: Task 2의 `MANAGER_MANUALS`, `manualDownloadErrorMessage`
- Produces: `ManualDownloadButton({ book, authHeaders, onError }: { book: ManualBook; authHeaders: () => Record<string, string>; onError: (message: string) => void })`
  — `fetch('/api/manager/manual?book=…', { headers: authHeaders() })`, 성공하면 blob → `URL.createObjectURL` → 숨은
  `<a download={downloadName}>` 클릭 → URL 해제. 받는 동안 `disabled`와 `받는 중…`(Loader2 회전). 실패는 `onError(manualDownloadErrorMessage(status))`만
  부르고 페이지 이동·세션 정리는 하지 않는다. 모양은 예시 화면대로: 흰 바탕, `border-[#d5dde2]`, `BookOpen` 아이콘, 작은 글씨.
- 통합 매니저: `authHeaders={() => authHeaders()}`, `onError={setError}`. 견적 페이지: 같은 이름의 지역 함수가 있다
  (`authHeaders`, `setError`).

- [ ] **Step 1: 컴포넌트 작성과 두 페이지에 넣기**
- [ ] **Step 2: 타입 확인** — `npx tsc --noEmit -p .` 오류 없음, `git diff --stat`이 두 페이지에서 몇 줄만 바뀜(CRLF 유지)
- [ ] **Step 3: 커밋** — `사용 설명서: 통합 매니저·견적 페이지 머리글에 내려받기 버튼`

### Task 4: 만들기 도구 뼈대 (인쇄 레이아웃, CDP, 가짜 데이터, 첫 장)

**Files:**
- Create: `scripts/manuals/layout.mjs`, `scripts/manuals/cdp.mjs`, `scripts/manuals/mock-data.mjs`,
  `scripts/manuals/build-manuals.mjs`, `scripts/manuals/office-manual.mjs`(1장만)
- Modify: `package.json` (`"manuals": "node scripts/manuals/build-manuals.mjs"`)
- Test: `tests/manual-layout.test.mjs`, `tests/manual-mock.test.mjs`

**Interfaces:**
- 내용 파일 모양(`office-manual.mjs`가 `export default`):
  ```js
  { id: 'office', title: '통합 매니저 사용 설명서', eyebrow: 'WEVE OFFICE · 직원용', coverNote: '…',
    chapters: [{ title: '시작하기', sections: [{ id: 'login', title: '로그인', adminOnly?: true,
      shot: { path: '/manager-weve-7519', session?: false, actions?: Action[], marks: Mark[], clip?: string, height?: number },
      steps: [{ n: 1, title: '…', text: '…', appendix?: 'A-2' }], tip?: '…' }] }],
    appendix: [{ id: 'A-1', title: '…', blocks: Array<{ h: string } | { p: string } | { list: string[] } | { table: { head: string[]; rows: string[][] } }> }] }
  ```
  `Action` = `{ click: Target } | { rightClick: Target } | { doubleClick: Target } | { scrollTo: Target } | { press: string } | { wait: number } | { setValue: { target: Target; value: string } }`,
  `Target` = 화면 글자(문자열, 앞뒤 공백 무시하고 정확히 같음) 또는 `{ text?: string; selector?: string; nth?: number; within?: string }`,
  `Mark` = `{ n: number; target: Target; box?: boolean }`. 절 번호(`1-1`)와 쪽 번호는 순서로 정해지고 내용 파일에 적지 않는다.
  한 쪽에 다 들어가지 않는 절은 다음 절에 `continues: true`를 적는다: 앞 절의 번호·제목에 '(이어서)'를 붙이고 목차에는 따로 싣지 않는다.
  대상 찾기: 보이는 요소 중 글자가 정확히 같은(또는 선택자에 맞는) 것, `within` 안에서만, 여러 개면 `nth`로 고른다. 없거나 `nth` 없이
  여러 개면 절 id와 대상을 담아 throw.
- `layout.mjs`:
  - `renderManual(manual, { shots: Record<sectionId, string /* data URL */>, date: Date }): { html: string; pageIds: string[]; expectedLinks: Array<{ page: number; targetPage: number }> }`
    — 쪽 순서: 표지(`cover`), 목차(`toc-1`…; 한 쪽 32줄마다 나눔), 절마다 한 쪽(`sec-<id>`), 부록마다 한 쪽(`appx-<id>`).
    목차 줄·[부록 A-n]·돌아가기 링크를 모두 `<a href="#…">`로 만들고, 그 링크들의 `{ 있는 쪽, 갈 쪽 }`을 `expectedLinks`로 낸다.
    돌아가기는 그 부록을 처음 가리킨 절로. 표지 날짜는 `YYYY년 M월 화면 기준`. 쪽 상자는 `210mm × 297mm`, `body { margin: 0 }`,
    `@page { size: A4; margin: 0 }`, 마지막 쪽 뒤에는 쪽 나눔 없음(빈 쪽 방지). 디자인은 예시 화면(`manual-sample.html`)의 색과 모양.
  - `validateManual(manual): void` — 다음이면 이유를 담아 throw: 절 id 중복, 단계 `n` 집합 ≠ 표시 `n` 집합, 없는 부록을 가리킴,
    아무 절도 가리키지 않는 부록.
- `cdp.mjs`:
  - `findChrome({ env, platform, exists }): string | null` — `env.CHROME_PATH` → 플랫폼별 Chrome 기본 위치 → Edge.
  - `launchChrome(chromePath: string): Promise<{ newPage(): Promise<CdpPage>; close(): Promise<void> }>` — `--headless=new`,
    임시 `--user-data-dir`, `--remote-debugging-port=0`을 쓰고 `DevToolsActivePort` 파일에서 포트를 읽는다.
  - `CdpPage`: `send(method, params)`, `evaluate(expression)`(값 반환, 예외면 throw), `waitFor(expression, timeoutMs)`, `onConsole(cb)`, `close()`.
- `mock-data.mjs`:
  - `buildMockData(today: Date)` — 모든 날짜는 `today` 기준 상대값. 이 Task에서는 업무 현황이 뜰 만큼(현장 몇 개, 상담 몇 건)만.
  - `routeMock(data, method: string, url: string, body: string | null): { status: number; body: unknown; unmocked?: true } | null`
    — 경로가 `/api/manager/` 또는 `/api/integrations/`로 시작하면 절대 `null`을 내지 않는다(모르는 경로는 `{ status: 200, body: {}, unmocked: true }`).
    그 밖의 경로는 `null`(진짜로 보냄). 페이지에 그대로 들어가야 하므로 바깥 변수·import를 쓰지 않는다.
  - `mockInitScript(data, { session: boolean }): string` — `routeMock.toString()`과 `JSON.stringify(data)`로 만든 페이지용 스크립트:
    세션이면 `sessionStorage['weve-manager-session-v2']`에 가짜 총괄 관리자(`MOCK_USER`, 토큰 `demo.demo`, 8시간), `window.fetch`
    감싸기, 모르는 경로는 `console.warn('[manual-mock] unmocked', …)`.
  - `MOCK_USER`
- `build-manuals.mjs`: `--only office|estimate`, `--base <url>`(기본 `http://localhost:3000`). 서버가 응답하지 않으면
  `node node_modules/next/dist/bin/next dev -p 3000`을 띄워 `/manager-weve-7519`가 200이 될 때까지(최대 120초) 기다리고 끝나면 끈다.
  절마다 새로 열기 → 가짜 스크립트 → 이동 → 로딩 화면이 사라질 때까지 대기 → 동작 → Next 개발 표시(`nextjs-portal`)와 상태
  문구 감추기 → 표시 그리기 → JPEG(quality 80, 1440×900, `clip`이면 그 요소만) 캡처. 그다음 `renderManual` → 넘침 검사(어느 쪽
  상자든 `scrollHeight > clientHeight + 1`이면 쪽 id로 throw) → `Page.printToPDF`(`preferCSSPageSize`, `printBackground`,
  머리글·바닥글 없음) → `readPdfLinks`로 확인(쪽 수 = `pageIds.length`, 바깥 링크 없음, `expectedLinks`와 PDF 링크가 같은
  `{page, targetPage}` 묶음, 크기 ≤ 4,000,000) → 통과하면 `manuals/<id>.pdf`에 쓰기. 끝에 unmocked 목록을 출력하고, 하나라도
  있으면 종료 코드 1(쓰기는 함).

- [ ] **Step 1: 실패하는 테스트 작성**
  - `manual-layout.test.mjs`: 절 2개·부록 1개짜리 작은 설명서로 `pageIds`가 `['cover','toc-1','sec-a','sec-b','appx-A-1']`,
    `expectedLinks`에 목차→각 쪽과 [부록]→5쪽, 돌아가기 5쪽→처음 가리킨 절 쪽이 있다. 목차 줄이 40개면 목차가 2쪽이 되고
    그 뒤 쪽 번호가 하나씩 밀린다. 날짜 `new Date(2026, 9, 23)` → `2026년 10월 화면 기준`. `validateManual`이 위 네 경우에 throw.
  - `manual-mock.test.mjs`: `routeMock`이 `/api/manager/office`, `/api/manager/whatever?x=1`, `/api/integrations/x/y`에 `null`이 아니고,
    `/_next/static/a.js`·`/weve-mark.png`에는 `null`. `JSON.stringify(buildMockData(new Date(2026, 9, 23)))` 안의 전화번호 모양
    (`01\d-?\d{3,4}-?\d{4}`)은 모두 `010-0000-`으로 시작하고, 이메일은 모두 `@example.com`. `mockInitScript`의 결과가
    `new Function`으로 문법 오류 없이 만들어진다.
- [ ] **Step 2: 실패 확인** — `npm test` → 새 테스트 FAIL
- [ ] **Step 3: 네 모듈 구현, `office-manual.mjs`에 1장(로그인, 화면 구성, 사용 설명서 받기) 작성, `package.json` 스크립트 추가**
- [ ] **Step 4: 통과 확인** — `npm test` PASS
- [ ] **Step 5: 실제로 만들어 보기** — `npm run manuals -- --only office` → 확인 통과, `manuals/office.pdf` 생김. PDF를 열어 표지·목차·1장
  캡처에 빨간 번호가 제자리에 있고, 목차와 돌아가기 링크가 맞는 쪽으로 가는지 눈으로 본다. 캡처에 'N' 표시나 상태 문구가 없다.
- [ ] **Step 6: 커밋** — `사용 설명서: 만들기 도구(캡처·인쇄·확인)` (`manuals/office.pdf`는 아직 커밋하지 않는다)

### Task 5: 통합 매니저 설명서 전체

**Files:**
- Modify: `scripts/manuals/office-manual.mjs`, `scripts/manuals/mock-data.mjs`
- Create: `manuals/office.pdf`
- Test: `tests/manager-manuals.test.mjs`(저장된 PDF 검사 추가)

**Interfaces:**
- Consumes: Task 4의 내용 파일 모양, `routeMock`, `readPdfLinks`

- [ ] **Step 1: 실패하는 테스트 작성** — `manuals/office.pdf`(그리고 다음 Task를 위해 있으면 `estimate.pdf`)를 읽어: 크기 ≤ 4,000,000,
  `pageCount ≥ 2`, 모든 링크가 `uri === null`이고 `targetPage`가 1…`pageCount` 안에 있다. 파일이 없으면 FAIL.
- [ ] **Step 2: 실패 확인** — `npm test` → 파일 없음으로 FAIL
- [ ] **Step 3: 가짜 데이터 채우기** — 스펙 3.1의 모든 탭이 빈 화면이 아니게: 상담(새·진행·완료, 카카오 상담 포함), 고객, 현장(공사중
  현장 하나는 진행 현황 링크 켜짐·마지막 확인 시각, 할 일·현장 기록 몇 개), 견적 요약, 매출, 재고(부족 하나), 협력업체, 홈페이지
  설정·팝업·프로젝트·상담 설문, 계정 목록, 알림 받을 휴대폰, 휴대폰 로그인 기기, 휴지통. 페이지가 부르는 API 모양은
  `app/manager-weve-7519/page.tsx`와 `progress-manager.ts`·`site-notes-api.ts`·`alert-phones-panel.tsx`·`mobile-devices-panel.tsx`를 보고 맞춘다.
- [ ] **Step 4: 내용 쓰기** — 스펙 3.1의 2~8장과 부록 A-1~A-5. 설명은 해당 화면 코드를 읽고 실제 동작대로 짧게(번호마다 1~2문장).
  부록 내용은 `docs/WEVE_WORKING_RULES.md`의 해당 규칙을 직원 말로 옮긴다(권한 표는 `app/lib/manager-permissions.ts`).
  계정 권한·휴지통 절은 `adminOnly: true`.
- [ ] **Step 5: 만들기** — `npm run manuals -- --only office` → 확인 통과, unmocked 0개. PDF를 처음부터 끝까지 훑어 실제 고객처럼
  보이는 이름·번호가 없는지, 빈 목록 화면이 없는지 본다.
- [ ] **Step 6: 통과 확인** — `npm test` PASS
- [ ] **Step 7: 커밋** — `사용 설명서: 통합 매니저 설명서`

### Task 6: 견적 작업 설명서

**Files:**
- Create: `scripts/manuals/estimate-manual.mjs`, `manuals/estimate.pdf`
- Modify: `scripts/manuals/mock-data.mjs`, `scripts/manuals/build-manuals.mjs`(설명서 목록에 추가), `tests/manager-manuals.test.mjs`(두 파일 모두 필수로)

**Interfaces:**
- Consumes: Task 4·5와 같다. 견적 페이지는 `/manager-weve-7519/estimate?siteId=<가짜 현장 id>`.

- [ ] **Step 1: 테스트 수정** — 저장된 PDF 검사가 `estimate.pdf`도 반드시 읽게 바꾼다 → `npm test` FAIL(파일 없음)
- [ ] **Step 2: 가짜 데이터 채우기** — `/api/manager/estimate`의 GET(`estimates=site`, `part=estimates|materials|materialsMeta` 등)과
  템플릿 API가 내는 모양: 현장 하나에 초안·최종안 두 버전, 최종안에 공사 4~5개·줄 25개 안팎(기본견적 공사 맨 앞), 실행 내역,
  공정 일정 8개 안팎(오늘 기준 이번 달·다음 달, 휴일 하나), 발주서 하나, 추가 사항 몇 줄, 자재 DB 40개 안팎(공통 항목과 그 품명들
  포함), 견적 카테고리 설정, 템플릿 두 개(20평·30평), 협력업체.
- [ ] **Step 3: 내용 쓰기** — 스펙 3.2의 1~8장과 부록 B-1~B-4. 창(템플릿 불러오기, 이 견적을 템플릿으로 저장, 공통 항목 한번에 추가,
  달력 출력)과 메뉴(도구 메뉴, 줄 메뉴, 바 우클릭 메뉴)는 연 상태로 캡처한다.
- [ ] **Step 4: 만들기** — `npm run manuals` (두 권 모두) → 확인 통과, unmocked 0개. 눈으로 훑기(Task 5 Step 5와 같은 기준).
- [ ] **Step 5: 통과 확인** — `npm test` PASS
- [ ] **Step 6: 커밋** — `사용 설명서: 견적 작업 설명서`

### Task 7: 문서, 전체 확인, PR

**Files:**
- Modify: `docs/WEVE_WORKING_RULES.md` ('사용 설명서' 절, 스펙 7장의 다섯 가지)

- [ ] **Step 1: 규칙 문서 추가**
- [ ] **Step 2: 전체 확인** — `npm test`, `npx tsc --noEmit -p .`, `npm run build` 모두 통과
- [ ] **Step 3: 브라우저 확인** — `MANAGER_SESSION_SECRET`을 준 개발 서버(3000)에서 `signSessionToken`으로 만든 진짜 관리자 토큰을
  탭 세션에 넣고, `/api/manager/manual`만 진짜로 보내고 나머지 `/api/manager/*`는 가짜로 답하는 임시 스크립트(스크래치 폴더,
  커밋 안 함)로 두 화면을 연다. 확인: 두 버튼이 예시 화면 자리에 있다, 받은 파일 이름이 `downloadName`이고 바이트가
  `manuals/*.pdf`와 같다, 받는 동안 `받는 중…`, 토큰을 지운 뒤 누르면 401 문구만 뜨고 견적 페이지의 `저장 안 된 변경 있음`과
  고친 내용이 그대로다(Review Focus 4). 크롬 PDF 보기에서 목차 한 줄, [부록] 하나, 돌아가기 하나를 눌러 맞는 쪽으로 가는지 본다.
- [ ] **Step 4: 커밋, 푸시, PR** — `feat/manager-manuals` → `main`. PR 본문에 무엇·왜·확인한 것, 설명서 다시 만드는 법. 끝에
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Auto-fix를 켠다. 대표님이 말하기 전에는 병합하지 않는다.
- [ ] **Step 5: 배포 미리보기 확인** — Vercel 미리보기에서 로그인 후 두 버튼으로 내려받아진다(Review Focus 1).
