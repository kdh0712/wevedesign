# 시공 사례 등록·수정 한 화면 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈페이지 > 'Project 관리'의 두 저장 경로(폴더 업로드, 분류 관리 폼)를 '시공 사례' 한 화면으로 합친다. 새 사례는 숨김으로 만들어지고, 같은 폼에서 정보를 채운 뒤 공개한다.

**Architecture:** 폼 검사·Sanity 패치 만들기와 올리기 판단은 순수 모듈(`app/lib/project-form.ts`, `app/lib/project-upload-rules.ts`)에 두고 Node 테스트로 고정한다. 서버는 폴더 올리기(`bulk-upload`)를 대상 지정 방식으로, 사례 저장(`office` type project)을 검사된 패치로, 사진 한 장 올리기를 자산만 돌려주는 경로(`project-asset`)로 바꾼다. 화면은 `page.tsx`에서 새 파일(`project-workspace.tsx` 등)로 뺀다. 홈페이지는 평수 '0' 표시와 옛 주소 404만 고친다.

**Tech Stack:** Next.js App Router(TypeScript), Sanity(`managerClient`, GROQ), `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-21-portfolio-project-editor-design.md` (반드시 함께 읽는다)

## Global Constraints

- 작업 규칙 `docs/WEVE_WORKING_RULES.md`: 사진은 Sanity 자산 흐름 그대로(Firebase Storage 아님), Studio를 평소 업무에 쓰게 하지 않는다, 올린 뒤 폼을 비운다, 대표 사진 선택과 16:9 중심점 조정은 만들기·수정 모두에 있어야 한다, 설명 줄바꿈 유지, 홈페이지 모양은 바꾸지 않는다.
- 모든 manager API는 `requireManager({ anyOf: ['portfolio'] })`. Sanity 쓰기 전에 문서 종류를 확인한다(`isSanityIdWritable`).
- Sanity 스키마(`sanity/schema.ts`)는 바꾸지 않는다. `siteType`, `mainImagePosition`, `gallery` 필드와 기존 값은 남긴다(폼에서만 안 씀).
- 블로그 주소는 `http:`/`https:`만 허용한다(그 밖의 스킴, 예: `javascript:`는 거절).
- 화면 색은 관리 화면 설계 체계(청회색·청록). 주요 버튼 `#273541`, 보조 버튼 흰 바탕 테두리, 보조 글씨 `#60717d`. 새로 쓰는 글씨에 `#38a9bd`·흐린 회색을 쓰지 않는다.
- 문구는 스펙의 한국어 문구를 쓴다. 커밋 메시지는 한국어, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `page.tsx`는 CRLF·LF가 섞여 저장돼 있다. 고친 뒤에는 기준 커밋의 원본 + 줄 끝 무시 diff(`git diff --ignore-cr-at-eol` → `git apply --ignore-whitespace`)로 다시 만들어 PR에 실제 바뀐 줄만 남긴다(`app/api/manager/office/route.ts`도 같음).

## Review Focus

1. **대표 사진이 없는 폴더, 중간에 실패한 폴더**: 그 폴더만 '건너뜀'/'실패'(이유 포함), 다른 폴더는 계속 처리. → Task 2(route가 폴더마다 try/catch, 결과 요약 문구는 `uploadSummary` 테스트).
2. **옛 낱장 사진만 있는 사례**: [묶음으로 바꾸기]를 누르지 않고 저장하면 `gallery`는 그대로 남고 지워지지 않는다. → Task 1 테스트(묶음이 비면 `gallery`를 unset하지 않음).
3. **블로그 주소 입력**: `blog.naver.com/x` → `https://blog.naver.com/x`, `javascript:alert(1)`·`ftp://x` → 거절. → Task 1 테스트.
4. **저장하지 않은 변경**: 다른 사례를 고르거나 [사진 다시 올리기]·[홈페이지에 공개]를 누를 때 바뀐 내용이 있으면 묻거나 먼저 저장하라고 알린다. → Task 6 단계(순수 `isProjectFormDirty`, Task 1 테스트).
5. **공개 조건을 화면이 놓친 경우**: 저장된 사례에 대표 사진·분류가 없으면 서버가 공개를 거절한다. → Task 3(서버가 저장된 값으로 `publishBlockReason` 검사), Task 1 테스트.

---

## File Structure

