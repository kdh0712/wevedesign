# 공사별 견적 표 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 템플릿 작업 창과 현장 견적 화면을 같은 공사별 표 부품으로 바꾸고(공사 다루기·키보드·끌기·색·크게 보기), 평형 수량 조정과 "이 견적을 템플릿으로 저장"을 더한다.

**Architecture:** 묶음 규칙은 순수 모듈 `app/lib/estimate-templates.ts`에 더한다. 화면은 새 공통 부품 `grouped-lines-editor.tsx`가
줄 배열을 받아 고친 배열을 돌려주고, 템플릿 창과 현장 견적 화면이 각자 다른 칸(고르기 칸, 마진, 선택)을 props로 넣는다.
세 PR(A: 부품+템플릿 창, B: 평형·템플릿으로 저장, C: 현장 견적 화면)로 나눠 각각 대표님 승인 후 병합한다.

**Tech Stack:** Next.js app router, React, TypeScript, Tailwind, Firestore REST, node:test. 새 라이브러리 없음(끌기는 HTML 기본 드래그).

**Spec:** `docs/superpowers/specs/2026-10-23-estimate-grouped-editor-design.md`

## Global Constraints

- 화면 문구는 한국어, 스펙 표현 그대로: "이름 바꾸기", "공사 복사", "공사 삭제", "이 공사에 DB에서 추가", "줄 추가", "복제", "다른 공사로 옮기기", "DB에 저장", "크게 보기", "실행 금액 보기", "평형에 맞춰 수량 조정", "이 견적을 템플릿으로 저장", "새 템플릿", "기존 템플릿에 덮어쓰기".
- 줄은 같은 공사 안에서만 끌린다. 다른 공사로는 줄 메뉴 "다른 공사로 옮기기"만 쓴다.
- 공간 보기로 걸러 볼 때와 '기본견적' 줄·그 공사는 끌기·순서 버튼을 잠근다.
- 한글 조합 중(`event.nativeEvent.isComposing`) Enter는 칸 이동에 쓰지 않는다. Enter 이동은 `input`/`select`에서만.
- 공사 색은 화면에만. `print:` 스타일과 서류 출력 탭에는 색이 없다.
- 평형 조정은 기본 꺼짐. 면적 단위 `m2`·`㎡`·`m²`·`평`(공백·대소문자 무시) 자동 체크, 소수 첫째 자리 반올림, 비율 = 현장 평형 ÷ 기준 평형.
- `baseArea`: 비워 둘 수 있음, 있으면 1~500 숫자. 서버도 같은 규칙으로 400.
- 저장 형식은 그대로(줄 배열 JSON). 현장 견적은 순서만 바뀐다. 직원 앱·실행 내역·발주서·서류 출력 로직은 건드리지 않는다.
- `estimate/page.tsx`는 CRLF. 고친 뒤 `git diff --stat` 줄 수를 확인한다. `route.ts`는 CRLF/LF 혼합 → 고친 뒤 원래 줄바꿈 복원.
- 검증: `npm test`, `npx tsc --noEmit -p .`, PR 직전 `npm run build`. ESLint는 저장소에 없어 돌리지 않는다.
- UI 확인은 개발 서버 + 브라우저 안 fetch 가짜 응답(`.claude/launch.json`은 커밋 금지). 실제 Firestore는 PR마다 미리보기에서 대표님 확인.
- 커밋 메시지는 한국어, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. PR은 Auto-fix 켜고 병합은 대표님 승인 후.

## Review Focus

1. 한글 입력 마지막 글자에서 바로 Enter → 조합이 끝나기 전에 포커스가 옮겨져 글자가 사라지면 안 된다 (Task A3 화면 확인 단계).
2. 공사 이름을 이미 있는 공사 이름으로 바꾸기(공백만 다름 포함) → 합칠지 묻고, 취소하면 아무것도 바뀌지 않는다 (Task A1 테스트 + A3 확인).
3. 현장 견적을 열기만 했는데 순서 정리 때문에 '저장 안 함'이 뜨면 안 된다 (Task C1 확인).
4. 공간 보기로 걸러 둔 상태에서 Enter로 새 줄을 만들 때 → 새 줄이 그 공간 값을 받아 거르기에서 사라지지 않아야 한다 (Task C2 확인).
5. 덮어쓰기 저장 중 다른 사람이 그 템플릿을 고친 경우 → 409로 막고 다시 시도 안내 (Task B4 확인).

