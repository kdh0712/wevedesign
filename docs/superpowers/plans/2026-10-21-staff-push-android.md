# 직원 앱 설계 2 (새 상담 푸시 알림, 카카오 자동 가져오기, 안드로이드 APK) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상담 권한자가 켠 휴대폰에 새 상담 웹 푸시를 보내고, 카카오 비즈폼을 서버가 10분마다 가져오며, 안드로이드 APK(TWA)를 만들 수 있게 사이트를 준비한다.

**Architecture:** 판단(알림 문구, 주소 허용, 입력 검사, 비밀값 비교, assetlinks, 화면 상태)은 순수 함수로 두고 Node 테스트한다. 서버는 `web-push`로 보내고 구독은 Firestore `pushSubscriptions`(휴대폰 기기 하나에 문서 하나)에 둔다. 받는 사람은 보낼 때마다 기기와 계정을 다시 확인한다. 휴대폰은 알림만 다루는 서비스 워커를 등록하고 상담 탭 맨 위에서 알림을 켠다.

**Tech Stack:** Next.js App Router, React, Firestore REST(`app/api/manager/firestore.ts`), `web-push`, GitHub Actions, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-21-staff-push-android-design.md`

## Global Constraints

- 작업 폴더 `D:\kim\Desktop\Code\wevedesign-push`, 브랜치 `feature/staff-push-notifications`, PR #25 브랜치(`feature/staff-app-notes-schedule-estimate`) 위에 쌓는다. 공유 폴더 `wevedesign`의 브랜치는 바꾸지 않는다.
- `app/api/send-consultation/route.ts`는 줄 끝이 섞인 파일(`i/mixed`)이다. 줄 끝을 보존하는 스크립트(`.superpowers/keep-eol-edit.mjs`, 설계 1 작업 폴더에서 복사)로 고치고 `git diff --stat`으로 고친 줄만 바뀌었는지 본다. 다른 파일도 편집 뒤 `git diff --stat`을 본다.
- 테스트가 import하는 `app/lib/*.ts`, `app/manager-weve-7519/m/*.ts`는 다른 모듈을 `.ts` 확장자로 import한다. `app/api/**`의 Next 전용 모듈은 테스트에서 import하지 않는다.
- 알림 내용에 고객 이름·전화번호·메시지를 절대 넣지 않는다. 24시간 안 접수만 알린다. `url`은 `/manager-weve-7519/m?tab=consultations`, `tag`는 `new-consultation`, TTL 86400초, 긴급도 `high`.
- 허용 푸시 호스트: `fcm.googleapis.com`, `*.push.apple.com`, `updates.push.services.mozilla.com`, `*.notify.windows.com`, `https`만, 주소 1000자까지.
- 환경변수: `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`, `CRON_SECRET`, `ANDROID_APP_SHA256`. 안드로이드 패키지 이름 `kr.co.wevedesign.staff`.
- 알림 실패는 상담 저장·알림톡·이메일 결과를 바꾸지 않는다(`after()`, 오류는 로그만). 서버 500은 고정 문구.
- 화면 문구는 한국어 해요체. 커밋 메시지 한국어, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. 같은 휴대폰에서 [알림 켜기]를 두 번(또는 다른 직원으로 다시 로그인한 뒤) 누르면 구독이 겹치지 않고 마지막 사람 것으로 바뀌어야 한다 → Task 3에서 문서 id `ps-<deviceId>`로 덮어쓰고 `userId`를 새로 쓴다, Task 1 테스트 `pushSubscriptionId is one per device`.
2. 서버가 사용자가 준 주소로 요청을 보내므로 내부 주소·가짜 호스트(`fcm.googleapis.com.evil.com`)는 거절해야 한다 → Task 1 테스트 `only known push services are accepted`.
3. 카카오에서 밀린 상담 50건이 한꺼번에 들어와도 알림은 한 번("새 상담 N건")이어야 한다 → Task 1 테스트 `several consultations become one summary`.
4. 알림 켜기 도중 권한 창에서 [거부]를 누르거나 등록이 실패하면 화면이 "켜짐"으로 남으면 안 된다 → Task 5에서 서버 저장 성공 뒤에만 켜짐으로 바꾼다, Task 5 테스트 `denied permission shows the settings hint`.
5. `CRON_SECRET`이 비어 있는 배포에서 예약 실행 주소가 누구에게나 열리면 안 된다 → Task 1 테스트 `cron is closed without a secret`.

---

### Task 1: 순수 규칙 함수

**Files:**
- Create: `app/lib/push-rules.ts`
- Test: `tests/push-rules.test.mjs`

**Interfaces:**
- Produces:
  - `PUSH_SUBSCRIPTIONS_COLLECTION = 'pushSubscriptions'`, `ANDROID_PACKAGE_NAME = 'kr.co.wevedesign.staff'`
  - `pushSubscriptionId(deviceId: string): string` → `` `ps-${deviceId}` ``
  - `type PushMessage = { title: string; body: string; url: string; tag: string }`
  - `consultationPushMessage(consultations: Array<Record<string, unknown>>, nowMs: number): PushMessage | null` — `toMobileConsultation`(mobile-overview.ts)로 지역·공간·평형을 얻는다
  - `TEST_PUSH_MESSAGE: PushMessage` — `{ title: '위브 업무', body: '알림이 잘 와요.', url: '/manager-weve-7519/m?tab=consultations', tag: 'test' }`
  - `isPushEndpointAllowed(endpoint: unknown): endpoint is string`
  - `type PushAction = { ok: true; action: 'status' | 'unsubscribe' | 'test'; deviceId: string; deviceToken: string } | { ok: true; action: 'subscribe'; deviceId: string; deviceToken: string; subscription: { endpoint: string; p256dh: string; auth: string } } | { ok: false; error: string }`
  - `parsePushAction(body: unknown): PushAction` — `deviceId`는 `isMobileDeviceId` 모양(`^md-[0-9a-f]{24}$`, 이 파일에 같은 정규식), 토큰은 빈 값 금지, 키는 base64url(`^[A-Za-z0-9_-]+={0,2}$`, 200자까지)
  - `isCronAuthorized(header: string | null, secret: string | undefined): boolean` — 비밀값 없으면 항상 false, `Bearer <secret>`을 `timingSafeEqual`로 비교
  - `assetLinksFor(packageName: string, fingerprintsEnv: string | undefined): Array<Record<string, unknown>>`

- [ ] **Step 1: Write the failing tests**

```js
const now = Date.UTC(2026, 9, 21, 3);
const iso = (hoursAgo) => new Date(now - hoursAgo * 3600000).toISOString();
const consult = (extra) => ({ _id: 'c1', name: '홍길동', phone: '010-1234-5678', message: '거실 확장', fullAddress: '경기 안양시 동안구 평촌동 123', siteType: '아파트', areaRange: '30평대', createdAt: iso(1), ...extra });

test('one consultation: region, space and size, never the name, phone or message', () => {
  const message = consultationPushMessage([consult()], now);
  assert.deepEqual(message, { title: '새 상담', body: '안양 평촌동 · 아파트 · 30평대', url: '/manager-weve-7519/m?tab=consultations', tag: 'new-consultation' });
  for (const secret of ['홍길동', '1234', '거실 확장']) assert.ok(!JSON.stringify(message).includes(secret), secret);
  assert.equal(consultationPushMessage([consult({ fullAddress: '', siteType: '', areaRange: '' })], now).body, '새 상담이 들어왔어요');
});
test('several consultations become one summary', () => {
  const many = Array.from({ length: 50 }, (_, i) => consult({ _id: `c${i}` }));
  assert.deepEqual(consultationPushMessage(many, now), { title: '새 상담 50건', body: '앱에서 확인해 주세요', url: '/manager-weve-7519/m?tab=consultations', tag: 'new-consultation' });
});
test('only consultations from the last 24 hours count', () => {
  assert.equal(consultationPushMessage([consult({ createdAt: iso(25) })], now), null);
  assert.equal(consultationPushMessage([consult({ createdAt: 'nope' })], now), null);
  assert.equal(consultationPushMessage([consult({ createdAt: iso(25) }), consult({ createdAt: iso(2) })], now).title, '새 상담');
  assert.equal(consultationPushMessage([], now), null);
});
test('pushSubscriptionId is one per device', () => {
  assert.equal(pushSubscriptionId('md-0123456789abcdef01234567'), 'ps-md-0123456789abcdef01234567');
});
test('only known push services are accepted', () => {
  for (const ok of ['https://fcm.googleapis.com/fcm/send/abc', 'https://web.push.apple.com/QGx', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://wns2-par02p.notify.windows.com/w/?token=x']) assert.equal(isPushEndpointAllowed(ok), true, ok);
  for (const bad of ['http://fcm.googleapis.com/x', 'https://fcm.googleapis.com.evil.com/x', 'https://evil.com/fcm.googleapis.com', 'https://localhost/x', 'https://169.254.169.254/x', `https://fcm.googleapis.com/${'a'.repeat(1000)}`, 42, '']) assert.equal(isPushEndpointAllowed(bad), false, String(bad).slice(0, 60));
});
test('parsePushAction', () => {
  const device = { deviceId: 'md-0123456789abcdef01234567', deviceToken: 't'.repeat(43) };
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BOr_x-1', auth: 'k9_Z' } };
  assert.deepEqual(parsePushAction({ action: 'subscribe', ...device, subscription }), { ok: true, action: 'subscribe', ...device, subscription: { endpoint: subscription.endpoint, p256dh: 'BOr_x-1', auth: 'k9_Z' } });
  assert.deepEqual(parsePushAction({ action: 'test', ...device }), { ok: true, action: 'test', ...device });
  assert.equal(parsePushAction({ action: 'subscribe', ...device, subscription: { ...subscription, endpoint: 'https://evil.com/x' } }).ok, false);
  assert.equal(parsePushAction({ action: 'subscribe', ...device, subscription: { ...subscription, keys: { p256dh: 'a b', auth: 'x' } } }).ok, false);
  assert.equal(parsePushAction({ action: 'status', deviceId: '../x', deviceToken: 't' }).ok, false);
  assert.equal(parsePushAction({ action: 'status', deviceId: device.deviceId, deviceToken: '' }).ok, false);
  assert.equal(parsePushAction({ action: 'spam', ...device }).ok, false);
  assert.equal(parsePushAction(null).ok, false);
});
test('cron is closed without a secret', () => {
  assert.equal(isCronAuthorized('Bearer ', ''), false);
  assert.equal(isCronAuthorized('Bearer x', undefined), false);
  assert.equal(isCronAuthorized(null, 's3cret'), false);
  assert.equal(isCronAuthorized('Bearer wrong', 's3cret'), false);
  assert.equal(isCronAuthorized('s3cret', 's3cret'), false);
  assert.equal(isCronAuthorized('Bearer s3cret', 's3cret'), true);
});
test('assetLinksFor', () => {
  assert.deepEqual(assetLinksFor('kr.co.wevedesign.staff', undefined), []);
  assert.deepEqual(assetLinksFor('kr.co.wevedesign.staff', ' AB:CD , 12:34 '), [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: 'kr.co.wevedesign.staff', sha256_cert_fingerprints: ['AB:CD', '12:34'] },
  }]);
  assert.deepEqual(assetLinksFor('kr.co.wevedesign.staff', 'not a fingerprint'), []);
});
```

- [ ] **Step 2: Run** `node --test tests/push-rules.test.mjs` — Expected: FAIL (모듈 없음)
- [ ] **Step 3: Implement** `app/lib/push-rules.ts`. 지문은 `^[0-9A-F]{2}(:[0-9A-F]{2})+$`(대문자로 바꾼 뒤)만 받는다. `isCronAuthorized`는 `node:crypto`의 `timingSafeEqual`, 길이가 다르면 false.
- [ ] **Step 4: Run** `npm test` — Expected: PASS
- [ ] **Step 5: Commit** `푸시 알림 규칙 함수`

### Task 2: 기기가 살아 있는지 (토큰 없이)

**Files:**
- Modify: `app/api/manager/_mobile-device-rules.ts`
- Test: `tests/mobile-device.test.mjs`

**Interfaces:**
- Produces: `deviceIsActive(device: MobileDeviceRecord | null, nowMs: number, key: Buffer): boolean` — 있고, 끊기지 않았고, 만료 전이고, 서명이 맞을 때만 true(토큰 비교 없음). `deviceRefreshDecision`은 이 함수로 앞부분을 바꾼다(동작은 같다).

- [ ] **Step 1: Failing test** `deviceIsActive needs a live, signed device` — 기존 `deviceFor` 도우미로: 정상 true, `revokedAt` false, 만료 false, 다른 키로 서명 false, `null` false.
- [ ] **Step 2: Run** `node --test tests/mobile-device.test.mjs` — Expected: FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npm test` — Expected: PASS(기존 `deviceRefreshDecision` 테스트 포함)
- [ ] **Step 5: Commit** `기기 상태 확인 함수`

### Task 3: 구독 저장·보내기 서버와 API

**Files:**
- Modify: `package.json`, `package-lock.json` (`npm install web-push@3` + `@types/web-push`)
- Create: `app/api/manager/_push.ts`, `app/api/manager/push/route.ts`
- Modify: `app/api/manager/mobile/session/route.ts` (logout, 새 로그인의 이전 기기, refresh에서 계정이 사라져 끊을 때), `app/api/manager/mobile/devices/route.ts` (DELETE)

**Interfaces:**
- Consumes: Task 1 전부, Task 2 `deviceIsActive`, `getMobileDevice`(`_mobile-devices.ts`), `reloadManagerUser`(`_login.ts`), `hasAnyPermission`, `resolveSessionKey`(`_token.ts`), `patchFirestoreFields`, `getFirestoreDocument`, `deleteFirestoreDocument`, `listFirestoreCollection`, `requireManager`, `deviceRefreshDecision`.
- Produces (`_push.ts`):
  - `webPushConfig(): { publicKey: string; privateKey: string; subject: string } | null`
  - `savePushSubscription(device: MobileDeviceRecord, subscription: { endpoint; p256dh; auth }, nowIso: string): Promise<void>` — `ps-<deviceId>` 덮어쓰기
  - `hasPushSubscription(deviceId: string): Promise<boolean>`
  - `deletePushSubscription(deviceId: string): Promise<void>` — 없어도 성공, 실패는 throw
  - `sendPushToDevice(deviceId: string, message: PushMessage): Promise<'sent' | 'gone' | 'failed' | 'none'>`
  - `notifyNewConsultations(consultations: Array<Record<string, unknown>>): Promise<void>` — 설정 없거나 문구가 null이면 아무것도 안 함. 설계 §2 "받는 사람 확인" 순서, 계정은 `userId`별로 한 번만 읽음. 절대 throw하지 않는다(모든 오류 `console.error`)
- Produces (HTTP `/api/manager/push`): `GET` → `{ configured: boolean; publicKey: string }`; `POST` status → `{ subscribed }`, subscribe/unsubscribe → `{ ok: true }`, test → `{ result }`

- [ ] **Step 1: 패키지** — `npm install web-push@3 && npm install -D @types/web-push`. Expected: `package.json`에 두 줄.
- [ ] **Step 2: `_push.ts`** — `web-push`의 `sendNotification(subscription, JSON.stringify(message), { vapidDetails, TTL: 86400, urgency: 'high' })`. `statusCode` 404·410이면 구독 삭제 후 `'gone'`.
- [ ] **Step 3: 라우트** — `requireManager(anyOf ['consultations'])` → `isProgressStoreReady()` 아니면 503 `MOBILE_STORE_MISSING` → `parsePushAction` 실패 400 → 기기 읽기, `deviceRefreshDecision(device, deviceToken, now, key).ok`이고 `device.userId === session.sub`가 아니면 403 `'이 휴대폰 로그인을 확인하지 못했어요. 다시 로그인해 주세요.'` → `webPushConfig()` 없으면 subscribe/test는 503 `'알림 기능이 아직 설정되지 않았어요.'`. 예외 500 `'알림 설정을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'`. `Cache-Control: no-store`.
- [ ] **Step 4: 정리 연결** — session route의 `logout`·`endShownDevice`(이전 기기)·refresh에서 `revokeMobileDevice` 하는 곳, devices DELETE에서 `deletePushSubscription(deviceId).catch((e) => console.warn(...))`.
- [ ] **Step 5: Run** `npx tsc --noEmit -p .`, `npm test` — Expected: 오류 없음, PASS
- [ ] **Step 6: Commit** `웹 푸시 구독 저장·보내기 API`

### Task 4: 새 상담에서 알림, 카카오 자동 가져오기

**Files:**
- Modify: `app/api/send-consultation/route.ts` (줄 끝 보존 스크립트로)
- Create: `app/api/manager/_kakao-bizform.ts`, `app/api/cron/kakao-bizform/route.ts`, `.github/workflows/kakao-bizform-sync.yml`
- Modify: `app/api/integrations/kakao-bizform/sync/route.ts`

**Interfaces:**
- Consumes: Task 3 `notifyNewConsultations`, Task 1 `isCronAuthorized`.
- Produces: `importKakaoBizForm(): Promise<{ configured: boolean; imported: Array<Record<string, unknown>> }>` — 지금 sync 라우트의 본문(카카오 API 최대 10쪽, 이미 있는 id 건너뛰기, Firestore 또는 Sanity 저장)을 옮긴 것. 저장한 레코드(`_id` 포함)를 돌려준다.

- [ ] **Step 1: 홈페이지 상담** — 저장(`savePublicConsultationToFirestore` / `writeClient.create`) 바로 뒤에 `after(() => notifyNewConsultations([consultationRecord]))`. `after`는 `next/server`에서 import.
- [ ] **Step 2: 카카오 함수 추출** — `_kakao-bizform.ts`로 옮기고 기존 라우트는 `requireManager` 뒤 `importKakaoBizForm()` 호출, 응답은 지금과 같은 모양(`configured`, `imported: n`, `checkedAt`), 가져온 것이 있으면 `after(() => notifyNewConsultations(imported))`.
- [ ] **Step 3: 예약 실행 라우트** — `POST`만. `CRON_SECRET` 없으면 503 `{ error: 'CRON_SECRET이 설정되지 않았습니다.' }`, `isCronAuthorized` 실패 401, `configured: false`면 `{ imported: 0, skipped: '카카오 설정 없음' }`, 아니면 가져온 뒤 `await notifyNewConsultations(imported)`(예약 실행은 응답을 기다려도 된다) 후 `{ imported: n }`. 예외 500 `'카카오 비즈폼을 가져오지 못했습니다.'`. `export const maxDuration = 60`.
- [ ] **Step 4: 워크플로** — 설계 §4의 YAML(`on: schedule: - cron: '*/10 * * * *'`, `workflow_dispatch:`; job 하나, `runs-on: ubuntu-latest`, `timeout-minutes: 2`, step `curl -fsS --max-time 90 -X POST ...`).
- [ ] **Step 5: Run** `npx tsc --noEmit -p .`, `npm test`, `git diff --stat` — Expected: 통과, send-consultation은 몇 줄만
- [ ] **Step 6: Commit** `새 상담 푸시 알림 발송, 카카오 비즈폼 예약 가져오기`

