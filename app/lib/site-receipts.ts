// 현장 영수증함 (spec docs/superpowers/specs/2026-11-24-site-receipts-design.md). Receipts snapped on the staff phone are
// kept per site and moved into an estimate version's 실행내역서 later on the PC. Pure rules shared by
// /api/manager/receipts, the phone sheet, the PC panel and Node tests; relative .ts imports only.
import { hasAnyPermission, type ManagerIdentity } from './manager-permissions.ts';
import { isOfficeRecordId } from './mobile-overview.ts';
import { siteStage } from './site-folders.ts';
import type { ProgressPhotoView, StoredProgressPhoto } from './site-progress.ts';

export const SITE_RECEIPTS_COLLECTION = 'siteReceipts';
export const RECEIPT_MAX_PHOTOS = 3;
export const RECEIPT_MEMO_MAX = 100;
export const RECEIPT_AMOUNT_MAX = 100_000_000;
export const MY_RECEIPTS_LIMIT = 50;

export const LOCKED_RECEIPT_ERROR = '실행내역서에 들어간 영수증은 바꿀 수 없어요. 실행내역서의 줄을 고쳐 주세요.';
const UNKNOWN_REQUEST = '알 수 없는 요청입니다.';
const PHOTO_INVALID = '사진 정보가 올바르지 않아요. 다시 찍어 주세요.';

const RECEIPT_ID = /^rc-[0-9a-f]{24}$/;
const RECEIPT_PHOTO_PATHNAME = /^receipts\/[0-9a-f]{24}\.(jpg|png|webp)$/;
const PHOTO_ID = /^[0-9a-f]{16}$/;
const MAX_PHOTO_EDGE = 20000;

export const isReceiptId = (value: unknown): value is string => typeof value === 'string' && RECEIPT_ID.test(value);
export const isReceiptPhotoPathname = (value: unknown): value is string => typeof value === 'string' && RECEIPT_PHOTO_PATHNAME.test(value);

// A work line's receiptId as kept by the estimate save and the estimate screen: a receipt id, or '' for anything else.
export const normalizeReceiptId = (value: unknown): string => (isReceiptId(value) ? value : '');

const str = (value: unknown) => (typeof value === 'string' ? value : '');
const isPhotoEdge = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_PHOTO_EDGE;

// Who acts, always from the signed session. id is the account (the session's sub): a Firebase account's loginId can change
// between its login (auth email) and the phone's hourly session trade (profile email or uid), its id does not.
export type ReceiptAuthor = { id: string; loginId: string; name: string; role: string; permissions: readonly string[] };

const authorName = (author: ReceiptAuthor) => (author.name || author.loginId).slice(0, 80);
const canEstimate = (author: ReceiptAuthor) => hasAnyPermission({ role: author.role, permissions: author.permissions } as ManagerIdentity, ['estimates']);

// '' (or nothing) is no amount. Spaces, thousands commas and a trailing 원 are allowed; anything else (3.2만, -5, 1e5) is
// refused rather than read as 0, so a typo never becomes a free receipt.
export function parseReceiptAmount(value: unknown): { ok: true; amount: number | null } | { ok: false; error: string } {
  if (value === null || value === undefined) return { ok: true, amount: null };
  let digits: string;
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) return { ok: false, error: '금액은 숫자만 적어 주세요.' };
    digits = String(value);
  } else if (typeof value === 'string') {
    digits = value.replace(/\s+/g, '').replace(/원$/, '').replace(/,/g, '');
    if (!digits) return { ok: true, amount: null };
    if (!/^[0-9]{1,12}$/.test(digits)) return { ok: false, error: '금액은 숫자만 적어 주세요.' };
  } else {
    return { ok: false, error: '금액은 숫자만 적어 주세요.' };
  }
  const amount = Number(digits);
  if (amount > RECEIPT_AMOUNT_MAX) return { ok: false, error: '금액은 1억 원까지 적을 수 있어요.' };
  return { ok: true, amount };
}

