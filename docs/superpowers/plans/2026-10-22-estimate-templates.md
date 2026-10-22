# 견적 템플릿 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 평형별 견적 템플릿을 만들어 두고, 현장 견적에 카테고리·공간을 골라 최신 자재 DB 단가로 불러온다.

**Architecture:** 템플릿 규칙(거르기·단가 찾기·검사)은 화면·서버 없는 순수 모듈 `app/lib/estimate-templates.ts`에 둔다.
서버는 Firestore `estimateTemplates`를 서비스 계정으로 읽고 쓰는 얇은 저장 모듈과 기존 견적 API의 새 동작들이다.
화면은 템플릿 관리 창과 불러오기 창을 새 파일로 만들고, 거대한 `estimate/page.tsx`에는 연결 코드만 더한다.

**Tech Stack:** Next.js app router, TypeScript, Firestore REST (`app/api/manager/firestore.ts`), Tailwind, node:test.

**Spec:** `docs/superpowers/specs/2026-10-22-estimate-templates-design.md`

## Global Constraints

- 화면 문구는 한국어. 문구는 스펙의 표현을 그대로 쓴다: "템플릿 관리", "템플릿 불러오기", "DB에서 추가",
  "기존 견적에서 복사", "DB에서 못 찾음", "(카테고리 없음)", "(공간 없음)", "기존 항목 지우고 바꾸기", "뒤에 덧붙이기", "취소".
- 템플릿 이름: 앞뒤 공백 제거 후 1~60자, 다른 템플릿과 겹치지 않음(공백 전부·대소문자 무시).
- 템플릿 줄은 최대 2,000줄.
- 저장소는 Firestore 컬렉션 `estimateTemplates`만. 서버 서비스 계정으로만 접근(`idToken` 넘기지 않음). Sanity 지원 없음.
  `shouldUseFirestoreErp() && canUseFirestoreOnServer()`가 아니면 템플릿 API는 400
  "템플릿은 Firestore에서만 쓸 수 있어요."
- 모든 템플릿 API는 `requireManager(request, { anyOf: ['estimates'] })`.
- 템플릿 저장은 `updateTime` 조건부(고칠 때) / `exists: false`(새로 만들 때). 충돌은 409 `{ conflict: 'changed' | 'deleted' }`.
- 테스트는 `npm test` (`node --test tests/*.test.mjs`); 테스트는 `.ts`를 직접 import 하므로 `app/lib/estimate-templates.ts`는
  다른 파일을 import 하지 않는다.
- `estimate/page.tsx`, `app/api/manager/estimate/route.ts`는 줄바꿈(CRLF/LF)이 섞여 있을 수 있다. 고친 뒤
  `git diff --stat`의 줄 수가 실제 변경과 맞는지 보고, 파일 전체가 바뀌었으면 원래 줄바꿈을 되살린 다음 커밋한다.
- `.claude/launch.json`은 미리보기에만 쓰고 커밋하지 않는다.
- 커밋 메시지는 한국어, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. 같은 템플릿을 두 번 불러오거나 덧붙이기 → 줄 id가 기존 줄과 겹치면 줄 편집·삭제가 엉킨다. 새 id가 모두 달라야 한다 (Task 1 테스트).
2. 품명·규격·단위가 같은 DB 항목이 둘 이상 → 아무거나 고르면 엉뚱한 단가가 들어간다. 못 찾음이어야 한다 (Task 1 테스트).
3. 자재 DB 버전 문서가 없거나(`null`) 브라우저 저장 자재가 비어 있음 → "최신"으로 착각하면 안 되고 전체를 새로 읽어야 한다 (Task 3 테스트).
4. 새 견적 버전에 자동으로 들어가는 제목 줄(품명만 있고 단가 0) → 빈 견적이 아니므로 바꾸기/덧붙이기를 물어야 한다. 품명·규격·비고가 모두 비고 단가가 0인 줄만 빈 줄이다 (Task 1 테스트).
5. 템플릿 고친 직후 다른 직원이 같은 템플릿 저장 → 덮어쓰지 않고 409 (Task 2 확인 단계).

---

### Task 1: 템플릿 규칙 순수 모듈

**Files:**
- Create: `app/lib/estimate-templates.ts`
- Test: `tests/estimate-templates.test.mjs`

