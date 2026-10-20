# 직원용 휴대폰 웹앱 설계

작성일: 2026-10-20 · 상태: 검토 대기

## 1. 목적

직원이 이동 중이나 현장에서 휴대폰으로 오늘 일을 빨리 확인하고, 바로 전화하고, 일일 보고를 올린다.
안드로이드와 아이폰 모두 홈 화면에 아이콘을 추가해 앱처럼 쓴다(웹앱, PWA). 스토어 앱은 만들지 않는다.

성공 기준:

- 아이콘을 누르면 다시 로그인하지 않고(30일 이내) 오늘 홈이 3초 안에 뜬다.
- 현장에서 사진을 찍어 일일 보고를 저장하고 고객 알림톡까지 휴대폰에서 끝낼 수 있다.
- 새 상담을 보고 바로 전화한 뒤 상태를 바꿀 수 있다.
- PC 관리자 화면의 동작과 권한 규칙은 바뀌지 않는다.

### 결정 사항 (대표님 답변)

| 질문 | 결정 |
|---|---|
| 형태 | 사이트 안의 웹앱(PWA). 스토어 앱은 나중에 필요하면 Expo로 |
| 1차 기능 | 오늘 홈, 현장 상세, 휴대폰 일일 보고, 상담 목록 |
| 보여 줄 현장 | 권한 있는 직원은 전체 현장. 담당 직원 칸은 만들지 않는다 |
| 로그인 유지 | 30일 유지. 관리자가 기기별로 로그인을 끊을 수 있다 |
| 상담 알림 | 지금 알림톡 그대로. 앱에는 새 상담 수와 목록만 표시. 푸시 알림은 2차 |
| 디자인 | 대화에서 확인한 시안(아이보리 배경, 먹색 글씨, 브론즈 포인트, 아래 탭 4개) |
| 휴대폰 보고 | 고객 진행 기록만 올린다. 내부 메모 칸은 두지 않는다 |

### 하지 않는 것 (1차)

푸시 알림, 오프라인 사용, 스토어 배포, 견적 보기, 일정 달력, 거래처·자재 검색, 현장 메모·체크리스트, A/S 기록,
고객 등록·현장 만들기(PC에서 한다).

## 2. 주소와 설치

- 주소: `/manager-weve-7519/m` (관리자 화면 아래, 공개 사이트와 분리).
- `/manager-weve-7519/:path*`에 `X-Robots-Tag: noindex, nofollow`와 `Cache-Control: private, no-store`를 붙인다.
  지금 관리자 화면에는 없어서 함께 추가한다.
- 앱 정보 파일 `/manager-weve-7519/m/manifest.webmanifest`:
  이름 "위브 업무", `scope`·`start_url`은 `/manager-weve-7519/m`, `display: standalone`, 배경·테마색 `#fffdf8`.
  아이콘은 `public/weve-symbol.png`(512)에서 192·512 크기와 마스크용(여백 있는) 512를 만든다.
- 아이폰용 `apple-touch-icon`, `apple-mobile-web-app-capable`, 상태바 색 메타 태그를 넣는다.
- 서비스 워커는 1차에 넣지 않는다. 안드로이드 크롬과 아이폰 사파리 모두 없어도 홈 화면에 추가된다.
- 처음 들어왔을 때 홈 화면 추가 방법을 안내하는 카드를 보여 준다(아이폰: 공유 → 홈 화면에 추가,
  안드로이드: 메뉴 → 홈 화면에 추가). 이미 앱으로 열렸으면(`display-mode: standalone`) 숨긴다.

## 3. 로그인: 기기 토큰

지금 세션 토큰은 8시간짜리이고 서버가 DB를 보지 않고 검증한다(`_token.ts`). 이 구조는 그대로 두고,
휴대폰에는 30일짜리 **기기 토큰**을 따로 준다. 기기 토큰으로는 API를 직접 부를 수 없고, 1시간짜리 일반 세션
토큰을 받아 오는 데만 쓴다. 그래서 기존 API(`requireManager`)는 하나도 바꾸지 않는다.

### 흐름

