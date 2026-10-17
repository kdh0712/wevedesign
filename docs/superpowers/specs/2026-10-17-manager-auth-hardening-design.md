# 매니저 인증 강화 설계

작성일: 2026-10-17 · 상태: 검토 대기

## 1. 목적

직원 계정이 사실상 대표(admin)와 같은 권한을 갖는 문제를 없앤다. 직원은 계정 권한 체크박스에서 허용된 탭의
데이터만 서버에서 받고 바꿀 수 있어야 하며, 마스터 비밀번호는 브라우저로 나가지 않는다. 로그인, F5 복원, API
응답 속도는 지금보다 느려지지 않는다.

### 확인된 문제

1. `app/api/manager/auth/route.ts`가 모든 로그인 성공에 `token: MANAGER_PASSWORD`를 돌려준다. 직원도
   `sessionStorage`나 네트워크 탭에서 마스터 비밀번호를 읽어 `admin`으로 로그인할 수 있다.
2. 권한은 화면의 탭 필터(`app/manager-weve-7519/page.tsx`의 `visibleTabs`)에서만 적용된다. 어떤 API도 역할이나
   권한을 확인하지 않고, `x-manager-user` 헤더는 서버에서 읽지 않는다. 견적 작업 화면은 권한 검사가 전혀 없다.
3. ID 방식 계정 비밀번호가 Sanity에 평문으로 저장되고 평문으로 비교된다.
4. `firebase-database.rules.json`이 본인의 `users/$uid` 전체 쓰기를 허용한다. 직원이 자기 `role`을 `admin`으로
   바꿀 수 있다.
5. 견적 작업 화면이 마스터 비밀번호를 `localStorage`(`weve-manager-password`)에 저장하고 자동 로그인한다.
   `docs/WEVE_WORKING_RULES.md`의 규칙에 어긋난다.
6. (조사 중 추가 발견) Sanity 모드의 `DELETE /api/manager/office`는 문서 유형을 확인하지 않아 어떤 문서 ID든 지운다.
7. (조사 중 추가 발견) 대시보드는 '업무 현황' 권한만 있으면 매출, 이익, 예상 마진 합계를 보여준다. 새 직원의
   기본 권한에 '업무 현황'이 들어 있다.

### 결정 사항 (대표님 답변)

| 질문 | 결정 |
|---|---|
| 권한이 없을 때 서버가 막는 범위 | 탭 단위. 권한 없는 탭의 데이터는 서버가 보내지 않는다 |
| 견적 작업 화면 | '견적 작업'(`estimates`) 권한이 있으면 원가·마진 포함 전체 사용, 없으면 차단 |
| 대표 로그인 방식 | `admin` + 마스터 비밀번호 |
| 직원 계정 종류 | 미정. 이메일(Firebase)과 ID(Sanity) 두 방식 모두 지원 |
| 권한 변경·비활성화 반영 시점 | 다음 로그인 때 (최대 8시간). 긴급 시 서명 키 교체로 전원 로그아웃 |

## 2. 로그인과 세션 토큰

### 토큰

- 형식: `base64url(JSON payload) + "." + base64url(HMAC-SHA256(key, payload 부분))`
- payload: `{ v: 1, sub, name, loginId, role: 'admin' | 'staff', perms: string[], src: 'master' | 'account' | 'firebase', iat, exp }`
  (`iat`, `exp`는 초 단위, `exp = iat + 8시간`)
- 검증: 서명을 `timingSafeEqual`로 비교하고 `v === 1`, `exp > now`를 확인한다. DB 조회 없음.
- admin 토큰의 권한은 항상 전체 권한으로 계산한다. payload의 `perms`보다 `role`이 우선한다.
- 전송: `Authorization: Bearer <token>`. `x-manager-password`, `x-manager-user` 헤더는 없앤다.

### 서명 키

