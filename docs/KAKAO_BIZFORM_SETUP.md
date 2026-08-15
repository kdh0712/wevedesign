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

Configure the manager notification separately. Separate multiple phone numbers with commas:

```text
ALIGO_CONSULTATION_ADMIN_RECEIVER_PHONES=01011112222,01033334444
ALIGO_CONSULTATION_ADMIN_TEMPLATE_CODE=
ALIGO_CONSULTATION_ADMIN_MESSAGE_TEMPLATE=
ALIGO_CONSULTATION_ADMIN_SUBJECT=신규 상담 요청
```

Configure the customer contract-complete template separately. The receiver is taken from the selected customer's phone field when the manager sends the contract-complete notification:

```text
ALIGO_CONSULTATION_CUSTOMER_TEMPLATE_CODE=
ALIGO_CONSULTATION_CUSTOMER_MESSAGE_TEMPLATE=
ALIGO_CONSULTATION_CUSTOMER_SUBJECT=계약 완료 안내
ALIGO_CONSULTATION_CUSTOMER_BUTTON_JSON=
```

Each message-template environment variable must exactly match its approved Alimtalk template text. The manager template supports `#{상담내용}`, `#{고객명}`, `#{연락처}`, `#{주소}`, `#{공간}`, `#{평수}`, `#{예산}`, and `#{희망일}`. The customer contract-complete template supports `#{고객명}` and `#{연락처}`. Set the button JSON only when the approved customer template includes a button.

Set `ALIGO_CONSULTATION_ENABLED=false` to disable the automatic manager notification. The previous single-manager variables remain supported as manager-notification fallbacks, and the previous `ALIGO_CONTRACT_*` variables remain supported as contract-complete fallbacks.

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