1. **로그인**: 휴대폰 로그인 화면에서 아이디·비밀번호를 넣는다. 서버는 PC 로그인과 같은 방법으로 확인한다
   (Firebase 이메일, `admin` 마스터 비밀번호, ID 계정). 같은 시도 제한(`loginLimiter`)을 쓴다.
   성공하면 기기 기록을 만들고 `{ deviceId, deviceToken, session }`을 돌려준다.
2. **앱을 열 때·1시간마다**: `deviceId`와 `deviceToken`으로 새 세션 토큰(1시간)을 받는다. 이때 서버가 확인한다.
   - 기기 기록이 있고, 끊기지 않았고, 30일이 지나지 않았다.
   - 계정이 아직 활성이다. 권한과 역할은 이때 계정에서 다시 읽는다.
3. **로그아웃**: 자기 기기 기록을 끊고 휴대폰에 저장된 값을 지운다.
4. **관리자가 끊기**: PC 관리자 화면 '계정' 탭에 "휴대폰 로그인 기기" 목록을 두고 기기마다 [로그인 끊기]를 둔다.
   끊은 기기는 늦어도 1시간 안에(다음 갱신 때) 로그인 화면으로 돌아간다.

로그인 유지는 마지막 로그인부터 30일이다. 사용할 때마다 늘어나지 않는다.

### 저장

- Firestore 컬렉션 `managerDevices/{deviceId}` (서버 서비스 계정으로만 읽고 쓴다):
  `userId, loginId, userName, src, deviceLabel, tokenHash, createdAt, expiresAt, lastUsedAt, revokedAt, revokedBy`.
- `deviceToken`은 무작위 32바이트. 서버에는 SHA-256 해시만 저장하고 `timingSafeEqual`로 비교한다.
- `deviceLabel`은 User-Agent에서 뽑은 "iPhone · Safari" 같은 짧은 이름이다.
- `lastUsedAt`은 갱신할 때 적되, 10분 안에 다시 적지 않는다(쓰기 비용).
- 휴대폰은 `deviceId`·`deviceToken`을 `localStorage`에, 1시간 세션 토큰은 메모리에 둔다.
- Firestore 서비스 계정이 없는 환경에서는 휴대폰 로그인이 "휴대폰 로그인을 쓸 수 없습니다"로 막힌다.

### 토큰 변경

- `SessionSource`에 값을 더하지 않는다. 세션 토큰의 `src`는 원래 로그인 방식을 그대로 쓴다.
- `signSessionToken`에 만료 시간(초)을 받는 선택 인자를 더한다. 기본값은 지금처럼 8시간이다.

### 계정 다시 확인

| 로그인 방식 | 갱신 때 확인 |
|---|---|
| Firebase 이메일 | 서버 권한으로 `users/{uid}` 프로필을 읽어 `isActive`, `role`, 관리자 표시, `permissions`를 다시 계산 |
| ID 계정(Sanity) | `managerAccount` 문서를 `_id`로 읽어 `isActive`, `role`, `permissions` 확인 |
| 마스터 비밀번호(admin) | 계정 문서가 없으므로 기기 기록만 확인 |

로그인 확인 코드는 `auth/route.ts`에서 공통 함수로 뽑아 PC 로그인과 휴대폰 로그인이 같이 쓴다.

## 4. 서버 API

모두 `app/api/manager/mobile/` 아래에 둔다.

### `POST /api/manager/mobile/session`

| action | 입력 | 결과 |
|---|---|---|
| `login` | `loginId, password` | `{ deviceId, deviceToken, expiresAt, session }` |
| `refresh` | `deviceId, deviceToken` | `{ session }` 또는 401 `{ error, signedOut: true }` |
| `logout` | `deviceId, deviceToken` | `{ ok: true }` |

`session`은 PC 로그인 응답과 같은 모양 `{ token, expiresAt, user }`이다.

### `GET /api/manager/mobile/devices` · `DELETE /api/manager/mobile/devices` (admin 전용)

목록은 끊기지 않고 만료되지 않은 기기를 최근 사용 순으로 보여 준다. 삭제는 `{ deviceId }`를 받아 `revokedAt`을 적는다.