---

## PR A — 공통 표 부품 + 템플릿 작업 창

### Task A1: 공사·줄 다루기 규칙

**Files:**
- Modify: `app/lib/estimate-templates.ts`
- Test: `tests/estimate-templates.test.mjs`

**Interfaces:**
- Produces (모두 export, 제네릭 `T extends TemplateLine`, 입력 배열은 바꾸지 않음):
  - `renameTemplateGroup(lines: T[], from: string, to: string): T[]` — `to` trim이 비면 `lines` 그대로. `from` 공사의 모든 줄 `category = to.trim()`. 같은 이름 공사가 이미 있으면 그 공사 줄 뒤에 붙는다(합치기). 결과는 공사별로 모인 순서.
  - `templateGroupExists(lines: T[], label: string): boolean` — trim 비교.
  - `templateCopyGroupName(label: string, labels: string[]): string` — `<label> 복사`, 겹치면 ` 복사 2`…
  - `copyTemplateGroup(lines: T[], label: string, newLabel: string, newId: () => string): T[]` — 원래 공사 바로 다음에 새 id·`category = newLabel` 줄들.
  - `removeTemplateGroup(lines: T[], label: string): { lines: T[]; removedIds: string[] }`
  - `duplicateTemplateLine(lines: T[], lineId: string, newId: () => string): T[]` — 바로 아래에 복사.
  - `moveTemplateLineBefore(lines: T[], lineId: string, beforeLineId: string | null): T[]` — 같은 공사 안에서만. `null`이면 그 공사 끝. 다른 공사 줄 id면 `lines` 그대로.
  - `moveTemplateGroupBefore(lines: T[], label: string, beforeLabel: string | null): T[]` — `null`이면 맨 끝.
  - `pinBaseGroupFirst(lines: T[], isBase: (line: T) => boolean): T[]` — 기본 줄이 든 공사(들)를 맨 앞으로, 나머지 순서 유지.
  - `GROUP_COLORS: ReadonlyArray<{ accent: string; soft: string }>` (8개) · `groupColor(index: number)` = `GROUP_COLORS[index % 8]`.

- [ ] **Step 1: 실패하는 테스트** — 기존 `grouped()` 도우미(철거 a,c / 욕실 b / 도배 d / 기타 e)를 쓴다.