| 파일 | 역할 |
|---|---|
| `app/lib/project-form.ts` (새) | 순수: 폼 검사, Sanity 패치(set/unset), 블로그 주소, 공개 조건, 옛 사진 → 묶음, 같은 이름, 폼 변경 여부 |
| `tests/project-form.test.mjs` (새) | 위 규칙 |
| `app/lib/project-upload-rules.ts` (새) | 순수: 폴더별 대상 읽기, 새 사례 필드, 사진 바꾸기 패치, 같은 이름 사례, 새 id, 결과 문구 |
| `tests/project-upload-rules.test.mjs` (새) | 위 규칙 |
| `app/api/manager/bulk-upload/route.ts` | 대상 지정 방식, 새 사례 숨김·무작위 id, 폴더마다 실패 처리 |
| `app/api/manager/project-asset/route.ts` (새) | 사진 한 장을 Sanity 자산으로 올리고 id·url만 돌려줌 |
| `app/api/manager/project-main-image/route.ts` | 삭제(새 화면은 쓰지 않음) |
| `app/api/manager/office/route.ts` | 사례 저장은 `buildProjectPatch`, 공개/숨기기 동작, 사례 조회에 `_key`·사진 순서·시공 전 사진 추가 |
| `app/lib/seo-utils.ts` | `findProjectByOldSlug` |
| `tests/seo-utils.test.mjs` (새, 없으면) | 위 함수 |
| `app/portfolio/[slug]/page.tsx` | 옛 주소 → 정식 주소 308 |
| `app/page.tsx` | 평수 0 표시 막기(3곳) |
| `scripts/upload-project-folders.mjs` | 같은 규칙 |
| `app/manager-weve-7519/project-upload-files.ts` (새) | `page.tsx`에서 옮김: 폴더 미리보기, 끌어놓기 읽기, 압축, 업로드 상수 |
| `app/manager-weve-7519/project-workspace.tsx` (새) | 목록 + 편집 폼 + 공개/숨기기 |
| `app/manager-weve-7519/project-upload.tsx` (새) | 새 사례 올리기(폴더별 대상 고르기)와 [사진 다시 올리기] |
| `app/manager-weve-7519/page.tsx` | 옛 두 패널·상태·함수 제거, 새 화면 연결, 탭 이름 '시공 사례', 이 탭에서 '홈페이지 관리' 패널 숨김 |
| `tests/manager-api-matrix.mjs` | `project-main-image` → `project-asset` |
| `docs/WEVE_WORKING_RULES.md` | 스펙 8절 |

---

### Task 1: 폼 규칙 (`project-form.ts`)

**Files:** Create `app/lib/project-form.ts`, `tests/project-form.test.mjs`

**Interfaces (Produces, all exported, no imports):**
```ts
export type EditableImage = { key: string; assetId: string; url?: string; alt?: string; caption?: string };
export type EditableGroup = { key: string; title: string; roomType?: string; images: EditableImage[] };
export type ProjectFormInput = {
  title: string; categoryId: string; location: string; area: string; year: string; materials: string;
  blogUrl: string; description: string; displayOrder: string; featured: boolean;
  mainImageAssetId: string; mainImagePositionX: number; mainImagePositionY: number;
  beforeImageAssetId: string;            // '' = 시공 전 사진 없음(빼기)
  galleryGroups: EditableGroup[];
};
export type ProjectPatch = { set: Record<string, unknown>; unset: string[] };
export function normalizeBlogUrl(value: string): string | null;          // '' → '', 잘못되면 null
export function isSanityImageAssetId(value: string): boolean;            // /^image-[A-Za-z0-9]+-\d+x\d+-[a-z0-9]+$/
export function buildProjectPatch(input: ProjectFormInput): { ok: true; patch: ProjectPatch } | { ok: false; error: string };
export function publishBlockReason(project: { title?: string; categoryId?: string; mainImageAssetId?: string }): string | null;
export function legacyGalleryToGroup(images: EditableImage[]): EditableGroup;   // key 'group-legacy', title '사진'
export function hasDuplicateTitle(title: string, projectId: string, projects: Array<{ _id: string; title?: string }>): boolean;
export function isProjectFormDirty(initial: ProjectFormInput, current: ProjectFormInput): boolean;  // JSON 비교, 문자열 앞뒤 공백 무시
```

