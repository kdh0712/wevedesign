// Made-up estimate-page data for the manual screenshots (sites, versions, 자재 DB, templates). The same rules as
// mock-data.mjs apply: every name, number and place is invented.

const line = (id, space, category, process, name, spec, unit, quantity, customerUnitPrice, executionUnitPrice, extra = {}) => ({
  id,
  space,
  category,
  process,
  name,
  spec,
  unit,
  quantity,
  customerUnitPrice,
  executionUnitPrice,
  note: '',
  ...extra,
});

/** @param {(days: number) => string} ymd  @param {(days: number, hour?: number) => string} at */
export function buildEstimateData({ ymd, at, sites, vendors }) {
  const materials = [
    ['m-base-1', '기본견적', '기본견적', '기본견적', '현장 보양·폐기물 처리', '식', 1_300_000],
    ['m-base-2', '기본견적', '기본견적', '현장 관리비', '공사 기간', '식', 800_000],
    ['m-dem-1', '철거', '철거', '주방·욕실 철거', '전체', '식', 1_900_000],
    ['m-dem-2', '철거', '철거', '폐기물 반출', '1톤 트럭', '대', 280_000],
    ['m-dem-3', '철거', '철거', '바닥재 철거', '장판·마루', '평', 25_000],
    ['m-wood-1', '목공', '목공', '우물천장', '석고보드 9.5T 2겹', 'm2', 48_000],
    ['m-wood-2', '목공', '목공', '걸레받이 몰딩', '60mm', 'm', 6_000],
    ['m-wood-3', '목공', '목공', '방문 교체', '900×2100 ABS', '세트', 330_000],
    ['m-wood-4', '목공', '목공', '가벽 설치', '각재+석고 2겹', 'm2', 55_000],
    ['m-tile-c', '타일', '타일', '공통', '300×600 포세린', 'm2', 58_000, ['거실 욕실', '안방 욕실', '현관', '주방 벽']],
    ['m-tile-2', '타일', '타일', '주방 벽 타일', '300×600', 'm2', 52_000],
    ['m-tile-3', '타일', '타일', '현관 바닥 타일', '600×600', 'm2', 61_000],
    ['m-plm-1', '설비', '설비', '양변기', '원피스', '개', 290_000],
    ['m-plm-2', '설비', '설비', '욕실장', '600 슬라이드', '개', 190_000],
    ['m-plm-3', '설비', '설비', '세면대', '반다리', '개', 170_000],
    ['m-plm-4', '설비', '설비', '욕조 철거·방수', '우레탄 2회', '식', 650_000],
    ['m-kit-1', '가구', '가구', '싱크대', 'ㄱ자 3.2m 인조대리석', '식', 3_700_000],
    ['m-kit-2', '가구', '가구', '붙박이장', '여닫이 2.4m', '식', 1_600_000],
    ['m-kit-3', '가구', '가구', '신발장', '현관 1.2m', '식', 620_000],
    ['m-wall-1', '도배', '도배', '실크 도배', '친환경 실크', '평', 72_000],
    ['m-wall-2', '도배', '도배', '합지 도배', '일반 합지', '평', 38_000],
    ['m-floor-1', '바닥', '바닥', '강마루', '오크 그레이', '평', 128_000],
    ['m-floor-2', '바닥', '바닥', '장판', '2.2T', '평', 42_000],
    ['m-elec-1', '전기', '전기', 'LED 다운라이트', '3인치', '개', 26_000],
    ['m-elec-2', '전기', '전기', '스위치·콘센트 교체', '전체', '식', 480_000],
    ['m-elec-3', '전기', '전기', '거실 등박스 조명', '라인조명 2m', '개', 85_000],
    ['m-paint-1', '도장', '도장', '방문 필름', '무광 화이트', '짝', 140_000],
    ['m-paint-2', '도장', '도장', '베란다 탄성코트', '2회', 'm2', 18_000],
  ].map(([_id, category, process, name, spec, unit, unitPrice, commonOptions]) => ({
    _id,
    category,
    process,
    name,
    spec,
    unit,
    unitPrice,
    note: '',
    sourceSheet: category,
    updatedAt: at(-14),
    ...(commonOptions ? { commonOptions } : {}),
  }));

  const estimateCategoryOf = {
    기본견적: '기본견적',
    철거: '철거 공사',
    목공: '목공 공사',
    타일: '욕실 공사',
    설비: '욕실 공사',
    가구: '주방 공사',
    도배: '도배·바닥',
    바닥: '도배·바닥',
    전기: '전기·조명',
  };
  const materialSettings = {
    estimateCategories: ['기본견적', '철거 공사', '목공 공사', '욕실 공사', '주방 공사', '도배·바닥', '전기·조명'],
    estimateItems: Object.fromEntries(materials.filter((item) => estimateCategoryOf[item.category]).map((item) => [item._id, estimateCategoryOf[item.category]])),
    materialOrder: materials.map((item) => item._id),
  };

  const finalLines = [
    line('l1', '공용', '기본견적', '기본견적', '기본견적', '현장 보양·폐기물 처리', '식', 1, 1_800_000, 1_300_000, { materialId: 'm-base-1' }),
    line('l2', '공용', '기본견적', '기본견적', '현장 관리비', '공사 기간', '식', 1, 1_200_000, 800_000, { materialId: 'm-base-2' }),
    line('l3', '공용', '철거 공사', '철거', '주방·욕실 철거', '전체', '식', 1, 2_400_000, 1_900_000, { materialId: 'm-dem-1' }),
    line('l4', '공용', '철거 공사', '철거', '폐기물 반출', '1톤 트럭', '대', 4, 350_000, 280_000, { materialId: 'm-dem-2' }),
    line('l5', '거실', '목공 공사', '목공', '우물천장', '석고보드 9.5T 2겹', 'm2', 18, 65_000, 48_000, { materialId: 'm-wood-1' }),
    line('l6', '공용', '목공 공사', '목공', '걸레받이 몰딩', '60mm', 'm', 85, 9_000, 6_000, { materialId: 'm-wood-2' }),
    line('l7', '침실', '목공 공사', '목공', '방문 교체', '900×2100 ABS', '세트', 3, 420_000, 330_000, { materialId: 'm-wood-3', note: '안방 문은 기존 유지' }),
    line('l8', '욕실', '욕실 공사', '타일', '거실 욕실', '300×600 포세린', 'm2', 24, 78_000, 58_000, { materialId: 'm-tile-c', commonName: true }),
    line('l9', '욕실', '욕실 공사', '타일', '안방 욕실', '300×600 포세린', 'm2', 19, 78_000, 58_000, { materialId: 'm-tile-c', commonName: true }),
    line('l10', '욕실', '욕실 공사', '설비', '양변기', '원피스', '개', 2, 380_000, 290_000, { materialId: 'm-plm-1' }),
    line('l11', '욕실', '욕실 공사', '설비', '욕실장', '600 슬라이드', '개', 2, 260_000, 190_000, { materialId: 'm-plm-2' }),
    line('l12', '주방', '주방 공사', '가구', '싱크대', 'ㄱ자 3.2m 인조대리석', '식', 1, 4_800_000, 3_700_000, { materialId: 'm-kit-1' }),
    line('l13', '주방', '주방 공사', '타일', '주방 벽 타일', '300×600', 'm2', 9, 72_000, 52_000, { materialId: 'm-tile-2' }),
    line('l14', '공용', '도배·바닥', '도배', '실크 도배', '친환경 실크', '평', 32, 95_000, 72_000, { materialId: 'm-wall-1' }),
    line('l15', '공용', '도배·바닥', '바닥', '강마루', '오크 그레이', '평', 26, 165_000, 128_000, { materialId: 'm-floor-1' }),
    line('l16', '공용', '전기·조명', '전기', 'LED 다운라이트', '3인치', '개', 24, 38_000, 26_000, { materialId: 'm-elec-1' }),
    line('l17', '공용', '전기·조명', '전기', '스위치·콘센트 교체', '전체', '식', 1, 650_000, 480_000, { materialId: 'm-elec-2' }),
    line('l18', '거실', '전기·조명', '전기', '거실 등박스 조명', '라인조명 2m', '개', 4, 120_000, 85_000, { materialId: 'm-elec-3' }),
  ];

  const workLines = [
    { id: 'w1', sourceLineId: '', date: ymd(-28), space: '', category: '입금', process: '입금', name: '계약금', spec: '', unit: '', quantity: 0, executionUnitPrice: 0, income: 9_720_000, expense: 0, payment: 0, vendor: '', status: '', note: '계약금 20%' },
    { id: 'w2', sourceLineId: 'l3', date: ymd(-10), space: '공용', category: '철거 공사', process: '철거', name: '주방·욕실 철거', spec: '전체', unit: '식', quantity: 1, executionUnitPrice: 1_900_000, income: 0, expense: 1_900_000, payment: 1_900_000, vendor: '가나목공', status: '완료', note: '' },
    { id: 'w3', sourceLineId: 'l4', date: ymd(-9), space: '공용', category: '철거 공사', process: '철거', name: '폐기물 반출', spec: '1톤 트럭', unit: '대', quantity: 4, executionUnitPrice: 280_000, income: 0, expense: 1_120_000, payment: 1_120_000, vendor: '가나목공', status: '완료', note: '' },
    { id: 'w4', sourceLineId: 'l5', date: ymd(-4), space: '거실', category: '목공 공사', process: '목공', name: '우물천장', spec: '석고보드 9.5T 2겹', unit: 'm2', quantity: 18, executionUnitPrice: 48_000, income: 0, expense: 864_000, payment: 0, vendor: '가나목공', status: '진행', note: '' },
    { id: 'w5', sourceLineId: '', date: ymd(-3), space: '', category: '입금', process: '입금', name: '중도금', spec: '', unit: '', quantity: 0, executionUnitPrice: 0, income: 19_440_000, expense: 0, payment: 0, vendor: '', status: '', note: '중도금 40%' },
    { id: 'w6', sourceLineId: 'l16', date: ymd(-2), space: '공용', category: '전기·조명', process: '전기', name: 'LED 다운라이트', spec: '3인치', unit: '개', quantity: 24, executionUnitPrice: 26_000, income: 0, expense: 624_000, payment: 624_000, vendor: '다라전기', status: '완료', note: '' },
  ];

  const vendorOf = (id) => vendors.find((vendor) => vendor._id === id);
  const task = (id, name, start, durationDays, progress, color, vendorId, memo = '') => {
    const vendor = vendorOf(vendorId);
    return {
      id,
      name,
      startDate: ymd(start),
      endDate: ymd(start + durationDays - 1),
      durationDays,
      progress,
      color,
      vendorId: vendor?._id || '',
      vendorName: vendor?.name || '',
      vendorPhone: vendor?.phone || '',
      memo,
    };
  };
  const schedule = [
    task('t1', '철거', -10, 3, 100, '#4d5d66', 'v1'),
    task('t2', '설비 배관', -7, 2, 100, '#8bb8e8', 'v5'),
    task('t3', '전기 배선', -6, 3, 100, '#e3a85f', 'v2'),
    task('t4', '목공', -4, 7, 60, '#f1c76a', 'v1', '우물천장 먼저'),
    task('t5', '욕실 타일', 2, 4, 0, '#79c7c5', 'v3'),
    task('t6', '방문 필름', 5, 2, 0, '#b9a7e8', 'v4'),
    task('t7', '주방 가구 설치', 8, 2, 0, '#d9a1a1', ''),
    task('t8', '도배', 10, 2, 0, '#8fc6a8', ''),
    task('t9', '강마루', 12, 2, 0, '#e3a85f', ''),
    task('t10', '입주 청소', 15, 1, 0, '#4d5d66', ''),
  ];

  const purchaseOrders = [
    {
      id: 'po1',
      title: '욕실 타일 발주',
      vendorName: '마바타일',
      orderDate: ymd(-3),
      deliveryDate: ymd(1),
      memo: '오전 입고, 엘리베이터 사용 신고 완료',
      templateKey: 'modelSpec',
      columnLabels: { category: '구분', modelName: '모델명', spec: '규격', quantity: '수량', unit: '단위', unitPrice: '단가', amount: '금액' },
      visibleColumns: ['category', 'modelName', 'spec', 'quantity', 'unit', 'amount', 'note'],
      items: [
        { id: 'poi1', category: '벽 타일', modelName: 'WT-3601 화이트', vendorName: '마바타일', spec: '300×600', unit: '박스', quantity: 22, unitPrice: 36_000, note: '' },
        { id: 'poi2', category: '바닥 타일', modelName: 'FT-3002 그레이', vendorName: '마바타일', spec: '300×300', unit: '박스', quantity: 8, unitPrice: 31_000, note: '논슬립' },
        { id: 'poi3', category: '부자재', modelName: '타일 접착제', vendorName: '마바타일', spec: '20kg', unit: '포', quantity: 6, unitPrice: 14_000, note: '' },
      ],
    },
  ];

  const extraItems = [
    { id: 'x1', name: '베란다 방수 추가', spec: '우레탄 2회', unit: '식', quantity: 1, unitPrice: 450_000, date: ymd(-2), vendorName: '', note: '' },
    { id: 'x2', name: '현관 중문', spec: '3연동 슬림', unit: '세트', quantity: 1, unitPrice: 1_350_000, date: ymd(-1), vendorName: '', note: '' },
  ];

  const draftLines = finalLines.filter((item) => !['l13', 'l18'].includes(item.id)).map((item) => ({ ...item, id: `d${item.id}`, customerUnitPrice: Math.round(item.customerUnitPrice * 1.08) }));

  const estimate = (siteId, _id, versionType, versionLabel, lines, extra = {}) => ({
    _id,
    siteId,
    siteTitle: sites.find((site) => site._id === siteId)?.title,
    customerName: sites.find((site) => site._id === siteId)?.customerName,
    versionType,
    versionLabel,
    linesJson: JSON.stringify(lines),
    workLinesJson: JSON.stringify(extra.workLines || []),
    scheduleJson: JSON.stringify(extra.schedule || []),
    holidaysJson: JSON.stringify(extra.holidays || []),
    constructionStartDate: extra.start || '',
    purchaseOrdersJson: JSON.stringify(extra.purchaseOrders || []),
    purchaseOrderTemplatesJson: '[]',
    extraItemsJson: JSON.stringify(extra.extraItems || []),
    legacyWorkbooksJson: '[]',
    memo: extra.memo || '',
    createdAt: extra.createdAt,
    updatedAt: extra.updatedAt,
  });

  // The workspace opens the newest version, so the final one is the newest.
  const estimatesBySite = {
    'site-1': [
      estimate('site-1', 'est-1b', 'final', '계약 견적', finalLines, {
        workLines,
        schedule,
        holidays: [ymd(3)],
        start: ymd(-10),
        purchaseOrders,
        extraItems,
        memo: '욕실 2곳 타일 색상 고객 확인 완료. 주방 상판 색상은 다음 주 결정.',
        createdAt: at(-31),
        updatedAt: at(-1, 17),
      }),
      estimate('site-1', 'est-1a', 'draft', '첫 상담 견적', draftLines, { createdAt: at(-37), updatedAt: at(-36) }),
    ],
    'site-2': [estimate('site-2', 'est-2a', 'final', '계약 견적', finalLines.slice(0, 12).map((item) => ({ ...item, id: `s2${item.id}` })), { createdAt: at(-21), updatedAt: at(-20) })],
    'site-3': [estimate('site-3', 'est-3a', 'draft', '첫 상담 견적', finalLines.slice(0, 8).map((item) => ({ ...item, id: `s3${item.id}` })), { createdAt: at(-9), updatedAt: at(-8) })],
  };

  const templateLines = (lines, prefix) => lines.map((item) => ({ ...item, id: `${prefix}${item.id}` }));
  const total = (lines) => lines.reduce((sum, item) => sum + item.quantity * item.customerUnitPrice, 0);
  const full30 = templateLines(finalLines, 't30-');
  const part20 = templateLines(
    finalLines.filter((item) => ['기본견적', '도배·바닥', '전기·조명'].includes(item.category)).map((item) => (item.unit === '평' ? { ...item, quantity: 20 } : item)),
    't20-',
  );
  const templates = [
    { id: 'tpl-30', name: '30평형 풀공사', lineCount: full30.length, customerTotal: total(full30), baseArea: 30, updatedAt: at(-12), updatedBy: '김위브', lines: full30, updateTime: at(-12) },
    { id: 'tpl-20', name: '20평형 도배·바닥·조명', lineCount: part20.length, customerTotal: total(part20), baseArea: 20, updatedAt: at(-30), updatedBy: '김위브', lines: part20, updateTime: at(-30) },
  ];

  return {
    sites: sites.map(({ _id, title, customerName, customerPhone, siteType, address, status, memo }) => ({ _id, title, customerName, customerPhone, siteType, address, status, memo })),
    estimatesBySite,
    materials,
    materialsMeta: { version: 'manual-demo-1', updatedAt: at(-14), count: materials.length },
    materialSettings,
    vendors: vendors.map(({ _id, name, manager, phone, service, status }) => ({ _id, name, manager, phone, service, status })),
    templates,
  };
}
