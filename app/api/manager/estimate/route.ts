import { NextResponse } from 'next/server';
import { gzipSync, gunzipSync } from 'zlib';
import * as XLSX from 'xlsx';
import { checkSanityDocumentType, hashId, isSanityIdWritable, managerClient } from '../_utils';
import { requireManager } from '../_session';
import {
  canUseFirestoreForRequest,
  deleteEstimateFromFirestore,
  deleteMaterialFromFirestore,
  isFirestoreConflictError,
  readEstimateDataFromFirestore,
  readEstimateMaterialSettingsForUpdate,
  readEstimateMaterialsFromFirestore,
  readSiteEstimatesFromFirestore,
  saveEstimateIfUnchangedInFirestore,
  saveMaterialToFirestore,
  shouldUseFirestoreErp,
  touchEstimateMaterialMetaInFirestore,
  writeEstimateMaterialSettingsIfUnchanged,
} from '../firestore';
import { commonOptionsForSave, sanitizeCommonOptions } from '../../../lib/estimate-common-options';
import {
  applyMaterialSettingsOp,
  changeMaterialSettingsSafely,
  decodeMaterialSettings,
  encodeMaterialSettingsFields,
  estimateSaveConflict,
  estimateSaveConflictMessage,
  linkMaterialToEstimateCategory,
  removeMaterialFromSettings,
  type MaterialSettings,
  type MaterialSettingsChange,
} from '../../../lib/estimate-save-safety';

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
  commonName?: boolean;
};

type WorkLine = {
  id?: string;
  sourceLineId?: string;
  date?: string;
  space?: string;
  category?: string;
  process?: string;
  name?: string;
  spec?: string;
  unit?: string;
  quantity?: number | string;
  executionUnitPrice?: number | string;
  income?: number | string;
  expense?: number | string;
  payment?: number | string;
  vendor?: string;
  status?: string;
  note?: string;
};

type ScheduleTask = {
  id?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  durationDays?: number | string;
  progress?: number | string;
  color?: string;
  vendorId?: string;
  vendorName?: string;
  vendorPhone?: string;
  memo?: string;
};

type PurchaseOrderItem = {
  id?: string;
  category?: string;
  modelName?: string;
  vendorName?: string;
  spec?: string;
  unit?: string;
  quantity?: number | string;
  unitPrice?: number | string;
  note?: string;
};

type PurchaseOrder = {
  id?: string;
  title?: string;
  vendorName?: string;
  orderDate?: string;
  deliveryDate?: string;
  memo?: string;
  templateKey?: string;
  doorModelName?: string;
  doorFinish?: string;
  doorBrand?: string;
  columnLabels?: Record<string, string>;
  visibleColumns?: string[];
  columnWidths?: Record<string, string>;
  cellAlignments?: Record<string, string>;
  mergeSameCategory?: boolean;
  headerMergeLabel?: string;
  headerMergeColumns?: string[];
  items?: PurchaseOrderItem[];
};

type PurchaseOrderTemplatePreset = {
  id?: string;
  name?: string;
  templateKey?: string;
  columnLabels?: Record<string, string>;
  visibleColumns?: string[];
  columnWidths?: Record<string, string>;
  cellAlignments?: Record<string, string>;
  mergeSameCategory?: boolean;
  headerMergeLabel?: string;
  headerMergeColumns?: string[];
};

type LegacyWorkSite = {
  id?: string;
  siteName?: string;
  rows?: WorkLine[];
};

type ExtraItem = {
  id?: string;
  name?: string;
  spec?: string;
  unit?: string;
  quantity?: number | string;
  unitPrice?: number | string;
  date?: string;
  vendorName?: string;
  note?: string;
};

type EstimateVersionType = 'draft' | 'revision' | 'final' | 'change';

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
  // Only meaningful when name is '공통': the 품명s offered when the item is picked into an estimate, in order.
  commonOptions?: string[];
  updatedAt: string;
};

// Estimate DB = full-DB materials linked to user-defined estimate categories, kept in one settings document
// (app/lib/estimate-save-safety.ts) so edits to a material show up in both views.
const MATERIAL_SETTINGS_ID = 'estimateMaterialSettings';
const materialSettingsProjection = '{estimateCategoriesJson, estimateItemsJson, materialOrderJson}';

// Sites and vendors in the 휴지통 (deletedAt set) stay out of the estimate workspace.
const sitesGroq = `*[_type == "officeSite" && !defined(deletedAt)] | order(createdAt desc, _createdAt desc)[0...300] {
    _id, title, customerName, customerPhone, customerId, consultationId, siteType, address, status, memo, createdAt
  }`;