- [ ] **Step 1: Failing tests** — `tests/project-form.test.mjs`에 아래를 쓴다(값은 그대로).
  - `normalizeBlogUrl`: `''`→`''`, `'blog.naver.com/weve'`→`'https://blog.naver.com/weve'`, `'http://a.kr/x'`→그대로, `' https://a.kr '`→`'https://a.kr'`, `'javascript:alert(1)'`→`null`, `'ftp://a.kr'`→`null`, `'not a url with space'`→`null`.
  - `buildProjectPatch` 정상 입력(제목 '평촌 34평', 분류 'cat-1', 평수 '34', 순서 '', 연도 '2026', 블로그 'blog.naver.com/x', 설명 ' 첫 줄\n둘째 줄 ', 묶음 1개(사진 2장), 대표 자산 'image-abc-800x600-jpg', 시공 전 ''):
    - `set.title === '평촌 34평'`, `set.category` = `{ _type: 'reference', _ref: 'cat-1' }`, `set.area === 34`, `set.year === '2026'`, `set.blogUrl === 'https://blog.naver.com/x'`, `set.description === '첫 줄\n둘째 줄'`, `set.mainImage` = `{ _type: 'image', asset: { _type: 'reference', _ref: 'image-abc-800x600-jpg' }, alt: '평촌 34평 대표 사진' }`, `set.galleryGroups[0]` = `{ _type: 'object', _key: 'g1', title: '거실', roomType: '거실', displayOrder: 1, images: [{ _type: 'image', _key: 'i1', asset: {_type:'reference', _ref: 'image-…'}, alt: '평촌 34평 거실', caption: …, displayOrder: 1 }, …] }`.
    - `unset`에 `'displayOrder'`, `'beforeImage'`, `'gallery'`(묶음이 있으므로)가 있고 `'area'`는 없다.
  - 빈칸: `area: ''` → `unset`에 `'area'`, `set`에 `area` 없음. `area: '0'` → 오류 `'평수는 0보다 큰 숫자로 입력해 주세요.'`. `displayOrder: '0'` → `set.displayOrder === 0`. `displayOrder: '1.5'` → 오류 `'보이는 순서는 0 이상의 정수로 입력해 주세요.'`.
  - 오류 문구: 제목 공백 → `'이름을 입력해 주세요.'`, 81자 → `'이름은 80자까지 입력할 수 있습니다.'`, 분류 없음 → `'공간 분류를 골라 주세요.'`, 연도 `'26'` → `'시공 연도는 4자리로 입력해 주세요.'`, 블로그 `'javascript:x'` → `'블로그 주소를 확인해 주세요.'`, 묶음 이름 21자 → `'묶음 이름은 1~20자로 입력해 주세요.'`, 자산 id `'abc'` → `'사진 정보가 올바르지 않습니다. 새로고침한 뒤 다시 시도해 주세요.'`.
  - 옛 사진만 있는 사례(Review Focus 2): `galleryGroups: []` → `set.galleryGroups`는 `[]`, `unset`에 `'gallery'` **없음**.
  - 대표 자산 `''` → `set.mainImage` 없음, `unset`에 `'mainImage'` 없음(대표 사진은 지우지 않음).
  - 중심점: X `-5` → 0, Y `120` → 100, `NaN` → 50.
  - `publishBlockReason`: 셋 다 있으면 `null`; 제목 없으면 `'이름을 입력해 주세요.'`; 분류 없으면 `'공간 분류를 골라 주세요.'`; 대표 없으면 `'대표 사진을 골라 주세요.'`.
  - `legacyGalleryToGroup([a,b])` → `{ key: 'group-legacy', title: '사진', roomType: '사진', images: [a,b] }`(순서 유지).
  - `hasDuplicateTitle(' 평촌 ', 'p1', [{_id:'p1',title:'평촌'},{_id:'p2',title:'평촌'}])` → true, 자기 자신만 같으면 false.
  - `isProjectFormDirty`: 제목 `' 평촌 '` vs `'평촌'` → false; 묶음 순서 바뀜 → true; 사진 한 장 빠짐 → true.
- [ ] **Step 2:** `node --test tests/project-form.test.mjs` → FAIL(모듈 없음).
- [ ] **Step 3: Implement.** 정해지지 않은 규칙: 문자열은 앞뒤 공백 제거(설명은 줄바꿈 유지하고 앞뒤만). 빈 `location`·`year`·`materials`·`blogUrl`·`description`·`area`·`displayOrder`는 `unset`. 사진 `alt`는 `'{이름} {묶음 이름}'`, 묶음과 사진의 `displayOrder`는 배열 순서(1부터). 묶음 `roomType`이 없으면 이름과 같게.
- [ ] **Step 4:** 위 테스트 PASS, `npm test` 0 fail.
- [ ] **Step 5: Commit** `"시공 사례 1: 폼 검사와 저장 패치 규칙"` (설계 문서와 이 계획도 함께 추가)

