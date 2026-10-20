import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSULTATION_STATUSES,
  buildMobileSites,
  consultationGroup,
  koreanDateLabel,
  sortSitesForList,
  timeAgo,
  listedConsultations,
  listedSites,
  nextDay,
  parseConsultationPatch,
  pickActiveSiteIds,
  reportBlockReason,
  shortRegion,
  tomorrowTasks,
  visibleMobileTabs,
} from '../app/lib/mobile-overview.ts';

const today = '2026-10-20';
const schedule = (tasks) => JSON.stringify(tasks);
const task = (id, name, startDate, endDate, extra = {}) => ({ id, name, startDate, endDate, durationDays: 0, progress: 0, ...extra });

test('consultation statuses keep the PC order', () => {
  assert.deepEqual(CONSULTATION_STATUSES, ['신규', '상담중', '견적', '계약', '완료']);
});

test('tabs follow permissions', () => {
  assert.deepEqual(visibleMobileTabs({ sites: false, dashboard: false, consultations: true }), ['consultations']);
  assert.deepEqual(visibleMobileTabs({ sites: true, dashboard: false, consultations: false }), ['today', 'sites']);
  assert.deepEqual(visibleMobileTabs({ sites: true, dashboard: true, consultations: true }), ['today', 'sites', 'report', 'consultations']);
  assert.deepEqual(visibleMobileTabs({ sites: false, dashboard: true, consultations: false }), []);
});

test('finished, on-hold and trashed sites are not listed', () => {
  const sites = [{ _id: 'a', status: '시공중' }, { _id: 'b', status: '완료' }, { _id: 'c', status: '보류' }, { _id: 'd', status: '계약', deletedAt: 'x' }, { _id: 'e' }];
  assert.deepEqual(listedSites(sites).map((site) => site._id), ['a', 'e']);
});

test('buildMobileSites reads the schedule of the picked estimate and keeps vendors only when allowed', () => {
  const sites = [{ _id: 's1', title: '용호마을 24평', address: '의왕시', status: '시공중', customerName: '홍길동', customerPhone: '010-1111-2222' }];
  const estimates = [
    { siteId: 's1', versionType: 'revision', updatedAt: '2026-10-19', scheduleJson: schedule([task('x', '옛 공정', '2026-10-01', '2026-10-02')]) },
    { siteId: 's1', versionType: 'final', updatedAt: '2026-10-01',
      scheduleJson: schedule([task('t1', '목공', '2026-10-18', '2026-10-25', { vendorName: '한빛목공', vendorPhone: '010-9999-0000', memo: '내부' })]) },
    { siteId: 's1', versionType: 'final', updatedAt: '2026-10-30', deletedAt: 'x', scheduleJson: schedule([task('z', '휴지통', '2026-10-01', '2026-10-02')]) },
  ];
  const [withVendors] = buildMobileSites({ sites, estimates, today, showVendors: true });
  assert.equal(withVendors.customerPhone, '010-1111-2222');
  assert.deepEqual(withVendors.schedule.tasks.map((t) => [t.name, t.state, t.vendorName, t.vendorPhone]), [['목공', 'active', '한빛목공', '010-9999-0000']]);
  assert.ok(!JSON.stringify(withVendors).includes('내부'));
  const [withoutVendors] = buildMobileSites({ sites, estimates, today, showVendors: false });
  assert.ok(!('vendorName' in withoutVendors.schedule.tasks[0]));
  assert.ok(!('vendorPhone' in withoutVendors.schedule.tasks[0]));
});

test('a site with no estimate or a broken schedule is listed with an empty schedule and no blank phone', () => {
  const sites = [{ _id: 's1', title: 'A', status: '시공중', customerPhone: '' }, { _id: 's2', title: 'B', status: '시공중' }];
  const estimates = [{ siteId: 's2', versionType: 'final', scheduleJson: '{not json' }];
  const built = buildMobileSites({ sites, estimates, today, showVendors: true });
  assert.deepEqual(built.map((site) => site.schedule), [null, null]);
  assert.ok(!('customerPhone' in built[0]));
});

