import { randomBytes } from 'node:crypto';
import type { NotifyLogEntry, ProgressPhoto, ProgressUpdate } from '../../lib/site-progress';
import type { ProgressAccessState } from '../progress/_access';
import {
  canUseFirestoreOnServer,
  deleteFirestoreDocument,
  getFirestoreDocument,
  officeFirestoreCollections,
  queryFirestoreCollectionByField,
  saveFirestoreDocument,
  shouldUseFirestoreErp,
} from './firestore';

// Everything here reads and writes with the server service account (no idToken), so the browser never touches these records.
export const SITE_PROGRESS_COLLECTION = 'siteProgressUpdates';
const SITE_ESTIMATES_COLLECTION = 'siteEstimates';

export type ProgressSite = {
  _id: string;
  title?: string;
  customerName?: string;
  customerPhone?: string;
  customerId?: string;
  progressCode?: string;
  progressEnabled?: boolean;
  progressCodeCreatedAt?: string;
  progressAccess?: ProgressAccessState;
  [key: string]: unknown;
};

export type ProgressSiteFields = Partial<{
  progressCode: string;
  progressEnabled: boolean;
  progressCodeCreatedAt: string;
  progressAccess: ProgressAccessState;
}>;

// The office sites live in Firestore only in Firestore mode; with the Sanity data source there is nothing to read.
export const isProgressStoreReady = () => canUseFirestoreOnServer() && shouldUseFirestoreErp();

// A site in the 휴지통 (deletedAt set) is treated as if it did not exist.
const isTrashed = (site: Record<string, unknown>) => Boolean(site.deletedAt);

export async function getSiteForProgress(siteId: string): Promise<ProgressSite | null> {
  const id = siteId.trim();
  if (!id) return null;
  const site = await getFirestoreDocument<ProgressSite>(officeFirestoreCollections.site, id);
  return site && !isTrashed(site) ? site : null;
}

export async function findSiteByProgressCode(code: string): Promise<ProgressSite | null> {
  const value = code.trim();
  if (!value) return null;
  const sites = await queryFirestoreCollectionByField<ProgressSite>(officeFirestoreCollections.site, 'progressCode', value);
  return sites.find((site) => site.progressCode === value && !isTrashed(site)) ?? null;
}

// The site's own number first; a site saved without one falls back to the linked customer's number.
export async function resolveCustomerPhone(site: ProgressSite): Promise<string> {
  const own = String(site.customerPhone ?? '').trim();
  if (/\d/.test(own)) return own;

  const customerId = String(site.customerId ?? '').trim();
  if (!customerId) return '';
  const customer = await getFirestoreDocument<{ phone?: unknown }>(officeFirestoreCollections.customer, customerId);
  const phone = String(customer?.phone ?? '').trim();
  return /\d/.test(phone) ? phone : '';
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const asText = (value: unknown) => (typeof value === 'string' ? value : '');

function toPhoto(value: unknown): ProgressPhoto | null {
  if (!isObject(value)) return null;
  return { assetId: asText(value.assetId), url: asText(value.url), width: Number(value.width) || 0, height: Number(value.height) || 0 };
}

function toNotifyLogEntry(value: unknown): NotifyLogEntry | null {
  if (!isObject(value)) return null;
  const error = asText(value.error);
  return { sentAt: asText(value.sentAt), ok: value.ok === true, ...(error ? { error } : {}), by: asText(value.by) };
}

// Firestore returns whatever was stored; rebuild the shape the API promises.
function toProgressUpdate(record: Record<string, unknown>): ProgressUpdate {
  const createdBy = asText(record.createdBy);
  return {
    _id: asText(record._id),
    siteId: asText(record.siteId),
    reportDate: asText(record.reportDate),
    designer: asText(record.designer),
    workDetail: asText(record.workDetail),
    photos: (Array.isArray(record.photos) ? record.photos : []).map(toPhoto).filter((photo): photo is ProgressPhoto => photo !== null),
    createdAt: asText(record.createdAt),
    ...(createdBy ? { createdBy } : {}),
    notifyLog: (Array.isArray(record.notifyLog) ? record.notifyLog : [])
      .map(toNotifyLogEntry)
      .filter((entry): entry is NotifyLogEntry => entry !== null),
  };
}

const newest = (a: ProgressUpdate, b: ProgressUpdate) =>
  b.reportDate.localeCompare(a.reportDate) || b.createdAt.localeCompare(a.createdAt);

export async function listProgressUpdates(siteId: string): Promise<ProgressUpdate[]> {
  const rows = await queryFirestoreCollectionByField<Record<string, unknown>>(SITE_PROGRESS_COLLECTION, 'siteId', siteId);
  return rows.map(toProgressUpdate).sort(newest);
}

export async function getProgressUpdate(id: string): Promise<ProgressUpdate | null> {
  const value = id.trim();
  if (!value) return null;
  const record = await getFirestoreDocument<Record<string, unknown>>(SITE_PROGRESS_COLLECTION, value);
  return record ? toProgressUpdate(record) : null;
}

export async function saveProgressUpdate(update: Omit<ProgressUpdate, '_id'> & { _id?: string }): Promise<ProgressUpdate> {
  const id = update._id?.trim() || `progress-${randomBytes(8).toString('hex')}`;
  // Callers pass the whole record (notifyLog included); saveFirestoreDocument merges it over the stored document.
  const saved = await saveFirestoreDocument(SITE_PROGRESS_COLLECTION, { ...update, _id: id }, undefined, id);
  return toProgressUpdate(saved);
}

export async function deleteProgressUpdate(id: string): Promise<void> {
  await deleteFirestoreDocument(SITE_PROGRESS_COLLECTION, id);
}

// A new link code: 16 random bytes as base64url (22 characters).
export const generateProgressCode = () => randomBytes(16).toString('base64url');

// The whole site record is written back so a failed re-read inside saveFirestoreDocument cannot drop its other fields.
export async function saveSiteProgressFields(siteId: string, fields: ProgressSiteFields): Promise<ProgressSite> {
  const id = siteId.trim();
  const current = id ? await getFirestoreDocument<ProgressSite>(officeFirestoreCollections.site, id) : null;
  if (!current || isTrashed(current)) throw new Error('현장을 찾을 수 없습니다.');
  return saveFirestoreDocument(officeFirestoreCollections.site, { ...current, ...fields }, undefined, id);
}

// Every estimate version of the site; the customer view picks the schedule from them.
export async function listSiteEstimates(siteId: string): Promise<Array<Record<string, unknown>>> {
  return queryFirestoreCollectionByField<Record<string, unknown>>(SITE_ESTIMATES_COLLECTION, 'siteId', siteId);
}
