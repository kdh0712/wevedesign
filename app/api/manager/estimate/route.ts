import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { assertManager, hashId, managerClient } from '../_utils';

export const runtime = 'nodejs';

type EstimateLine = {
  id?: string;
  space?: string;
  category?: string;
  process?: string;
  name?: string;
  spec?: string;
  unit?: string;
  quantity?: number | string;
  customerUnitPrice?: number | string;
  executionUnitPrice?: number | string;
  note?: string;
};

type ScheduleTask = {
  id?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  progress?: number | string;
  memo?: string;
};

type MaterialDoc = {
  _id: string;
  _type: 'estimateMaterial';
  category: string;
  process: string;
  name: string;
  spec: string;
  unit: string;
  unitPrice: number;
  note: string;
  sourceSheet: string;
  updatedAt: string;
};

const estimateQuery = `{
  "sites": *[_type == "officeSite"] | order(createdAt desc, _createdAt desc)[0...300] {
    _id, title, customerName, customerPhone, customerId, consultationId, siteType, address, status, memo, createdAt
  },
  "estimates": *[_type == "siteEstimate"] | order(updatedAt desc, _updatedAt desc)[0...300] {
    _id, siteId, siteTitle, customerName, versionLabel, linesJson, scheduleJson,
    customerEstimateTotal, executionCostTotal, marginAmount, marginRate, memo, updatedAt, createdAt
  },
  "materials": *[_type == "estimateMaterial"] | order(category asc, process asc, name asc)[0...1000] {
    _id, category, process, name, spec, unit, unitPrice, note, sourceSheet, updatedAt
  }
}`;

export async function GET(request: Request) {
  const authError = assertManager(request);
  if (authError) return authError;

  try {
    const data = await managerClient.fetch(estimateQuery);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Estimate data fetch failed:', error);
    return NextResponse.json({ error: getErrorMessage(error, '견적 데이터를 불러오지 못했습니다.') }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = assertManager(request);
  if (authError) return authError;

  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      return await importMaterials(request);
    }

    const body = await request.json();
    const action = String(body?.action || '');

    if (action === 'saveEstimate') {
      return await saveEstimate(body);
    }

    if (action === 'saveMaterial') {
      return await saveMaterial(body?.material || {});
    }

    if (action === 'deleteMaterial') {
      const id = String(body?.id || '').trim();
      if (!id) return NextResponse.json({ error: '삭제할 자재를 선택해주세요.' }, { status: 400 });
      await managerClient.delete(id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: '지원하지 않는 견적 작업입니다.' }, { status: 400 });
  } catch (error) {
    console.error('Estimate save failed:', error);
    return NextResponse.json({ error: getErrorMessage(error, '견적 작업을 처리하지 못했습니다.') }, { status: 500 });
  }
}

async function saveEstimate(body: Record<string, unknown>) {
  const siteId = String(body.siteId || '').trim();
  if (!siteId) return NextResponse.json({ error: '현장을 먼저 선택해주세요.' }, { status: 400 });

  const lines = Array.isArray(body.lines) ? normalizeLines(body.lines as EstimateLine[]) : [];
  const schedule = Array.isArray(body.schedule) ? normalizeSchedule(body.schedule as ScheduleTask[]) : [];
  const totals = calculateTotals(lines);
  const now = new Date().toISOString();
  const existingId = typeof body.id === 'string' ? body.id.trim() : '';
  const id = existingId || `siteEstimate-${hashId(siteId)}`;

  const doc = {
    _id: id,
    _type: 'siteEstimate',
    siteId,
    siteTitle: String(body.siteTitle || '').trim(),
    customerName: String(body.customerName || '').trim(),
    versionLabel: String(body.versionLabel || '기본 견적').trim(),
    linesJson: JSON.stringify(lines),
    scheduleJson: JSON.stringify(schedule),
    customerEstimateTotal: totals.customerEstimateTotal,
    executionCostTotal: totals.executionCostTotal,
    marginAmount: totals.marginAmount,
    marginRate: totals.marginRate,
    memo: String(body.memo || '').trim(),
    createdAt: typeof body.createdAt === 'string' ? body.createdAt : now,
    updatedAt: now,
  };

  await managerClient.createOrReplace(doc);
  return NextResponse.json({ record: doc });
}

async function saveMaterial(material: Record<string, unknown>) {
  const name = String(material.name || '').trim();
  if (!name) return NextResponse.json({ error: '품명을 입력해주세요.' }, { status: 400 });

  const category = String(material.category || '').trim() || '미분류';
  const process = String(material.process || '').trim();
  const spec = String(material.spec || '').trim();
  const unit = String(material.unit || '').trim();
  const id = String(material._id || '').trim() || materialId(category, name, spec, unit);
  const now = new Date().toISOString();

  const doc = {
    _id: id,
    _type: 'estimateMaterial',
    category,
    process,
    name,
    spec,
    unit,
    unitPrice: toNumber(material.unitPrice),
    note: String(material.note || '').trim(),
    sourceSheet: String(material.sourceSheet || '직접 입력').trim(),
    updatedAt: now,
  };

  await managerClient.createOrReplace(doc);
  return NextResponse.json({ record: doc });
}