const estimateProjection = `{
    _id, siteId, siteTitle, customerName, versionType, versionLabel, linesJson, workLinesJson, scheduleJson, holidaysJson, constructionStartDate,
    purchaseOrdersJson, purchaseOrderTemplatesJson, extraItemsJson, legacyWorkbooksJson, legacyWorkbooksCompressedJson,
    customerEstimateTotal, executionCostTotal, marginAmount, marginRate,
    estimateExecutionCostTotal, estimatedMarginAmount, estimatedMarginRate,
    actualExecutionCostTotal, actualMarginAmount, actualMarginRate, additionalCostTotal,
    memo, updatedAt, createdAt
  }`;
const allEstimatesGroq = `*[_type == "siteEstimate"] | order(updatedAt desc, _updatedAt desc)[0...300] ${estimateProjection}`;
const siteEstimatesGroq = `*[_type == "siteEstimate" && siteId == $siteId] | order(updatedAt desc, _updatedAt desc) ${estimateProjection}`;
const newestSiteIdGroq = `*[_type == "officeSite" && !defined(deletedAt)] | order(createdAt desc, _createdAt desc)[0]._id`;
const materialsGroq = `*[_type == "estimateMaterial"] | order(category asc, process asc, name asc)[0...5000] {
    _id, category, process, name, spec, unit, unitPrice, note, sourceSheet, updatedAt, defined(commonOptions) => { commonOptions }
  }`;
const materialSettingsGroq = `*[_id == "${MATERIAL_SETTINGS_ID}"][0] ${materialSettingsProjection}`;
const vendorsGroq = `*[_type == "officeVendor" && !defined(deletedAt)] | order(name asc)[0...300] {
    _id, name, manager, phone, service, status, memo, createdAt
  }`;

const estimateQuery = ({ siteScoped, includeMaterials }: { siteScoped: boolean; includeMaterials: boolean }) => `{
  "sites": ${sitesGroq},
  "estimates": ${siteScoped ? siteEstimatesGroq : allEstimatesGroq},
  ${includeMaterials ? `"materials": ${materialsGroq},` : ''}
  "materialSettings": ${materialSettingsGroq},
  "vendors": ${vendorsGroq}
}`;

type EstimateReadOptions = {
  part: string;
  includeMaterials: boolean;
  // undefined = newest 300 versions of every site (original payload); a string = that site only, '' = newest site.
  estimatesSiteId?: string;
};

// GET variants:
// - no params: sites, the newest 300 versions of every site, materials, settings and vendors (original payload)
// - materials=skip: the same without materials
// - estimates=site&siteId=: only that site's versions ('' = newest site), plus estimatesSiteId
// - part=estimates&siteId=: { estimates, estimatesSiteId } for one site
// - part=materials: { materials, materialsMeta, materialSettings }
export async function GET(request: Request) {
  const access = requireManager(request, { anyOf: ['estimates'] });
  if (access.error) return access.error;

  try {
    const startedAt = Date.now();
    const url = new URL(request.url);
    const part = url.searchParams.get('part') || '';
    const siteId = (url.searchParams.get('siteId') || '').trim();
    const isSiteScoped = part === 'estimates' || url.searchParams.get('estimates') === 'site';

    if (part === 'estimates' && !siteId) {
      return NextResponse.json({ error: '현장을 먼저 선택해주세요.' }, { status: 400 });
    }

    const payload = await readEstimatePayload(request, {
      part,
      includeMaterials: url.searchParams.get('materials') !== 'skip',
      estimatesSiteId: isSiteScoped ? siteId : undefined,
    });
    return timedJson(payload, startedAt, part || (isSiteScoped ? 'site' : 'all'));
  } catch (error) {
    console.error('Estimate data fetch failed:', error);
    return NextResponse.json({ error: getErrorMessage(error, '견적 데이터를 불러오지 못했습니다.') }, { status: 500 });
  }
}

async function readEstimatePayload(request: Request, { part, includeMaterials, estimatesSiteId }: EstimateReadOptions) {
  const useFirestore = shouldUseFirestoreErp() && canUseFirestoreForRequest(request);

  if (part === 'materials') {
    if (useFirestore) {
      const data = await readEstimateMaterialsFromFirestore(request);
      return { ...data, materialSettings: decodeMaterialSettings(data.materialSettings) };
    }
    const data = await managerClient.fetch(`{ "materials": ${materialsGroq}, "materialSettings": ${materialSettingsGroq} }`);
    return { materials: data?.materials || [], materialsMeta: null, materialSettings: decodeMaterialSettings(data?.materialSettings) };
  }

  if (part === 'estimates') {
    const siteId = estimatesSiteId || '';
    const estimates = useFirestore
      ? await readSiteEstimatesFromFirestore(request, siteId)
      : await managerClient.fetch(siteEstimatesGroq, { siteId });
    return { estimates: decodeEstimates(estimates), estimatesSiteId: siteId };
  }

  if (useFirestore) {
    return decodeEstimatePayload(await readEstimateDataFromFirestore(request, { includeMaterials, estimatesSiteId }));
  }

  const siteScoped = typeof estimatesSiteId === 'string';
  const scopedSiteId = siteScoped ? estimatesSiteId || String((await managerClient.fetch(newestSiteIdGroq)) || '') : '';
  const data = decodeEstimatePayload(
    await managerClient.fetch(estimateQuery({ siteScoped, includeMaterials }), siteScoped ? { siteId: scopedSiteId } : {}),
  );
  return {
    ...data,
    ...(siteScoped ? { estimatesSiteId: scopedSiteId } : {}),
    ...(includeMaterials ? {} : { materialsMeta: null }),
  };
}

