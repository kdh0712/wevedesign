# Kakao BizForm+ Integration Setup

The manager can import Kakao Moment BizForm+ responses into `officeConsultation` records. It polls while the manager is open and deduplicates records by Kakao `applyId`.

## Required Kakao Configuration

1. The form must be a Kakao Moment advertising-account `BizForm+` form.
2. The Kakao Developers app and Moment advertising account must use the same business registration number.
3. Request and receive approval for the Kakao Moment additional feature and the `BizForm+ response result lookup` business consent scope.
4. The authorizing Kakao account must have advertising-account access and form-report download permission.
5. Issue a business access token through Kakao Business Authentication.

Official references:

- https://developers.kakao.com/docs/latest/ko/kakaomoment/bizformplus
- https://developers.kakao.com/docs/latest/ko/business-auth/common
- https://developers.kakao.com/docs/latest/ko/business-auth/rest-api
- https://developers.kakao.com/docs/latest/ko/kakaotalk-channel/callback

## Vercel Environment Variables

Configure these only in Vercel. Do not enter tokens in the manager UI or commit them to Git.

```text
KAKAO_BUSINESS_ACCESS_TOKEN=
KAKAO_MOMENT_AD_ACCOUNT_ID=
KAKAO_BIZFORM_PLUS_ID=MA-0000
```

Redeploy after adding or changing environment variables.

## Consultation Kakao Notification

New homepage consultation requests send an internal Aligo Kakao Alimtalk notification to one or more manager phones after the request is saved. The customer template is sent separately when a manager uses the contract-complete action.

```text
ALIGO_API_KEY=
ALIGO_USER_ID=
ALIGO_SENDER_KEY=
ALIGO_SENDER_PHONE=
```

The receiving phones are normally managed in the manager: 외부 채널 tab → 상담 알림 받을 번호 (admin only, up to 5). The list is stored in Firestore (`managerSettings/consultationAlimtalk`) and takes effect immediately without a redeploy. When that list is empty, the environment variable below is used as a fallback.

Configure the manager notification separately. Separate multiple phone numbers with commas:

```text
ALIGO_CONSULTATION_ADMIN_RECEIVER_PHONES=01011112222,01033334444
ALIGO_CONSULTATION_ADMIN_TEMPLATE_CODE=
ALIGO_CONSULTATION_ADMIN_MESSAGE_TEMPLATE=
ALIGO_CONSULTATION_ADMIN_SUBJECT=신규 상담 요청
ALIGO_CONSULTATION_ADMIN_BUTTON_JSON=
```

The manager notification always sends a button. By default it is the approved template's `관리페이지` web link (`https://www.wevedesign.co.kr/manager-weve-7519`). Set `ALIGO_CONSULTATION_ADMIN_BUTTON_JSON` only when the approved template's button changes. Kakao rejects a message whose text or buttons differ from the approved template ("메시지가 템플릿과 일치하지않음"). Typed-out `\n` and Windows line breaks in the message-template variables are converted to real line breaks before sending.

Configure the customer contract-complete template separately. The receiver is taken from the selected customer's phone field when the manager sends the contract-complete notification:

```text
ALIGO_CONSULTATION_CUSTOMER_TEMPLATE_CODE=
ALIGO_CONSULTATION_CUSTOMER_MESSAGE_TEMPLATE=
ALIGO_CONSULTATION_CUSTOMER_SUBJECT=계약 완료 안내
ALIGO_CONSULTATION_CUSTOMER_BUTTON_JSON=
```

Each message-template environment variable must exactly match its approved Alimtalk template text. The manager template supports `#{상담내용}`, `#{고객명}`, `#{연락처}`, `#{주소}`, `#{공간}`, `#{평수}`, `#{예산}`, and `#{희망일}`. The customer contract-complete template supports `#{고객명}` and `#{연락처}`. Set the button JSON only when the approved customer template includes a button.

Set `ALIGO_CONSULTATION_ENABLED=false` to disable the automatic manager notification. The previous single-manager variables remain supported as manager-notification fallbacks, and the previous `ALIGO_CONTRACT_*` variables remain supported as contract-complete fallbacks.