---

### Task 2: 폴더 올리기 규칙과 경로

**Files:** Create `app/lib/project-upload-rules.ts`, `tests/project-upload-rules.test.mjs`; Rewrite `app/api/manager/bulk-upload/route.ts`

**Interfaces (Produces):**
```ts
export type UploadTarget = { mode: 'new' } | { mode: 'replace'; projectId: string };
export function parseUploadTargets(raw: unknown): Map<string, UploadTarget>;   // JSON 문자열 {폴더이름: 'new' | 'replace:<id>'}, 잘못된 값은 버림
export function newProjectId(randomHex: string): string;                       // 'project-' + 24 hex, 아니면 throw
export function newProjectFields(input: { title: string; categoryRef: string; mainAssetId: string; beforeAssetId: string | null; galleryGroups: unknown[] }): Record<string, unknown>;
export function replacePhotoPatch(input: { title: string; mainAssetId: string; beforeAssetId: string | null; galleryGroups: unknown[] }): { set: Record<string, unknown>; unset: string[] };
export function sameTitleProjects<P extends { _id: string; title?: string }>(folderTitle: string, projects: readonly P[]): P[];
export type UploadResult = { projectTitle: string; status: 'created' | 'replaced' | 'skipped' | 'failed'; projectId?: string; reason?: string; imageCount?: number; groupCount?: number };
export function uploadSummary(results: UploadResult[]): string;                // '새로 만듦 2 · 사진 바꿈 0 · 건너뜀 1'(+ ' · 실패 N' 있을 때만)
```
API: `POST /api/manager/bulk-upload` multipart `files[]`, `paths` (JSON), `targets` (JSON), `categoryId` 또는 `category`(새 사례가 있을 때만 필수) → `{ results: UploadResult[] }`.

- [ ] **Step 1: Failing tests**
  - `parseUploadTargets('{"A":"new","B":"replace:project-abc","C":"replace:","D":"x"}')` → A new, B replace `project-abc`, C·D 없음. 문자열이 아니거나 JSON이 아니면 빈 Map.
  - `newProjectId('0123456789abcdef01234567')` → `'project-0123456789abcdef01234567'`; `'xyz'` → throw.
  - `newProjectFields` → `isVisible: false`, `featured: false`, `title`, `category` 참조, `mainImage.alt === '{이름} 대표 사진'`, `galleryGroups` 그대로, `beforeImage`는 자산이 있을 때만(`alt '{이름} 시공 전 사진'`).
  - `replacePhotoPatch` → `set`의 키는 정확히 `['galleryGroups', 'mainImage', 'mainImagePositionX', 'mainImagePositionY']`(+ 시공 전 자산이 있으면 `'beforeImage'`), X/Y는 50, `unset`은 `['gallery']`. **`title`, `isVisible`, `featured`, `category`, `location`, `area`, `description`, `year`, `materials`, `blogUrl`, `displayOrder`가 없다**는 것을 키 목록으로 단언.
  - `sameTitleProjects(' 평촌 ', [{_id:'a',title:'평촌'},{_id:'b',title:'산본'},{_id:'c',title:'평촌'}])` → a, c.
  - `uploadSummary` → 실패가 없으면 `'새로 만듦 1 · 사진 바꿈 1 · 건너뜀 0'`, 있으면 끝에 `' · 실패 1'`.
- [ ] **Step 2:** FAIL 확인.
- [ ] **Step 3: Implement rules**, 그다음 route:
  - 폼 필드 `siteType`, `location`, `description`, `area`, `featured`는 더 읽지 않는다.
  - 폴더 이름 → 대상: `targets`에 없으면 그 폴더는 `skipped`(`'올릴 방법이 정해지지 않았습니다.'`).
  - `new`: 분류 필요(`categoryId` 또는 `getOrCreateCategory(category)`, 둘 다 없으면 그 폴더 `skipped` `'공간 분류가 필요합니다.'`), id `newProjectId(randomBytes(12).toString('hex'))`, `create`.
  - `replace`: `isSanityIdWritable(projectId, 'project')`가 아니면 `failed` `'바꿀 시공 사례를 찾을 수 없습니다.'`; 그 사례의 `title`을 읽어 alt에 쓰고 `patch(id).set(...).unset(...)`; 초안(`drafts.<id>`)이 있으면 같은 패치.
  - 대표 사진이 없으면 `skipped` `'대표 이미지가 없습니다.'`(지금과 같음).
  - 폴더마다 try/catch: 실패하면 `failed`와 짧은 이유(오류 메시지)를 남기고 다음 폴더로. 응답은 항상 200 `{ results }`(요청 전체가 잘못된 경우만 400/500).
  - 사진 파일 해석(`parseFile`, 묶음 만들기)은 지금 그대로.