// Photos arrive from the browser, so each is rebuilt from the known fields. One with a url (a signed URL it was shown) or
// a pathname outside receipts/ is not a receipt photo it uploaded.
function parseReceiptPhoto(value: unknown): StoredProgressPhoto | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Record<string, unknown>;
  if ('url' in item) return null;
  if (typeof item.id !== 'string' || !PHOTO_ID.test(item.id) || !isReceiptPhotoPathname(item.pathname)) return null;
  if (!isPhotoEdge(item.width) || !isPhotoEdge(item.height)) return null;
  return { id: item.id, pathname: item.pathname, width: item.width as number, height: item.height as number };
}

type Fields = { amount: number | null; memo: string };
function parseFields(input: Record<string, unknown>): { ok: true; value: Fields } | { ok: false; error: string } {
  const amount = parseReceiptAmount(input.amount);
  if (!amount.ok) return amount;
  const memo = str(input.memo).trim();
  if (memo.length > RECEIPT_MEMO_MAX) return { ok: false, error: `메모는 ${RECEIPT_MEMO_MAX}자까지 쓸 수 있어요.` };
  return { ok: true, value: { amount: amount.amount, memo } };
}

export type ReceiptAction =
  | { ok: true; action: 'create'; siteId: string; photos: StoredProgressPhoto[]; amount: number | null; memo: string }
  | { ok: true; action: 'update'; id: string; siteId: string; amount: number | null; memo: string }
  | { ok: true; action: 'setSkipped'; id: string; skipped: boolean }
  | { ok: true; action: 'delete'; id: string }
  | { ok: false; error: string };

export function parseReceiptAction(body: unknown): ReceiptAction {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, error: UNKNOWN_REQUEST };
  const input = body as Record<string, unknown>;

  if (input.action === 'create' || input.action === 'update') {
    if (input.action === 'update' && !isReceiptId(input.id)) return { ok: false, error: '영수증을 골라 주세요.' };
    if (!isOfficeRecordId(input.siteId)) return { ok: false, error: '현장을 골라 주세요.' };
    const fields = parseFields(input);
    if (!fields.ok) return fields;
    if (input.action === 'update') return { ok: true, action: 'update', id: input.id as string, siteId: input.siteId, ...fields.value };

    const rawPhotos = Array.isArray(input.photos) ? input.photos : [];
    if (rawPhotos.length === 0) return { ok: false, error: '영수증 사진을 찍어 주세요.' };
    if (rawPhotos.length > RECEIPT_MAX_PHOTOS) return { ok: false, error: `사진은 ${RECEIPT_MAX_PHOTOS}장까지 올릴 수 있어요.` };
    const photos: StoredProgressPhoto[] = [];
    for (const raw of rawPhotos) {
      const photo = parseReceiptPhoto(raw);
      if (!photo) return { ok: false, error: PHOTO_INVALID };
      photos.push(photo);
    }
    return { ok: true, action: 'create', siteId: input.siteId, photos, ...fields.value };
  }

  if (input.action === 'setSkipped' || input.action === 'delete') {
    if (!isReceiptId(input.id)) return { ok: false, error: '영수증을 골라 주세요.' };
    if (input.action === 'delete') return { ok: true, action: 'delete', id: input.id };
    if (typeof input.skipped !== 'boolean') return { ok: false, error: UNKNOWN_REQUEST };
    return { ok: true, action: 'setSkipped', id: input.id, skipped: input.skipped };
  }

  return { ok: false, error: UNKNOWN_REQUEST };
}

// createdById (the account) is a top-level string so "my receipts" is one equality query; createdBy keeps the login id.
export function newReceiptRecord(
  input: { id: string; siteId: string; photos: StoredProgressPhoto[]; amount: number | null; memo: string },
  author: ReceiptAuthor,
  nowIso: string,
  receiptDate: string,
): Record<string, unknown> {
  return {
    _id: input.id,
    siteId: input.siteId,
    photos: input.photos,
    amount: input.amount,
    memo: input.memo,
    receiptDate,
    createdAt: nowIso,
    createdBy: author.loginId,
    createdById: author.id,
    createdByName: authorName(author),
  };
}