test('today shows building sites and contract sites with work today, delayed first', () => {
  const sites = buildMobileSites({
    sites: [
      { _id: 'plain', title: '공정표 없음', status: '시공중' },
      { _id: 'later', title: '계약만', status: '계약' },
      { _id: 'contract-now', title: '계약 오늘 작업', status: '계약' },
      { _id: 'late', title: '지연', status: '시공중' },
      { _id: 'consult', title: '상담', status: '상담중' },
    ],
    estimates: [
      { siteId: 'later', scheduleJson: schedule([task('a', '철거', '2026-11-01', '2026-11-02')]) },
      { siteId: 'contract-now', scheduleJson: schedule([task('b', '철거', '2026-10-19', '2026-10-21')]) },
      { siteId: 'late', scheduleJson: schedule([task('c', '목공', '2026-10-25', '2026-10-30'), task('d', '전기', '2026-10-01', '2026-10-10', { progress: 50 })]) },
    ],
    today,
    showVendors: false,
  });
  assert.deepEqual(pickActiveSiteIds(sites), ['late', 'contract-now', 'plain']);
});

test('tomorrow lists tasks starting tomorrow on today sites only', () => {
  const sites = buildMobileSites({
    sites: [{ _id: 'a', title: 'A', status: '시공중' }, { _id: 'b', title: 'B', status: '상담완료' }],
    estimates: [
      { siteId: 'a', scheduleJson: schedule([task('1', '타일', '2026-10-21', '2026-10-22', { vendorName: '한빛타일' }), task('2', '도배', '2026-10-23', '2026-10-24')]) },
      { siteId: 'b', scheduleJson: schedule([task('3', '철거', '2026-10-21', '2026-10-22')]) },
    ],
    today,
    showVendors: true,
  });
  assert.equal(nextDay(today), '2026-10-21');
  assert.equal(nextDay('2026-12-31'), '2027-01-01');
  assert.deepEqual(tomorrowTasks(sites, pickActiveSiteIds(sites), '2026-10-21'), [{ siteId: 'a', siteTitle: 'A', taskName: '타일', vendorName: '한빛타일' }]);
});

test('shortRegion keeps the city and the neighbourhood', () => {
  assert.equal(shortRegion('경기 안양시 동안구 평촌동 123'), '안양 평촌동');
  assert.equal(shortRegion('의왕시 오리나무1길 12'), '의왕');
  assert.equal(shortRegion('서울특별시 강남구 역삼동 1'), '서울 역삼동');
  assert.equal(shortRegion('경기 양평군 양평읍'), '경기 양평군');
  assert.equal(shortRegion(''), '');
});

test('listedConsultations drops trash and old finished ones, newest first, without blank phones', () => {
  const now = Date.UTC(2026, 9, 20, 3);
  const daysAgo = (n) => new Date(now - n * 86400000).toISOString();
  const list = listedConsultations(
    [
      { _id: 'old-done', status: '완료', createdAt: daysAgo(31) },
      { _id: 'recent-contract', status: '계약', createdAt: daysAgo(29), phone: '010-1234-5678', fullAddress: '경기 안양시 동안구 평촌동 1' },
      { _id: 'old-new', status: '신규', createdAt: daysAgo(90), phone: '' },
      { _id: 'trashed', status: '신규', createdAt: daysAgo(1), deletedAt: 'x' },
      { _id: 'no-status', createdAt: daysAgo(2) },
    ],
    now,
  );
  assert.deepEqual(list.map((item) => item.id), ['no-status', 'recent-contract', 'old-new']);
  assert.equal(list[0].status, '신규');
  assert.equal(list[1].region, '안양 평촌동');
  assert.equal(list[1].phone, '010-1234-5678');
  assert.ok(!('phone' in list[2]));
});

test('parseConsultationPatch accepts a known status or a memo and nothing else', () => {
  assert.deepEqual(parseConsultationPatch({ id: 'c1', status: '견적' }), { ok: true, id: 'c1', fields: { status: '견적' } });
  assert.deepEqual(parseConsultationPatch({ id: 'c1', memo: ' 내일 재통화 ' }), { ok: true, id: 'c1', fields: { memo: '내일 재통화' } });
  assert.deepEqual(parseConsultationPatch({ id: 'c1', memo: '' }), { ok: true, id: 'c1', fields: { memo: '' } });
  assert.equal(parseConsultationPatch({ id: 'c1', status: '취소' }).ok, false);
  assert.equal(parseConsultationPatch({ id: 'c1', memo: 'x'.repeat(2001) }).ok, false);
  assert.equal(parseConsultationPatch({ status: '견적' }).ok, false);
  assert.equal(parseConsultationPatch({ id: 'a/b', status: '견적' }).ok, false);
  assert.equal(parseConsultationPatch({ id: 'c1' }).ok, false);
  assert.equal(parseConsultationPatch(null).ok, false);
});