// Server-Timing shows in the browser's network panel, so the cost of each variant can be checked against real data.
function timedJson(payload: unknown, startedAt: number, label: string) {
  const readMs = Date.now() - startedAt;
  const body = JSON.stringify(payload);
  const jsonMs = Date.now() - startedAt - readMs;
  console.info(`Estimate GET ${label}: ${Buffer.byteLength(body)} bytes, read ${readMs}ms, json ${jsonMs}ms`);
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/json',
      'Server-Timing': `read;dur=${readMs}, json;dur=${jsonMs}`,
    },
  });
}

export async function POST(request: Request) {
  const access = requireManager(request, { anyOf: ['estimates'] });
  if (access.error) return access.error;

  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      return await importMaterials(request);
    }

    const body = await request.json();
    const action = String(body?.action || '');

    if (action === 'saveEstimate') {
      return await saveEstimate(body, request);
    }

    if (action === 'deleteEstimate') {
      const id = String(body?.id || '').trim();
      if (!id) return NextResponse.json({ error: '삭제할 견적 버전을 선택해주세요.' }, { status: 400 });
      if (shouldUseFirestoreErp() && canUseFirestoreForRequest(request)) {
        await deleteEstimateFromFirestore(request, id);
        return NextResponse.json({ ok: true });
      }
      if ((await checkSanityDocumentType(id, 'siteEstimate')) !== 'ok') {
        return NextResponse.json({ error: '삭제할 견적 버전을 찾을 수 없습니다.' }, { status: 404 });
      }
      await managerClient.delete(id);
      return NextResponse.json({ ok: true });
    }

    if (action === 'saveMaterial') {
      return await saveMaterial(body?.material || {}, request, body?.estimateCategory);
    }

    if (action === 'updateMaterialSettings') {
      return await updateMaterialSettings(body || {}, request);
    }

    if (action === 'deleteMaterial') {
      const id = String(body?.id || '').trim();
      if (!id) return NextResponse.json({ error: '삭제할 자재를 선택해주세요.' }, { status: 400 });
      if (shouldUseFirestoreErp() && canUseFirestoreForRequest(request)) {
        await deleteMaterialFromFirestore(request, id);
        await touchEstimateMaterialMetaInFirestore(request);
      } else {
        if ((await checkSanityDocumentType(id, 'estimateMaterial')) !== 'ok') {
          return NextResponse.json({ error: '삭제할 자재를 찾을 수 없습니다.' }, { status: 404 });
        }
        await managerClient.delete(id);
      }
      const result = await changeMaterialSettings(request, (settings) => removeMaterialFromSettings(settings, id));
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: '지원하지 않는 견적 작업입니다.' }, { status: 400 });
  } catch (error) {
    console.error('Estimate save failed:', error);
    return NextResponse.json({ error: getErrorMessage(error, '견적 작업을 처리하지 못했습니다.') }, { status: 500 });
  }
}