1. `MANAGER_SESSION_SECRET`가 있으면 그 값을 쓴다 (권장, 32바이트 이상 무작위 값).
2. 없으면 `HMAC-SHA256(SANITY_WRITE_TOKEN, "weve-manager-session-v1")`로 파생한다. 이미 서버에만 있는 긴 무작위
   값이라 배포 직후 로그인이 막히지 않는다.
3. 둘 다 없으면 로그인 API가 500과 "세션 서명 키가 설정되지 않았습니다"를 돌려준다.

마스터 비밀번호에서 키를 파생하지 않는다. 토큰 하나만 새도 비밀번호를 오프라인으로 대입해 볼 수 있기 때문이다.

### 로그인 API (`POST /api/manager/auth`)

로그인 순서와 방식은 지금과 같고, 돌려주는 값만 바뀐다.

| 로그인 | 확인 방법 | 토큰 내용 |
|---|---|---|
| `admin`/`manager` + 마스터 비밀번호 | 상수 시간 비교 | `role: admin`, `src: master` |
| 이메일 (Firebase 설정 시) | Firebase Auth 로그인 → 본인 토큰으로 프로필과 `launcher_admins` 읽기 | 프로필의 역할·권한 |
| 그 외 ID | Sanity `managerAccount` 조회 → scrypt 검증 | 계정의 역할·권한 |

응답: `{ token, expiresAt, user: { id, name, loginId, role, permissions }, firebaseToken? }`.
`firebaseToken`은 Firebase 로그인이면서 **Firebase 서비스 계정이 설정되지 않은 경우에만** 보낸다. 그 경우에는
서버가 Firestore를 사용자 토큰으로 읽어야 하기 때문이다.

### 배포 시점

예전 세션(마스터 비밀번호가 담긴 토큰)은 거부되므로 열려 있는 탭은 한 번 다시 로그인한다.

## 3. 서버 권한 검사

### 공통 모듈

- `app/lib/manager-permissions.ts` (서버·화면 공용, Node 전용 코드 없음): 권한 목록, 데이터별 읽기 권한 표,
  유형별 쓰기 권한 표, `effectivePermissions(role, perms)`, `canRead`, `canWrite`.
- `app/api/manager/_session.ts` (서버 전용): 토큰 서명·검증과
  `requireManager(request, { permission?, anyOf?, admin? })`. 성공하면 세션을 돌려주고, 실패하면 401(토큰 없음,
  위조, 만료) 또는 403(권한 없음) 응답을 돌려준다.
- 기존 `assertManager`는 삭제한다. 모든 호출부를 `requireManager`로 바꾼다.

### 읽기: `GET /api/manager/office`

데이터를 읽은 뒤, 권한이 없는 항목은 빈 배열로 바꿔 응답한다.

| 응답 키 | 받을 수 있는 권한 (하나라도 있으면) |
|---|---|
| `consultations` | `consultations` |
| `customers` | `customers`, `sites` |
| `sites` | `sites`, `customers`, `estimates`, `sales` |
| `estimates` (견적 요약: 금액·원가·마진) | `estimates`, `sales` |
| `sales` | `sales` |
| `inventory` | `inventory` |
| `vendors` | `vendors` |
| `projects`, `categories` | `portfolio` |
| `visitStats` | `dashboard` |

`storageWarning` 같은 상태 값은 그대로 보낸다.

### 쓰기와 기능별 API

| API | 조건 |
|---|---|
| `POST /api/manager/auth` | 공개 (로그인) |
| `GET /api/manager/office` | 로그인 (위 표대로 걸러서 응답) |
| `POST`/`DELETE /api/manager/office` | 유형별: `consultation`→`consultations`, `customer`→`customers`, `site`→`sites` 또는 `customers`, `sale`→`sales`, `inventory`→`inventory`, `vendor`→`vendors`, `project`/`category`→`portfolio` |
| `GET`/`POST /api/manager/estimate` | `estimates` |
| `GET /api/manager/settings` | 로그인 (공개 홈페이지 내용) |
| `PATCH /api/manager/settings` | `portfolio` 또는 `integrations` |
| `POST /api/manager/settings-image`, `bulk-upload`, `project-main-image` | `portfolio` |
| `POST /api/integrations/aligo-alimtalk/send` | `customers` |
| `POST /api/integrations/kakao-bizform/sync` | `consultations` |
| `/api/manager/accounts` (전체) | admin |
| `POST /api/manager/migrate-firestore` | admin |

