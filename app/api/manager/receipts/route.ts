import { NextResponse, after } from 'next/server';
import { hasAnyPermission } from '../../../lib/manager-permissions';
import { isOfficeRecordId } from '../../../lib/mobile-overview';
import { todayInSeoul } from '../../../lib/site-progress';
import {
  MY_RECEIPTS_LIMIT,
  canChangeReceipt,
  parseReceiptAction,
  skippedFields,
  toReceiptView,
  type ReceiptAuthor,
  type SiteReceipt,
  type SiteReceiptView,
} from '../../../lib/site-receipts';
import { MOBILE_STORE_MISSING } from '../_mobile-devices';
import { deleteReceiptPhotos, isProgressPhotoStoreConfigured, signReceiptPhotos, uploadReceiptPhoto } from '../_progress-photo-storage';
import { PHOTO_STORE_MISSING_MESSAGE, PHOTO_STORE_PERMISSION_MESSAGE, isStoragePermissionError, storageErrorSummary } from '../_progress-photos';
import { checkPhotoUpload, parsePhotoSize } from '../_progress-request';
import { isProgressStoreReady } from '../_progress-store';
import { requireManager, type ManagerSession } from '../_session';
import {
  createReceiptRecord,
  deleteReceiptRecord,
  getReceiptRecord,
  listReceiptRecordsByCreator,
  listReceiptRecordsOfSite,
  readLockedReceiptIds,
  receiptPhotoPathnames,
  updateReceiptRecord,
} from '../_site-receipts';
import { getFirestoreDocument, isFirestoreConflictError, listFirestoreCollection, officeFirestoreCollections } from '../firestore';

export const runtime = 'nodejs';

// 현장 영수증함 (spec docs/superpowers/specs/2026-11-24-site-receipts-design.md). The staff phone snaps receipts into a
// site (sites permission) and sees only its own; the PC 실행내역서 sees a site's receipts and moves them into work lines
// (estimates permission). The writer always comes from the signed session. Receipts never reach a customer page.
const SITE_NOT_FOUND = '현장을 찾을 수 없어요.';
const RECEIPT_NOT_FOUND = '영수증을 찾을 수 없어요.';
const LOAD_FAILED = '영수증을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
const SAVE_FAILED = '영수증을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.';
const PHOTO_SAVE_FAILED = '사진을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.';
const NEEDS_SITES = '현장 권한이 필요합니다.';
const NEEDS_ESTIMATES = '견적 권한이 필요합니다.';

type Row = Record<string, unknown>;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (error: string, status: number) => json({ error }, status);
const str = (value: unknown) => (typeof value === 'string' ? value : '');

const authorOf = (session: ManagerSession): ReceiptAuthor => ({
  id: session.sub,
  loginId: session.loginId,
  name: session.name,
  role: session.role,
  permissions: session.permissions,
});

async function liveSite(siteId: string): Promise<Row | null> {
  const site = await getFirestoreDocument<Row>(officeFirestoreCollections.site, siteId);
  return site && !site.deletedAt ? site : null;
}

// Every site not in the trash, with only what the phone's site search and list labels need.
async function readSiteSummaries(): Promise<Array<{ id: string; title: string; address: string; status: string }>> {
  const rows = await listFirestoreCollection<Row>(officeFirestoreCollections.site, undefined, 1000, ['title', 'address', 'status', 'deletedAt']);
  return rows.filter((row) => !row.deletedAt && isOfficeRecordId(row._id)).map((row) => ({
    id: String(row._id),
    title: str(row.title) || '현장명 없음',
    address: str(row.address),
    status: str(row.status),
  }));
}

// Photos signed in one go. A signing failure is logged; every photo keeps its place with an empty url.
async function signReceipts(receipts: SiteReceipt[]): Promise<{ receipts: SiteReceiptView[]; photosUnavailable: boolean }> {
  const photos = receipts.flatMap((receipt) => receipt.photos);
  let signed: Awaited<ReturnType<typeof signReceiptPhotos>> | null = null;
  try {
    signed = await signReceiptPhotos(photos);
  } catch (error) {
    console.error('Receipt photo URLs not signed:', storageErrorSummary(error));
  }
  let index = 0;
  return {
    receipts: receipts.map((receipt) => ({
      ...receipt,
      photos: receipt.photos.map((photo) => (signed ? signed[index++] : { id: photo.id, url: '', width: photo.width, height: photo.height })),
    })),
    photosUnavailable: signed === null,
  };
}