**Interfaces:**
- Produces (모두 `app/lib/estimate-templates.ts`에서 export):
  - `type TemplateLine = { id: string; space: string; category: string; process: string; name: string; spec: string; unit: string; quantity: number; customerUnitPrice: number; executionUnitPrice: number; note: string; commonName?: boolean; materialId?: string }`
    (페이지의 `EstimateLine`과 같은 모양 + `materialId`)
  - `type TemplateMaterial = { _id?: string; name?: string; spec?: string; unit?: string; unitPrice?: number }`
  - `type TemplateSelection = { categories: string[]; spaces: string[] }` (켜진 칸 이름들)
  - `type TemplateRefreshResult = { lines: TemplateLine[]; changed: Array<{ name: string; before: number; after: number }>; notFound: string[] }`
  - `const NO_CATEGORY = '(카테고리 없음)'`, `const NO_SPACE = '(공간 없음)'`, `const TEMPLATE_NAME_MAX = 60`, `const TEMPLATE_LINE_MAX = 2000`
  - `normalizeTemplateLines(raw: unknown): TemplateLine[]` — 배열 또는 JSON 문자열을 받아 객체만 남기고 필드 타입을 맞춘다
    (문자열은 trim 안 함, 숫자는 유한수 아니면 0, `quantity` 없으면 1, `id` 없으면 `''`).
  - `templateSelectionOptions(lines: TemplateLine[]): { categories: Array<{ label: string; count: number }>; spaces: Array<{ label: string; count: number }> }` — 처음 나온 순서, 빈 값(trim 후)은 `NO_CATEGORY`/`NO_SPACE`.
  - `filterTemplateLines(lines: TemplateLine[], selection: TemplateSelection): TemplateLine[]`
  - `findTemplateMaterial(line: TemplateLine, materials: TemplateMaterial[]): TemplateMaterial | null`
  - `refreshTemplateLines(lines: TemplateLine[], materials: TemplateMaterial[], newId: () => string): TemplateRefreshResult`
  - `isBlankEstimateLine(line: TemplateLine): boolean`
  - `placeTemplateLines<T extends TemplateLine>(current: T[], incoming: T[], mode: 'replace' | 'append'): T[]`
  - `templateCustomerTotal(lines: TemplateLine[]): number` — `Math.round(Σ quantity × customerUnitPrice)`
  - `templateNameError(name: string, otherNames: string[]): string` — 문제 없으면 `''`
  - `templateLinesError(lines: unknown[]): string` — 2,000줄 초과면 `'템플릿은 2,000줄까지 저장할 수 있어요. 템플릿을 나눠 주세요.'`, 아니면 `''`

- [ ] **Step 1: 실패하는 테스트 쓰기** — `tests/estimate-templates.test.mjs`. 도우미 `line(overrides)`(빈 `TemplateLine` 기본값 + overrides, `quantity: 1`)와
  `pick(obj, keys)`(그 키들만 담은 객체)를 두고:

