import { randomBytes } from 'node:crypto';
import { SITE_RECEIPTS_COLLECTION, isReceiptPhotoPathname, lockedReceiptIds, newReceiptRecord, type ReceiptAuthor } from '../../lib/site-receipts';
import type { StoredProgressPhoto } from '../../lib/site-progress';
import {
  deleteFirestoreDocument,
  getFirestoreDocument,
  listFirestoreCollection,
  patchFirestoreFields,
  queryFirestoreCollectionByField,
} from './firestore';

// 현장 영수증함 in Firestore (rules in app/lib/site-receipts.ts; spec 2026-11-24-site-receipts). One document per receipt,
// read and written with the server service account only; the Firestore security rules keep every browser out of this
// collection, as with siteNotes.

const ESTIMATES_COLLECTION = 'siteEstimates';
// Locking needs only the work lines, never the prices of the estimate lines.
const LOCK_FIELDS = ['siteId', 'workLinesJson', 'deletedAt'];

type Row = Record<string, unknown>;

// exists:false: a (practically impossible) id collision fails instead of replacing another receipt.
export async function createReceiptRecord(
  input: { siteId: string; photos: StoredProgressPhoto[]; amount: number | null; memo: string; process: string; note: string },
  author: ReceiptAuthor,
  nowIso: string,
  receiptDate: string,
): Promise<Row> {
  const id = `rc-${randomBytes(12).toString('hex')}`;
  const record = newReceiptRecord({ id, ...input }, author, nowIso, receiptDate);
  return patchFirestoreFields<Row>(SITE_RECEIPTS_COLLECTION, id, record, { precondition: { exists: false } });
}

export async function getReceiptRecord(id: string): Promise<Row | null> {
  return getFirestoreDocument<Row>(SITE_RECEIPTS_COLLECTION, id);
}

// Only the given fields change; exists:true fails (FirestoreConflictError) when the receipt is gone.
export async function updateReceiptRecord(id: string, fields: Row): Promise<Row> {
  return patchFirestoreFields<Row>(SITE_RECEIPTS_COLLECTION, id, fields, { precondition: { exists: true } });
}

export async function deleteReceiptRecord(id: string): Promise<void> {
  await deleteFirestoreDocument(SITE_RECEIPTS_COLLECTION, id);
}

export async function listReceiptRecordsOfSite(siteId: string): Promise<Row[]> {
  return queryFirestoreCollectionByField<Row>(SITE_RECEIPTS_COLLECTION, 'siteId', siteId);
}

// The account's receipts (createdById is the session's sub).
export async function listReceiptRecordsByCreator(accountId: string): Promise<Row[]> {
  return queryFirestoreCollectionByField<Row>(SITE_RECEIPTS_COLLECTION, 'createdById', accountId);
}

// The receipts made into a work line of a saved, live estimate version: of one site, or of every site.
export async function readLockedReceiptIds(siteId?: string): Promise<Set<string>> {
  const estimates = siteId
    ? await queryFirestoreCollectionByField<Row>(ESTIMATES_COLLECTION, 'siteId', siteId)
    : await listFirestoreCollection<Row>(ESTIMATES_COLLECTION, undefined, 1000, LOCK_FIELDS);
  return lockedReceiptIds(estimates, siteId);
}

export const receiptPhotoPathnames = (record: Row): string[] =>
  (Array.isArray(record.photos) ? record.photos : []).flatMap((photo) => {
    const pathname = typeof photo === 'object' && photo !== null ? (photo as Row).pathname : '';
    return isReceiptPhotoPathname(pathname) ? [pathname] : [];
  });

// A permanently deleted site takes its receipts with it. Returns their photo pathnames for the caller to remove.
export async function deleteReceiptsOfSite(siteId: string): Promise<string[]> {
  const records = await listReceiptRecordsOfSite(siteId);
  for (const record of records) await deleteReceiptRecord(String(record._id));
  return records.flatMap(receiptPhotoPathnames);
}