const newestFirst = (a: SiteReceipt, b: SiteReceipt) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);

export async function GET(request: Request) {
  const access = requireManager(request, { anyOf: ['sites', 'estimates'] });
  if (access.error) return access.error;
  if (!isProgressStoreReady()) return fail(MOBILE_STORE_MISSING, 503);
  const { session } = access;
  const author = authorOf(session);
  const params = new URL(request.url).searchParams;

  try {
    if (params.get('sites') === '1') {
      if (!hasAnyPermission(session, ['sites'])) return fail(NEEDS_SITES, 403);
      return json({ sites: await readSiteSummaries() });
    }

    if (params.get('mine') === '1') {
      if (!hasAnyPermission(session, ['sites'])) return fail(NEEDS_SITES, 403);
      const [records, locked, sites] = await Promise.all([listReceiptRecordsByCreator(session.sub), readLockedReceiptIds(), readSiteSummaries()]);
      const mine = records
        .flatMap((record) => toReceiptView(record, author, locked) ?? [])
        .sort(newestFirst)
        .slice(0, MY_RECEIPTS_LIMIT);
      const titles = new Map(sites.map((site) => [site.id, site.title]));
      return json({
        ...(await signReceipts(mine)),
        siteTitles: Object.fromEntries(mine.map((receipt) => [receipt.siteId, titles.get(receipt.siteId) || '삭제된 현장'])),
      });
    }

    const siteId = params.get('siteId');
    if (!hasAnyPermission(session, ['estimates'])) return fail(NEEDS_ESTIMATES, 403);
    if (!isOfficeRecordId(siteId)) return fail('현장을 골라 주세요.', 400);
    const [records, locked] = await Promise.all([listReceiptRecordsOfSite(siteId), readLockedReceiptIds(siteId)]);
    const receipts = records.flatMap((record) => toReceiptView(record, author, locked) ?? []).sort(newestFirst);
    return json(await signReceipts(receipts));
  } catch (error) {
    console.error('Receipts load failed:', error);
    return fail(LOAD_FAILED, 500);
  }
}

