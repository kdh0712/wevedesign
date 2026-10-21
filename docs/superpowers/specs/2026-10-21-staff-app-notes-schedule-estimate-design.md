# 직원 앱 추가 기능: 현장 기록·할 일, 일정, 견적 보기 (설계 1)

작성일: 2026-10-21 · 상태: 검토 대기 · 앞선 설계: `2026-10-20-staff-mobile-app-design.md`

## 1. 목적과 범위

직원 휴대폰 앱(`/manager-weve-7519/m`)에 세 가지를 더한다. 셋 다 지금 웹앱에 들어가므로 아이폰 웹앱과
나중의 안드로이드 앱(설계 2) 양쪽에서 그대로 쓴다.

1. **현장 기록·할 일**: 현장마다 직원끼리 남기는 기록과 체크하는 할 일. PC 현장 화면에서도 보고 쓴다.
2. **일정**: 모든 진행 현장의 공정을 주 단위 날짜별 목록으로 본다.
3. **견적 보기**: 현장의 견적을 고객 금액만 읽기 전용으로 본다.

성공 기준:

- 사무실(PC)에서 남긴 할 일을 현장 직원이 휴대폰에서 보고 체크하면, PC에서 누가 언제 했는지 보인다.
- 두 직원이 같은 현장에 동시에 기록을 써도 어느 쪽도 사라지지 않는다.
- 일정 탭에서 이번 주 어느 현장에 어떤 공정이 있는지 한 화면에 보인다.
- 견적 화면과 그 API 응답 어디에도 원가(실행 단가·실행 금액)·마진이 없다.

### 결정 사항 (대표님 답변, 2026-10-21)

| 질문 | 결정 |
|---|---|
| 현장 메모 모양 | 기록 목록(누가·언제) + 할 일 체크 목록을 새로 만든다. PC의 기존 '메모' 칸은 휴대폰에서 읽기 전용 |
| PC 표시 | PC 현장 화면에서도 기록·할 일을 보고 쓴다 |
| 견적 내용 | 고객 금액만. 원가·마진은 휴대폰에 보내지 않는다 |
| 일정 모양 | 주 단위 날짜별 목록 |

### 하지 않는 것

기록에 사진 붙이기, 할 일 담당자 지정·마감일, 할 일 알림, 견적 수정·여러 버전 고르기, 일정에서 공정 날짜 바꾸기,
달력 격자. 푸시 알림과 안드로이드 앱은 설계 2에서 다룬다.

## 2. 현장 기록·할 일

### 저장

Firestore 새 컬렉션 `siteNotes`. 문서 하나가 기록 한 줄 또는 할 일 하나다. 문서를 나눠 두기 때문에 동시에 써도
서로 덮어쓰지 않는다.

| 필드 | 내용 |
|---|---|
| `_id` | 서버가 만든 `sn-` + 무작위 24자리 16진수 |
| `siteId` | 현장 id |
| `kind` | `'note'`(기록) 또는 `'todo'`(할 일) |
| `text` | 앞뒤 공백을 뺀 1~1000자 |
| `createdAt` · `createdBy` · `createdByName` | 서버가 세션에서 채운다(`loginId`, 이름). 화면이 보낸 값은 쓰지 않는다 |
| `todoState` | 할 일만: `'open'` 또는 `'done'`. 기록과 지운 문서는 `''` |
| `doneAt` · `doneBy` · `doneByName` | 체크했을 때. 체크를 풀면 지운다 |
| `deletedAt` · `deletedBy` | 지운 표시. 목록에서 빠진다 |

`todoState`를 문자열로 두는 까닭: 지금 있는 `queryFirestoreCollectionByField`(문자열 같음 비교, 복합 색인 불필요)로
"안 한 할 일"만 읽을 수 있다.

### 권한

- 읽기·쓰기·체크: `sites` 권한(현장을 볼 수 있는 사람). admin은 모두 가능.
- 지우기: 쓴 사람 본인(`createdBy === session.loginId`) 또는 admin. 그 밖은 403.
- 고객 진행 현황 페이지와 그 API는 `siteNotes`를 읽지 않는다.
- Firestore 보안 규칙은 `managerDevices`와 같이 클라이언트의 읽기·쓰기를 모두 막는다. 서버 서비스 계정만 쓴다.

### 서버 API: `/api/manager/site-notes`

- `GET ?siteId=…` → `{ notes: SiteNote[] }`. `siteId == …`로 읽고, 지운 것을 빼고, 최신순.
  할 일은 안 한 것 먼저.