```js
test('renaming a 공사 renames every line, and an existing name merges after it', () => {
  const renamed = renameTemplateGroup(grouped(), '철거 공사', '해체 공사');
  assert.deepEqual(groupTemplateLines(renamed).map((g) => [g.label, g.lines.map((l) => l.id)]), [['해체 공사', ['a', 'c']], ['욕실 공사', ['b']], ['도배', ['d']], ['기타 공사', ['e']]]);
  const merged = renameTemplateGroup(grouped(), '철거 공사', ' 욕실 공사 ');
  assert.deepEqual(groupTemplateLines(merged).map((g) => [g.label, g.lines.map((l) => l.id)]), [['욕실 공사', ['b', 'a', 'c']], ['도배', ['d']], ['기타 공사', ['e']]]);
  assert.equal(renameTemplateGroup(grouped(), '도배', '도배 공사').find((l) => l.id === 'd').category, '도배 공사', 'a 공정-labelled 공사 gets a 카테고리');
  assert.deepEqual(renameTemplateGroup(grouped(), '철거 공사', '  ').map((l) => l.id), grouped().map((l) => l.id));
  assert.equal(templateGroupExists(grouped(), ' 욕실 공사'), true);
});

test('copying a 공사 puts new-id lines right after it under the new name', () => {
  assert.equal(templateCopyGroupName('욕실 공사', ['욕실 공사', '욕실 공사 복사']), '욕실 공사 복사 2');
  let n = 0;
  const copied = copyTemplateGroup(grouped(), '철거 공사', '철거 공사 복사', () => `n${++n}`);
  assert.deepEqual(copied.map((l) => l.id), ['a', 'c', 'n1', 'n2', 'b', 'd', 'e']);
  assert.deepEqual(copied.slice(2, 4).map((l) => [l.category, l.customerUnitPrice]), [['철거 공사 복사', 500], ['철거 공사 복사', 10]]);
});

test('removing a 공사 reports the removed ids', () => {
  const { lines, removedIds } = removeTemplateGroup(grouped(), '철거 공사');
  assert.deepEqual(lines.map((l) => l.id), ['b', 'd', 'e']);
  assert.deepEqual(removedIds, ['a', 'c']);
});

test('a duplicated line sits right below the original', () => {
  assert.deepEqual(duplicateTemplateLine(grouped(), 'a', () => 'z').map((l) => l.id), ['a', 'z', 'c', 'b', 'd', 'e']);
});

test('dragging a line only lands inside its own 공사', () => {
  const lines = [...grouped(), line({ id: 'f', category: '철거 공사' })]; // 철거: a, c, f
  const ids = (ls) => ls.map((l) => l.id);
  assert.deepEqual(ids(moveTemplateLineBefore(lines, 'f', 'a')).slice(0, 3), ['f', 'a', 'c']);
  assert.deepEqual(ids(moveTemplateLineBefore(lines, 'a', null)).slice(0, 3), ['c', 'f', 'a']);
  assert.deepEqual(ids(moveTemplateLineBefore(lines, 'a', 'b')), ids(lines), 'another 공사 is not a drop target');
});

test('dragging a 공사 moves it before another, or to the end', () => {
  const labels = (ls) => groupTemplateLines(ls).map((g) => g.label);
  assert.deepEqual(labels(moveTemplateGroupBefore(grouped(), '도배', '철거 공사')), ['도배', '철거 공사', '욕실 공사', '기타 공사']);
  assert.deepEqual(labels(moveTemplateGroupBefore(grouped(), '철거 공사', null)), ['욕실 공사', '도배', '기타 공사', '철거 공사']);
});

test('the 기본견적 공사 stays first and neighbouring 공사 never share a color', () => {
  const pinned = pinBaseGroupFirst(grouped(), (l) => l.id === 'd');
  assert.deepEqual(groupTemplateLines(pinned).map((g) => g.label), ['도배', '철거 공사', '욕실 공사', '기타 공사']);
  assert.equal(GROUP_COLORS.length, 8);
  for (let i = 0; i < 20; i += 1) assert.notDeepEqual(groupColor(i), groupColor(i + 1));
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test tests/estimate-templates.test.mjs` / Expected: `does not provide an export named 'renameTemplateGroup'`.
- [ ] **Step 3: 구현** — 모두 `groupTemplateLines` → 묶음 배열 조작 → `flattenGroups`. `GROUP_COLORS`는 흰 배경에서 읽히는 진한 accent와 옅은 soft 짝 8개(파랑·주황·초록·보라·분홍·청록·갈색·남색 계열).
- [ ] **Step 4: 통과 확인** — Run: `npm test` / Expected: 전부 PASS.
- [ ] **Step 5: 커밋** — `공사 다루기 규칙: 이름 바꾸기·합치기, 복사, 삭제, 줄 복제, 끌어 놓기, 기본견적 고정, 공사 색`

### Task A2: 세부내역서 공사 색 + 크게 보기

**Files:**
- Modify: `app/manager-weve-7519/estimate/template-document-preview.tsx`

**Interfaces:**
- Consumes: `groupColor`, `groupTemplateLines`.
- Produces: `TemplateDocumentPreview({ title, subtitle, lines, onCollapse })` — `name` prop을 `title`(문서 제목 아래 첫 줄, 예: 템플릿 이름 또는 현장 이름)·`subtitle?`(예: 버전 이름)로 바꾼다. 공사 제목 줄에 `soft` 배경·`accent` 글자·왼쪽 4px 띠(인라인 style, `print:` 에서는 회색). [크게 보기] → 화면 전체 덮개(`fixed inset-0 z-[60]`, 가로 최대 1120px, 글씨 14px), [실행 금액 보기] 공유, Esc·바깥 클릭·[닫기]로 닫힘.