async function saveEstimate(body: Record<string, unknown>, request: Request) {
  const siteId = String(body.siteId || '').trim();
  if (!siteId) return NextResponse.json({ error: '현장을 먼저 선택해주세요.' }, { status: 400 });

  const lines = Array.isArray(body.lines) ? normalizeLines(body.lines as EstimateLine[]) : [];
  const workLines = Array.isArray(body.workLines) ? normalizeWorkLines(body.workLines as WorkLine[]) : [];
  const schedule = Array.isArray(body.schedule) ? normalizeSchedule(body.schedule as ScheduleTask[]) : [];
  const purchaseOrders = Array.isArray(body.purchaseOrders) ? normalizePurchaseOrders(body.purchaseOrders as PurchaseOrder[]) : [];
  const purchaseOrderTemplatePresets = Array.isArray(body.purchaseOrderTemplatePresets) ? normalizePurchaseOrderTemplatePresets(body.purchaseOrderTemplatePresets as PurchaseOrderTemplatePreset[]) : [];
  const extraItems = Array.isArray(body.extraItems) ? normalizeExtraItems(body.extraItems as ExtraItem[]) : [];
  const legacyWorkSites = Array.isArray(body.legacyWorkSites) ? normalizeLegacyWorkSites(body.legacyWorkSites as LegacyWorkSite[]) : [];
  const legacyWorkbookFields = encodeLegacyWorkbooks(legacyWorkSites);
  const holidays = Array.isArray(body.holidays) ? normalizeHolidays(body.holidays) : [];
  const constructionStartDate = normalizeHolidays([body.constructionStartDate])[0] || '';
  const totals = calculateTotals(lines, workLines, extraItems);
  const now = new Date().toISOString();
  const existingId = typeof body.id === 'string' ? body.id.trim() : '';
  const versionType = normalizeVersionType(body.versionType);
  const versionLabel = String(body.versionLabel || defaultVersionLabel(versionType)).trim();
  const id = existingId || `siteEstimate-${hashId([siteId, versionType, versionLabel, now].join('|'))}`;

  const doc = {
    _id: id,
    _type: 'siteEstimate',
    siteId,
    siteTitle: String(body.siteTitle || '').trim(),
    customerName: String(body.customerName || '').trim(),
    versionType,
    versionLabel,
    linesJson: JSON.stringify(lines),
    workLinesJson: JSON.stringify(workLines),
    scheduleJson: JSON.stringify(schedule),
    holidaysJson: JSON.stringify(holidays),
    constructionStartDate,
    purchaseOrdersJson: JSON.stringify(purchaseOrders),
    purchaseOrderTemplatesJson: JSON.stringify(purchaseOrderTemplatePresets),
    extraItemsJson: JSON.stringify(extraItems),
    ...legacyWorkbookFields,
    customerEstimateTotal: totals.customerEstimateTotal,
    executionCostTotal: totals.executionCostTotal,
    marginAmount: totals.marginAmount,
    marginRate: totals.marginRate,
    estimateExecutionCostTotal: totals.estimateExecutionCostTotal,
    estimatedMarginAmount: totals.estimatedMarginAmount,
    estimatedMarginRate: totals.estimatedMarginRate,
    actualExecutionCostTotal: totals.actualExecutionCostTotal,
    actualMarginAmount: totals.actualMarginAmount,
    actualMarginRate: totals.actualMarginRate,
    additionalCostTotal: totals.additionalCostTotal,
    memo: String(body.memo || '').trim(),
    createdAt: typeof body.createdAt === 'string' ? body.createdAt : now,
    updatedAt: now,
  };

  // An existing version saves only if it is still what the editor loaded (baseUpdatedAt); otherwise the page asks
  // whether to save a new version or reload, instead of one computer silently overwriting another's work.
  const conflictOf = (stored: { updatedAt?: unknown } | null) => estimateSaveConflict(stored, { existingId, baseUpdatedAt: body.baseUpdatedAt });
  // The editor keeps editing what it sent without reloading, so it gets the saved version back the way the list holds
  // it (legacy workbooks inline) and sends its updatedAt as the base of the next save.
  const record = decodeLegacyWorkbooksRecord(doc);

  if (shouldUseFirestoreErp() && canUseFirestoreForRequest(request)) {
    const { conflict } = await saveEstimateIfUnchangedInFirestore(doc, request, conflictOf);
    if (conflict) return estimateConflictResponse(conflict);
    return NextResponse.json({ record });
  }

  if (existingId && !(await isSanityIdWritable(existingId, 'siteEstimate', { allowNew: true }))) {
    return NextResponse.json({ error: '저장할 견적 버전이 올바르지 않습니다.' }, { status: 400 });
  }

  const stored = await managerClient.fetch<{ _rev?: string; updatedAt?: string } | null>(`*[_id == $id][0]{_rev, updatedAt}`, { id });
  const conflict = conflictOf(stored);
  if (conflict) return estimateConflictResponse(conflict);
  try {
    if (stored?._rev) {
      const fields = Object.fromEntries(Object.entries(doc).filter(([key]) => key !== '_id' && key !== '_type'));
      await managerClient.patch(id).ifRevisionId(stored._rev).set(fields).commit();
    } else {
      await managerClient.create(doc);
    }
  } catch (error) {
    if (isSanityConflictError(error)) return estimateConflictResponse('changed');
    throw error;
  }
  return NextResponse.json({ record });
}

function estimateConflictResponse(conflict: 'changed' | 'deleted') {
  return NextResponse.json({ error: estimateSaveConflictMessage(conflict), conflict }, { status: 409 });
}

// Sanity answers 409 when ifRevisionId no longer matches or create finds the document already there.
function isSanityConflictError(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as { statusCode?: number }).statusCode === 409);
}

const LEGACY_WORKBOOKS_INLINE_LIMIT = 850000;