- `POST` (JSON):
  - `{ action: 'add', siteId, kind, text }` → 현장이 있고 지워지지 않았는지 확인한 뒤 만든다.
  - `{ action: 'setDone', id, done }` → 할 일만. `todoState`, `doneAt/By/ByName`을 바꾼다.
  - `{ action: 'delete', id }` → 권한을 확인하고 지운 표시를 한다.
  - 쓰기는 `patchFirestoreFields`의 `exists` 조건으로 한다(만들 때 `exists:false`, 바꿀 때 `exists:true`).
- id는 `^sn-[0-9a-f]{24}$`, `siteId`는 상담 id와 같은 형식 검사(`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`)를 거친 뒤에만
  Firestore에 닿는다.
- 입력 검사와 응답 모양은 순수 함수 `app/lib/site-notes.ts`에 둔다(`parseSiteNoteAction`, `toSiteNoteView`,
  `sortSiteNotes`, `canDeleteSiteNote`).
- 현장을 **영구 삭제**할 때 그 현장의 `siteNotes`도 지운다(#21의 영구 삭제 정리 경로에 더한다).

### 휴대폰 화면 (현장 상세)

순서: 위쪽 정보 → 버튼 줄 → **PC 메모(읽기 전용, 있을 때만)** → 진행률·공정표 → **할 일** → **현장 기록** → 최근 보고.

- **할 일**: 체크 상자, 내용, "김OO · 10/21". 안 한 일을 위에, 끝낸 일은 "끝낸 일 N개"로 접는다. 맨 아래 입력칸과
  [추가]. 체크는 바로 서버에 보내고, 실패하면 체크를 되돌리고 알린다.
- **현장 기록**: 최신순, 처음 5개만 보이고 [더 보기]. 맨 아래 입력칸과 [남기기]. 저장에 실패하면 입력한 글은 남긴다.
- 지우기: 본인 글(또는 admin)에만 작은 [지우기], 확인을 한 번 받는다.
- PC 메모를 보여 주려고 `overview`의 현장 정보에 `memo`(있을 때만)를 더한다. `sites` 권한으로 이미 볼 수 있는 값이다.

### 오늘 화면

- `overview`에 `openTodoCounts: Record<siteId, number>`를 더한다. `todoState == 'open'`으로 한 번 읽어 현장별로 센다
  (지운 문서는 `todoState`가 `''`이므로 빠진다). 진행 현장 카드에 "할 일 2"를 표시한다.
- 휴대폰에서 할 일을 추가·체크하면 그 숫자를 화면에서 바로 고친다(다시 불러오지 않는다).

### PC 화면

- PC 현장 편집 화면(기존 '메모' 칸 아래)에 같은 할 일·기록 목록을 넣는다. 새 컴포넌트
  `app/manager-weve-7519/site-notes-panel.tsx`, 기존 PC 세션으로 같은 API를 부른다.
- 기존 '메모' 칸은 바꾸지 않는다.
- 새 현장을 만드는 중(아직 저장 전)에는 "저장한 뒤에 쓸 수 있어요"만 보인다.

## 3. 일정 탭

- 아래 탭에 **일정**을 더한다. 순서: 오늘 · 현장 · 일정 · 보고 · 상담. `sites` 권한이면 보인다
  (`visibleMobileTabs`). 아이콘은 달력.
- 데이터: 지금 `overview`의 현장 공정표(`sites[].schedule.tasks`)를 그대로 쓴다. 새 API나 Firestore 읽기가 없다.
  완료·보류 현장은 이미 빠져 있다.
- 순수 함수 `buildWeekSchedule(sites, weekStart, today)`(`app/lib/mobile-schedule.ts`):
  - 주는 월요일 시작, 7일. `weekStart`는 그 주 월요일.
  - 공정이 그날에 걸리면(`startDate <= 날 <= endDate`) 그날 목록에 넣는다. 날짜가 없거나 잘못된 공정은 뺀다.
  - 각 줄: 현장 id·이름, 공정 이름, "n/m일"(공정 기간 중 몇째 날, 양 끝 포함 달력 날짜), 거래처 이름(권한 있을 때),
    그날이 시작이면 `starts`, 끝이면 `ends`, 지연이면 `delayed`(공정표의 `state`).
  - 같은 날 안에서는 지연 먼저, 그다음 현장 이름, 공정 시작일 순.
- 화면: 위에 "10월 20일 ~ 26일"과 [◀] [이번 주] [▶]. 날짜 머리에 "20일 (월)", 오늘은 강조. 공정이 없는 날은
  "일정 없음" 한 줄. 줄을 누르면 그 현장 상세로 간다.
- 뒤로 가기: 일정이나 오늘에서 연 현장 상세는 뒤로 가기(안드로이드 버튼 포함)를 누르면 연 탭으로 돌아간다.
  화면의 "현장 목록" 버튼은 지금처럼 현장 목록으로 간다.

## 4. 견적 보기

- 현장 상세 버튼 줄에 **견적**을 더한다. `estimates` 권한이 있을 때만(`overview`의 `canViewEstimates`로 알린다).
- 누르면 현장 상세 안의 견적 화면으로 바뀐다. 뒤로 가기(버튼과 안드로이드)는 현장 상세로 돌아간다.
  `createBackGuard`를 한 단계 더 쌓을 수 있게 넓힌다(현장 상세 → 견적).
- 서버 `GET /api/manager/mobile/estimate?siteId=…`: `requireManager(anyOf ['estimates'])`. `siteId` 형식 검사 →
  그 현장의 견적을 읽는다 → 지운 것 빼고 `pickScheduleEstimate`(최근 확정본, 없으면 최근 견적)로 하나 고른다 →
  순수 함수 `toCustomerEstimateView`(`app/lib/mobile-estimate.ts`)로 바꿔 보낸다.
- `toCustomerEstimateView` 결과(이것만 보낸다):
  - `versionLabel`, `versionType`, `updatedAt`, `total`, `vatNote: '부가세 별도'`
  - `groups[]`: `category`(`line.category || line.process || '기타 공사'`, PC 고객 견적서와 같은 규칙), `subtotal`, `lines[]`
  - `lines[]`: `name`, `spec`(`spec || space`), `unit`(`unit || '식'`), `quantity`, `unitPrice`(= `customerUnitPrice`),
    `amount`(= 수량 × 고객 단가), `note`(고객 견적서에도 찍히는 칸)
  - 품명이 없는 줄은 뺀다(PC 고객 견적서와 같다). `total`은 남은 줄 금액의 합.
  - `executionUnitPrice`, `executionAmount`, 원가·마진 합계, 작업 내역(`workLinesJson`), 발주서, 견적 `memo`는 담지 않는다.
- 화면: 위에 버전 이름(없으면 "확정 견적"/"최근 견적"), 수정일, **총액**과 "(부가세 별도)". 그 아래 묶음마다 이름과
  소계, 펼치면 줄마다 품명·규격 / 수량·단위 × 단가 = 금액 / 비고. 처음에는 모두 접힌 상태.
  견적이 없으면 "이 현장에는 견적이 없어요."

## 5. 오류 처리

지금 앱의 규칙을 따른다: 연결 오류면 마지막 화면을 두고 [다시 시도], API 401은 한 번 강제 갱신 후 다시 시도하고
또 401이면 로그아웃, 저장 실패 시 입력한 글은 남긴다. 서버 500은 고정 문구로 답하고 자세한 오류는 서버 로그에만 남긴다.
할 일 체크처럼 화면을 먼저 바꾸는 동작은 실패하면 되돌린다.

## 6. 테스트

실패하는 테스트를 먼저 쓴다(`node --test`, `tests/*.test.mjs`).

- `tests/site-notes.test.mjs`: 입력 검사(빈 글, 1000자 초과, 모르는 `kind`, id·siteId 형식), 지우기 권한(본인·admin만),
  정렬(안 한 일 먼저, 최신순), 응답에 내부 필드가 없는지.
- `tests/mobile-schedule.test.mjs`: 주 시작(월요일, 연말 넘김), 공정이 걸리는 날, 시작·마감·n/m일, 잘못된 날짜 제외, 정렬.
- `tests/mobile-estimate.test.mjs`: 묶음 규칙, 품명 없는 줄 제외, 금액 계산, **결과 JSON에 원가·마진 필드가 없음**.
- `tests/mobile-overview.test.mjs`: 일정 탭 권한, `openTodoCounts` 세기, PC 메모 포함.
- `tests/mobile-screen.test.mjs`: 두 단계 뒤로 가기(현장 상세 → 견적), 연 탭으로 돌아가기.
- `npm test`, `npm run build` 통과. 배포 미리보기에서 PC와 휴대폰으로 할 일 주고받기를 확인한다.

## 7. 운영 준비와 문서

- 새 환경변수는 없다. Firestore 컬렉션 `siteNotes`는 처음 쓸 때 생긴다. Firebase 콘솔의 Firestore 보안 규칙에
  `siteNotes`도 클라이언트 접근 금지로 넣는다(대표님이 콘솔에서 확인).
- `docs/WEVE_WORKING_RULES.md`의 Staff Phone App 절에 일정 탭, 기록·할 일 권한, 견적 보기(고객 금액만)를 더한다.
