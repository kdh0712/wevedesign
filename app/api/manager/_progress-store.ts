import { randomBytes } from 'node:crypto';
import type { NotifyLogEntry, ProgressUpdate, StoredProgressPhoto } from '../../lib/site-progress';
import type { ProgressAccessState } from '../progress/_access';
import { needsCustomerRecordPhone, pickCustomerPhone } from './_customer-phone';
import { readStoredPhoto } from './_progress-request';
import {
  canUseFirestoreOnServer,
  deleteFirestoreDocument,
  getFirestoreDocument,
  getFirestoreDocumentWithVersion,
  officeFirestoreCollections,
  patchFirestoreFields,
  queryFirestoreCollectionByField,
  saveFirestoreDocument,
  shouldUseFirestoreErp,
} from './firestore';

export { isFirestoreConflictError } from './firestore';

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

// The site and the version it was read at, for a write that must land only on that version (verify, first-upload link).
export async function getSiteForProgressWithVersion(siteId: string): Promise<{ site: ProgressSite; updateTime: string } | null> {
  const id = siteId.trim();
  if (!id) return null;
  const read = await getFirestoreDocumentWithVersion<ProgressSite>(officeFirestoreCollections.site, id);
  return read && !isTrashed(read.record) ? { site: read.record, updateTime: read.updateTime } : null;
}

export async function findSiteByProgressCode(code: string): Promise<ProgressSite | null> {
  const value = code.trim();
  if (!value) return null;
  const sites = await queryFirestoreCollectionByField<ProgressSite>(officeFirestoreCollections.site, 'progressCode', value);
  return sites.find((site) => site.progressCode === value && !isTrashed(site)) ?? null;
}

// A mobile wins: the site's own mobile, then the linked customer's mobile, then any site number, then any customer number
// (see pickCustomerPhone). Verify, the customer cookie and the alimtalk all use this one answer. The customer record is read
// only when the site's own number is not a mobile.
export async function resolveCustomerPhone(site: ProgressSite): Promise<string> {
  const customerId = String(site.customerId ?? '').trim();
  const customer =
    customerId && needsCustomerRecordPhone(site.customerPhone)
      ? await getFirestoreDocument<{ phone?: unknown }>(officeFirestoreCollections.customer, customerId)
      : null;
  return pickCustomerPhone(site.customerPhone, customer?.phone);
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const asText = (value: unknown) => (typeof value === 'string' ? value : '');

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
    // Pathnames only; a photo reaches a browser as a signed URL made per request (_progress-photos.ts).
    photos: (Array.isArray(record.photos) ? record.photos : []).map(readStoredPhoto).filter((photo): photo is StoredProgressPhoto => photo !== null),
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

// Only notifyLog is written, and only while the record still exists, so a record deleted during a send is not recreated.
// Throws FirestoreConflictError when the record is gone.
export async function saveProgressNotifyLog(id: string, notifyLog: NotifyLogEntry[]): Promise<ProgressUpdate> {
  const saved = await patchFirestoreFields(SITE_PROGRESS_COLLECTION, id, { notifyLog }, { precondition: { exists: true } });
  return toProgressUpdate(saved);
}

export async function deleteProgressUpdate(id: string): Promise<void> {
  await deleteFirestoreDocument(SITE_PROGRESS_COLLECTION, id);
}

// A new link code: 16 random bytes as base64url (22 characters).
export const generateProgressCode = () => randomBytes(16).toString('base64url');

// Writes only the given progress fields; every other field of the site (a staff edit saved a moment ago included) stays as it
// is. With updateTime the write lands only on that version of the site, otherwise only while the site still exists; a write
// that loses throws FirestoreConflictError and changes nothing. A missing or trashed site is refused before anything is written.
export async function saveSiteProgressFields(
  siteId: string,
  fields: ProgressSiteFields,
  opts: { updateTime?: string } = {},
): Promise<ProgressSite> {
  const id = siteId.trim();
  const current = id ? await getFirestoreDocument<ProgressSite>(officeFirestoreCollections.site, id) : null;
  if (!current || isTrashed(current)) throw new Error('현장을 찾을 수 없습니다.');
  return patchFirestoreFields<ProgressSite>(officeFirestoreCollections.site, id, fields, {
    // An empty updateTime is refused by the query builder instead of quietly becoming an unconditioned write.
    precondition: opts.updateTime !== undefined ? { updateTime: opts.updateTime } : { exists: true },
  });
}

// Every estimate version of the site; the customer view picks the schedule from them.
export async function listSiteEstimates(siteId: string): Promise<Array<Record<string, unknown>>> {
  return queryFirestoreCollectionByField<Record<string, unknown>>(SITE_ESTIMATES_COLLECTION, 'siteId', siteId);
}