function encodeLegacyWorkbooks(legacyWorkSites: LegacyWorkSite[]) {
  const json = JSON.stringify(legacyWorkSites);
  if (json.length <= LEGACY_WORKBOOKS_INLINE_LIMIT) {
    return {
      legacyWorkbooksJson: json,
      legacyWorkbooksCompressedJson: '',
    };
  }

  return {
    legacyWorkbooksJson: '[]',
    legacyWorkbooksCompressedJson: gzipSync(Buffer.from(json, 'utf8')).toString('base64'),
  };
}

function decodeEstimatePayload(data: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!data) return {};
  const decoded = { ...data, materialSettings: decodeMaterialSettings(data.materialSettings) };
  if (!Array.isArray(data.estimates)) return decoded;
  return { ...decoded, estimates: decodeEstimates(data.estimates) };
}

function decodeEstimates(estimates: unknown) {
  return Array.isArray(estimates) ? estimates.map((estimate) => decodeLegacyWorkbooksRecord(estimate as Record<string, unknown>)) : [];
}

type SettingsVersion = { exists: boolean; version: string };

// Read for a change: a failed read throws instead of looking like empty settings, and the version (Firestore
// updateTime or Sanity _rev) goes with it so the write can refuse to land on a newer copy.
async function readMaterialSettingsForUpdate(request: Request): Promise<{ settings: MaterialSettings; version: SettingsVersion }> {
  if (shouldUseFirestoreErp() && canUseFirestoreForRequest(request)) {
    const stored = await readEstimateMaterialSettingsForUpdate(request);
    return { settings: decodeMaterialSettings(stored?.record ?? null), version: { exists: Boolean(stored), version: stored?.updateTime || '' } };
  }
  const stored = await managerClient.fetch<Record<string, unknown> | null>(`*[_id == $id][0]{_rev, estimateCategoriesJson, estimateItemsJson, materialOrderJson}`, {
    id: MATERIAL_SETTINGS_ID,
  });
  return { settings: decodeMaterialSettings(stored), version: { exists: Boolean(stored), version: String(stored?._rev || '') } };
}

// Throws a conflict (FirestoreConflictError or a Sanity 409) when the settings changed after that read; nothing is written then.
async function writeMaterialSettingsIfUnchanged(settings: MaterialSettings, version: SettingsVersion, request: Request) {
  const fields = encodeMaterialSettingsFields(settings, new Date().toISOString());
  if (shouldUseFirestoreErp() && canUseFirestoreForRequest(request)) {
    await writeEstimateMaterialSettingsIfUnchanged(request, fields, version.exists ? version.version : null);
    return;
  }
  if (version.exists && version.version) {
    await managerClient.patch(MATERIAL_SETTINGS_ID).ifRevisionId(version.version).set(fields).commit();
    return;
  }
  await managerClient.create({ _id: MATERIAL_SETTINGS_ID, _type: 'estimateMaterialSettings', ...fields });
}

function changeMaterialSettings(request: Request, change: (settings: MaterialSettings) => MaterialSettingsChange) {
  return changeMaterialSettingsSafely(
    {
      read: () => readMaterialSettingsForUpdate(request),
      write: (settings, version) => writeMaterialSettingsIfUnchanged(settings, version, request),
      isConflict: (error) => isFirestoreConflictError(error) || isSanityConflictError(error),
    },
    change,
  );
}

async function updateMaterialSettings(body: Record<string, unknown>, request: Request) {
  const result = await changeMaterialSettings(request, (settings) => applyMaterialSettingsOp(settings, body));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ materialSettings: result.settings });
}

// The client only reads legacyWorkbooksJson, so the compressed copy is dropped instead of being sent twice.
function decodeLegacyWorkbooksRecord(record: Record<string, unknown>) {
  const { legacyWorkbooksCompressedJson, ...rest } = record;
  const compressed = typeof legacyWorkbooksCompressedJson === 'string' ? legacyWorkbooksCompressedJson : '';
  if (!compressed) return rest;

  try {
    return {
      ...rest,
      legacyWorkbooksJson: gunzipSync(Buffer.from(compressed, 'base64')).toString('utf8'),
    };
  } catch {
    return rest;
  }
}

function normalizeVersionType(value: unknown): EstimateVersionType {
  const next = String(value || '').trim();
  if (next === 'revision' || next === 'final' || next === 'change') return next;
  return 'draft';
}

function defaultVersionLabel(versionType: EstimateVersionType) {
  const labels: Record<EstimateVersionType, string> = {
    draft: '초안',
    revision: '수정안',
    final: '최종안',
    change: '변경견적',
  };
  return labels[versionType];
}