test('timeAgo in Korean', () => {
  const now = Date.UTC(2026, 9, 20, 3, 0, 0);
  const ago = (ms) => new Date(now - ms).toISOString();
  assert.equal(timeAgo(ago(20 * 1000), now), '방금');
  assert.equal(timeAgo(ago(14 * 60000), now), '14분 전');
  assert.equal(timeAgo(ago(2 * 3600000), now), '2시간 전');
  assert.equal(timeAgo(ago(3 * 86400000), now), '3일 전');
  assert.equal(timeAgo(ago(40 * 86400000), now), '9월 10일');
  assert.equal(timeAgo('', now), '');
});

test('koreanDateLabel', () => {
  assert.equal(koreanDateLabel('2026-10-20'), '10월 20일 화요일');
  assert.equal(koreanDateLabel('bad'), '');
});

test('consultation groups', () => {
  assert.equal(consultationGroup('신규'), 'new');
  assert.equal(consultationGroup('상담중'), 'open');
  assert.equal(consultationGroup('견적'), 'open');
  assert.equal(consultationGroup('계약'), 'done');
  assert.equal(consultationGroup('완료'), 'done');
});

test('sites list in work order, then by title', () => {
  const site = (id, status, title) => ({ id, status, title, address: '', customerName: '', schedule: null });
  const sorted = sortSitesForList([site('a', '상담중', '가'), site('b', '시공중', '나'), site('c', '계약', '다'), site('d', '시공중', '가'), site('e', '', '라')]);
  assert.deepEqual(sorted.map((s) => s.id), ['d', 'b', 'c', 'a', 'e']);
});

test('a report needs a site, 1 to 40 photos and text, like the server', () => {
  assert.equal(reportBlockReason({ siteId: '', photoCount: 1, text: '작업' }), '현장을 골라 주세요.');
  assert.equal(reportBlockReason({ siteId: 's', photoCount: 0, text: '작업' }), '사진을 한 장 이상 넣어 주세요.');
  assert.equal(reportBlockReason({ siteId: 's', photoCount: 41, text: '작업' }), '사진은 한 번에 40장까지 올릴 수 있어요.');
  assert.equal(reportBlockReason({ siteId: 's', photoCount: 2, text: '   ' }), '고객에게 보이는 내용을 써 주세요.');
  assert.equal(reportBlockReason({ siteId: 's', photoCount: 2, text: 'x'.repeat(5001) }), '내용은 5000자까지 쓸 수 있어요.');
  assert.equal(reportBlockReason({ siteId: 's', photoCount: 40, text: '작업' }), null);
});

test('placeholder phone numbers never become call buttons', () => {
  const sites = buildMobileSites({
    sites: [{ _id: 's1', title: 'A', status: '시공중', customerPhone: '-' }, { _id: 's2', title: 'B', status: '시공중', customerPhone: '031-381-0489' }],
    estimates: [{ siteId: 's1', scheduleJson: JSON.stringify([task('t', '목공', '2026-10-19', '2026-10-22', { vendorName: '한빛', vendorPhone: '미정' })]) }],
    today,
    showVendors: true,
  });
  assert.ok(!('customerPhone' in sites[0]));
  assert.ok(!('vendorPhone' in sites[0].schedule.tasks[0]));
  assert.equal(sites[0].schedule.tasks[0].vendorName, '한빛');
  assert.equal(sites[1].customerPhone, '031-381-0489');
  const [consultation] = listedConsultations([{ _id: 'c', status: '신규', createdAt: '2026-10-20T00:00:00Z', phone: '없음' }], Date.UTC(2026, 9, 20));
  assert.ok(!('phone' in consultation));
});