// '정리 안 해도 됨' as flat fields, so undoing it is one masked write of empty values.
export function skippedFields(skipped: boolean, author: ReceiptAuthor, nowIso: string): Record<string, unknown> {
  return skipped
    ? { skippedAt: nowIso, skippedBy: author.loginId, skippedByName: authorName(author), updatedAt: nowIso }
    : { skippedAt: '', skippedBy: '', skippedByName: '', updatedAt: nowIso };
}

export type SiteReceipt = {
  id: string;
  siteId: string;
  photos: StoredProgressPhoto[];
  amount: number | null;
  memo: string;
  receiptDate: string;
  createdAt: string;
  createdByName: string;
  mine: boolean;
  skipped: { at: string; byName: string } | null;
  locked: boolean;
};

// What a browser receives: signed photo URLs, never pathnames, and no login ids.
export type SiteReceiptView = Omit<SiteReceipt, 'photos'> & { photos: ProgressPhotoView[] };

// The server's view of a record (photos still carry their pathnames; the route signs them). Broken records are dropped.
export function toReceiptView(record: Record<string, unknown>, viewer: ReceiptAuthor, lockedIds: ReadonlySet<string>): SiteReceipt | null {
  if (record.deletedAt || !isReceiptId(record._id) || !isOfficeRecordId(record.siteId)) return null;
  const photos = (Array.isArray(record.photos) ? record.photos : []).flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const photo = item as Record<string, unknown>;
    if (!isReceiptPhotoPathname(photo.pathname)) return [];
    return [{ id: str(photo.id), pathname: photo.pathname, width: Number(photo.width) || 0, height: Number(photo.height) || 0 }];
  });
  const amount = typeof record.amount === 'number' && Number.isFinite(record.amount) ? record.amount : null;
  const createdById = str(record.createdById);
  const skippedAt = str(record.skippedAt);
  return {
    id: record._id,
    siteId: record.siteId,
    photos,
    amount,
    memo: str(record.memo),
    receiptDate: str(record.receiptDate),
    createdAt: str(record.createdAt),
    createdByName: str(record.createdByName),
    mine: createdById !== '' && createdById === viewer.id,
    skipped: skippedAt ? { at: skippedAt, byName: str(record.skippedByName) } : null,
    locked: lockedIds.has(record._id),
  };
}