- [ ] **Step 4:** 테스트 PASS, `npm test`, `npx tsc --noEmit -p .`.
- [ ] **Step 5: Commit** `"시공 사례 2: 폴더 올리기는 대상을 지정하고 새 사례는 숨김·무작위 id로"`

---

### Task 3: 사례 저장·공개·사진 올리기 서버

**Files:** Modify `app/api/manager/office/route.ts`; Create `app/api/manager/project-asset/route.ts`; Delete `app/api/manager/project-main-image/route.ts`; Modify `tests/manager-api-matrix.mjs`

**Interfaces:**
- `POST /api/manager/office` `{ type: 'project', id, data: ProjectFormInput }` → `buildProjectPatch`; 오류면 400 `{ error }`; 아니면 `patch(id).set({ ...set, updatedAt }).unset(unset)`(초안 있으면 같이) → `{ record }`.
- `POST /api/manager/office` `{ type: 'project', id, action: 'setVisibility', isVisible: boolean }` → 공개하려면 저장된 사례를 읽어(`{ title, "categoryId": category._ref, "mainImageAssetId": mainImage.asset._ref }`) `publishBlockReason`이 있으면 400 → `patch(id).set({ isVisible, updatedAt })`(초안도) → `{ ok: true, isVisible }`.
- `POST /api/manager/project-asset` multipart `file` → 이미지 형식(jpeg/png/webp/gif/avif)·크기(4,000,000바이트 이하) 확인 → `managerClient.assets.upload('image', …)` → `{ assetId, url }`. 사례 문서는 고치지 않는다.
- 사무 GET의 `projects` 조회(관리자용 `query`만): `galleryGroups[] { _key, roomType, title, displayOrder, images[] { _key, "assetId": asset->_id, "url": asset->url, alt, caption, displayOrder } }`, `"beforeImage": beforeImage.asset->url`, `"beforeImageAssetId": beforeImage.asset->_id`. `gallery[]`에도 `_key`.

- [ ] **Step 1:** 순수 부분은 Task 1에서 테스트됨. 여기서는 `tests/manager-api-matrix.mjs`의 `project-main-image` 줄을 `project-asset`으로 바꾸고, `{type:'project', id:'project-matrix-missing', action:'setVisibility', isVisible:true}`를 `portfolio` 세션(401/403 아님)·`consult` 세션(403)으로 더한다.
- [ ] **Step 2: Implement.** 사무 POST의 project 분기는 `cleanData` 대신 `body.data`를 `buildProjectPatch`에 넣는다(검사 함수가 타입을 맞춤). id 없는 생성 분기는 그대로 둔다(화면은 쓰지 않음).
- [ ] **Step 3:** `npx tsc --noEmit -p .` 통과, `npm test` 0 fail, `node --check tests/manager-api-matrix.mjs`.
- [ ] **Step 4:** office route 줄 끝 복원(Global Constraints).
- [ ] **Step 5: Commit** `"시공 사례 3: 사례 저장은 검사된 패치로, 공개는 서버가 조건 확인, 사진은 자산만 올리는 경로로"`

---

### Task 4: 홈페이지 — 평수 0, 옛 주소

**Files:** Modify `app/lib/seo-utils.ts`, `app/portfolio/[slug]/page.tsx`, `app/page.tsx`; Test `tests/seo-utils.test.mjs`(있으면 거기에 추가)

**Interfaces:** `export function findProjectByOldSlug<P extends { id?: string; _id?: string }>(slug: string, projects: readonly P[]): P | null` — 주소 마지막 `-` 뒤가 8자 영숫자이고, `shortId(p.id || p._id)`가 그것과 같은 사례가 정확히 하나면 그 사례.