- [ ] **Step 1: 구현** — 표 본문을 `DocumentBody({ groups, showExecution, large })`로 빼서 작게/크게 두 번 그린다. Esc는 열려 있을 때만 `keydown` 등록.
- [ ] **Step 2: 확인** — Run: `npx tsc --noEmit -p .` / Expected: 오류 없음(템플릿 창의 호출부도 `title`로 바꾼다).
- [ ] **Step 3: 커밋** — `세부내역서 미리보기: 공사별 색과 크게 보기`

### Task A3: 공통 공사별 표 부품 + 템플릿 작업 창 적용

**Files:**
- Create: `app/manager-weve-7519/estimate/grouped-lines-editor.tsx`
- Modify: `app/manager-weve-7519/estimate/template-manager.tsx` (지금의 묶음 표·`CategoryCell` 자리를 부품으로 바꾼다; `CategoryCell`은 부품 파일로 옮긴다)

**Interfaces:**
- Consumes: Task A1 전부, 기존 `groupTemplateLines`, `insertIntoTemplateGroup`, `moveTemplateGroup`, `moveTemplateLineInGroup`, `setTemplateLineCategory`, `findTemplateMaterial`, `isBlankEstimateLine`, `NumberTextInput`.
- Produces:

```ts
export type GroupedColumn = 'space' | 'category' | 'process' | 'name' | 'spec' | 'unit' | 'quantity' | 'customerUnitPrice' | 'executionUnitPrice' | 'margin' | 'note';
export type GroupedLinesEditorProps<T extends TemplateLine> = {
  lines: T[];
  onChange: (lines: T[]) => void;
  newLine: (group: string) => T;                      // 빈 줄, 새 id, category = group (공간 거르기 중이면 그 공간)
  newId: () => string;
  columns: GroupedColumn[];
  spaceOptions: string[];
  categoryOptions: string[];
  renderCell?: Partial<Record<'category' | 'process' | 'name', (line: T) => ReactNode>>; // 없으면 기본 입력칸
  onAddFromDb: (group: string) => void;               // [이 공사에 DB에서 추가]
  onRepick?: (line: T) => void;                       // [DB에서 다시 고르기] (템플릿)
  materials?: TemplateMaterial[];                     // 있으면 'DB에서 못 찾음' 표시 (템플릿)
  selectedLineId?: string;                            // 현장 견적 ④
  onSelectLine?: (id: string) => void;
  spaceFilter?: string;                               // '' = 전체. 값이 있으면 그 공간 줄만 보이고 끌기·순서 잠금
  isPinned?: (line: T) => boolean;                    // '기본견적' 줄: 끌기·순서 잠금, 공사 맨 위
  removeMessage?: (lines: T[]) => string;             // 줄·공사 삭제 확인 문구 (현장 견적은 실행 내역 연결 수 포함)
  onRemoved?: (ids: string[]) => void;                // 삭제 뒤 (현장 견적: 실행 내역 연결 풀기)
  lineMenuExtras?: (line: T) => Array<{ label: string; run: () => void }>; // 'DB에 저장'
  emptyLineWhenAllRemoved?: boolean;                  // 현장 견적: 모두 지우면 빈 줄 하나
};
export function GroupedLinesEditor<T extends TemplateLine>(props: GroupedLinesEditorProps<T>): JSX.Element;
```

