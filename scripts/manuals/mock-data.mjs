// Made-up office data for the manual screenshots, and the script that serves it to the page in place of the manager API
// (spec 2026-10-23 §4.3). Every name, number and address here is invented: people are 홍길동·김예시·이샘플·박보기·최견본…,
// phones are 010-0000-xxxx, mail is @example.com and places are in '가나시'. Never copy a real customer, site or vendor in.

export const MOCK_USER = {
  id: 'manual-demo',
  name: '김위브',
  loginId: 'weve-demo',
  role: 'admin',
  permissions: ['dashboard', 'consultations', 'customers', 'sites', 'estimates', 'sales', 'inventory', 'vendors', 'portfolio', 'integrations', 'accounts'],
};

/** All dates are relative to `today`, so the screens look current whenever the manuals are made. */
export function buildMockData(today) {
  const at = (days, hour = 10, minute = 0) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days, hour, minute);
    return date.toISOString();
  };
  const ymd = (days) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const consultations = [
    { _id: 'c1', name: '정예시', phone: '010-0000-1101', siteType: '아파트', propertyType: '아파트', areaRange: '30평대', homeStatus: '거주 중', reason: '노후 리모델링', budget: '5천만~7천만 원', timeline: '3개월 이내', address: '가나시 다라동 101-2', fullAddress: '가나시 다라동 101-2 가나아파트 103동', message: '욕실 두 개와 주방을 같이 고치고 싶어요.', privacyAgreed: true, status: '신규', source: 'website', createdAt: at(0, 9, 12) },
    { _id: 'c2', name: '한보기', phone: '010-0000-1102', siteType: '아파트', propertyType: '아파트', areaRange: '20평대', homeStatus: '이사 예정', reason: '입주 전 인테리어', budget: '3천만~5천만 원', timeline: '1개월 이내', address: '가나시 마바동 22', fullAddress: '가나시 마바동 22 마바아파트', message: '입주 전에 도배·바닥·조명 견적 부탁드립니다.', privacyAgreed: true, status: '신규', source: 'kakao-bizform', createdAt: at(-1, 15, 40) },
    { _id: 'c3', name: '윤샘플', phone: '010-0000-1103', siteType: '주택', propertyType: '단독주택', areaRange: '40평대', homeStatus: '거주 중', reason: '부분 수리', budget: '2천만~3천만 원', timeline: '일정 협의', address: '가나시 사아동 7', fullAddress: '가나시 사아동 7', message: '2층 방 두 개 리모델링 상담 원합니다.', privacyAgreed: true, status: '상담중', source: 'website', createdAt: at(-3, 11, 5), memo: '토요일 오전 통화 가능' },
    { _id: 'c4', name: '서견본', phone: '010-0000-1104', siteType: '상가', propertyType: '상가', areaRange: '20평대', homeStatus: '공실', reason: '창업', budget: '4천만~6천만 원', timeline: '2개월 이내', address: '가나시 자차동 55', fullAddress: '가나시 자차동 55 1층', message: '카페 인테리어 상담 부탁드립니다.', privacyAgreed: true, status: '견적', source: 'website', createdAt: at(-6, 14, 20) },
    { _id: 'c5', name: '강예시', phone: '010-0000-1105', siteType: '아파트', propertyType: '아파트', areaRange: '30평대', homeStatus: '거주 중', reason: '노후 리모델링', budget: '5천만~7천만 원', timeline: '3개월 이내', address: '가나시 다라동 12-3', fullAddress: '가나시 다라동 12-3 한빛아파트 105동', message: '전체 리모델링 원합니다.', privacyAgreed: true, status: '계약', source: 'website', createdAt: at(-20, 10, 0) },
  ];

  const customers = [
    { _id: 'cu1', name: '홍길동', phone: '010-0000-2201', chatRoomUrl: 'https://open.kakao.com/o/example1', siteType: '아파트', address: '가나시 다라동 12-3 한빛아파트 105동', status: '시공중', memo: '현관 비밀번호는 현장 단톡방 공지 참고', createdAt: at(-40) },
    { _id: 'cu2', name: '김예시', phone: '010-0000-2202', siteType: '주택', address: '가나시 마바동 88', status: '계약', memo: '', createdAt: at(-25) },
    { _id: 'cu3', name: '이샘플', phone: '010-0000-2203', siteType: '상가', address: '가나시 사아동 31 1층', status: '견적', memo: '오픈 목표일 다음 달 말', createdAt: at(-12) },
    { _id: 'cu4', name: '박보기', phone: '010-0000-2204', siteType: '아파트', address: '가나시 자차동 9 해오름빌라 2층', status: '실측 예정', createdAt: at(-4) },
    { _id: 'cu5', name: '최견본', phone: '010-0000-2205', siteType: '아파트', address: '가나시 카타동 3 마루아파트 201동', status: '완료', createdAt: at(-120) },
  ];

  const sites = [
    { _id: 'site-1', title: '한빛아파트 32평 리모델링', customerName: '홍길동', customerPhone: '010-0000-2201', customerId: 'cu1', siteType: '아파트', address: '가나시 다라동 12-3 한빛아파트 105동', status: '시공중', memo: '엘리베이터 사용 신고 완료', createdAt: at(-38) },
    { _id: 'site-2', title: '푸른마을 단독주택', customerName: '김예시', customerPhone: '010-0000-2202', customerId: 'cu2', siteType: '주택', address: '가나시 마바동 88', status: '계약', memo: '', createdAt: at(-24) },
    { _id: 'site-3', title: '새봄상가 1층 카페', customerName: '이샘플', customerPhone: '010-0000-2203', customerId: 'cu3', siteType: '상가', address: '가나시 사아동 31 1층', status: '견적', memo: '', createdAt: at(-11) },
    { _id: 'site-4', title: '해오름빌라 24평', customerName: '박보기', customerPhone: '010-0000-2204', customerId: 'cu4', siteType: '아파트', address: '가나시 자차동 9 해오름빌라 2층', status: '실측 예정', memo: '', createdAt: at(-3) },
    { _id: 'site-5', title: '마루아파트 45평', customerName: '최견본', customerPhone: '010-0000-2205', customerId: 'cu5', siteType: '아파트', address: '가나시 카타동 3 마루아파트 201동', status: '완료', memo: '', createdAt: at(-118) },
  ];

  const estimates = [
    { _id: 'est-1b', siteId: 'site-1', siteTitle: sites[0].title, customerName: '홍길동', versionType: 'final', versionLabel: '최종안', customerEstimateTotal: 48_600_000, executionCostTotal: 36_900_000, marginAmount: 11_700_000, marginRate: 24.1, updatedAt: at(-30) },
    { _id: 'est-1a', siteId: 'site-1', siteTitle: sites[0].title, customerName: '홍길동', versionType: 'draft', versionLabel: '초안', customerEstimateTotal: 52_300_000, executionCostTotal: 39_800_000, marginAmount: 12_500_000, marginRate: 23.9, updatedAt: at(-36) },
    { _id: 'est-2a', siteId: 'site-2', siteTitle: sites[1].title, customerName: '김예시', versionType: 'final', versionLabel: '최종안', customerEstimateTotal: 61_800_000, executionCostTotal: 47_200_000, marginAmount: 14_600_000, marginRate: 23.6, updatedAt: at(-20) },
    { _id: 'est-3a', siteId: 'site-3', siteTitle: sites[2].title, customerName: '이샘플', versionType: 'draft', versionLabel: '초안', customerEstimateTotal: 39_400_000, executionCostTotal: 30_100_000, marginAmount: 9_300_000, marginRate: 23.6, updatedAt: at(-8) },
  ];

  const sales = [
    { _id: 'sale-1', siteId: 'site-1', estimateId: 'est-1b', customerName: '홍길동', projectTitle: sites[0].title, amount: 48_600_000, cost: 36_900_000, status: '부분 입금', paymentDate: ymd(-28), memo: '계약금·중도금 입금', createdAt: at(-30) },
    { _id: 'sale-2', siteId: 'site-2', estimateId: 'est-2a', customerName: '김예시', projectTitle: sites[1].title, amount: 61_800_000, cost: 47_200_000, status: '계약', paymentDate: ymd(5), memo: '', createdAt: at(-19) },
    { _id: 'sale-3', siteId: 'site-5', customerName: '최견본', projectTitle: sites[4].title, amount: 31_200_000, cost: 23_900_000, status: '입금 완료', paymentDate: ymd(-90), memo: '', createdAt: at(-115) },
  ];

  const inventory = [
    { _id: 'inv-1', itemName: '석고보드 9.5T', category: '목공', quantity: 120, unit: '장', minQuantity: 50, vendor: '가나목재', memo: '창고 A', createdAt: at(-60) },
    { _id: 'inv-2', itemName: '실리콘(백색)', category: '마감', quantity: 8, unit: '개', minQuantity: 20, vendor: '다라건재', memo: '', createdAt: at(-60) },
    { _id: 'inv-3', itemName: '타일 접착제 20kg', category: '타일', quantity: 14, unit: '포', minQuantity: 10, vendor: '마바타일', memo: '', createdAt: at(-50) },
    { _id: 'inv-4', itemName: '걸레받이 몰딩 60mm', category: '목공', quantity: 35, unit: '본', minQuantity: 20, vendor: '가나목재', memo: '', createdAt: at(-45) },
  ];

  const vendors = [
    { _id: 'v1', name: '가나목공', manager: '고목수', phone: '010-0000-3301', service: '목공', status: '협력중', memo: '주말 작업 가능', createdAt: at(-200) },
    { _id: 'v2', name: '다라전기', manager: '전보기', phone: '010-0000-3302', service: '전기·조명', status: '협력중', memo: '', createdAt: at(-200) },
    { _id: 'v3', name: '마바타일', manager: '타예시', phone: '010-0000-3303', service: '타일', status: '협력중', memo: '', createdAt: at(-180) },
    { _id: 'v4', name: '사아도장', manager: '도샘플', phone: '010-0000-3304', service: '도장·필름', status: '협력중', memo: '', createdAt: at(-150) },
    { _id: 'v5', name: '자차설비', manager: '설견본', phone: '010-0000-3305', service: '설비·욕실', status: '협력중', memo: '', createdAt: at(-150) },
  ];

  const office = {
    consultations,
    customers,
    sites,
    estimates,
    sales,
    inventory,
    vendors,
    categories: [
      { _id: 'cat-home', title: '주거 공간', slug: 'residential' },
      { _id: 'cat-shop', title: '상업 공간', slug: 'commercial' },
    ],
    projects: [],
    visitStats: { todayCount: 12, weekCount: 85 },
  };

  const settings = {
    consultationEmail: 'office@example.com',
    representativeName: '김위브',
    businessNumber: '000-00-00000',
    companyStartYear: '2015',
    phone: '010-0000-0489',
    safePhone: '010-0000-0490',
    companyPhone: '010-0000-0491',
    address: '가나시 다라로 123',
    lotAddress: '가나시 다라동 100-1',
  };

  return {
    today: today.toISOString(),
    office,
    settings,
    trash: { consultations: [], customers: [], sites: [], sales: [], inventory: [], vendors: [], projects: [] },
  };
}