async function saveMaterial(material: Record<string, unknown>, request: Request, estimateCategory?: unknown) {
  const name = String(material.name || '').trim();
  if (!name) return NextResponse.json({ error: '품명을 입력해주세요.' }, { status: 400 });

  const category = String(material.category || '').trim() || '미분류';
  const process = String(material.process || '').trim();
  const spec = String(material.spec || '').trim();
  const unit = String(material.unit || '').trim();
  const id = String(material._id || '').trim() || materialId(category, name, spec, unit);
  const now = new Date().toISOString();

  const doc: MaterialDoc = {
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
  // Only a request that sends commonOptions changes them; without the field the Firestore merge keeps the stored list.
  const commonOptions = commonOptionsForSave(name, material.commonOptions);
  if (commonOptions) doc.commonOptions = commonOptions;

  let record: MaterialDoc = doc;
  if (shouldUseFirestoreErp() && canUseFirestoreForRequest(request)) {
    const stored = await saveMaterialToFirestore(doc, request);
    const storedOptions = sanitizeCommonOptions(stored?.commonOptions);
    if (storedOptions) record = { ...doc, commonOptions: storedOptions };
    await touchEstimateMaterialMetaInFirestore(request);
  } else {
    if (!(await isSanityIdWritable(id, 'estimateMaterial', { allowNew: true }))) {
      return NextResponse.json({ error: '저장할 자재가 올바르지 않습니다.' }, { status: 400 });
    }
    await managerClient.createOrReplace(doc);
  }

  if (typeof estimateCategory !== 'string') return NextResponse.json({ record });

  const result = await changeMaterialSettings(request, (settings) => linkMaterialToEstimateCategory(settings, id, estimateCategory));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ record, materialSettings: result.settings });
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

  if (shouldUseFirestoreErp() && canUseFirestoreForRequest(request)) {
    for (const doc of docs) {
      await saveMaterialToFirestore(doc, request);
    }
    await touchEstimateMaterialMetaInFirestore(request, docs.length);
    const categories = Array.from(new Set(docs.map((doc) => doc.category))).sort();
    return NextResponse.json({ importedCount: docs.length, categories });
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
        commonName: Boolean(line.commonName),
      };
    })
    // The page accepts a line with any of these filled in, so none of them may be dropped here.
    .filter((line) => line.name || line.space || line.category || line.process || line.note);
}

function normalizeWorkLines(lines: WorkLine[]) {
  return lines
    .map((line, index) => {
      const quantity = toNumber(line.quantity);
      const executionUnitPrice = toNumber(line.executionUnitPrice);
      const fallbackExpense = Math.round(quantity * executionUnitPrice);
      const expense = toNumber(line.expense) || fallbackExpense;
      return {
        id: line.id || `work-${Date.now()}-${index}`,
        sourceLineId: String(line.sourceLineId || '').trim(),
        date: String(line.date || '').trim(),
        space: String(line.space || '').trim(),
        category: String(line.category || '').trim(),
        process: String(line.process || '').trim(),
        name: String(line.name || '').trim(),
        spec: String(line.spec || '').trim(),
        unit: String(line.unit || '').trim(),
        quantity,
        executionUnitPrice,
        income: toNumber(line.income),
        expense,
        payment: toNumber(line.payment),
        executionAmount: expense,
        vendor: String(line.vendor || '').trim(),
        status: String(line.status || '예정').trim(),
        note: String(line.note || '').trim(),
      };
    })
    .filter((line) => line.name || line.space || line.category || line.process || line.date || line.income || line.expense || line.payment || line.note);
}

function normalizeSchedule(schedule: ScheduleTask[]) {
  return schedule
    .map((task, index) => ({
      id: task.id || `task-${Date.now()}-${index}`,
      name: String(task.name || '').trim(),
      startDate: String(task.startDate || '').trim(),
      endDate: String(task.endDate || '').trim(),
      durationDays: Math.max(1, Math.round(toNumber(task.durationDays) || 1)),
      progress: Math.max(0, Math.min(100, toNumber(task.progress))),
      color: normalizeColor(task.color),
      vendorId: String(task.vendorId || '').trim(),
      vendorName: String(task.vendorName || '').trim(),
      vendorPhone: String(task.vendorPhone || '').trim(),
      memo: String(task.memo || '').trim(),
    }))
    .filter((task) => task.name);
}

