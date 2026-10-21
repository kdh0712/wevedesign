# 직원 앱 설계 2: 새 상담 푸시 알림과 안드로이드 설치 파일

작성일: 2026-10-21 · 상태: 검토 대기 · 앞선 설계: `2026-10-20-staff-mobile-app-design.md`,
`2026-10-21-staff-app-notes-schedule-estimate-design.md`(PR #25, 이 작업은 그 위에 얹는다)

## 1. 목적과 범위

새 상담이 들어오면 직원 휴대폰에 알림이 오게 하고, 안드로이드 직원은 링크로 받은 설치 파일(APK)로 앱을 깐다.

성공 기준:

- 상담 권한이 있는 직원이 휴대폰에서 [알림 켜기]를 누르면, 그 뒤 홈페이지 상담과 카카오 비즈폼 상담이 들어올 때
  앱을 열지 않아도 알림이 온다(홈페이지는 저장 직후, 카카오는 10분 안팎).
- 알림을 누르면 앱의 상담 탭이 열린다.
- 권한을 빼거나 그 휴대폰 로그인을 끊으면 다음 상담부터 알림이 가지 않는다.
- 안드로이드 직원은 APK 하나로 '위브 업무' 앱을 깔고, 주소창 없이 쓰며 알림을 받는다.
- 알림이 실패해도 상담 저장·알림톡·이메일은 지금과 똑같다.

### 결정 사항 (대표님 답변, 2026-10-21)

| 질문 | 결정 |
|---|---|
| 유료 개발자 계정 | 쓰지 않는다 |
| 알림 대상 | 홈페이지 상담 + 카카오 비즈폼 상담. 카카오는 PC가 꺼져 있어도 서버가 가져온다 |
| 받는 사람 | 상담 권한자 중 자기 휴대폰에서 알림을 켠 사람 |
| 안드로이드 앱 | 웹앱을 감싼 APK(TWA). 알림은 아이폰과 같은 웹 푸시 하나. Expo는 이번에 쓰지 않는다 |
| Vercel 요금제 | Hobby. 카카오 자동 가져오기는 GitHub Actions 예약 실행(공개 저장소라 무료) |

### 하지 않는 것

알림 설정 세분화(시간대·지역별), 상담 외 알림(보고·할 일), 오프라인 캐시, Play 스토어 배포, Expo 앱, PC 브라우저 알림.

## 2. 웹 푸시 보내기 (서버)

### 준비

- 패키지 `web-push`(VAPID 서명과 내용 암호화)를 더한다.
- 환경변수: `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`(`npx web-push generate-vapid-keys`로 한 번 만든다),
  `WEB_PUSH_SUBJECT`(`mailto:` 주소). 셋 중 하나라도 없으면 알림 기능은 꺼진 것으로 보고 화면은
  "알림 기능이 아직 설정되지 않았어요"를 보여 준다. 공개키는 API가 화면에 내려준다(`NEXT_PUBLIC_` 변수는 쓰지 않는다).

### 구독 저장

Firestore 새 컬렉션 `pushSubscriptions`. 문서 id는 `ps-<휴대폰 로그인 기기 id>`라서 한 휴대폰에 하나다
(다시 켜면 덮어쓴다).

| 필드 | 내용 |
|---|---|
| `deviceId` | `managerDevices`의 기기 id |
| `userId` · `loginId` | 켤 때 확인한 직원 |
| `endpoint` · `p256dh` · `auth` | 브라우저가 준 알림 주소와 암호 키 |
| `createdAt` · `updatedAt` · `lastSentAt` | 시각 |

브라우저 접근은 Firestore 보안 규칙으로 막고(`managerDevices`, `siteNotes`와 같다) 서버 서비스 계정만 쓴다.

### 알림 주소 검사

서버가 이 주소로 요청을 보내므로, 알려진 푸시 서비스 주소만 받는다(`https`만):
`fcm.googleapis.com`, `*.push.apple.com`, `updates.push.services.mozilla.com`, `*.notify.windows.com`.
그 밖은 400. 길이는 1000자까지, 키는 base64url 형식만.

### API: `/api/manager/push`

모두 `requireManager(anyOf ['consultations'])`와 **휴대폰 기기 확인**을 거친다: 요청에 기기 id·토큰을 함께 보내고,
서버가 `deviceRefreshDecision`으로 살아 있는 기기인지, `device.userId`가 세션 직원과 같은지 확인한다.

- `GET` → `{ configured, publicKey }` (기기 확인 없이, 권한만)
- `POST { action: 'status', deviceId, deviceToken }` → `{ subscribed }`
- `POST { action: 'subscribe', deviceId, deviceToken, subscription: { endpoint, keys: { p256dh, auth } } }` → 저장
- `POST { action: 'unsubscribe', deviceId, deviceToken }` → 삭제
- `POST { action: 'test', deviceId, deviceToken }` → 그 휴대폰에만 "알림이 잘 와요" 시험 알림

입력 검사는 순수 함수(`app/lib/push-rules.ts`의 `parsePushAction`, `isPushEndpointAllowed`)에 둔다.

### 받는 사람 확인 (보낼 때마다)

`pushSubscriptions` 전체를 읽고 구독마다:

1. 기기(`managerDevices`)를 읽어 서명이 맞고, 끊기지 않았고, 만료되지 않았는지 본다(`deviceIsActive`, 토큰 비교 없이).
   아니면 구독을 지우고 넘어간다.
2. 계정을 다시 읽는다(`reloadManagerUser`). 없거나 상담 권한(`hasAnyPermission(['consultations'])`, admin 포함)이
   없으면 보내지 않는다(구독은 남긴다: 권한이 돌아오면 다시 받는다).
3. 보낸다. 푸시 서비스가 404·410이면 구독을 지운다. 그 밖의 실패는 서버 로그에만 남긴다.

직원 수가 적어 읽기 비용은 작다. 계정을 같은 요청 안에서 두 번 읽지 않도록 `userId`별로 한 번만 읽는다.

### 로그인 끊기와 함께 정리

휴대폰 로그아웃(`/api/manager/mobile/session` logout), 새로 로그인할 때 이전 기기 끊기, 관리자의 [로그인 끊기]
(`DELETE /api/manager/mobile/devices`), 갱신 때 계정이 사라져 기기를 끊을 때 → `ps-<기기 id>`를 지운다
(실패는 로그만; 보낼 때 1번에서 다시 걸러진다).

### 알림 내용

순수 함수 `consultationPushMessage(consultations, nowMs)`:

- 접수 시각(`createdAt`)이 지금부터 24시간 안인 상담만 센다. 하나도 없으면 보내지 않는다.
- 1건: 제목 "새 상담", 내용 `[지역, 공간, 평형].filter(Boolean).join(' · ')`(`toMobileConsultation`의 `region`,
  `siteType`, `areaRange`). 셋 다 비면 "새 상담이 들어왔어요".
- 2건 이상: 제목 "새 상담 N건", 내용 "앱에서 확인해 주세요".
- **이름, 전화번호, 메시지는 절대 넣지 않는다**(잠금화면에 보인다).
- `url`: `/manager-weve-7519/m?tab=consultations`, `tag`: `new-consultation`(같은 태그는 알림 하나로 겹친다).
- 보낼 때 TTL 24시간, 긴급도 high.

### 언제 보내나

- **홈페이지 상담** (`app/api/send-consultation/route.ts`): 저장이 끝난 뒤 `after(() => notifyNewConsultations([record]))`.
  봇·중복으로 저장하지 않은 요청은 보내지 않는다.
- **카카오 비즈폼**: 새로 가져온 상담 목록으로 `notifyNewConsultations(imported)`(§4). PC 동기화·서버 예약 실행 모두.

## 3. 휴대폰 화면: 알림 켜기

### 서비스 워커

`public/manager-weve-7519/m/sw.js`, 범위 `/manager-weve-7519/m`. 하는 일은 둘뿐이다.

- `push`: 받은 JSON으로 `showNotification(title, { body, icon: '/staff-app/icon-192.png', tag, data: { url } })`.
- `notificationclick`: 열린 앱 창이 있으면 그 창을 앞으로 가져와 `url`로 이동, 없으면 새 창으로 연다.

`fetch` 처리와 캐시는 넣지 않는다. 배포한 화면이 지금처럼 바로 반영된다.

앱이 시작될 때(로그인 후) 서비스 워커를 등록한다. 등록 실패는 알림 칸에서만 알린다.

### [새 상담 알림] 칸

상담 탭 맨 위, 상담 권한이 있는 사람에게만 보인다. 상태는 순수 함수 `pushPanelState(env)`로 정한다
(`app/manager-weve-7519/m/push-state.ts`):

| 상태 | 화면 |
|---|---|
| 서버 설정 없음 | "알림 기능이 아직 설정되지 않았어요." |
| 브라우저가 지원 안 함 | "이 휴대폰에서는 알림을 받을 수 없어요." (iOS 16.4 미만 등) |
| 아이폰이고 홈 화면 앱이 아님 | "홈 화면에 추가한 앱에서만 알림을 켤 수 있어요." + 추가 방법 |
| 알림 거부됨 | "휴대폰 설정에서 '위브 업무' 알림을 허용해 주세요." |
| 꺼짐 | [알림 켜기] |
| 켜짐 | "새 상담이 오면 알려 드려요." [시험 알림] [끄기] |

[알림 켜기]: 알림 권한 요청 → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` →
`subscribe` API. 어느 단계든 실패하면 무엇이 안 됐는지 한 줄로 알린다. 휴대폰 기기 id·토큰은 `mobile-session.ts`에
`deviceCredentials()`를 더해 꺼낸다(로그인 안 된 상태면 칸을 보여 주지 않는다).

### 알림을 누르면

앱은 `?tab=consultations`로 열리면 상담 탭을 고른다(권한이 있을 때). 읽은 뒤 주소에서 `tab`을 지운다.

## 4. 카카오 비즈폼 자동 가져오기

- 지금 `app/api/integrations/kakao-bizform/sync/route.ts` 안의 가져오기를 `app/api/manager/_kakao-bizform.ts`의
  `importKakaoBizForm(): Promise<{ imported: Array<Record<string, unknown>> }>`로 뺀다. 동작(최대 10쪽, 이미 있는 id 건너뛰기,
  Firestore/Sanity 저장)은 그대로다. 기존 라우트는 이 함수를 부르고, 응답 뒤에 `after()`로 알림을 보낸다.
- 새 라우트 `POST /api/cron/kakao-bizform`: `Authorization: Bearer <CRON_SECRET>`만 받는다(시간 일정 비교,
  `isCronAuthorized` 순수 함수). `CRON_SECRET`이 없으면 503, 틀리면 401. 가져온 뒤 알림을 보내고
  `{ imported: n }`을 돌려준다. 카카오 설정이 없으면 `{ imported: 0, skipped: '카카오 설정 없음' }`.
- `.github/workflows/kakao-bizform-sync.yml`: `schedule: '*/10 * * * *'`와 `workflow_dispatch`. 단계 하나:
  `curl -fsS -X POST -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" "${{ secrets.SITE_URL }}/api/cron/kakao-bizform"`.
  GitHub 저장소 Secrets에 `CRON_SECRET`(Vercel과 같은 값)과 `SITE_URL`(`https://www.wevedesign.co.kr`)을 넣는다.
- 공개 저장소는 60일 동안 커밋이 없으면 GitHub가 예약 실행을 멈춘다(메일로 알림, Actions 화면에서 다시 켬).
  규칙 문서에 적는다.
- 밀린 상담이 한꺼번에 들어와도 §2의 24시간 기준과 묶기 때문에 알림은 한 번이다.

## 5. 안드로이드 설치 파일 (TWA)

### 사이트 쪽

- 앱 정보 파일(`m/manifest.webmanifest/route.ts`)에 `id: '/manager-weve-7519/m'`, `orientation: 'portrait'`,
  `categories: ['business', 'productivity']`를 더한다(PWABuilder 경고 대응. 스크린샷은 스토어용이라 넣지 않는다).
- `/.well-known/assetlinks.json`: `next.config.ts` rewrite로 `app/api/android-assetlinks/route.ts`에 연결한다.
  순수 함수 `assetLinksFor(packageName, fingerprints)`가 Digital Asset Links JSON을 만든다. 패키지 이름은
  `kr.co.wevedesign.staff`, 지문은 환경변수 `ANDROID_APP_SHA256`(쉼표로 여러 개, 대문자 16진수와 `:`).
  값이 없으면 `[]`. `Content-Type: application/json`, 캐시 1시간.

### 만들기와 나눠 주기 (대표님, 안내 문서 `docs/STAFF_APP_ANDROID_SETUP.md`)

1. 설계 2가 배포된 뒤 PWABuilder에 `https://www.wevedesign.co.kr/manager-weve-7519/m`을 넣고 다시 검사한다.
2. Package For Stores → Android → 패키지 이름 `kr.co.wevedesign.staff`, 앱 이름 "위브 업무",
   알림 위임(Notification delegation) 켬, 서명 키는 새로 만들기.
3. 받은 묶음의 **서명 키 파일과 비밀번호는 안전한 곳에 보관**한다(앱을 다시 만들 때 꼭 필요, 저장소에 넣지 않는다).
4. 묶음 안 `assetlinks.json`의 지문을 Vercel `ANDROID_APP_SHA256`에 넣고 다시 배포한다.
5. APK를 카카오톡·드라이브 링크로 직원에게 보낸다. 직원은 "출처를 알 수 없는 앱 설치"를 한 번 허용한다.
6. 앱을 열어 로그인 → 상담 탭 [알림 켜기] → [시험 알림].

화면 수정은 사이트 배포만으로 반영되므로 APK를 다시 만들 일은 앱 이름·아이콘을 바꿀 때뿐이다.

## 6. 오류 처리

- 알림 보내기는 상담 저장 뒤 `after()`에서 돌고, 어떤 실패도 상담 저장·알림톡·이메일 결과를 바꾸지 않는다.
- 예약 실행이 실패하면 다음 10분에 다시 한다. 이미 가져온 상담은 다시 가져오지 않는다.
- 화면의 [알림 켜기] 실패는 단계별 한 줄 안내(권한 거부, 등록 실패, 서버 저장 실패).
- 서버 500은 고정 문구, 자세한 오류는 서버 로그에만.

## 7. 테스트

실패하는 테스트를 먼저 쓴다(`node --test`).

- `tests/push-rules.test.mjs`: `consultationPushMessage`(24시간 기준, 1건·여러 건, 이름·전화·메시지가 들어가지 않음,
  빈 칸 처리), `isPushEndpointAllowed`(허용 호스트, http 거절, 비슷한 가짜 호스트 거절), `parsePushAction`,
  `isCronAuthorized`(없는 비밀값, 틀린 값, 맞는 값), `assetLinksFor`.
- `tests/mobile-device.test.mjs`: `deviceIsActive`(끊김·만료·서명 불일치).
- `tests/push-state.test.mjs`: `pushPanelState`의 표 전부.
- `npm test`, `npx tsc --noEmit`, `npm run build`. 미리보기에 배포한 뒤 대표님 아이폰(홈 화면 앱)과 안드로이드
  크롬에서 알림 켜기·시험 알림·실제 상담 알림을 확인한다.

## 8. 운영 준비와 문서

- 새 환경변수: `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`, `CRON_SECRET`, `ANDROID_APP_SHA256`.
- GitHub Secrets: `CRON_SECRET`, `SITE_URL`.
- Firebase 콘솔 Firestore 규칙에 `pushSubscriptions` 클라이언트 접근 금지를 더한다.
- `docs/WEVE_WORKING_RULES.md` Staff Phone App 절: 알림 대상·받는 사람·알림 내용(이름·전화 없음)·정리 규칙,
  카카오 자동 가져오기와 60일 규칙, 안드로이드 APK.
- 새 문서 `docs/STAFF_APP_ANDROID_SETUP.md`: VAPID 키 만들기, Vercel·GitHub 설정, PWABuilder 단계, 직원 설치 안내.