### Task 5: 휴대폰 화면 (서비스 워커, 알림 켜기, 상담 탭 바로 열기)

**Files:**
- Create: `public/manager-weve-7519/m/sw.js`, `app/manager-weve-7519/m/push-state.ts`, `app/manager-weve-7519/m/push-panel.tsx`
- Modify: `app/manager-weve-7519/m/mobile-session.ts` (`deviceCredentials()`), `app/manager-weve-7519/m/consultations-tab.tsx` (맨 위에 패널), `app/manager-weve-7519/m/page.tsx` (서비스 워커 등록, `?tab=consultations`)
- Test: `tests/push-state.test.mjs`, `tests/mobile-session.test.mjs`

**Interfaces:**
- Consumes: HTTP `/api/manager/push`(Task 3).
- Produces:
  - `type PushEnv = { configured: boolean; supported: boolean; isIos: boolean; standalone: boolean; permission: 'default' | 'granted' | 'denied'; subscribed: boolean }`
  - `type PushPanelState = 'unconfigured' | 'unsupported' | 'install-first' | 'denied' | 'off' | 'on'`
  - `pushPanelState(env: PushEnv): PushPanelState` — 우선순위: unconfigured → (isIos && !standalone) install-first → unsupported → denied → on(subscribed && granted) → off
  - `PUSH_PANEL_TEXT: Record<PushPanelState, string>` — 설계 §3 표의 문구
  - `isIosUserAgent(ua: string): boolean`
  - `deviceCredentials(): { deviceId: string; deviceToken: string } | null` (mobile-session 반환 객체에)
  - `PushPanel({ authedFetch, credentials })` — `authedFetch`는 page의 것, `credentials: () => { deviceId; deviceToken } | null`