/**
 * The mock API. It runs inside the page from its source text (mockInitScript), so it uses nothing outside itself.
 * Returns null only for paths that are not manager or integration APIs; those go to the dev server as usual.
 */
export function routeMock(data, method, url, body) {
  const [pathname, query = ''] = url.split('?');
  if (!pathname.startsWith('/api/manager/') && !pathname.startsWith('/api/integrations/')) return null;
  const params = new URLSearchParams(query);
  const ok = (value) => ({ status: 200, body: value });
  void body;

  if (pathname === '/api/manager/office') {
    if (method === 'GET') return ok(params.get('view') === 'trash' ? data.trash : data.office);
    return ok({ ok: true });
  }
  if (pathname === '/api/manager/settings') return ok(method === 'GET' ? { settings: data.settings } : { ok: true });
  if (pathname === '/api/integrations/kakao-bizform/sync') return ok({ configured: true, imported: 0, checkedAt: data.today });

  return { status: 200, body: {}, unmocked: true };
}

/** The script put into every page before it loads: a made-up admin session (optional) and the mock API. */
export function mockInitScript(data, { session }) {
  return `(() => {
  const data = ${JSON.stringify(data)};
  const routeMock = ${routeMock.toString()};
  ${
    session
      ? `sessionStorage.setItem('weve-manager-session-v2', JSON.stringify({ token: 'demo.demo', firebaseToken: '', user: ${JSON.stringify(MOCK_USER)}, expiresAt: Date.now() + 8 * 3600 * 1000, savedAt: Date.now() }));`
      : `sessionStorage.removeItem('weve-manager-session-v2');`
  }
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, location.href);
    if (url.origin === location.origin) {
      const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const answer = routeMock(data, method, url.pathname + url.search, typeof init.body === 'string' ? init.body : null);
      if (answer) {
        if (answer.unmocked) console.warn('[manual-mock] unmocked', method, url.pathname + url.search);
        return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { 'Content-Type': 'application/json' } });
      }
    }
    return realFetch(input, init);
  };
})();`;
}