function normalizePurchaseOrders(orders: PurchaseOrder[]) {
  const defaultColumnLabels = {
    category: '구분',
    modelName: '모델명',
    spec: '규격',
    quantity: '수량',
    unit: '단위',
    unitPrice: '단가',
    amount: '금액',
  };
  const columnKeys = ['category', 'modelName', 'spec', 'quantity', 'unit', 'amount', 'note'];
  const alignValues = ['left', 'center', 'right'];
  const defaultVisibleColumns: Record<string, string[]> = {
    modelSpec: ['category', 'modelName', 'spec', 'quantity', 'unit', 'amount', 'note'],
    subType: ['category', 'modelName', 'quantity', 'unit'],
    doorSet: ['category', 'modelName', 'spec', 'unit', 'quantity', 'note'],
    custom: ['category', 'modelName', 'spec', 'quantity', 'unit', 'amount', 'note'],
  };

  return orders
    .map((order, index) => {
      const id = String(order.id || `purchase-${Date.now()}-${index}`).trim();
      const templateKey = ['modelSpec', 'subType', 'doorSet', 'custom'].includes(String(order.templateKey || ''))
        ? String(order.templateKey)
        : 'modelSpec';
      const columnLabels = Object.fromEntries(
        Object.entries({ ...defaultColumnLabels, ...(order.columnLabels || {}) }).map(([key, value]) => [key, String(value || '').trim() || defaultColumnLabels[key as keyof typeof defaultColumnLabels]]),
      );
      const visibleColumns = Array.isArray(order.visibleColumns)
        ? order.visibleColumns.map((column) => String(column || '')).filter((column) => columnKeys.includes(column))
        : [];
      const cellAlignments = Object.fromEntries(
        Object.entries(order.cellAlignments || {})
          .map(([key, value]) => [key, String(value || '').trim()])
          .filter(([key, value]) => columnKeys.includes(key) && alignValues.includes(value)),
      );
      const items = Array.isArray(order.items)
        ? order.items
            .map((item, itemIndex) => {
              const quantity = toNumber(item.quantity);
              const unitPrice = toNumber(item.unitPrice);
              return {
                id: String(item.id || `${id}-item-${itemIndex}`).trim(),
                category: String(item.category || '').trim(),
                modelName: String(item.modelName || '').trim(),
                vendorName: String(item.vendorName || '').trim(),
                spec: String(item.spec || '').trim(),
                unit: String(item.unit || '').trim(),
                quantity,
                unitPrice,
                amount: Math.round(quantity * unitPrice),
                note: String(item.note || '').trim(),
              };
            })
            .filter((item) => item.category || item.modelName || item.spec || item.quantity || item.unitPrice || item.note)
        : [];

      return {
        id,
        title: String(order.title || '').trim(),
        vendorName: String(order.vendorName || '').trim(),
        orderDate: String(order.orderDate || '').trim(),
        deliveryDate: String(order.deliveryDate || '').trim(),
        memo: String(order.memo || '').trim(),
        templateKey,
        doorModelName: String(order.doorModelName || '').trim(),
        doorFinish: String(order.doorFinish || '').trim(),
        doorBrand: String(order.doorBrand || '').trim(),
        columnLabels,
        visibleColumns: visibleColumns.length ? visibleColumns : defaultVisibleColumns[templateKey],
        columnWidths: typeof order.columnWidths === 'object' && order.columnWidths ? order.columnWidths : {},
        cellAlignments,
        mergeSameCategory: Boolean(order.mergeSameCategory),
        headerMergeLabel: String(order.headerMergeLabel || '').trim(),
        headerMergeColumns: Array.isArray(order.headerMergeColumns)
          ? order.headerMergeColumns.map((column) => String(column || '')).filter((column) => columnKeys.includes(column))
          : [],
        items,
      };
    })
    .filter((order) => order.title || order.vendorName || order.memo || order.items.length > 0);
}