- [ ] **Step 1: 부품 구현** — 스펙 2.2~2.6 그대로. 정할 것만:
  - 공사 제목 줄: 손잡이(`draggable`, 잠금 시 없음) · 접기 · 색 점 · 이름(또는 이름 바꾸기 입력칸, Enter 확정·Esc 취소) · [이름 바꾸기] · 항목 수·고객 소계 · [이 공사에 DB에서 추가] [줄 추가] [공사 복사] [공사 삭제] [공사 ↑] [공사 ↓].
    - 이름 바꾸기 확정 시 `templateGroupExists`이고 자기 자신이 아니면 부품 안 확인 상자 "OO와 합칠까요?" → 예: `renameTemplateGroup`, 아니오: 그대로.
    - 공사 복사는 `templateCopyGroupName`으로 이름을 정해 바로 만들고, 그 새 공사의 이름 바꾸기 입력칸을 연다.
  - 섹션 스타일: `groupColor(index)`로 `style={{ borderLeft: '6px solid accent' }}`, 제목 줄 배경 soft, 이름 글자 accent.
  - 줄: 손잡이 · 칸들 · ⋯ 메뉴(복제 / 다른 공사로 옮기기(하위 목록: 자기 공사 제외한 공사 이름) / extras / 삭제). 바깥 클릭·Esc로 메뉴 닫힘.
  - 키보드: 입력칸·선택칸에 `data-grow`(보이는 줄 순번), `data-gcol`(칸 이름). `onKeyDown` Enter(조합 중 제외): `[data-grow=r±1][data-gcol=c]` 포커스; 그 공사의 마지막 줄이면 `insertIntoTemplateGroup(..., [newLine(group)])` 후 다음 렌더에서 새 줄 첫 입력칸 포커스(`pendingFocusId` 상태 + `useEffect`).
  - 끌기: 줄 `dragstart`에 `{kind:'line', id, group}`을 상태로 기억, 같은 공사 줄 위 `dragover`에서만 `preventDefault` + 놓을 자리 표시(위/아래 절반으로 before 결정), `drop` → `moveTemplateLineBefore`. 공사도 같은 방식으로 `moveTemplateGroupBefore`. 잠금 조건(spaceFilter, isPinned)이면 `draggable={false}`.
  - 삭제: `removeMessage`가 있으면 그 문구, 없으면 "'<품명>'을(를) 삭제할까요?" / "OO N개 항목을 지울까요?" 부품 안 확인 상자 → 지우고 `onRemoved(ids)`; 결과가 비고 `emptyLineWhenAllRemoved`면 `[newLine('')]`.
  - 마진 칸: `수량×(고객−실행)`과 `%`(고객 금액 0이면 `-`), 초록 글자.
  - 'DB에서 못 찾음'과 [DB에서 다시 고르기]는 `materials`/`onRepick`이 있을 때만.
- [ ] **Step 2: 템플릿 창 적용** — `columns = ['space','category','name','spec','unit','quantity','customerUnitPrice','executionUnitPrice','note']`, `newLine = (g) => ({ ...emptyTemplateLine(newLineId()), category: g })`, `onAddFromDb = addFromDbToGroup`, `onRepick`, `materials`. 공사 접기 상태·↑↓·추가 함수 등 부품으로 옮겨진 코드는 지운다. `TemplateDocumentPreview`는 `title={draft.name}`.
- [ ] **Step 3: 확인** — Run: `npm test && npx tsc --noEmit -p .` / Expected: 통과. 개발 서버 + 가짜 응답으로 템플릿 창에서: 이름 바꾸기(새 이름, 기존 이름 → 합치기 확인·취소), 공사 복사·삭제, 줄 복제·다른 공사로 옮기기·삭제, Tab/Enter/Shift+Enter, 마지막 줄 Enter 새 줄(포커스), 한글 조합 중 Enter, 줄 끌기(같은 공사 O / 다른 공사 X), 공사 끌기, 색, 크게 보기(Esc), 저장 후 다시 열기.
- [ ] **Step 4: 커밋** — `공통 공사별 표 부품: 공사 다루기·줄 메뉴·키보드·끌기·색, 템플릿 작업 창 적용`

### Task A4: PR A

- [ ] `npm run build` 통과 확인 → 브랜치 `feat/estimate-grouped-editor` 푸시 → PR(한국어 본문, 확인한 것·미리보기 확인할 것) → Auto-fix 켜기 → 대표님 병합 승인 대기.

---

## PR B — 평형 수량 조정 + 이 견적을 템플릿으로 저장 (main 최신에서 `feat/template-area-and-save`)

### Task B1: 평형·저장 규칙

**Files:** Modify `app/lib/estimate-templates.ts` · Test `tests/estimate-templates.test.mjs`