// The receipt ids on an estimate version's saved 실행내역서 (workLinesJson). Unreadable JSON has none.
export function receiptIdsOfWorkLines(workLinesJson: unknown): string[] {
  if (typeof workLinesJson !== 'string' || !workLinesJson.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(workLinesJson);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((line) => {
    const id = typeof line === 'object' && line !== null ? normalizeReceiptId((line as Record<string, unknown>).receiptId) : '';
    return id ? [id] : [];
  });
}

// A receipt is locked once any saved, live estimate version (of the site, when given) has a work line made from it.
export function lockedReceiptIds(estimates: ReadonlyArray<Record<string, unknown>>, siteId?: string): Set<string> {
  const ids = new Set<string>();
  for (const estimate of estimates) {
    if (estimate.deletedAt) continue;
    if (siteId !== undefined && estimate.siteId !== siteId) continue;
    for (const id of receiptIdsOfWorkLines(estimate.workLinesJson)) ids.add(id);
  }
  return ids;
}

// Locked receipts are frozen for everyone (the work line is the record now). Otherwise the uploader edits and deletes
// until 정리 (skipped counts as 정리); anyone with estimates edits and moves; only an admin deletes someone else's.
export function canChangeReceipt(
  receipt: Pick<SiteReceipt, 'mine' | 'skipped' | 'locked'>,
  author: ReceiptAuthor,
  change: 'edit' | 'delete',
): { ok: true } | { ok: false; status: 403 | 409; error: string } {
  if (receipt.locked) return { ok: false, status: 409, error: LOCKED_RECEIPT_ERROR };
  const ownOpen = receipt.mine && !receipt.skipped;
  if (change === 'edit' && (ownOpen || canEstimate(author))) return { ok: true };
  if (change === 'delete' && (ownOpen || author.role === 'admin')) return { ok: true };
  return {
    ok: false,
    status: 403,
    error: change === 'edit' ? '올린 사람(정리 전)이나 견적 권한이 있는 사람만 고칠 수 있어요.' : '올린 사람(정리 전)이나 총괄 관리자만 지울 수 있어요.',
  };
}

// The 실행 항목 입력 row a receipt fills: its date, its amount as 지출 and its memo as 비고. 공종 is left to staff.
export function receiptWorkLineDraft(receipt: Pick<SiteReceipt, 'id' | 'receiptDate' | 'amount' | 'memo'>): {
  date: string;
  expense: number;
  note: string;
  receiptId: string;
} {
  return { date: receipt.receiptDate, expense: receipt.amount ?? 0, note: receipt.memo || '영수증', receiptId: receipt.id };
}

// The PC status of a receipt for the open estimate version: done when the version on screen has a line made from it
// (unsaved when that differs from the version's saved copy), skipped when marked so, otherwise open, with the labels of
// other saved versions that have it as a hint (a 초안 line does not put the cost into 최종안).
export function receiptVersionStatus(input: {
  receiptId: string;
  skipped: boolean;
  openLines: ReadonlyArray<{ receiptId?: string }>;
  openSavedJson: string | undefined;
  otherVersions: ReadonlyArray<{ label: string; workLinesJson?: string }>;
}): { state: 'done' | 'open' | 'skipped'; unsaved: boolean; otherLabels: string[] } {
  const inOpen = input.openLines.some((line) => line.receiptId === input.receiptId);
  const inSaved = receiptIdsOfWorkLines(input.openSavedJson).includes(input.receiptId);
  const unsaved = inOpen !== inSaved;
  if (inOpen) return { state: 'done', unsaved, otherLabels: [] };
  if (input.skipped) return { state: 'skipped', unsaved, otherLabels: [] };
  const otherLabels = input.otherVersions
    .filter((version) => receiptIdsOfWorkLines(version.workLinesJson).includes(input.receiptId))
    .map((version) => version.label);
  return { state: 'open', unsaved, otherLabels };
}

// The phone's site list for a new receipt: the last site picked on this phone first (unless it is gone or 완료), then
// 진행중 (계약·시공중), then the other open sites. 완료 sites are found only by search.
export function receiptPickerGroups<S extends { id: string; status: string }>(
  sites: readonly S[],
  lastSiteId: string | null,
): { recent: S | null; active: S[]; open: S[] } {
  const offered = sites.filter((site) => siteStage(site.status) !== '완료');
  const recent = (lastSiteId && offered.find((site) => site.id === lastSiteId)) || null;
  const rest = offered.filter((site) => site !== recent);
  return {
    recent,
    active: rest.filter((site) => siteStage(site.status) === '진행중'),
    open: rest.filter((site) => siteStage(site.status) === '미체결'),
  };
}

// The phone's word for one of my receipts: 정리됨 once it is in a saved 실행내역서 (any version), 정리 안 해도 됨 when the
// office marked it so, otherwise 정리 전 (still mine to fix or delete).
export function receiptPhoneLabel(receipt: Pick<SiteReceipt, 'locked' | 'skipped'>): '정리됨' | '정리 안 해도 됨' | '정리 전' {
  if (receipt.locked) return '정리됨';
  return receipt.skipped ? '정리 안 해도 됨' : '정리 전';
}