- [ ] **Step 1: Failing test** — `findProjectByOldSlug('아파트-예전이름-abcd1234', [{id:'project-xx-abcd1234'}])` → 그 사례; 같은 끝 8자가 둘 → null; 끝이 8자가 아니면 null; 대문자 섞인 id(`'project-XXABCD1234'`) → 소문자 비교로 찾음.
- [ ] **Step 2:** FAIL 확인. **Step 3:** 구현.
- [ ] **Step 4:** 상세 페이지: `getProjectBySlug`로 못 찾으면 `getProjects()`에서 `findProjectByOldSlug` → 있으면 `permanentRedirect(projectPath(project))`(308), 없으면 `notFound()`. `generateMetadata`도 같은 사례로 정식 주소 메타데이터.
- [ ] **Step 5:** 평수: `app/page.tsx`의 `{project.area && …}` 3곳을 `{Number(project.area) > 0 && …}`로, 상세 페이지 `about`의 `project.area && …`도 같게. 모양·문구는 그대로. (정렬: 운영 데이터 확인 결과 GROQ `displayOrder asc`는 값 없는 사례를 이미 뒤로 보내므로 조회문은 바꾸지 않는다.)
- [ ] **Step 6:** 테스트 PASS, `npm test`. **Commit** `"시공 사례 4: 평수 0 표시 막기, 이름·분류가 바뀐 사례의 옛 주소는 정식 주소로 308"`

---

### Task 5: CLI 스크립트

**Files:** Modify `scripts/upload-project-folders.mjs`

- [ ] **Step 1:** 스크립트가 `../app/lib/project-upload-rules.ts`의 `newProjectId`, `newProjectFields`, `replacePhotoPatch`, `sameTitleProjects`를 쓰게 한다(Node 24는 `.ts`를 그대로 불러옴; `package.json` 스크립트 그대로).
  - 같은 이름 사례가 정확히 1개 → 사진 바꾸기(`replacePhotoPatch`), 0개 → 새로 만들기(`newProjectFields`, id `newProjectId(randomBytes)`), 2개 이상 → 건너뛰고 경고.
  - 새 사례는 기본 숨김: `visible` 기본값 `false`, `--visible`로 공개(기존 `--hidden`은 받아도 무시). `--featured`는 새 사례에만.
  - 새 분류 slug는 관리 화면과 같은 `slugValue` 규칙(스크립트 안에 같은 정규식으로; `_utils.ts`는 서버 모듈이라 불러오지 않음).
- [ ] **Step 2:** `node scripts/upload-project-folders.mjs --dry-run <빈 임시 폴더>`가 오류 없이 끝나는지 확인(토큰 불필요).
- [ ] **Step 3: Commit** `"시공 사례 5: 업로드 스크립트도 같은 규칙(새 사례 숨김, 다시 올리면 사진만)"`

---

### Task 6: 화면 — 목록과 편집 폼

**Files:** Create `app/manager-weve-7519/project-upload-files.ts`, `app/manager-weve-7519/project-workspace.tsx`; Modify `app/manager-weve-7519/page.tsx`(옮긴 함수 import로 교체)

**Interfaces:**
- `project-upload-files.ts`: `page.tsx`의 `PreviewProject`, `UPLOAD_PRESETS`, `MAX_UPLOAD_BYTES`, `buildPreview`, `filesFromDrop`(와 `readDropEntry`, `fileWithRelativePath`, `roomNameFromFile`), `prepareUploadFiles`, `compressFiles`, `compressImage`, `toJpegFileName`을 그대로 옮겨 export.
- `project-workspace.tsx`: `export function ProjectWorkspace(props)`:
```ts
type ProjectWorkspaceProps = {
  projects: ManagedProject[]; categories: CategoryOption[];
  authHeaders: () => Record<string, string>;
  reload: () => Promise<void>;                 // page의 loadOfficeData(password, { silent: true })
  setStatus: (t: string) => void; setError: (t: string) => void;
};
```
  `ManagedProject`·`CategoryOption` 타입은 `app/manager-weve-7519/project-types.ts`(새)로 옮겨 page와 공유한다(Task 3의 조회 필드 `_key`, 사진 `displayOrder`, `beforeImage`, `beforeImageAssetId` 포함).