`accounts`(계정 권한) 권한은 직원에게 아무것도 허용하지 않는다. 계정 관리는 역할이 admin인 계정만 할 수 있고,
직원 화면에서는 이 탭을 숨긴다 (지금도 탭 내용은 admin에게만 보인다).

### 삭제 안전장치

`DELETE /api/manager/office`는 `type`을 필수로 받는다. Sanity 모드에서는 지우기 전에 문서의 `_type`이
`typeMap[type]`과 같은지 확인하고, 다르면 400을 돌려준다. 계정, 설정 등 다른 문서는 이 API로 지울 수 없다.

## 4. 계정, 비밀번호, Firebase 규칙

### ID 방식 계정 (Sanity `managerAccount`)

- 저장 형식: `scrypt$16384$8$1$<salt base64>$<hash base64>` (`node:crypto`의 `scrypt`, 패키지 추가 없음)
- 계정 API는 해시만 저장한다. 비밀번호를 비워 두고 수정하면 기존 해시를 유지한다.
- 로그인할 때 저장값이 해시 형식이 아니면(예전 평문) 상수 시간으로 비교한다. 맞으면 해시로 바꿔 저장한다.
  저장 실패는 로그인을 막지 않는다.
- 2026-10-17 기준 운영 데이터에 `managerAccount`는 0개다. 실제로 옮길 계정은 없다.

### Firebase(이메일) 계정

- 규칙 (`firebase-database.rules.json`): `users/$uid` 전체 쓰기는 admin(`launcher_admins` 또는 `role === 'admin'`)만
  가능하다. 본인은 `name`, `email`, `updatedAt`, 그리고 처음 한 번 `createdAt`만 쓸 수 있다. `role`,
  `permissions`, `isActive`는 admin만 바꿀 수 있다. 읽기 규칙은 지금과 같다.
- 서버의 관리자 접근: 계정 목록, 추가, 수정, 비활성화는 Firebase 서비스 계정의 OAuth 토큰으로 처리한다
  (scope `firebase.database`, `userinfo.email`). 서비스 계정이 없으면 요청에 담긴 admin의 Firebase 토큰을 쓴다.
  둘 다 없으면 "Firebase 계정 관리에는 서비스 계정 설정이 필요합니다"라는 오류를 돌려준다. 마스터 비밀번호로
  로그인한 대표도 Firebase 계정 목록을 볼 수 있게 된다 (지금은 볼 수 없다).
- 새 계정 추가: Firebase Auth `signUp`으로 사용자를 만든 뒤, 프로필(역할·권한 포함)은 새 사용자 토큰이 아니라
  위의 관리자 접근으로 쓴다.
- 프로필이 없는 사용자의 첫 로그인: `name`, `email`, `createdAt`, `updatedAt`만 만든다. 역할은 `staff`이고
  **권한은 없음**으로 시작한다. admin이 계정 탭에서 권한을 준다. 지금처럼 '업무 현황 + 상담 요청'을 자동으로
  주지 않는다.
- 서비스 계정 공용화: `firestore.ts`의 Google 액세스 토큰 발급을 scope를 받는 함수로 바꿔 Firestore와 Realtime
  Database가 함께 쓴다 (scope별 캐시).

## 5. 화면 변경

### 매니저 (`app/manager-weve-7519/page.tsx`)