function normalizePurchaseOrderTemplatePresets(presets: PurchaseOrderTemplatePreset[]) {
  const defaultColumnLabels = {
    category: '구분',
    modelName: '모델명',
    spec: '규격',
    quantity: '수량',
    unit: '단위',
    unitPrice: '단가',
    amount: '금액',
  };
  const columnKeys = ['category', 'modelName', 'spec', 'quantity', 'unit', 'amount', 'note'];
  const alignValues = ['left', 'center', 'right'];
  const defaultVisibleColumns: Record<string, string[]> = {
    modelSpec: ['category', 'modelName', 'spec', 'quantity', 'unit', 'amount', 'note'],
    subType: ['category', 'modelName', 'quantity', 'unit'],
    doorSet: ['category', 'modelName', 'spec', 'unit', 'quantity', 'note'],
    custom: ['category', 'modelName', 'spec', 'quantity', 'unit', 'amount', 'note'],
  };

  return presets
    .map((preset, index) => {
      const templateKey = ['modelSpec', 'subType', 'doorSet', 'custom'].includes(String(preset.templateKey || ''))
        ? String(preset.templateKey)
        : 'custom';
      const visibleColumns = Array.isArray(preset.visibleColumns)
        ? preset.visibleColumns.map((column) => String(column || '')).filter((column) => columnKeys.includes(column))
        : [];
      const columnWidths = Object.fromEntries(
        Object.entries(preset.columnWidths || {})
          .map(([key, value]) => {
            const numericWidth = String(value || '').replace(/[^0-9.]/g, '');
            return [key, numericWidth || ''];
          })
          .filter(([key, value]) => columnKeys.includes(key) && value),
      );
      const cellAlignments = Object.fromEntries(
        Object.entries(preset.cellAlignments || {})
          .map(([key, value]) => [key, String(value || '').trim()])
          .filter(([key, value]) => columnKeys.includes(key) && alignValues.includes(value)),
      );

      return {
        id: String(preset.id || `purchase-template-${Date.now()}-${index}`).trim(),
        name: String(preset.name || `템플릿 ${index + 1}`).trim(),
        templateKey,
        columnLabels: Object.fromEntries(
          Object.entries({ ...defaultColumnLabels, ...(preset.columnLabels || {}) }).map(([key, value]) => [key, String(value || '').trim() || defaultColumnLabels[key as keyof typeof defaultColumnLabels]]),
        ),
        visibleColumns: visibleColumns.length ? visibleColumns : defaultVisibleColumns[templateKey],
        columnWidths,
        cellAlignments,
        mergeSameCategory: Boolean(preset.mergeSameCategory),
        headerMergeLabel: String(preset.headerMergeLabel || '').trim(),
        headerMergeColumns: Array.isArray(preset.headerMergeColumns)
          ? preset.headerMergeColumns.map((column) => String(column || '')).filter((column) => columnKeys.includes(column))
          : [],
      };
    })
    .filter((preset) => preset.name);
}

function normalizeLegacyWorkSites(sites: LegacyWorkSite[]) {
  return sites
    .map((site, index) => ({
      id: String(site.id || `legacy-${Date.now()}-${index}`).trim(),
      siteName: String(site.siteName || '').trim(),
      rows: Array.isArray(site.rows) ? normalizeWorkLines(site.rows) : [],
    }))
    .filter((site) => site.siteName || site.rows.length > 0);
}

function normalizeExtraItems(items: ExtraItem[]) {
  return items
    .map((item, index) => {
      const quantity = toNumber(item.quantity);
      const unitPrice = toNumber(item.unitPrice);
      return {
        id: String(item.id || `extra-${Date.now()}-${index}`).trim(),
        name: String(item.name || '').trim(),
        spec: String(item.spec || '').trim(),
        unit: String(item.unit || '').trim(),
        quantity,
        unitPrice,
        amount: Math.round(quantity * unitPrice),
        date: String(item.date || '').trim(),
        vendorName: String(item.vendorName || '').trim(),
        note: String(item.note || '').trim(),
      };
    })
    .filter((item) => item.name || item.spec || item.vendorName || item.quantity || item.unitPrice || item.note);
}

function normalizeHolidays(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim())
        .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)),
    ),
  ).sort();
}

function normalizeColor(value: unknown) {
  const color = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#f1c76a';
}

function calculateTotals(
  lines: ReturnType<typeof normalizeLines>,
  workLines: ReturnType<typeof normalizeWorkLines>,
  extraItems: ReturnType<typeof normalizeExtraItems> = [],
) {
  const customerEstimateTotal = Math.round(lines.reduce((sum, line) => sum + Number(line.customerAmount || 0), 0));
  const estimateExecutionCostTotal = Math.round(lines.reduce((sum, line) => sum + Number(line.executionAmount || 0), 0));
  const hasWorkLines = workLines.length > 0;
  const actualExecutionCostTotal = hasWorkLines
    ? Math.round(workLines.reduce((sum, line) => sum + Number(line.expense || line.executionAmount || 0), 0))
    : 0;
  const additionalCostTotal = Math.round(extraItems.reduce((sum, item) => sum + Number(item.amount || 0), 0));
  const estimatedMarginAmount = customerEstimateTotal - estimateExecutionCostTotal;
  const actualMarginAmount = hasWorkLines ? customerEstimateTotal - actualExecutionCostTotal - additionalCostTotal : 0;
  const estimatedMarginRate = customerEstimateTotal > 0 ? Math.round((estimatedMarginAmount / customerEstimateTotal) * 1000) / 10 : 0;
  const actualMarginRate = customerEstimateTotal > 0 && hasWorkLines ? Math.round((actualMarginAmount / customerEstimateTotal) * 1000) / 10 : 0;
  const executionCostTotal = actualExecutionCostTotal;
  const marginAmount = actualMarginAmount;
  const marginRate = actualMarginRate;

  return {
    customerEstimateTotal,
    executionCostTotal,
    marginAmount,
    marginRate,
    estimateExecutionCostTotal,
    estimatedMarginAmount,
    estimatedMarginRate,
    actualExecutionCostTotal,
    actualMarginAmount,
    actualMarginRate,
    additionalCostTotal,
  };
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