- [ ] **Step 1: Failing tests** — `tests/push-state.test.mjs`:

```js
const base = { configured: true, supported: true, isIos: false, standalone: true, permission: 'default', subscribed: false };
test('panel states in order', () => {
  assert.equal(pushPanelState({ ...base, configured: false }), 'unconfigured');
  assert.equal(pushPanelState({ ...base, isIos: true, standalone: false, supported: false }), 'install-first');
  assert.equal(pushPanelState({ ...base, supported: false }), 'unsupported');
  assert.equal(pushPanelState(base), 'off');
  assert.equal(pushPanelState({ ...base, permission: 'granted', subscribed: true }), 'on');
  assert.equal(pushPanelState({ ...base, permission: 'granted', subscribed: false }), 'off');
});
test('denied permission shows the settings hint', () => {
  assert.equal(pushPanelState({ ...base, permission: 'denied', subscribed: true }), 'denied');
  assert.match(PUSH_PANEL_TEXT.denied, /설정/);
});
test('iPhone and iPad user agents', () => {
  assert.equal(isIosUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), true);
  assert.equal(isIosUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), true);
  assert.equal(isIosUserAgent('Mozilla/5.0 (Linux; Android 14)'), false);
});
```

`tests/mobile-session.test.mjs`에 `deviceCredentials returns the stored device or null`(저장된 기기 → `{ deviceId, deviceToken }`, 없으면 `null`).