```js
test('selection options count categories and spaces, blanks get their own box', () => {
  const lines = [line({ category: '타일', space: '욕실' }), line({ category: '타일', space: '거실' }), line({ category: ' ', space: '' })];
  const options = templateSelectionOptions(lines);
  assert.deepEqual(options.categories, [{ label: '타일', count: 2 }, { label: NO_CATEGORY, count: 1 }]);
  assert.deepEqual(options.spaces, [{ label: '욕실', count: 1 }, { label: '거실', count: 1 }, { label: NO_SPACE, count: 1 }]);
});

test('a line comes in only when both its category and its space are on', () => {
  const lines = [line({ id: 'a', category: '타일', space: '욕실' }), line({ id: 'b', category: '타일', space: '거실' }), line({ id: 'c', category: '도배', space: '거실' })];
  assert.deepEqual(filterTemplateLines(lines, { categories: ['타일'], spaces: ['거실', '주방'] }).map((l) => l.id), ['b']);
  assert.deepEqual(filterTemplateLines([line({ id: 'd', category: '', space: '' })], { categories: [NO_CATEGORY], spaces: [NO_SPACE] }).map((l) => l.id), ['d']);
});

test('findTemplateMaterial: materialId first, then one exact name/spec/unit match', () => {
  const db = [{ _id: 'm1', name: '타일', spec: '600각', unit: 'm2', unitPrice: 30000 }, { _id: 'm2', name: '타일', spec: '300각', unit: 'm2', unitPrice: 20000 }];
  assert.equal(findTemplateMaterial(line({ materialId: 'm2', name: '바뀐 이름' }), db)._id, 'm2');
  assert.equal(findTemplateMaterial(line({ name: ' 타일 ', spec: '600각', unit: 'm2' }), db)._id, 'm1');
  assert.equal(findTemplateMaterial(line({ materialId: 'gone', name: '타일', spec: '600각', unit: 'm2' }), db)._id, 'm1', 'a deleted id falls back to the name match');
});

test('two DB items with the same name/spec/unit are not guessed', () => {
  const db = [{ _id: 'x', name: '실리콘', spec: '', unit: '개', unitPrice: 1 }, { _id: 'y', name: '실리콘', spec: '', unit: '개', unitPrice: 2 }];
  assert.equal(findTemplateMaterial(line({ name: '실리콘', spec: '', unit: '개' }), db), null);
});

test('a common line is never matched by name', () => {
  const db = [{ _id: 'c', name: '공통', spec: '', unit: '식', unitPrice: 5 }, { _id: 'n', name: '줄눈', spec: '', unit: '식', unitPrice: 7 }];
  assert.equal(findTemplateMaterial(line({ commonName: true, name: '줄눈', unit: '식' }), db), null);
  assert.equal(findTemplateMaterial(line({ commonName: true, name: '줄눈', materialId: 'c' }), db)._id, 'c');
});

test('refreshTemplateLines puts the DB price in both prices, keeps the rest, and reports', () => {
  const db = [{ _id: 'm1', name: '타일', spec: '600각(신)', unit: 'm2', unitPrice: 33000 }, { _id: 'c', name: '공통', spec: '', unit: '식', unitPrice: 9000 }];
  let n = 0;
  const result = refreshTemplateLines([
    line({ id: 't1', materialId: 'm1', name: '타일', spec: '600각', unit: 'm2', quantity: 12, customerUnitPrice: 30000, executionUnitPrice: 30000, space: '욕실', note: '벽' }),
    line({ id: 't2', materialId: 'c', commonName: true, name: '줄눈 시공', customerUnitPrice: 9000, executionUnitPrice: 9000 }),
    line({ id: 't3', name: '특수 시공비', customerUnitPrice: 500000, executionUnitPrice: 400000 }),
  ], db, () => `new-${++n}`);
  assert.deepEqual(result.lines.map((l) => l.id), ['new-1', 'new-2', 'new-3']);
  assert.deepEqual(pick(result.lines[0], ['customerUnitPrice', 'executionUnitPrice', 'spec', 'quantity', 'space', 'note', 'materialId']),
    { customerUnitPrice: 33000, executionUnitPrice: 33000, spec: '600각(신)', quantity: 12, space: '욕실', note: '벽', materialId: 'm1' });
  assert.equal(result.lines[1].name, '줄눈 시공', 'a common line keeps its own 품명');
  assert.deepEqual(pick(result.lines[2], ['customerUnitPrice', 'executionUnitPrice']), { customerUnitPrice: 500000, executionUnitPrice: 400000 });
  assert.deepEqual(result.changed, [{ name: '타일', before: 30000, after: 33000 }]);
  assert.deepEqual(result.notFound, ['특수 시공비']);
});

test('placing template lines: replace, append, and new ids never collide', () => {
  const current = [line({ id: 'a' }), line({ id: 'b' })];
  let n = 0;
  const first = refreshTemplateLines([line({ id: 'a' })], [], () => `line-${++n}`).lines;
  const second = refreshTemplateLines([line({ id: 'a' })], [], () => `line-${++n}`).lines;
  const all = placeTemplateLines(placeTemplateLines(current, first, 'append'), second, 'append');
  assert.equal(new Set(all.map((l) => l.id)).size, 4);
  assert.deepEqual(placeTemplateLines(current, first, 'replace').map((l) => l.id), first.map((l) => l.id));
});

test('only a line with no 품명·규격·비고 and zero prices is blank; the new-version title line is not', () => {
  assert.equal(isBlankEstimateLine(line({ name: '', spec: '', note: '', customerUnitPrice: 0, executionUnitPrice: 0 })), true);
  assert.equal(isBlankEstimateLine(line({ name: '용호마을 24평 초안', customerUnitPrice: 0, executionUnitPrice: 0 })), false);
});

test('template name and size rules', () => {
  assert.notEqual(templateNameError('   ', []), '');
  assert.notEqual(templateNameError('가'.repeat(61), []), '');
  assert.notEqual(templateNameError('30평형 풀공사', ['30 평형풀공사']), '', 'spaces and case are ignored');
  assert.equal(templateNameError(' 30평형 풀공사 ', ['20평형']), '');
  assert.notEqual(templateLinesError(new Array(2001).fill({})), '');
  assert.equal(templateLinesError(new Array(2000).fill({})), '');
});

test('normalizeTemplateLines takes JSON or arrays and never yields NaN', () => {
  const lines = normalizeTemplateLines(JSON.stringify([{ id: 'x', quantity: 'abc', customerUnitPrice: '1200' }, 3, null]));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].quantity, 0);
  assert.equal(lines[0].customerUnitPrice, 1200);
  assert.deepEqual(normalizeTemplateLines('{broken'), []);
  assert.equal(templateCustomerTotal([line({ quantity: 1.5, customerUnitPrice: 1001 })]), 1502);
});
```