async function importMaterials(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: '업로드할 자재 단가 엑셀 파일을 선택해주세요.' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const now = new Date().toISOString();
  const docs = workbook.SheetNames.flatMap((sheetName) => parseSheet(workbook, sheetName, now));

  if (!docs.length) {
    return NextResponse.json({ error: '읽을 수 있는 자재 단가 항목을 찾지 못했습니다.' }, { status: 400 });
  }

  for (let index = 0; index < docs.length; index += 100) {
    const tx = managerClient.transaction();
    docs.slice(index, index + 100).forEach((doc) => tx.createOrReplace(doc));
    await tx.commit();
  }

  const categories = Array.from(new Set(docs.map((doc) => doc.category))).sort();
  return NextResponse.json({ importedCount: docs.length, categories });
}

function parseSheet(workbook: XLSX.WorkBook, sheetName: string, updatedAt: string): MaterialDoc[] {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Array<string | number>>(sheet, { header: 1, defval: '' });
  const headerIndex = rows.findIndex((row) => row.some((cell) => String(cell).trim() === '품명') && row.some((cell) => String(cell).trim() === '단가'));
  if (headerIndex < 0) return [];

  const headers = rows[headerIndex].map((cell) => String(cell).trim());
  const column = (name: string) => headers.findIndex((header) => header === name);
  const nameIndex = column('품명');
  const specIndex = column('규격');
  const unitIndex = column('단위');
  const priceIndex = column('단가');
  const processIndex = column('공종');
  const noteIndex = column('비고');

  return rows
    .slice(headerIndex + 1)
    .map((row) => {
      const name = cleanCell(row[nameIndex]);
      const unitPrice = toNumber(row[priceIndex]);
      if (!name || unitPrice <= 0) return null;

      const category = cleanCell(row[processIndex]) || sheetName.trim() || '미분류';
      const spec = specIndex >= 0 ? cleanCell(row[specIndex]) : '';
      const unit = unitIndex >= 0 ? cleanCell(row[unitIndex]) : '';

      return {
        _id: materialId(category, name, spec, unit),
        _type: 'estimateMaterial',
        category,
        process: category,
        name,
        spec,
        unit,
        unitPrice,
        note: noteIndex >= 0 ? cleanCell(row[noteIndex]) : '',
        sourceSheet: sheetName,
        updatedAt,
      };
    })
    .filter(Boolean) as MaterialDoc[];
}

function normalizeLines(lines: EstimateLine[]) {
  return lines
    .map((line, index) => {
      const quantity = toNumber(line.quantity);
      const customerUnitPrice = toNumber(line.customerUnitPrice);
      const executionUnitPrice = toNumber(line.executionUnitPrice);
      return {
        id: line.id || `line-${Date.now()}-${index}`,
        space: String(line.space || '').trim(),
        category: String(line.category || '').trim(),
        process: String(line.process || '').trim(),
        name: String(line.name || '').trim(),
        spec: String(line.spec || '').trim(),
        unit: String(line.unit || '').trim(),
        quantity,
        customerUnitPrice,
        executionUnitPrice,
        customerAmount: Math.round(quantity * customerUnitPrice),
        executionAmount: Math.round(quantity * executionUnitPrice),
        note: String(line.note || '').trim(),
      };
    })
    .filter((line) => line.name || line.space || line.category);
}

function normalizeSchedule(schedule: ScheduleTask[]) {
  return schedule
    .map((task, index) => ({
      id: task.id || `task-${Date.now()}-${index}`,
      name: String(task.name || '').trim(),
      startDate: String(task.startDate || '').trim(),
      endDate: String(task.endDate || '').trim(),
      progress: Math.max(0, Math.min(100, toNumber(task.progress))),
      memo: String(task.memo || '').trim(),
    }))
    .filter((task) => task.name);
}

function calculateTotals(lines: ReturnType<typeof normalizeLines>) {
  const customerEstimateTotal = Math.round(lines.reduce((sum, line) => sum + Number(line.customerAmount || 0), 0));
  const executionCostTotal = Math.round(lines.reduce((sum, line) => sum + Number(line.executionAmount || 0), 0));
  const marginAmount = customerEstimateTotal - executionCostTotal;
  const marginRate = customerEstimateTotal > 0 ? Math.round((marginAmount / customerEstimateTotal) * 1000) / 10 : 0;

  return { customerEstimateTotal, executionCostTotal, marginAmount, marginRate };
}

function materialId(category: string, name: string, spec: string, unit: string) {
  return `estimateMaterial-${hashId([category, name, spec, unit].join('|'))}`;
}

function cleanCell(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