### `GET /api/manager/mobile/overview`

휴대폰 화면 전체에 필요한 값을 한 번에 돌려준다. 1시간 세션 토큰이 필요하다.

```
{
  today: '2026-10-20',
  sites: [{ id, title, address, status, customerName, customerPhone?,
            schedule: { percent, startDate, endDate,
                        tasks: [{ id, name, state, percent, startDate, endDate, vendorName?, vendorPhone? }] } | null }],
  activeSiteIds: [...],      // 오늘 홈에 나오는 현장
  tomorrow: [{ siteId, siteTitle, taskName, vendorName? }],
  consultations?: [{ id, name, phone, createdAt, status, siteType, areaRange, reason, timeline, region, message, memo }]
}
```

- **현장 목록**: 휴지통이 아니고 상태가 '완료', '보류'가 아닌 현장.
- **공정표**: 그 현장의 견적 중 `pickScheduleEstimate`로 고른 견적의 `scheduleJson`을 `summarizeSchedule`로 계산한다
  (고객 진행 현황 페이지와 같은 규칙. 지연 표시 포함).
- **오늘 홈 현장**: 상태가 '시공중'이거나, 공정표에 오늘 진행 또는 지연 공정이 있는 현장. 지연 공정이 있는 현장을
  먼저, 그다음 시작일 순.
- **내일 시작**: 오늘 홈 현장들의 공정 중 시작일이 내일인 것.
- **상담**: '신규'·'상담중'·'견적'은 모두, '계약'·'완료'는 최근 30일 것만. 최신순. 지역은 주소의 시·동까지만.
- 순수 계산(현장 고르기, 정렬, 내일 공정, 상담 정리)은 `app/lib/mobile-overview.ts`에 import 없는 함수로 둔다.

### 기존 API를 그대로 쓰는 곳

- 현장 상세의 최근 보고: `GET /api/manager/progress?siteId=`
- 일일 보고 사진 올리기·저장·알림톡: `POST /api/manager/progress` (`uploadPhoto`, `createUpdate`, `notify`)
### `POST /api/manager/mobile/consultation`

상담 상태·메모만 바꾼다. `POST /api/manager/office`는 기록을 통째로 덮어쓰므로(확인함) 쓰지 않는다.
입력 `{ id, status?, memo? }`. `status`는 '신규', '상담중', '견적', '계약', '완료' 중 하나, `memo`는 2000자 이하.
`patchFirestoreFields`로 받은 칸과 `updatedAt`만 쓰고, 문서가 있을 때만 쓴다(`exists: true`). 휴지통의 상담은 404.
결과 `{ consultation }`(overview의 상담 모양).

## 5. 권한

| 화면·값 | 필요한 권한 |
|---|---|
| 오늘·현장 탭, 고객 전화 | `sites` |
| 공정 거래처 이름·전화 | `sites`와 함께 `estimates` 또는 `vendors` |
| 보고 탭, 보고 저장·사진·알림톡 | `sites`와 `dashboard` (지금 PC 규칙과 같다) |
| 상담 탭, 상태·메모 바꾸기 | `consultations` |

서버가 권한 없는 값은 `overview`에 넣지 않는다. 화면은 권한 없는 탭을 숨긴다. 탭이 하나도 없으면
"휴대폰에서 볼 수 있는 권한이 없습니다. 관리자에게 권한을 요청해 주세요."를 보여 준다.

## 6. 화면

공통: 화면 아래 탭(오늘, 현장, 보고, 상담), 아이보리 배경 `#fffdf8`, 글씨 `#171512`, 보조 글씨 `#625d54`,
테두리 `#eadfcd`, 진행 막대 `#8f6f43`, 지연은 주황(`#c2410c` 계열)에만. 가장 중요한 버튼 하나만 먹색으로 채운다.
누르는 곳은 44px 이상. 아이폰 홈 바·노치 여백(`safe-area-inset`)을 지킨다. 아래로 당기면 새로고침.