Also add to `tests/mobile-estimate.test.mjs`:

```js
test('the phone estimate never carries the material link of a line', () => {
  const view = toCustomerEstimateView({ linesJson: JSON.stringify([{ name: '타일', quantity: 1, customerUnitPrice: 1000, materialId: 'secret-material-id' }]) });
  assert.ok(!JSON.stringify(view).includes('secret-material-id'));
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: `estimate-templates.test.mjs` FAIL (모듈 없음). mobile-estimate 새 테스트는 이미 PASS여도 괜찮다(지켜야 할 약속을 고정하는 테스트).

- [ ] **Step 3: `app/lib/estimate-templates.ts` 구현**

규칙은 스펙 4장 그대로. 놓치기 쉬운 것만:
- 비교용 정리: `key = (v) => String(v ?? '').trim()`; 이름 겹침 검사는 `String(v).replace(/\s/g, '').toLowerCase()`.
- `findTemplateMaterial`: (1) `materialId`가 있고 같은 `_id`가 있으면 그것. (2) `commonName`이면 `null`.
  (3) `key(name)`·`key(spec)`·`key(unit)`가 모두 같은 DB 항목이 정확히 1개면 그것, 아니면 `null`.
- `refreshTemplateLines`: 찾은 줄은 `{ ...line, id: newId(), customerUnitPrice: p, executionUnitPrice: p, spec: m.spec ?? '', unit: m.unit ?? '', materialId: m._id, name: line.commonName ? line.name : (m.name ?? line.name) }`
  (`p = Number(m.unitPrice) || 0`). 고객 또는 실행 단가 중 하나라도 `p`와 다르면 `changed`에
  `{ name: 줄 품명(trim, 비면 '(품명 없음)'), before: line.customerUnitPrice, after: p }`. 못 찾은 줄은 `{ ...line, id: newId() }`이고
  같은 이름 규칙으로 `notFound`에 넣는다.
- `placeTemplateLines`: `'replace'`면 `incoming`, `'append'`면 `[...current.filter((l) => !isBlankEstimateLine(l)), ...incoming]`.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: 모두 PASS.

- [ ] **Step 5: 커밋**

```bash
git add app/lib/estimate-templates.ts tests/estimate-templates.test.mjs tests/mobile-estimate.test.mjs
git commit -m "견적 템플릿 규칙: 공사 고르기, 최신 단가 찾기, 이름·크기 검사"
```

---

### Task 2: 템플릿 저장소와 API

**Files:**
- Create: `app/api/manager/_estimate-templates.ts`
- Modify: `app/api/manager/estimate/route.ts` (GET 분기, POST 동작 추가)

**Interfaces:**
- Consumes: Task 1의 `normalizeTemplateLines`, `templateCustomerTotal`, `templateNameError`, `templateLinesError`, `TemplateLine`.
  `firestore.ts`의 `listFirestoreCollection(collection, idToken?, pageSize?, fieldPaths?)`,
  `getFirestoreDocumentWithVersion`, `getFirestoreDocument`, `patchFirestoreFields(collection, id, fields, { precondition })`,
  `deleteFirestoreDocument`, `readEstimateMaterialMetaFromFirestore`(이미 있음), `isFirestoreConflictError`.
- Produces:
  - `ESTIMATE_TEMPLATES_COLLECTION = 'estimateTemplates'`
  - `type EstimateTemplateSummary = { id: string; name: string; lineCount: number; customerTotal: number; updatedAt: string; updatedBy: string }`
  - `type EstimateTemplate = EstimateTemplateSummary & { lines: TemplateLine[]; updateTime: string }`
  - `listEstimateTemplates(): Promise<EstimateTemplateSummary[]>` (필드 마스크 `['name','lineCount','customerTotal','updatedAt','updatedBy']`, 이름순 `localeCompare('ko')`)
  - `readEstimateTemplate(id: string): Promise<EstimateTemplate | null>`
  - `saveEstimateTemplate(input: { id?: string; name: string; lines: unknown; baseUpdateTime?: string; by: string }): Promise<EstimateTemplate>` — 검사 실패는 `EstimateTemplateInputError`(message = 한국어 안내), 충돌은 `FirestoreConflictError` 그대로 던짐
  - `deleteEstimateTemplate(id: string): Promise<void>`
  - API (모두 `/api/manager/estimate`):
    - `GET ?part=templates` → `{ templates: EstimateTemplateSummary[] }`
    - `GET ?part=template&id=ID` → `{ template: EstimateTemplate }`, 없으면 404 `{ error: '삭제된 템플릿이에요.', conflict: 'deleted' }`
    - `GET ?part=materialsMeta` → `{ materialsMeta: MaterialCacheMeta | null }` (Firestore 문서 1개만 읽음. Sanity 모드면 `null`)
    - `POST { action: 'saveTemplate', template: { id?, name, lines, baseUpdateTime? } }` → `{ template: EstimateTemplate }`;
      400 `{ error }`(검사 실패), 409 `{ error, conflict: 'changed' | 'deleted' }`
    - `POST { action: 'deleteTemplate', id }` → `{ ok: true }`

- [ ] **Step 1: `_estimate-templates.ts` 구현**

`saveEstimateTemplate` 순서: 이름·줄 검사(`templateNameError`의 `otherNames`는 `listEstimateTemplates()`에서 자기 id 제외) →
새 템플릿이면 `randomBytes(12).toString('hex')` id와 `{ exists: false }`, 고치는 것이면 `{ updateTime: baseUpdateTime }`로
`patchFirestoreFields` → 고친 것인데 `baseUpdateTime`이 비었으면 입력 오류. 저장 필드는 스펙 3.1 표 그대로(`linesJson`은
`JSON.stringify(normalizeTemplateLines(lines))`, `createdAt/createdBy`는 새로 만들 때만). 반환 `updateTime`은 저장 후
`getFirestoreDocumentWithVersion`으로 다시 읽어 얻는다. 모든 Firestore 호출에 `idToken`을 넘기지 않는다(서비스 계정).

- [ ] **Step 2: route.ts에 GET·POST 분기 추가**

GET은 `part`가 `templates`/`template`/`materialsMeta`일 때 `readEstimatePayload`보다 먼저 처리. 템플릿 분기는 Global
Constraints의 Firestore 조건을 먼저 확인. POST의 `saveTemplate`에서 충돌이면 그 템플릿이 아직 있는지
(`readEstimateTemplate`) 보고 `'changed'`/`'deleted'`를 정한다. `by`는 `access.session.name`.
GET 주석의 variants 목록에 세 줄을 더한다.

- [ ] **Step 3: 타입·린트 확인**

Run: `npx tsc --noEmit && npm run lint`
Expected: 오류 없음.

- [ ] **Step 4: 개발 서버로 API 확인**

`.claude/launch.json`(커밋 금지)으로 개발 서버를 띄우고, `node tests/mint-manager-session.mjs`로 만든 토큰으로 curl:
1. `saveTemplate` 새로 만들기 → 200, `updateTime` 있음. 같은 이름(공백만 다르게)으로 또 만들기 → 400.
2. `part=templates` → 방금 것이 목록에 있고 `linesJson`은 없음.
3. 같은 `baseUpdateTime`으로 두 번 저장 → 두 번째는 409 `conflict: 'changed'`.
4. `deleteTemplate` 후 `part=template&id=` → 404 `conflict: 'deleted'`; 지운 템플릿 저장 → 409 `conflict: 'deleted'`.
5. `part=materialsMeta` → `{ materialsMeta: { version, ... } }`.
6. 확인용 템플릿은 모두 지운다.

- [ ] **Step 5: 커밋**

```bash
git add app/api/manager/_estimate-templates.ts app/api/manager/estimate/route.ts
git commit -m "견적 템플릿 저장소와 API: 목록·읽기·조건부 저장·삭제, 자재 DB 버전만 읽기"
```

---

### Task 3: 견적 줄의 DB 연결 기억과 자재 DB 최신 확인

**Files:**
- Modify: `app/manager-weve-7519/estimate/page.tsx` (`EstimateLine` 타입 49행 부근, `materialToLine` 1505행 부근, 자재 캐시 도우미 293~334행 부근)
- Modify: `app/lib/estimate-templates.ts` (판단 함수 하나)
- Test: `tests/estimate-templates.test.mjs`

**Interfaces:**
- Produces:
  - `EstimateLine.materialId?: string`; `materialToLine`이 `materialId: material._id || undefined`를 채운다.
  - `app/lib/estimate-templates.ts`: `isMaterialListCurrent(cachedVersionKey: string | null, serverVersionKey: string | null, cachedCount: number): boolean`
    — 둘 다 있고 같고 `cachedCount > 0`일 때만 `true`.
  - page 안 `ensureLatestMaterials(): Promise<Material[]>` — `part=materialsMeta`로 버전만 읽고, `readMaterialCache()`의 meta와
    `materialMetaKey`로 비교해 `isMaterialListCurrent`면 캐시 자재를, 아니면 `part=materials`를 읽어
    `writeMaterialCache`+`setMaterials` 후 그 자재를 돌려준다. 실패하면 던진다(호출하는 쪽이 불러오기를 멈춘다).

- [ ] **Step 1: 실패하는 테스트**

```js
test('the material list is current only when both versions exist, match, and the cache is not empty', () => {
  assert.equal(isMaterialListCurrent('v1|t|10', 'v1|t|10', 10), true);
  assert.equal(isMaterialListCurrent('v1|t|10', 'v2|t|10', 10), false);
  assert.equal(isMaterialListCurrent(null, 'v1|t|10', 10), false);
  assert.equal(isMaterialListCurrent('v1|t|10', null, 10), false, 'no server version is not proof of freshness');
  assert.equal(isMaterialListCurrent('v1|t|10', 'v1|t|10', 0), false);
});
```

- [ ] **Step 2: 실패 확인** — Run: `npm test` / Expected: `isMaterialListCurrent` is not a function

- [ ] **Step 3: 구현** — `isMaterialListCurrent`, `EstimateLine.materialId`, `materialToLine`, `ensureLatestMaterials`.
  기존 `isMaterialCacheFresh`(서버 meta가 없으면 true)는 화면 열기용이라 그대로 둔다.

- [ ] **Step 4: 확인** — Run: `npm test && npx tsc --noEmit` / Expected: PASS, 오류 없음.
  개발 서버에서 DB로 줄 하나를 고르고 저장한 뒤, 저장된 `linesJson`에 `materialId`가 들어갔는지 확인한다(API 응답으로).

- [ ] **Step 5: 커밋**

```bash
git add app/lib/estimate-templates.ts tests/estimate-templates.test.mjs app/manager-weve-7519/estimate/page.tsx
git commit -m "견적 줄이 고른 자재 DB 항목을 기억하고, 자재 DB 버전만 읽어 최신인지 확인"
```

---

### Task 4: 템플릿 관리 창 (만들기·고치기·복사·삭제·기존 견적에서 복사)

**Files:**
- Create: `app/manager-weve-7519/estimate/template-manager.tsx`
- Modify: `app/manager-weve-7519/estimate/page.tsx` (버튼, 자재 고르기 연결, 창 렌더)

**Interfaces:**
- Consumes: Task 1 (`TemplateLine`, `findTemplateMaterial`, `templateCustomerTotal`, `templateNameError`, `templateLinesError`,
  `normalizeTemplateLines`, `placeTemplateLines`, `isBlankEstimateLine`), Task 2 API, Task 3 `materialId`.
- Produces: `export function TemplateManager(props: TemplateManagerProps)`; 같은 파일에서
  `export type TemplateApiData = { error?: string; templates?: EstimateTemplateSummary[]; template?: EstimateTemplate; estimates?: Array<{ _id?: string; versionLabel?: string; linesJson?: string }>; conflict?: 'changed' | 'deleted' }`
  (요약·템플릿 타입은 화면 쪽에 같은 모양으로 다시 선언; 서버 파일을 import 하지 않는다). Task 5가 이 타입을 import 한다.

```ts
type TemplateManagerProps = {
  api: (query: Record<string, string>) => Promise<TemplateApiData>; // page의 fetchEstimateApi
  post: (body: Record<string, unknown>) => Promise<Response>;       // page의 인증 헤더로 POST /api/manager/estimate
  materials: TemplateMaterial[];                                     // 화면의 자재 DB ("DB에서 못 찾음" 표시용)
  sites: Array<{ _id: string; title?: string }>;
  spaceOptions: string[];                                            // page의 defaultSpaces
  categoryOptions: string[];                                         // 견적 카테고리(datalist)
  pickFromDb: (onPicked: (lines: TemplateLine[]) => void) => void;   // 자재 고르기 창을 열고 고른 줄을 돌려줌
  newLineId: () => string;                                           // page의 emptyLine().id
  onClose: () => void;
};
```

- [ ] **Step 1: page 쪽 자재 고르기 연결**

`TEMPLATE_PICKER_ID = '__template__'` 상수와 `templatePickRef = useRef<((lines: EstimateLine[]) => void) | null>(null)`.
`pickFromDb(onPicked)`는 ref에 콜백을 넣고 `setMaterialPicker({ lineId: TEMPLATE_PICKER_ID, step: 'category', category: '', process: '', search: '' })`.
`choosePickerMaterial`: `lineId === TEMPLATE_PICKER_ID`면 `apply(emptyLine())` 한 줄을 콜백으로 보내고 닫는다(`setActiveTab` 안 함).
`choosePickerCommonOptions`의 여러 개 선택과 `addCommonBulkLines`: `targetLineId === TEMPLATE_PICKER_ID`면
`buildCommonBulkLines(...)` 결과를 `setLines` 대신 콜백으로 보낸다(`replaceLineId`는 `''`).
`MaterialPickerModal`과 `CommonBulkAddDialog`가 템플릿 창 **위에** 보여야 하므로 템플릿 창의 z-index는 그 둘보다 낮게 둔다
(두 창의 실제 z-index를 보고 정한다).

- [ ] **Step 2: `TemplateManager` 구현** — 스펙 2.1 그대로. 정할 것만:
  - 목록 ↔ 작업 화면 두 화면. 작업 화면은 `{ id?, name, lines, baseUpdateTime }`과 저장 시점 스냅샷(`JSON.stringify`)을 두고
    다르면 "저장 안 함" 상태. 닫기·목록으로·다른 템플릿 열기 때 저장 안 함이면 `window.confirm`이 아니라 창 안 확인 상자로 묻는다.
  - 줄 표(아래에 "줄 추가" 버튼, `newLineId()`로 빈 줄): 공간 `<select>`(spaceOptions + 빈 값), 카테고리 `<input list>`(categoryOptions), 품명·규격·단위·비고 입력, 수량·고객 단가·
    실행 단가 숫자 입력(`number-text-input.tsx`의 `NumberTextInput` 재사용), 위/아래 이동, 삭제(확인 없이; 저장 전이라 되돌릴 수 있음).
    `findTemplateMaterial(line, materials) === null`인 줄 옆에 "DB에서 못 찾음".
  - 복사: 목록에서 고른 템플릿을 읽어 `name + ' 복사'`(겹치면 ' 복사 2', ' 복사 3'…)로 `id` 없이 작업 화면에 연다(저장해야 생김).
  - 이름 바꾸기: 목록에서 이름만 바꿔 저장(읽기 → 이름 바꿔 `saveTemplate`).
  - 삭제: 창 안 확인 상자 → `deleteTemplate` → 목록 새로 고침.
  - 기존 견적에서 복사: 현장 `<select>` → `api({ part: 'estimates', siteId })` → 버전 `<select>`(`versionLabel`) → 그 버전의
    `linesJson`을 `normalizeTemplateLines` 하고 줄마다 `newLineId()`로 새 id. 작업 화면에 줄이 있으면(빈 줄 제외) 바꾸기/덧붙이기/취소.
  - 저장: `templateNameError`/`templateLinesError`를 먼저 보여 주고, 409 `changed`면 "다른 곳에서 먼저 고쳤어요" +
    [상대 내용 다시 불러오기] [다른 이름으로 저장](이름 입력 후 `id`·`baseUpdateTime` 없이 저장). 409/404 `deleted`면 안내 후 목록.
    실패하면 창을 닫지 않는다.

- [ ] **Step 3: page에 "템플릿 관리" 버튼과 렌더** — 견적서 머리 버튼 줄(2777행 부근 `flex flex-wrap items-center gap-2`)에 버튼,
  `isTemplateManagerOpen` 상태, `TemplateManager` 렌더.

- [ ] **Step 4: 확인** — Run: `npm test && npx tsc --noEmit && npm run lint` / Expected: 통과.
  개발 서버에서: 새 템플릿에 DB에서 추가(한 개, 공통 항목 여러 개), 직접 입력 줄 추가 → "DB에서 못 찾음" 표시 → 저장 →
  목록 수·합계 확인 → 복사 → 이름 바꾸기 → 기존 견적에서 복사(바꾸기/덧붙이기) → 저장 안 하고 닫기 경고 → 삭제.

- [ ] **Step 5: 커밋**

```bash
git add app/manager-weve-7519/estimate/template-manager.tsx app/manager-weve-7519/estimate/page.tsx
git commit -m "견적 템플릿 관리 창: 만들기·고치기·복사·이름 바꾸기·삭제, 기존 견적에서 복사"
```

---

### Task 5: 템플릿 불러오기 창

**Files:**
- Create: `app/manager-weve-7519/estimate/template-load-dialog.tsx`
- Modify: `app/manager-weve-7519/estimate/page.tsx` (버튼, 줄 넣기)

**Interfaces:**
- Consumes: Task 1 전부, Task 2 `part=templates`/`part=template`, Task 3 `ensureLatestMaterials`.
- Produces: `export function TemplateLoadDialog(props: TemplateLoadDialogProps)`;

```ts
type TemplateLoadDialogProps = {
  api: (query: Record<string, string>) => Promise<TemplateApiData>;
  materials: TemplateMaterial[];                                   // 미리보기용(화면의 자재 DB)
  ensureLatestMaterials: () => Promise<TemplateMaterial[]>;
  currentLines: TemplateLine[];                                    // 지금 견적 줄 (빈 견적 판단)
  newLineId: () => string;
  onApply: (lines: TemplateLine[], mode: 'replace' | 'append') => void;
  onClose: () => void;
};
```

- [ ] **Step 1: `TemplateLoadDialog` 구현** — 스펙 2.2의 1~5단계 그대로. 정할 것만:
  - 단계: 고르기 → 공사 고르기·미리보기 → (견적에 빈 줄이 아닌 줄이 있으면) 바꾸기/덧붙이기/취소 → 결과 안내.
  - 체크 상태는 `TemplateSelection`; 처음엔 `templateSelectionOptions`의 모든 칸. 목록마다 "모두 켜기 / 모두 끄기".
  - 미리보기: `refreshTemplateLines(filterTemplateLines(...), materials, () => '')`로 항목 수, `templateCustomerTotal`,
    `changed.length`, `notFound.length`.
  - 불러오기: `await ensureLatestMaterials()` 실패 → "최신 단가를 확인하지 못했어요. 다시 시도해 주세요." 표시하고 멈춤.
    성공 → 그 자재로 `refreshTemplateLines(..., newLineId)` → `currentLines.every(isBlankEstimateLine)`이면 `onApply(lines, 'replace')`,
    아니면 바꾸기/덧붙이기 선택 후 `onApply`. 그리고 결과 안내(넣은 수, `changed` 목록 "품명: 30,000원 → 33,000원", `notFound` 목록).
  - 템플릿 읽기 404 → "삭제된 템플릿이에요." 후 목록 새로 고침. 불러올 항목 0개면 불러오기 비활성.

- [ ] **Step 2: page 연결** — 견적서 머리 버튼 줄에 "템플릿 불러오기"(현장 견적을 고칠 수 있을 때만 활성; 기존 견적 편집
  가능 여부 조건을 그대로 따름). `onApply`는 `setLines((current) => placeTemplateLines(current, lines, mode))` 후
  `setWorkLines`도 기존 "견적 바꾸면 실행 내역" 규칙을 따르는지 확인한다: 줄을 통째로 바꾼 경우 `startNewVersion`처럼
  실행 내역의 `sourceLineId`가 사라진 줄을 가리키게 되면 안 되므로, 기존 줄 삭제 때 쓰는 `unlinkWorkLinesFromLine`
  (`app/lib/estimate-save-safety.ts`)을 사라진 줄마다 적용한다.

- [ ] **Step 3: 확인** — Run: `npm test && npx tsc --noEmit && npm run lint` / Expected: 통과.
  개발 서버에서: 30평형 템플릿(욕실·거실·주방, 타일·도배 등)으로 — 욕실 끄기, 타일만 켜고 욕실 끄기, 전부 끄기(버튼 비활성),
  빈 견적에 바로 넣기, 새 버전 제목 줄이 있는 견적에서 바꾸기/덧붙이기, 같은 템플릿 두 번 덧붙이기(줄 편집 정상),
  DB 단가를 바꾼 뒤 불러오기 → 새 단가와 변경 안내, DB에서 지운 자재 → 못 찾음 안내.
  불러오기 때 네트워크 탭에서 자재 DB 전체 읽기가 없는지(버전만 읽는지) 확인.

- [ ] **Step 4: 커밋**

```bash
git add app/manager-weve-7519/estimate/template-load-dialog.tsx app/manager-weve-7519/estimate/page.tsx
git commit -m "견적 템플릿 불러오기: 카테고리·공간 고르기, 최신 단가 반영, 바꾸기·덧붙이기"
```

---

### Task 6: 규칙 문서, 전체 확인, PR

**Files:**
- Modify: `docs/WEVE_WORKING_RULES.md` (새 절 "Estimate Templates")

- [ ] **Step 1: 규칙 문서** — 영어로, 기존 절 형식에 맞춰: 저장소(`estimateTemplates`, 서비스 계정만, Firestore만),
  권한(`estimates`), 이름·크기 규칙, 조건부 저장, `materialId`와 최신 단가 찾기 순서, `part=materialsMeta`로 버전만 확인,
  템플릿은 현장·매출·직원 앱에 섞이지 않음.
- [ ] **Step 2: 전체 확인** — Run: `npm test && npx tsc --noEmit && npm run lint && npm run build` / Expected: 모두 통과.
- [ ] **Step 3: 커밋·푸시·PR** — 브랜치 `feat/estimate-templates`, PR 본문은 한국어로 바뀐 점·확인한 것·직접 확인이 남은 것,
  끝에 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. PR을 올린 뒤 Auto-fix를 켠다. 병합은 대표님 승인 후.