export async function POST(request: Request) {
  const access = requireManager(request, { anyOf: ['sites', 'estimates'] });
  if (access.error) return access.error;
  if (!isProgressStoreReady()) return fail(MOBILE_STORE_MISSING, 503);
  const { session } = access;

  // Photos come one per multipart request (Vercel caps a request near 4.5MB); everything else is JSON.
  if ((request.headers.get('content-type') || '').includes('multipart/form-data')) {
    if (!hasAnyPermission(session, ['sites'])) return fail(NEEDS_SITES, 403);
    return uploadPhoto(request);
  }

  const parsed = parseReceiptAction(await request.json().catch(() => null));
  if (!parsed.ok) return fail(parsed.error, 400);
  const author = authorOf(session);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  try {
    if (parsed.action === 'create') {
      if (!hasAnyPermission(session, ['sites'])) return fail(NEEDS_SITES, 403);
      if (!(await liveSite(parsed.siteId))) return fail(SITE_NOT_FOUND, 404);
      const { siteId, photos, amount, memo, process, note, receiptDate } = parsed;
      // The receipt's date is the day it was saved unless the uploader picked another (a receipt from earlier).
      const saved = await createReceiptRecord({ siteId, photos, amount, memo, process, note }, author, nowIso, receiptDate || todayInSeoul(nowMs));
      const receipt = toReceiptView(saved, author, new Set());
      if (!receipt) throw new Error('Saved receipt could not be read back.');
      const signed = await signReceipts([receipt]);
      return json({ receipt: signed.receipts[0] });
    }

    const record = await getReceiptRecord(parsed.id);
    const locked = record ? await readLockedReceiptIds(str(record.siteId)) : new Set<string>();
    const receipt = record ? toReceiptView(record, author, locked) : null;
    if (!record || !receipt) return fail(RECEIPT_NOT_FOUND, 404);

    if (parsed.action === 'setSkipped') {
      if (!hasAnyPermission(session, ['estimates'])) return fail(NEEDS_ESTIMATES, 403);
      const saved = await updateReceiptRecord(receipt.id, skippedFields(parsed.skipped, author, nowIso));
      const view = toReceiptView(saved, author, locked);
      if (!view) return fail(RECEIPT_NOT_FOUND, 404);
      return json({ receipt: (await signReceipts([view])).receipts[0] });
    }

    if (parsed.action === 'update') {
      const allowed = canChangeReceipt(receipt, author, 'edit');
      if (!allowed.ok) return fail(allowed.error, allowed.status);
      if (parsed.siteId !== receipt.siteId && !(await liveSite(parsed.siteId))) return fail(SITE_NOT_FOUND, 404);
      const saved = await updateReceiptRecord(receipt.id, {
        siteId: parsed.siteId,
        amount: parsed.amount,
        memo: parsed.memo,
        ...(parsed.process !== undefined ? { process: parsed.process } : {}),
        ...(parsed.note !== undefined ? { note: parsed.note } : {}),
        ...(parsed.receiptDate ? { receiptDate: parsed.receiptDate } : {}),
        updatedAt: nowIso,
      });
      const view = toReceiptView(saved, author, new Set());
      if (!view) return fail(RECEIPT_NOT_FOUND, 404);
      return json({ receipt: (await signReceipts([view])).receipts[0] });
    }

    const allowed = canChangeReceipt(receipt, author, 'delete');
    if (!allowed.ok) return fail(allowed.error, allowed.status);
    await deleteReceiptRecord(receipt.id);
    // The record is gone first; a photo that cannot be deleted is only logged.
    const pathnames = receiptPhotoPathnames(record);
    if (pathnames.length) after(() => deleteReceiptPhotos(pathnames));
    return json({ ok: true });
  } catch (error) {
    // exists:true failed: the receipt was removed between the read and the write.
    if (isFirestoreConflictError(error)) return fail(RECEIPT_NOT_FOUND, 404);
    console.error(`Receipt ${parsed.action} failed:`, error);
    return fail(SAVE_FAILED, 500);
  }
}

async function uploadPhoto(request: Request) {
  // Before the body is read: without a store the photo has nowhere to go.
  if (!isProgressPhotoStoreConfigured()) return fail(PHOTO_STORE_MISSING_MESSAGE, 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('요청 형식이 올바르지 않습니다.', 400);
  }
  if (form.get('action') !== 'uploadPhoto') return fail('알 수 없는 요청입니다.', 400);

  const siteId = str(form.get('siteId'));
  const file = form.get('file');
  if (!isOfficeRecordId(siteId)) return fail('현장을 골라 주세요.', 400);
  if (!(file instanceof File)) return fail('사진 파일이 없습니다.', 400);

  const check = checkPhotoUpload(file.type, file.size);
  if (!check.ok) return fail(check.error, check.status);
  // The browser measured the photo when it shrank it; the server does not read images.
  const size = parsePhotoSize(form.get('width'), form.get('height'));
  if (!size) return fail('사진 크기 정보가 올바르지 않습니다. 다시 찍어 주세요.', 400);

  // Looked up before the upload so a wrong site never leaves a stray photo behind.
  try {
    if (!(await liveSite(siteId))) return fail(SITE_NOT_FOUND, 404);
  } catch (error) {
    console.error('Receipt photo site check failed:', error);
    return fail(PHOTO_SAVE_FAILED, 500);
  }

  // Stored under a new random pathname: the phone's own file name may carry the customer's name and is never used.
  const bytes = Buffer.from(await file.arrayBuffer());
  let stored: { id: string; pathname: string };
  try {
    stored = await uploadReceiptPhoto(bytes, file.type);
  } catch (error) {
    console.error('Receipt photo upload to Firebase Storage failed:', storageErrorSummary(error));
    return isStoragePermissionError(error) ? fail(PHOTO_STORE_PERMISSION_MESSAGE, 500) : fail(PHOTO_SAVE_FAILED, 502);
  }

  // The one answer that carries a pathname: the phone sends the photo back unchanged with create.
  return json({ photo: { id: stored.id, pathname: stored.pathname, width: size.width, height: size.height } });
}