1. **오늘**: 날짜와 "○○님, 오늘 현장 N곳", 새 상담 카드(신규 수, 가장 최근 시각·지역 → 상담 탭),
   지연 경고(현장·공정·진행률), 오늘 현장 카드(진행률, 오늘 공정), 내일 시작 공정.
2. **현장**: 검색창과 상태별 목록. 누르면 **현장 상세**: 고객 전화(`tel:`), 길 안내(카카오맵 검색 링크),
   보고 쓰기, 전체 진행률과 기간, 공정표(완료·진행·지연·예정, 거래처 전화), 최근 보고 3개.
3. **보고**: 고객 진행 기록을 올리는 화면이다(대표님 결정: 내부 메모는 두지 않는다. PC의 내부 작업 내용은
   그 PC 브라우저에만 저장되기 때문). 현장 고르기(현장 상세에서 오면 이미 골라짐), 날짜(오늘), 사진 촬영·선택
   (`<input type="file" accept="image/*" capture="environment">`와 앨범용 `multiple` 입력 두 개, 기존 `resize-image.ts`로
   줄여서 하나씩 업로드), 사진마다 빼기 버튼, "고객에게 보이는 내용" 한 칸.
   [올리고 알림톡 보내기] / [올리기만]. 두 버튼 모두 고객 진행 현황 페이지에 올라간다고 버튼 위에 적는다.
   저장은 PC와 같은 `createUpdate`이고 결과 안내는 `postResultMessages`를 그대로 쓴다. 담당자 이름(`designer`)은
   로그인한 직원 이름이다.
4. **상담**: 신규 / 진행(상담중·견적) / 끝남(계약·완료) 구분. 카드에 이름, 경과 시간, 지역, 공간·평형·사유·시기,
   요청 메시지, 전화 버튼. 카드를 누르면 상태 바꾸기(상담중, 견적, 계약, 완료)와 메모.

## 7. 오류 처리

- 갱신이 401 `signedOut`이면 저장값을 지우고 로그인 화면으로 간다. 네트워크 오류면 마지막 화면을 그대로 두고
  "연결이 불안정합니다. 다시 시도"를 보여 준다.
- `overview`는 마지막 성공 결과를 메모리에 두고, 앱이 다시 앞에 나오면(`visibilitychange`) 5분이 지났을 때만 다시 받는다.
- 보고 사진 업로드가 실패하면 PC와 같이 기록을 만들지 않고 실패한 사진 이름을 알린다. 고른 사진과 글은 그대로 둬
  [다시 시도]로 다시 올릴 수 있다. 작성 중인 글이나 사진이 있으면 화면을 떠나기 전에 확인을 받는다.
- 알림톡 실패는 저장 성공과 따로 알려 준다(지금 PC와 같다).

## 8. 테스트

- `tests/mobile-overview.test.mjs`: 오늘 홈 현장 고르기, 지연 먼저 정렬, 내일 공정, 상담 구분·30일 제한,
  권한별로 빠지는 값.
- `tests/mobile-device.test.mjs`: 기기 토큰 해시·비교, 만료, 끊긴 기기, 10분 안 `lastUsedAt` 생략 규칙
  (순수 함수로 뽑아서 테스트).
- `npm test`, `npm run build` 통과.
- 로컬 개발 서버에서 휴대폰 크기(375×812)로 로그인 → 오늘 → 현장 상세 → 보고 저장 → 상담 상태 변경 확인.
- 실제 아이폰·안드로이드에서 홈 화면 추가, 카메라 촬영, 전화 걸기는 배포 후 대표님이 확인한다.

## 9. 운영 준비와 문서

- 새 환경변수는 없다. Firestore 서비스 계정(이미 사용 중)이 필요하다.
- `docs/WEVE_WORKING_RULES.md`에 "직원 휴대폰 웹앱" 절을 추가한다: 주소, 설치 방법, 30일 로그인과 끊기, 권한 표.
- `Permissions-Policy: camera=()`는 그대로 둔다. 파일 입력의 `capture`는 휴대폰 기본 카메라 앱을 열기 때문에
  이 정책의 영향을 받지 않는다(실기기에서 확인).