**Interfaces — Produces:**
- `isAreaUnit(unit: string): boolean`
- `scaleTemplateQuantities<T extends TemplateLine>(lines: T[], ratio: number, units: string[]): { lines: T[]; scaledCount: number }` — `units`는 trim 비교, `ratio`가 유한수·0 초과가 아니면 그대로.
- `templateBaseAreaError(value: unknown): string` — `''`/`null`/`undefined` 허용, 숫자(문자 숫자 포함) 1~500만 통과, 아니면 `'기준 평형은 1~500 사이 숫자로 넣어 주세요.'`.
- `normalizeBaseArea(value: unknown): number | null`
- `templateUnitOptions(lines: TemplateLine[]): Array<{ unit: string; count: number; area: boolean }>` — 처음 나온 순서, 빈 단위는 빼기.

- [ ] **Step 1: 실패하는 테스트**

```js
test('area units are recognised loosely', () => {
  for (const unit of ['m2', 'M2', ' ㎡ ', 'm²', '평']) assert.equal(isAreaUnit(unit), true, unit);
  for (const unit of ['m', '식', 'EA', 'SET', '']) assert.equal(isAreaUnit(unit), false, unit);
});

test('scaling changes only ticked units and rounds to one decimal', () => {
  const lines = [line({ id: 'a', unit: 'm2', quantity: 20 }), line({ id: 'b', unit: '식', quantity: 1 }), line({ id: 'c', unit: 'm', quantity: 7 })];
  const { lines: out, scaledCount } = scaleTemplateQuantities(lines, 33 / 30, ['m2', 'm']);
  assert.deepEqual(out.map((l) => l.quantity), [22, 1, 7.7]);
  assert.equal(scaledCount, 2);
  assert.deepEqual(scaleTemplateQuantities(lines, 0, ['m2']).lines.map((l) => l.quantity), [20, 1, 7]);
  assert.deepEqual(templateUnitOptions(lines), [{ unit: 'm2', count: 1, area: true }, { unit: '식', count: 1, area: false }, { unit: 'm', count: 1, area: false }]);
});

test('기준 평형 is optional and must be 1–500', () => {
  for (const ok of ['', null, undefined, 1, 30, '24.5', 500]) assert.equal(templateBaseAreaError(ok), '', String(ok));
  for (const bad of [0, -3, 501, 'abc']) assert.notEqual(templateBaseAreaError(bad), '', String(bad));
  assert.equal(normalizeBaseArea(' 30 '), 30);
  assert.equal(normalizeBaseArea(''), null);
});
```

- [ ] **Step 2: 실패 확인** → **Step 3: 구현** → **Step 4: `npm test` 통과** → **Step 5: 커밋** `평형 수량 조정과 기준 평형 규칙`

### Task B2: 템플릿 기준 평형 저장

**Files:** Modify `app/api/manager/_estimate-templates.ts`, `app/api/manager/estimate/route.ts`(saveTemplate 입력에 `baseArea`), `app/manager-weve-7519/estimate/template-manager.tsx`

**Interfaces:**
- `EstimateTemplateSummary.baseArea: number | null` (서버·화면 타입 모두). 목록 필드 마스크에 `baseArea` 추가.
- `saveEstimateTemplate(input: { …; baseArea?: unknown })` — `templateBaseAreaError`면 `EstimateTemplateInputError`, 저장 값은 `normalizeBaseArea` (null이면 필드를 `null`로 씀).
- 템플릿 창: 이름 옆 "기준 평형" 숫자 칸(`Draft.baseArea: string`, 스냅샷에 포함), 목록 요약에 `· 30평 기준`.

- [ ] **Step 1: 구현** → **Step 2: `npx tsc --noEmit -p .`** → **Step 3: 가짜 응답으로 저장 요청 본문에 `baseArea`가 실리는지, 0·501에서 저장 전 안내되는지 확인** → **Step 4: 커밋** `템플릿 기준 평형 저장`

### Task B3: 불러오기 창 평형 옵션

**Files:** Modify `app/manager-weve-7519/estimate/template-load-dialog.tsx`