- 세션 저장값: `{ token, user, firebaseToken, savedAt }`를 같은 키(`weve-manager-session-v2`)에 저장한다. 만료는
  토큰의 `exp`로 판단한다.
- F5 복원: 로딩 화면 → 저장된 토큰으로 데이터 로드 → 대시보드. 지금과 같은 흐름이고 추가 요청은 없다. 401이면
  세션을 지우고 로그인 폼을 보여준다.
- `authHeaders()`는 `Authorization: Bearer`와(있을 때만) `x-firebase-token`을 보낸다.
- 탭 표시는 `manager-permissions.ts`를 쓴다. 권한이 없는 호출(카카오 동기화, 계정 목록)은 하지 않는다.
- 대시보드: 매출·이익 카드는 `sales` 권한이 있을 때만, 예상 견적·예상 마진 카드는 `estimates` 또는 `sales`
  권한이 있을 때만 보인다. 권한이 없으면 0원으로 표시하지 않고 카드를 숨긴다.

### 견적 작업 (`app/manager-weve-7519/estimate/page.tsx`)

- `localStorage`의 `weve-manager-password` 저장과 자동 로그인을 없앤다. 페이지를 열면 예전 값을 지운다.
- 같은 탭의 매니저 세션(`sessionStorage`)을 그대로 쓴다. 세션 확인 중에는 지금처럼 로딩 화면을 보여준다.
- 세션이 없거나 거부되면 **아이디 + 비밀번호** 로그인 폼을 보여준다. 로그인은 `/api/manager/auth`로 하고,
  매니저와 같은 키에 세션을 저장한다.
- `estimates` 권한이 없으면 "견적 작업 권한이 없습니다" 화면과 매니저로 돌아가는 링크를 보여준다.

### 문서

`docs/WEVE_WORKING_RULES.md`의 Manager Authentication에 다음을 추가한다: 서명 세션 토큰, 서버 권한 표의 위치,
마스터 비밀번호 비노출, Firebase 규칙 배포 순서.

## 6. 오류 처리

| 상황 | 응답 | 화면 |
|---|---|---|
| 토큰 없음, 위조, 만료 | 401 `다시 로그인해 주세요.` | 세션 삭제 → 로그인 폼 |
| 권한 없음 | 403 `권한이 없습니다.` | 오류 메시지 (해당 탭은 원래 보이지 않음) |
| 서명 키 없음 | 로그인 500 | 로그인 폼에 오류 표시 |
| 비활성 계정 | 로그인 403 `비활성화된 계정입니다.` | 로그인 폼에 오류 표시 |

## 7. 검증

로컬에서는 테스트용 값만 넣은 `.env.local`을 쓴다 (테스트 마스터 비밀번호, 테스트 서명 키). Firebase와 Sanity
쓰기 토큰은 넣지 않는다. Sanity 읽기는 공개 데이터셋으로 동작한다.

1. 토큰 단위 검사 (Node 스크립트): 서명·검증, 위조된 payload 거부, 만료 거부, admin 권한 계산, scrypt
   해시·검증, 평문 저장값 판별.
2. API 권한 표 검사 (curl): admin 토큰, 권한별 직원 토큰, 위조 토큰, 만료 토큰으로 모든 매니저 API를 호출해
   200/403/401을 확인한다. 쓰기는 권한 검사를 통과한 뒤 Sanity 쓰기 토큰이 없어 500이 나는 것으로 통과를 확인한다.
   `GET /office` 응답에서 권한 없는 항목이 빈 배열인지 확인한다.
3. 화면 검사 (내장 브라우저, localhost):
   - admin: 테스트 마스터 비밀번호로 로그인 → F5 복원 → 견적 작업 열기 → 견적 화면 F5
   - 직원: 테스트 키로 만든 직원 토큰을 세션에 넣고 F5 → 탭 표시, 대시보드 카드, 견적 화면 차단 확인
   - 견적 화면을 세션 없이 열기 → 아이디 + 비밀번호 폼 확인. `localStorage`에 비밀번호가 남지 않는지 확인
