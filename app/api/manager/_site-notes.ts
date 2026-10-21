import { randomBytes } from 'node:crypto';
import {
  newSiteNoteRecord,
  SITE_NOTES_COLLECTION,
  sortSiteNotes,
  toSiteNoteView,
  type SiteNote,
  type SiteNoteAuthor,
  type SiteNoteKind,
} from '../../lib/site-notes';
import {
  deleteFirestoreDocument,
  getFirestoreDocument,
  patchFirestoreFields,
  queryFirestoreCollectionByField,
} from './firestore';

// 현장 기록·할 일 in Firestore (rules in app/lib/site-notes.ts). Read and written with the server service account only;
// the Firestore security rules keep every browser out of this collection, as with managerDevices.

export async function listSiteNotes(siteId: string): Promise<SiteNote[]> {
  const records = await queryFirestoreCollectionByField<Record<string, unknown>>(SITE_NOTES_COLLECTION, 'siteId', siteId);
  return sortSiteNotes(records.flatMap((record) => toSiteNoteView(record) ?? []));
}

export async function getSiteNoteRecord(id: string): Promise<Record<string, unknown> | null> {
  return getFirestoreDocument<Record<string, unknown>>(SITE_NOTES_COLLECTION, id);
}

// exists:false: a (practically impossible) id collision fails instead of replacing another note.
export async function createSiteNote(
  input: { siteId: string; kind: SiteNoteKind; text: string },
  author: SiteNoteAuthor,
  nowIso: string,
): Promise<SiteNote> {
  const id = `sn-${randomBytes(12).toString('hex')}`;
  const record = newSiteNoteRecord({ id, ...input }, author, nowIso);
  const saved = await patchFirestoreFields<Record<string, unknown>>(SITE_NOTES_COLLECTION, id, record, { precondition: { exists: false } });
  const view = toSiteNoteView(saved);
  if (!view) throw new Error('Saved site note could not be read back.');
  return view;
}

// Only the given fields change; exists:true fails (FirestoreConflictError) when the note is gone.
export async function updateSiteNote(id: string, fields: Record<string, unknown>): Promise<SiteNote | null> {
  const saved = await patchFirestoreFields<Record<string, unknown>>(SITE_NOTES_COLLECTION, id, fields, { precondition: { exists: true } });
  return toSiteNoteView(saved);
}

// A permanently deleted site takes its notes with it, deleted ones included.
export async function deleteSiteNotesOfSite(siteId: string): Promise<void> {
  const records = await queryFirestoreCollectionByField<Record<string, unknown>>(SITE_NOTES_COLLECTION, 'siteId', siteId);
  for (const record of records) await deleteFirestoreDocument(SITE_NOTES_COLLECTION, String(record._id));
}

export async function listOpenTodoRecords(): Promise<Array<Record<string, unknown>>> {
  return queryFirestoreCollectionByField<Record<string, unknown>>(SITE_NOTES_COLLECTION, 'todoState', 'open');
}