- [ ] **Step 1: 목록(왼쪽)** — [+ 새 시공 사례 올리기](Task 7의 올리기 패널을 연다), 검색(이름·지역), 분류 select, [전체|공개|숨김]. 줄: 작은 대표 사진, 이름, `분류 · 지역`, 상태(공개/숨김, 메인이면 '메인'). 정렬: `featured` 먼저 → `displayOrder`(없으면 뒤) → 최근.
- [ ] **Step 2: 편집 폼(오른쪽)** — 스펙 3.3 그대로. 상태는 `ProjectFormInput` 하나로 들고, 고른 사례에서 만든 처음 값과 `isProjectFormDirty`로 비교한다.
  - 이름(같은 이름이 있으면 칸 아래 `같은 이름의 시공 사례가 있습니다.` 안내, 막지 않음) · 공간 분류(select 또는 새 분류 입력 → 저장 때 `office` type `category`로 먼저 만듦) · 지역 · 평수 · 시공 연도 · 주요 자재 · 블로그 링크 · 짧은 설명(줄바꿈) · 보이는 순서(`비우면 순서 없음, 순서 있는 사례 뒤`) · ☐ 메인에도 보이기.
  - '대표 사진 표시 위치' 드롭다운은 만들지 않는다(효과가 없었음, 스펙 6절).
  - 대표 사진: [상세 사진 중 고르기](묶음 사진·옛 사진·지금 대표) / [새 사진 올리기](`compressImage` → `/api/manager/project-asset` → 폼의 `mainImageAssetId`·미리보기 url만 바꿈). 미리보기 두 틀(4:3 목록 카드, 16:9 사례 창)을 같은 `object-position: X% Y%`로, 틀을 누르면 그 자리로 중심점(정수). X/Y 숫자 칸도 둔다.
  - 시공 전 사진: 그림 + [바꾸기](같은 자산 경로) + [빼기](`beforeImageAssetId: ''`), 없으면 [올리기].
  - 공간별 사진: 묶음마다 이름 칸(1~20자), [↑][↓], 사진 썸네일마다 [빼기]. 옛 낱장 사진만 있는 사례(묶음 0, `gallery` 있음)는 `옛 방식 사진 N장 (묶음 없음)` 읽기 전용 + [묶음으로 바꾸기](`legacyGalleryToGroup`) — 바꾸기 전에는 빼기 버튼이 없다.
  - [저장]: 새 분류 먼저 → `POST /api/manager/office { type: 'project', id, data: form }` → 성공하면 `reload()`, 처음 값 = 지금 값, 상태 `'시공 사례를 저장했습니다.'`.
  - 공개/숨기기 버튼(머리 오른쪽): 숨김이면 [홈페이지에 공개], 공개면 [숨기기]. 변경이 있으면 `'저장한 뒤에 공개할 수 있습니다.'`로 막음. `publishBlockReason`(지금 폼 값 기준)이 있으면 그 문구. 요청은 `{ type:'project', id, action:'setVisibility', isVisible }`. 숨김 사례 머리 아래 `아직 홈페이지에 보이지 않습니다. 정보를 채운 뒤 공개하세요.`
  - 다른 사례를 고를 때 변경이 있으면 `confirm('저장하지 않은 변경이 있습니다. 버리고 넘어갈까요?')`.
  - 저장·공개·사진 올리기 중에는 버튼 비활성 + 진행 중 ref로 두 번 누르기 막기.
- [ ] **Step 3:** `page.tsx`의 업로드 보조 함수들을 `project-upload-files.ts` import로 바꾸고(다른 곳에서 쓰는지 grep), 타입을 `project-types.ts`에서 import. 이 Task에서는 아직 옛 패널을 그대로 두고 `ProjectWorkspace`는 Task 7에서 연결한다(빌드만 통과).
- [ ] **Step 4:** `npx tsc --noEmit -p .`, `npm test`, `npm run build`.
- [ ] **Step 5: Commit** `"시공 사례 6: 목록과 편집 폼(대표 사진·중심점·시공 전 사진·묶음·공개)"`

---

### Task 7: 화면 — 올리기와 연결

**Files:** Create `app/manager-weve-7519/project-upload.tsx`; Modify `project-workspace.tsx`, `page.tsx`

**Interfaces:** `export function ProjectUploadPanel(props: { projects: ManagedProject[]; categories: CategoryOption[]; authHeaders; replaceTarget?: { projectId: string; title: string }; onDone: (results: UploadResult[]) => void; onCancel: () => void; setStatus; setError })`.

- [ ] **Step 1: 새 시공 사례 올리기** (스펙 3.2): 공간 분류(select 또는 새 분류) · 폴더 고르기(`webkitdirectory`, 여러 개, 끌어놓기는 `filesFromDrop`) · 폴더마다 `이름 · 사진 N장 (대표 1 · 시공 전 1)` · 파일 이름 규칙 안내.
  - 폴더마다 `sameTitleProjects`가 있으면 `같은 이름의 시공 사례가 있습니다` + 라디오 [그 사례의 사진 바꾸기](여럿이면 select로 어느 사례인지) / [새 사례로 만들기]. **고르기 전에는 [올리기]가 꺼져 있다.** 같은 이름이 없으면 자동으로 `new`.
  - 새 사례가 하나라도 있으면 분류가 필수(`'공간 분류를 골라 주세요.'`).
  - 보내기: `prepareUploadFiles` → 용량 검사(`MAX_UPLOAD_BYTES`, 지금 문구) → `files`, `paths`, `targets`(폴더→`'new'|'replace:<id>'`), 분류 → `/api/manager/bulk-upload`.
  - 결과: `uploadSummary` + 실패·건너뜀 줄마다 이유. 새로 만든 사례가 정확히 하나면 그 사례를 편집 폼으로 연다; 여럿이면 목록 필터를 '숨김'으로. 폼을 비운다(작업 규칙).
