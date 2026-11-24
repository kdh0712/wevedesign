# 현장 폴더 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현장 관리 탭의 상태 버튼 8개를 폴더(전체 · 진행중 · 미체결 · 완료 · 지역별)로 바꾼다.

**Architecture:** 폴더·지역 규칙은 순수 모듈 `app/lib/site-folders.ts`(Node 테스트가 바로 읽음). `groupSitesByCustomer`는 현장 고르기 함수를 받도록 넓힌다. 화면은 `customer-site-tab.tsx`에서 폴더 목록과 목록을 나란히 둔다.

**Tech Stack:** Next.js app router, TypeScript, Tailwind, node:test.

**Spec:** docs/superpowers/specs/2026-11-24-site-folders-design.md

## Global Constraints

- 폴더 이름: `전체`, `진행중`, `미체결`, `완료`, 지역 머리말 `지역별`, 지역 없음 `지역 미정`.
- 진행중 = 계약 · 시공중; 완료 = 완료; 나머지(빈 상태 포함) = 미체결.
- lib 모듈은 상대 경로 `.ts` import만.
- 숫자는 휴지통에 없는 현장 전체(검색어와 무관).

## Review Focus

- 주소 앞에 우편번호나 '경기도'가 붙은 경우 → 시·군을 읽는다.
- '서울특별시', '서울시', '서울' → 모두 '서울'.
- 기억한 지역 폴더가 사라진 경우 → 전체로 돌아간다(현장이 아직 안 불러와졌을 때는 그대로 둔다).
- 고객별 보기에서 폴더를 고르면 해당 현장이 없는 고객은 숨는다.
- 예전에 저장한 `{ status }` 기억값 → 무시하고 전체로 시작.

---

### Task 1: 폴더·지역 규칙

**Files:**
- Create: `app/lib/site-folders.ts`
- Test: `tests/site-folders.test.mjs`

**Interfaces:**
- Produces:
  - `type SiteStage = '진행중' | '미체결' | '완료'`; `SITE_STAGES: readonly SiteStage[]` (그 순서)
  - `NO_REGION = '지역 미정'`
  - `siteStage(status: unknown): SiteStage`
  - `siteRegion(address: unknown): string`
  - `type SiteFolder = string` — `''`(전체) | SiteStage | `region:<이름>`; `regionFolder(name: string): string`
  - `siteInFolder(site: { status?: unknown; address?: unknown }, folder: string): boolean`
  - `countSiteFolders(sites): { all: number; stages: Record<SiteStage, number>; regions: { name: string; count: number }[] }` (휴지통 제외, 지역 정렬: 많은 순 → 가나다 → 지역 미정 끝)
  - `resolveSiteFolder(folder: unknown, counts, loaded: boolean): string` — 모르는 값 → ''; 지역 폴더가 counts에 없고 loaded면 ''.

- [ ] Step 1: 테스트 작성 — stage 매핑(8개 상태 + 빈 값), 지역(우편번호·경기도 앞머리, 서울특별시/서울시/서울, 부산광역시, 세종특별자치시, 양평군, 제주특별자치도 제주시, 광주광역시 vs 경기도 광주시, 빈 주소, '의왕 내손동'), siteInFolder, countSiteFolders 정렬·휴지통 제외, resolveSiteFolder.
- [ ] Step 2: 실행해서 실패 확인 (`node --test tests/site-folders.test.mjs` → module not found).
- [ ] Step 3: 구현.
- [ ] Step 4: 통과 확인.
- [ ] Step 5: 커밋.

### Task 2: 현장 관리 화면에 폴더

**Files:**
- Modify: `app/lib/customer-match.ts` (`groupSitesByCustomer` input에 `include?: (site: S) => boolean`)
- Modify: `tests/customer-match.test.mjs`
- Modify: `app/manager-weve-7519/customer-site-tab.tsx`

**Interfaces:**
- Consumes: Task 1 전부.
- `groupSitesByCustomer({ customers, sites, query, status, include })`: include가 있으면 상태 조건처럼 적용(그 현장이 없는 고객은 숨김).

- [ ] Step 1: customer-match 테스트 — include로 걸러지고, 현장 없는 고객이 숨는다.
- [ ] Step 2: 실패 확인.
- [ ] Step 3: 구현.
- [ ] Step 4: 통과 확인.
- [ ] Step 5: 탭: `status` 상태를 `folder`로 바꾸고, 기억값 `{ view, folder }`, 폴더 목록(`nav aria-label="현장 폴더"`, 버튼 `aria-pressed`, 이름 + 숫자), 지역별 접기/펴기, `md:grid-cols-[150px_minmax(0,1fr)]`.
- [ ] Step 6: 전체 테스트, tsc, build; 브라우저 목업으로 폴더 숫자·걸러짐·고객별 보기 확인.
- [ ] Step 7: 커밋.