- [ ] **Step 2: Run** `node --test tests/push-state.test.mjs tests/mobile-session.test.mjs` — Expected: FAIL
- [ ] **Step 3: Implement** `push-state.ts`, `deviceCredentials`.
- [ ] **Step 4: Run** 같은 명령 — Expected: PASS
- [ ] **Step 5: `sw.js`** — `push`: `event.data.json()` 실패 시 기본 문구, `self.registration.showNotification(title, { body, icon: '/staff-app/icon-192.png', badge: '/staff-app/icon-192.png', tag, data: { url } })`. `notificationclick`: `clients.matchAll({ type: 'window', includeUncontrolled: true })`에서 `/manager-weve-7519/m`로 시작하는 창을 `focus()` 후 `navigate(url)`, 없으면 `clients.openWindow(url)`. `fetch` 핸들러 없음.
- [ ] **Step 6: `PushPanel`** — 열릴 때 `GET /api/manager/push`, 그다음 `POST status`; 환경은 `'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window`, `matchMedia('(display-mode: standalone)').matches || navigator.standalone`. [알림 켜기]: `Notification.requestPermission()` → `navigator.serviceWorker.ready` → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`(공개키 base64url → `Uint8Array`) → `POST subscribe`가 성공한 뒤에만 `subscribed = true`. [끄기]: `POST unsubscribe` 후 `subscription.unsubscribe()`. [시험 알림]: `POST test`, 결과 한 줄. 버튼은 진행 중 막는다. `install-first`는 InstallGuide와 같은 추가 방법 문구.
- [ ] **Step 7: 연결** — `ConsultationsTab` 맨 위(제목 아래)에 `PushPanel`(props는 page에서 내려 줌). `page.tsx`: 로그인 상태(`phase === 'ready'`)가 되면 `navigator.serviceWorker?.register('/manager-weve-7519/m/sw.js', { scope: '/manager-weve-7519/m' }).catch(() => undefined)`; 시작 때 `new URLSearchParams(location.search).get('tab') === 'consultations'`이고 권한이 있으면 상담 탭으로, 그 뒤 `history.replaceState`로 `tab`을 지운다(`createBackGuard`가 쓰는 state를 건드리지 않도록 현재 `history.state`를 그대로 넘긴다).
- [ ] **Step 8: Run** `npm test`, `npx tsc --noEmit -p .` — Expected: PASS
- [ ] **Step 9: Commit** `휴대폰 상담 탭에 새 상담 알림 켜기`

### Task 6: 안드로이드 APK 준비와 문서

**Files:**
- Modify: `app/manager-weve-7519/m/manifest.webmanifest/route.ts`, `next.config.ts`
- Create: `app/api/android-assetlinks/route.ts`, `docs/STAFF_APP_ANDROID_SETUP.md`
- Modify: `docs/WEVE_WORKING_RULES.md`
- Test: `tests/next-config.test.mjs`

**Interfaces:**
- Consumes: Task 1 `assetLinksFor`, `ANDROID_PACKAGE_NAME`.

- [ ] **Step 1: Failing test** `assetlinks is served from /.well-known` — `await nextConfig.rewrites()`에 `{ source: '/.well-known/assetlinks.json', destination: '/api/android-assetlinks' }`가 있다.
- [ ] **Step 2: Run** `node --test tests/next-config.test.mjs` — Expected: FAIL
- [ ] **Step 3: Implement** — `next.config.ts`에 `async rewrites() { return [...] }`. 라우트: `GET` → `Response.json(assetLinksFor(ANDROID_PACKAGE_NAME, process.env.ANDROID_APP_SHA256), { headers: { 'Cache-Control': 'public, max-age=3600' } })`. manifest에 `id: '/manager-weve-7519/m'`, `orientation: 'portrait'`, `categories: ['business', 'productivity']`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS
- [ ] **Step 5: 문서** — `STAFF_APP_ANDROID_SETUP.md`: ① `npx web-push generate-vapid-keys`로 키 만들기와 Vercel 환경변수 5개(Production·Preview) ② `CRON_SECRET` 만드는 법(`openssl rand -hex 32` 또는 아무 긴 무작위 문자열)과 GitHub Secrets `CRON_SECRET`·`SITE_URL`, Actions 화면에서 수동 실행으로 확인 ③ Firebase 콘솔 Firestore 규칙에 `pushSubscriptions` 막기 ④ PWABuilder 단계(설계 §5 1~6) ⑤ 직원 안내(안드로이드: APK 설치 → 로그인 → 알림 켜기 / 아이폰: 홈 화면 추가 → 앱으로 열기 → 알림 켜기) ⑥ 60일 예약 실행 멈춤과 다시 켜기. `WEVE_WORKING_RULES.md` Staff Phone App 절에 설계 §8 항목.
- [ ] **Step 6: Run** `npm test`, `npx tsc --noEmit -p .`, `npm run build`, `git diff --stat origin/feature/staff-app-notes-schedule-estimate` — Expected: 모두 통과, 파일 전체가 바뀐 곳 없음
- [ ] **Step 7: Commit, push, PR** — `git push -u origin feature/staff-push-notifications`, `gh pr create --base feature/staff-app-notes-schedule-estimate`(본문에 #25 위에 쌓았다는 것과 대표님 준비 단계 목록, 끝에 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`).