4. `npm run build` 통과
5. 로컬에서 못 하는 것: 실제 Firebase 직원 계정 로그인과 계정 관리. 배포(또는 Vercel 미리보기) 뒤 대표님이
   체크리스트대로 확인한다.

## 8. 배포 순서 (대표님 작업)

1. (권장, 병합 전) Vercel에 `MANAGER_SESSION_SECRET` 추가. 병합 뒤에 추가하면 그때 한 번 더 전원 재로그인이 필요하다.
   Production 환경에만 넣으면 미리보기 배포의 토큰이 운영에서 통하지 않는다.
2. PR 병합 → Vercel 배포 → 열려 있는 탭은 다시 로그인.
3. **배포와 함께 Vercel의 `MANAGER_PASSWORD`를 새 값으로 바꾸고 다시 배포한다.** 이 변경 전에는 모든 직원 로그인이
   마스터 비밀번호를 받았고, 견적 화면은 그 값을 직원 컴퓨터의 `localStorage`에 남겼다. 바꾸지 않으면 지금이나
   예전 직원이 그 값으로 계속 admin 로그인을 할 수 있다.
4. 코드 배포 **뒤에** Firebase 규칙을 반영한다. 순서가 바뀌면 배포 전 코드의 계정 추가가 실패한다.
   먼저 콘솔(Realtime Database → 규칙)의 현재 규칙과 `firebase-database.rules.json`을 비교한다. `launcher_admins`라는
   이름으로 보아 다른 앱이 같은 데이터베이스를 쓸 수 있으므로, 통째로 덮어쓰지 말고 `users`와 `launcher_admins`
   부분만 바꾸고 다른 노드의 규칙은 그대로 둔다.
5. 규칙 반영 직후 콘솔에서 `/users`와 `launcher_admins`를 점검한다. 예전 규칙에서는 누구나 자기 `role`을 `admin`으로
   바꿀 수 있었으므로, `role: 'admin'`인 계정과 모르는 계정을 확인하고 정리한다.
6. 계정 탭에서 Firebase 계정 목록이 보이는지 확인한다. 권한 오류가 나면 Google Cloud IAM에서 서비스 계정에
   'Firebase Realtime Database Admin' 역할을 추가한다.
7. Firestore를 쓰는 운영 환경에는 Firebase 서비스 계정이 설정돼 있어야 한다. 서비스 계정 없이 사용자 토큰으로
   Firestore를 읽는 구성에서는 Firestore 규칙이 직원에게 모든 업무 컬렉션 접근을 허용해야 하므로, 직원이 서버를
   거치지 않고 Firestore를 직접 조회할 수 있어 탭 권한이 지켜지지 않는다. 서비스 계정이 있으면 Firestore 규칙이
   클라이언트 직접 접근을 막는지도 확인한다 (이 저장소에 규칙 파일이 없다).
8. 실제 직원 계정으로 체크리스트를 확인한다.

## 9. 범위 밖 (별도 작업으로 제안)

- **Sanity `production` 데이터셋이 공개 상태다.** 토큰 없이 자재 단가 1,030건, 견적 3건(마진 포함), 상담·고객·현장
  문서를 조회할 수 있다. 데이터셋을 비공개로 바꾸고 공개 사이트 조회에 `SANITY_READ_TOKEN`을 쓰도록 해야 한다.
  ID 방식 계정의 비밀번호 해시도 데이터셋이 공개인 동안은 외부에서 읽힐 수 있다.
- 로그인 시도 횟수 제한 (무차별 대입 방지)
- 서비스 계정 없이 Firestore를 사용자 토큰으로 읽는 구성에서 Firebase 토큰이 1시간 뒤 만료되는 기존 문제
- 세부 필드 단위 권한 (예: 직원에게 마진만 숨기기)