- 공사 고르기 아래 [평형에 맞춰 수량 조정] 체크(기본 꺼짐). 켜면: 기준 평형(템플릿 `baseArea`로 채움)·이 현장 평형 칸, `비율 = 현장 ÷ 기준` 표시(둘 다 0 초과일 때), `templateUnitOptions(chosen)` 체크 목록(area는 처음부터 켜짐).
- `chosen` → (켜져 있고 비율 유효하면) `scaleTemplateQuantities` → `refreshTemplateLines`. 미리보기 합계와 결과 안내("수량을 조정한 항목 N개")에 반영.
- [ ] **Step 1: 구현** → **Step 2: `npx tsc`** → **Step 3: 가짜 응답으로 30→33 평 m2 20 → 22, 식 그대로, 끄면 원래 수량, 기준 평형 없는 템플릿은 직접 입력해야 적용됨 확인** → **Step 4: 커밋** `템플릿 불러오기: 평형에 맞춰 수량 조정(옵션)`

### Task B4: 이 견적을 템플릿으로 저장

**Files:** Create `app/manager-weve-7519/estimate/save-as-template-dialog.tsx` · Modify `app/manager-weve-7519/estimate/page.tsx`(버튼은 지금 견적서 머리 버튼 줄의 [템플릿 불러오기] 옆, `isTemplateSaveOpen` 상태)

**Interfaces:**

```ts
export function SaveAsTemplateDialog(props: {
  api: (query: Record<string, string>) => Promise<TemplateApiData>;
  post: (body: Record<string, unknown>) => Promise<Response>;
  lines: TemplateLine[];                 // 지금 견적 줄
  isBase: (line: TemplateLine) => boolean;
  newLineId: () => string;
  onClose: () => void;
}): JSX.Element;
```

- 공사 체크 목록(`groupTemplateLines(lines without blanks)`), '기본견적' 줄이 든 공사는 처음에 꺼짐. 고른 공사의 줄을 새 id로.
- [새 템플릿]: 이름(템플릿 이름 규칙)·기준 평형 → `saveTemplate` (id 없이, `baseArea`).
- [기존 템플릿에 덮어쓰기]: `part=templates` 목록에서 고름 → 확인 "OO 템플릿의 항목을 이 견적으로 바꿀까요?" → `part=template`으로 `updateTime`·이름·기준 평형 읽기 → 같은 이름·기준 평형, 새 줄로 `saveTemplate`. 409면 "다른 곳에서 먼저 고쳤어요. 다시 시도해 주세요."
- 성공하면 "템플릿 'OO'에 저장했어요." 후 닫기 버튼.
- [ ] **Step 1: 구현** → **Step 2: `npx tsc`** → **Step 3: 가짜 응답으로 새로 저장(본문 줄·기본견적 제외), 덮어쓰기(확인 상자, baseUpdateTime 전달), 덮어쓰기 409 안내, 공사 체크 해제 반영 확인** → **Step 4: 커밋** `이 견적을 템플릿으로 저장: 새 템플릿 또는 덮어쓰기`

### Task B5: PR B — `npm run build` → 푸시 → PR → Auto-fix → 승인 대기.

---

## PR C — 현장 견적 화면 새 배치 (main 최신에서 `feat/estimate-page-grouped`)

### Task C1: 견적 줄 순서 정리

**Files:** Modify `app/manager-weve-7519/estimate/page.tsx`

- 저장된 버전을 편집기에 넣는 곳(`parseJson<EstimateLine[]>(estimate?.linesJson, …)` 직후)과 새 현장 기본 줄, `startNewVersion` 복사 줄, `applyTemplateLines` 결과에 `pinBaseGroupFirst(orderTemplateLinesByGroup(lines), isBaseEstimateLine)`를 적용한다. 저장 상태 기준(`snapshotRequest`)은 이 정리 뒤에 잡히므로 열기만 해서 '저장 안 함'이 되지 않는다.
- `sortedLines`(가나다순)와 '분류별/공간별 정렬' 칸을 없애고, 보이는 줄은 `lines` 순서 + 공간 거르기만.
- [ ] **Step 1: 구현** → **Step 2: `npx tsc`** → **Step 3: 가짜 응답으로 섞인 순서의 견적을 열어 공사별로 모이고 '저장' 버튼이 '저장 안 함' 표시 없이 그대로인지 확인** → **Step 4: 커밋** `현장 견적 줄 순서: 공사별로 모으고 기본견적 맨 위, 가나다 정렬 제거`

