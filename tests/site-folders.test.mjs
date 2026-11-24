import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NO_REGION,
  SITE_STAGES,
  countSiteFolders,
  regionFolder,
  resolveSiteFolder,
  siteInFolder,
  siteRegion,
  siteStage,
} from '../app/lib/site-folders.ts';

// The 현장 관리 folders: 진행중 · 미체결 · 완료 by status, and 지역별 by the 시·군 read from the address.
// Spec: docs/superpowers/specs/2026-11-24-site-folders-design.md

test('siteStage: 계약·시공중 are 진행중, 완료 is 완료, everything else (blank too) is 미체결', () => {
  assert.deepEqual(SITE_STAGES, ['진행중', '미체결', '완료']);
  assert.equal(siteStage('계약'), '진행중');
  assert.equal(siteStage('시공중'), '진행중');
  assert.equal(siteStage('완료'), '완료');
  for (const status of ['상담중', '상담완료', '실측 예정', '견적', '보류', '', undefined, null, '이상한 값']) {
    assert.equal(siteStage(status), '미체결', String(status));
  }
});

test('siteRegion: the first 시·군 in the address, after a postcode or a 도', () => {
  assert.equal(siteRegion('경기도 의왕시 내손동 123'), '의왕시');
  assert.equal(siteRegion('의왕시 포일로 10'), '의왕시');
  assert.equal(siteRegion('(16000) 경기 안양시 동안구 평촌대로 1'), '안양시');
  assert.equal(siteRegion('[15800] 경기도 군포시 산본동'), '군포시');
  assert.equal(siteRegion('경기도 수원시 영통구 광교로 5'), '수원시');
  assert.equal(siteRegion('경기도 양평군 양평읍'), '양평군');
  assert.equal(siteRegion('제주특별자치도 제주시 연동'), '제주시');
  assert.equal(siteRegion('  경기도   의왕시  '), '의왕시');
});

test('siteRegion: 특별시·광역시 read as their short name', () => {
  assert.equal(siteRegion('서울특별시 강남구 역삼동'), '서울');
  assert.equal(siteRegion('서울시 송파구'), '서울');
  assert.equal(siteRegion('서울 마포구 합정동'), '서울');
  assert.equal(siteRegion('부산광역시 해운대구'), '부산');
  assert.equal(siteRegion('인천 연수구 송도동'), '인천');
  assert.equal(siteRegion('세종특별자치시 한솔동'), '세종');
  assert.equal(siteRegion('광주광역시 북구'), '광주');
  // 광주시 is 경기 광주시.
  assert.equal(siteRegion('경기도 광주시 오포읍'), '광주시');
});

test('siteRegion: no address, or no 시·군 near the start, is 지역 미정', () => {
  assert.equal(NO_REGION, '지역 미정');
  for (const address of ['', '   ', undefined, null, 42, '의왕 내손동 래미안', '내손동 123-4 2층']) {
    assert.equal(siteRegion(address), NO_REGION, String(address));
  }
  // A 시 far into the address (an apartment name, a 도로명) is not a region.
  assert.equal(siteRegion('내손동 래미안 101동 1203호 에버시'), NO_REGION);
});

test('siteRegion: 신도시 is a neighbourhood, not a city', () => {
  assert.equal(siteRegion('평촌신도시 꿈마을 현대'), NO_REGION);
  assert.equal(siteRegion('안양 평촌신도시 꿈마을'), NO_REGION);
  assert.equal(siteRegion('산본신도시 세종주공'), NO_REGION);
  assert.equal(siteRegion('내손동 신도시'), NO_REGION);
  assert.equal(siteRegion('경기도 안양시 평촌신도시'), '안양시');
});

test('siteRegion: a 특례시 is the same folder as its 시', () => {
  assert.equal(siteRegion('경기도 수원특례시 영통구'), '수원시');
  assert.equal(siteRegion('용인특례시 수지구'), '용인시');
  assert.equal(siteRegion('경기 화성특례시 동탄'), '화성시');
});

test('siteRegion: a bare 서울·세종·광주 counts only as the first word', () => {
  // 산본 세종주공 6단지 is an apartment in 군포, and 경기 광주 is 경기 광주시, not 광주광역시.
  assert.equal(siteRegion('산본 세종 6단지'), NO_REGION);
  assert.equal(siteRegion('경기 광주 오포읍'), NO_REGION);
  assert.equal(siteRegion('(06000) 서울 강남구'), '서울');
  assert.equal(siteRegion('경기도 광주시 오포읍'), '광주시');
  assert.equal(siteRegion('세종 한솔동'), '세종');
});

test('siteInFolder: 전체, a stage, or a region', () => {
  const site = { status: '시공중', address: '경기도 의왕시 내손동' };
  assert.equal(siteInFolder(site, ''), true);
  assert.equal(siteInFolder(site, '진행중'), true);
  assert.equal(siteInFolder(site, '미체결'), false);
  assert.equal(siteInFolder(site, '완료'), false);
  assert.equal(regionFolder('의왕시'), 'region:의왕시');
  assert.equal(siteInFolder(site, regionFolder('의왕시')), true);
  assert.equal(siteInFolder(site, regionFolder('안양시')), false);
  assert.equal(siteInFolder({ status: '' }, regionFolder(NO_REGION)), true);
  assert.equal(siteInFolder({ status: '' }, '미체결'), true);
});

test('countSiteFolders: every live site, regions by count then 가나다, 지역 미정 last', () => {
  const sites = [
    { _id: '1', status: '계약', address: '경기도 의왕시 내손동' },
    { _id: '2', status: '완료', address: '경기도 안양시 동안구' },
    { _id: '3', status: '상담중', address: '' },
    { _id: '4', status: '견적', address: '경기도 의왕시 포일동' },
    { _id: '5', status: '시공중', address: '경기도 군포시 산본동' },
    { _id: '6', status: '보류', address: '경기도 의왕시 청계동', deletedAt: '2026-11-01' },
    { _id: '7', status: '', address: '서울특별시 강남구' },
  ];
  assert.deepEqual(countSiteFolders(sites), {
    all: 6,
    stages: { 진행중: 2, 미체결: 3, 완료: 1 },
    regions: [
      { name: '의왕시', count: 2 },
      { name: '군포시', count: 1 },
      { name: '서울', count: 1 },
      { name: '안양시', count: 1 },
      { name: NO_REGION, count: 1 },
    ],
  });
  assert.deepEqual(countSiteFolders([]), { all: 0, stages: { 진행중: 0, 미체결: 0, 완료: 0 }, regions: [] });
});

test('resolveSiteFolder: a stored folder is kept only while it still means something', () => {
  const counts = countSiteFolders([{ _id: '1', status: '계약', address: '경기도 의왕시' }]);
  assert.equal(resolveSiteFolder('', counts, true), '');
  assert.equal(resolveSiteFolder('진행중', counts, true), '진행중');
  assert.equal(resolveSiteFolder('완료', counts, true), '완료');
  assert.equal(resolveSiteFolder('region:의왕시', counts, true), 'region:의왕시');
  // A region with no sites left goes back to 전체, but not before the sites have loaded.
  assert.equal(resolveSiteFolder('region:안양시', counts, true), '');
  assert.equal(resolveSiteFolder('region:안양시', countSiteFolders([]), false), 'region:안양시');
  for (const value of ['시공중', 'region:', 'nope', 3, null, undefined, {}]) {
    assert.equal(resolveSiteFolder(value, counts, true), '', String(value));
  }
});
