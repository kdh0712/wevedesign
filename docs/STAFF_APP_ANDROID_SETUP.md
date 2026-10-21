# 직원 앱 알림·안드로이드 설치 준비

설계: `docs/superpowers/specs/2026-10-21-staff-push-android-design.md`. 아래 순서대로 한 번만 하면 된다.

## 1. 알림 키 만들기 (웹 푸시 VAPID)

컴퓨터 터미널에서 한 번 실행한다(저장소 폴더 어디서든).

```bash
npx web-push generate-vapid-keys
```

`Public Key`와 `Private Key`가 나온다. **Private Key는 비밀번호처럼 다룬다**(채팅·문서·저장소에 올리지 않는다).

## 2. Vercel 환경변수

Vercel → 프로젝트 → Settings → Environment Variables에서 **Production과 Preview 둘 다** 체크하고 넣는다.

| 이름 | 값 |
|---|---|
| `WEB_PUSH_PUBLIC_KEY` | 1번의 Public Key |
| `WEB_PUSH_PRIVATE_KEY` | 1번의 Private Key |
| `WEB_PUSH_SUBJECT` | `mailto:` + 대표 이메일 (예: `mailto:office@wevedesign.co.kr`) |
| `CRON_SECRET` | 길고 무작위인 문자열 (예: 터미널에서 `openssl rand -hex 32`, 또는 비밀번호 관리자로 40자 이상 생성) |
| `ANDROID_APP_SHA256` | 5번에서 받은 서명 지문 (처음엔 비워 둔다) |

넣은 뒤 다시 배포해야 적용된다.

## 3. GitHub 예약 실행 (카카오 비즈폼 10분마다)

GitHub → 저장소 → Settings → Secrets and variables → Actions → New repository secret:

| 이름 | 값 |
|---|---|
| `CRON_SECRET` | 2번과 **같은 값** |
| `SITE_URL` | `https://www.wevedesign.co.kr` |

확인: Actions 탭 → "Kakao BizForm sync" → Run workflow. 초록색 체크가 뜨면 된다.

공개 저장소는 **60일 동안 커밋이 없으면 GitHub가 예약 실행을 멈춘다.** GitHub가 메일로 알려 주면 Actions 탭에서
이 작업을 열고 "Enable workflow"를 누른다.

## 4. Firestore 보안 규칙

Firebase 콘솔 → Firestore Database → 규칙에서 `pushSubscriptions` 컬렉션도 `managerDevices`, `siteNotes`처럼
브라우저 읽기·쓰기를 막는다(서버는 서비스 계정이라 규칙의 영향을 받지 않는다).

## 5. 안드로이드 설치 파일 만들기 (PWABuilder)

이 기능이 배포된 **뒤에** 한다.

1. https://www.pwabuilder.com 에 `https://www.wevedesign.co.kr/manager-weve-7519/m`을 넣고 검사한다.
   서비스 워커 경고는 **남아 있어도 된다**: 알림용 서비스 워커는 로그인한 뒤에만 등록되는데 PWABuilder는 로그인하지
   않기 때문이다. 앱이 감싸는 크롬 안에서는 로그인 후 등록되어 알림이 동작한다. 빨간 오류(0이어야 함)만 확인한다.
2. **Package For Stores → Android → Generate Package**에서:
   - Package ID: `kr.co.wevedesign.staff`
   - App name: `위브 업무`, Launcher name: `위브 업무`
   - Notification delegation(알림 위임): 켬
   - Signing key: **Create new**
3. 내려받은 zip 안의 **서명 키 파일(`.keystore`)과 `signing-key-info.txt`(비밀번호)를 안전한 곳에 보관**한다.
   앱을 다시 만들 때 꼭 필요하다. 저장소에는 넣지 않는다.
4. zip 안 `assetlinks.json`의 `sha256_cert_fingerprints` 값(예: `AB:CD:...`)을 Vercel `ANDROID_APP_SHA256`에 넣고 다시 배포한다.
   `https://www.wevedesign.co.kr/.well-known/assetlinks.json`을 열어 그 값이 보이면 된다.
5. zip 안의 `.apk` 파일을 직원에게 카카오톡이나 구글 드라이브 링크로 보낸다.

## 6. 직원 안내

**안드로이드**: 받은 APK를 열고 "출처를 알 수 없는 앱 설치"를 한 번 허용 → 설치 → '위브 업무' 열기 → 로그인 →
상담 탭 맨 위 [알림 켜기] → [시험 알림]으로 확인.

**아이폰** (iOS 16.4 이상): 사파리로 `https://www.wevedesign.co.kr/manager-weve-7519/m` → 공유 버튼 → 홈 화면에 추가 →
**추가된 아이콘으로** 열기 → 로그인 → 상담 탭 [알림 켜기] → 허용 → [시험 알림].

알림에는 고객 이름·전화번호가 나오지 않는다(지역·공간·평형만). 휴대폰을 잃어버리면 PC 계정 권한 →
휴대폰 로그인 기기에서 [로그인 끊기]를 누르면 그 휴대폰의 알림도 멈춘다.