### Task C2: 현장 견적 표를 공통 부품으로

**Files:** Modify `app/manager-weve-7519/estimate/page.tsx` (견적서 탭: DB 패널 aside, '항목 추가' 입력칸, 카드 목록)

- 배치: `grid xl:grid-cols-[<DB 패널 340px 또는 접힘 44px>_minmax(0,1fr)_<미리보기 440px 또는 44px>]`. DB 패널 머리에 [접기], 접히면 세로 [DB 펼치기] 막대. 미리보기 `TemplateDocumentPreview title={site title} subtitle={versionLabel}`.
- 도구 줄: [공사 추가](이름 입력 → `insertIntoTemplateGroup`) [DB에서 추가](지금 `openMaterialPicker` 흐름 → 고른 줄을 `orderTemplateLinesByGroup`로 넣기) [템플릿 불러오기] [템플릿 관리] [이 견적을 템플릿으로 저장] · 공간 보기 select(`lineFilterType/Value`를 공간 거르기 하나로 단순화).
- `GroupedLinesEditor` props: `columns = ['space','category','process','name','spec','unit','quantity','customerUnitPrice','executionUnitPrice','margin','note']`, `renderCell`의 category/process/name은 지금 카드의 `PickerCell`·`CommonNameCell` 그대로(`openMaterialPicker(line, step)`), `selectedLineId`/`onSelectLine = setSelectedLineId`, `spaceFilter`, `isPinned = isBaseEstimateLine`, `removeMessage`(지금 `deleteLine` 문구 규칙: 실행 내역 연결 수), `onRemoved = ids → setWorkLines(unlink 각각)`, `lineMenuExtras = line => [{ label: 'DB에 저장', run: () => openLineDbSaveFor(line) }]`, `emptyLineWhenAllRemoved`, `newLine = (g) => ({ ...emptyLine(), category: g, space: lineSpaceFilter || '' })`, `onAddFromDb = (g) => 고르기 창을 열고 고른 줄을 g 공사에 넣기`(템플릿 창과 같은 `TEMPLATE_PICKER_ID` 방식의 별도 대상 id `GROUP_PICKER_ID`).
- 'DB에 저장': 지금 `openLineDbSave`/`saveLineDraftToDb`가 `lineDraft`를 쓰므로, `openLineDbSaveFor(line)`가 `setLineDraft(line)`·`setLineDraftSource(null)` 후 지금 저장 패널을 연다. 저장 패널은 '항목 추가' 칸 안에서 꺼내 도구 줄 아래 접이식 패널로 옮긴다.
- 지우는 것: '항목 추가' 입력칸, [수정 불러오기], 카드 목록, `editLineDraft`·`submitLineDraft` 화면 연결(함수는 다른 곳에서 안 쓰면 삭제).
- [ ] **Step 1: 구현** → **Step 2: `npm test && npx tsc`** → **Step 3: 가짜 응답으로: 선택 후 DB 패널 [선택 행 적용]/[새 행 추가], 고르기 칸 3종, 공통 품명 입력, 마진 칸, 공간 보기(끌기 잠김, Enter 새 줄이 그 공간), 기본견적 고정, 줄·공사 삭제 시 실행 내역 연결 안내, 줄 메뉴 DB에 저장(카테고리·공통 항목), DB 패널·미리보기 접기, 크게 보기, 저장 요청 본문 줄 순서** → **Step 4: 커밋** `현장 견적 화면: 공사별 표·DB 패널 접기·실시간 세부내역서`

### Task C3: 작업 규칙 문서와 PR C

- [ ] `docs/WEVE_WORKING_RULES.md` "Estimate Templates" 절에 공사별 표 규칙(같은 공사 안에서만 끌기, 거르기 중 잠금, 기본견적 고정, 줄 순서 저장, 평형 조정, 템플릿으로 저장) 추가 → `npm run build` → 푸시 → PR → Auto-fix → 승인 대기.

## 마지막 검토

PR C까지 끝나면 세 PR 범위(main 기준 전체)를 새 검토자 한 명이 검토하고, 중요한 문제는 테스트 먼저 쓰고 고친다.