- [ ] **Step 2: [사진 다시 올리기]** (편집 폼의 공간별 사진 머리): 같은 패널을 `replaceTarget`으로 열어 폴더 하나만 받고, 대상은 항상 `replace:<그 사례 id>`(분류 칸 없음). 폼에 저장하지 않은 변경이 있으면 먼저 저장하라고 막는다. 끝나면 `reload()` 후 같은 사례를 다시 연다.
- [ ] **Step 3: page.tsx 연결**
  - 홈페이지 탭 버튼 'Project 관리' → **'시공 사례'**.
  - `homepageTab === 'projects'`이면 '홈페이지 관리' 패널(과 '홈페이지 설정 저장' 버튼)을 그리지 않고 `<ProjectWorkspace …/>`만 그린다.
  - 옛 '현장 폴더 한번에 업로드'·'Project 분류 관리' 패널, 그 상태(`category`, `newCategory`, `uploadSiteType`, `uploadLocation`, `uploadArea`, `uploadDescription`, `featured`, `files`, `uploadInputKey`, `selectedProjectId`, `projectFilterCategoryId`, `project*` 폼 상태, `uploadingMainImage`, 업로드 결과 `results` 표시)와 함수(`uploadProjects`, `selectProjectForEdit`, `updateProjectImageFocus`, `saveProjectMainImage`, `saveProjectClassification`, `getProjectImageOptions`, `imageObjectPosition` 중 다른 곳에서 안 쓰는 것)를 지운다. 쓰는 곳이 남으면 옮긴 모듈에서 import.
- [ ] **Step 4:** `npx tsc --noEmit -p .`, `npm test`, `npm run build`, page.tsx 줄 끝 복원. 가짜 데이터로 `ProjectWorkspace`만 그리는 임시 페이지(커밋하지 않음)에서 목록·폼·묶음 바꾸기·옛 사진 바꾸기·공개 버튼 상태를 눌러 보고 지운다.
- [ ] **Step 5: Commit** `"시공 사례 7: 새 시공 사례 올리기(폴더별 대상 고르기)와 사진 다시 올리기, 한 화면으로 연결"`

---

### Task 8: 작업 규칙 문서와 마무리

**Files:** Modify `docs/WEVE_WORKING_RULES.md` (Portfolio 절)

- [ ] **Step 1:** 스펙 8절 + 이번 결정: 새 사례는 숨김·무작위 id, 같은 이름 폴더는 올리기 전에 직원이 대상을 고름(이름으로 저절로 덮어쓰지 않음), 사진 바꾸기는 사진만 바꾸고 공개 여부·메인·이름·직접 넣은 정보 유지(대표가 바뀌면 중심점 50/50, 옛 `gallery` 지움), 비운 숫자는 '없음'(저장된 0은 그대로), 블로그 주소는 http/https만(https 보정), 공개는 서버가 이름·분류·대표 사진 확인, 옛 주소는 정식 주소로 308, 사진 한 장은 `project-asset`으로 자산만 올리고 사례에는 [저장] 때 붙음. "Keep representative-image selection and 16:9 crop-position controls…"는 그대로.
- [ ] **Step 2:** `npm test` 전부 통과, `npm run build` 통과.
- [ ] **Step 3: Commit** `"시공 사례 8: 작업 규칙 문서"`
- [ ] **Step 4: PR 확인 목록**(미리보기에서 사람이): 폴더 하나 올리기 → 홈페이지에 안 보임 → 정보 채워 공개 → 이름 바꾸기 → 옛 주소 이동 → [사진 다시 올리기]로 원래 폴더 → 이름·공개·메인 유지 → 같은 이름 폴더를 새로 올릴 때 묻는지 → 옛 방식 사진 사례를 묶음으로 바꿔 홈페이지 사진이 그대로인지 → 평수를 비운 사례에 '0'이 안 보이는지.