## Customer Progress Kakao Notification

After staff post a daily report to the customer progress page, the manager can send the customer an Aligo Kakao Alimtalk with a button to that site's progress page. Staff choose it per post ("고객에게 알림톡 보내기", off by default) or from the site's record list ("알림톡 보내기" / "다시 보내기"). Nothing is sent automatically, and a record that was already sent needs "다시 보내기" to go out again. The receiver is the site's customer phone, or the linked customer's phone when the site has none. It must be a mobile number.

This notification uses the shared `ALIGO_API_KEY`, `ALIGO_USER_ID`, `ALIGO_SENDER_KEY`, `ALIGO_SENDER_PHONE` and `ALIGO_TEST_MODE` values above, plus these. Configure them only in Vercel and redeploy after changing them:

```text
ALIGO_PROGRESS_TEMPLATE_CODE=
ALIGO_PROGRESS_MESSAGE_TEMPLATE=
ALIGO_PROGRESS_BUTTON_JSON=
ALIGO_PROGRESS_SUBJECT=공사 진행 안내
```

- `ALIGO_PROGRESS_TEMPLATE_CODE`, `ALIGO_PROGRESS_MESSAGE_TEMPLATE` and `ALIGO_PROGRESS_BUTTON_JSON` are all required. If any one is missing, the manager shows "알림톡 템플릿 설정이 필요합니다" and records can still be posted without the alimtalk. `ALIGO_PROGRESS_SUBJECT` is optional and defaults to `공사 진행 안내`.
- `ALIGO_PROGRESS_MESSAGE_TEMPLATE` must exactly match the approved template text. Kakao rejects any difference ("메시지가 템플릿과 일치하지않음"). Typed-out `\n` and Windows line breaks are converted to real line breaks before sending.
- `ALIGO_PROGRESS_BUTTON_JSON` must match the approved button. Put `#{코드}` in the link; the server replaces it with the site's link code when it sends. Use the same shape as the existing manager button (`linkType: "WL"`, mobile link in `linkMo`) and add the PC link key exactly as Aligo shows it for the approved template.
- Variables: `#{고객명}`, `#{현장명}`, `#{날짜}` (the report date written as `YYYY년 M월 D일`, for example `2026년 10월 17일`), and `#{코드}` in the button link only.

Template example (registered and approved in Aligo by the owner):

```text
[위브디자인] 공사 진행 안내
#{고객명} 고객님, #{현장명} 현장의 #{날짜} 공사 진행 상황이 등록되었습니다.
아래 버튼을 눌러 사진과 공정 일정을 확인해 주세요.
문의: 031-381-0489

버튼(웹링크) 진행 현황 보기
  모바일웹 링크: https://www.wevedesign.co.kr/progress/#{코드}
  PC 링크: 같은 주소
  채널추가: 체크하지 않음 (정보성 알림톡)
```

Register the button as a web link named `진행 현황 보기`. The mobile link is `https://www.wevedesign.co.kr/progress/#{코드}` and the PC link is the same address. Leave 채널추가 unchecked, because this is an informational alimtalk.

Use `ALIGO_TEST_MODE=Y` on preview deployments to check the request format without sending a real message. The result of every send, and its error if it failed, is stored on the progress record and shown in the site's "알림톡 발송 기록".

## Import Behavior

- Endpoint: `POST /api/integrations/kakao-bizform/sync`
- Authentication: existing manager request header
- Poll interval: 30 seconds while the manager is unlocked
- Deduplication key: form ID plus Kakao `applyId`
- Source label: `카카오 비즈니스폼+ · {inflowSource}`
- Name, phone, address, submitted time, and all question answers are preserved.
- Common question titles are mapped to site type, area, status, reason, budget, and timeline when recognizable.

## Channel Chat Limitation

The standard KakaoTalk Channel webhook only reports channel add/block relationship changes. It does not expose incoming 1:1 chat messages or unread counts. Chat notifications require a Kakao i Connect/BizMessage `상담톡` integration through an approved dealer and that provider's webhook credentials.
