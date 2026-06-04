# 현장 사진 자동 업로드

현장별 사진 폴더를 Sanity Project로 한 번에 올리는 스크립트입니다.

## 1. 폴더 정리

폴더명은 홈페이지에 보일 Project 이름으로 사용됩니다.

```text
현장사진/
  의왕 32평 리모델링/
    대표.jpg
    거실1.jpg
    거실2.jpg
    주방1.jpg
    침실1.jpg
    침실2.jpg
    시공전.jpg
  안성 주택 리모델링/
    대표.jpg
    현관1.jpg
    현관2.jpg
    욕실1.jpg
```

파일명 규칙은 `공간명 + 숫자`입니다.

- `거실1.jpg`, `거실2.jpg`는 `거실` 묶음으로 올라갑니다.
- `침실1.jpg`, `침실2.jpg`는 `침실` 묶음으로 올라갑니다.
- 숫자 순서대로 홈페이지 상세 화면에 표시됩니다.
- `대표.jpg`, `메인.jpg`, `썸네일.jpg`는 대표 이미지로 사용됩니다.
- `시공전.jpg`, `공사전.jpg`, `before.jpg`는 시공 전 사진으로 사용됩니다.

## 2. Sanity 토큰 준비

`.env.local` 파일에 아래 값을 추가합니다.

```text
SANITY_WRITE_TOKEN=Sanity에서 만든 쓰기 토큰
```

토큰은 Sanity 관리 화면에서 만들 수 있습니다.

```text
sanity.io/manage → 프로젝트 선택 → API → Tokens → Add API token
```

권한은 `Editor` 또는 `Write`가 가능한 권한으로 생성합니다.

## 3. 미리보기

실제로 업로드하기 전에 어떤 식으로 묶이는지 먼저 확인합니다.

```bash
npm run upload:projects -- "C:\사진\현장사진" --category 주택 --dry-run
```

## 4. 실제 업로드

```bash
npm run upload:projects -- "C:\사진\현장사진" --category 주택
```

한 폴더만 올릴 수도 있습니다.

```bash
npm run upload:projects -- "C:\사진\현장사진\의왕 32평 리모델링" --category 아파트
```

## 참고

같은 이름의 Project가 이미 있으면 새로 중복 생성하지 않고 해당 Project를 업데이트합니다.
