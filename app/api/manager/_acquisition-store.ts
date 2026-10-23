import { DEFAULT_ACQUISITION_OPTIONS, normalizeAcquisitionOptions, type AcquisitionOption, type SiteAcquisition } from '../../lib/acquisition';
import type { FirestorePrecondition } from './_firestore-rest';
import { getFirestoreDocumentWithVersion, officeFirestoreCollections, patchFirestoreFields } from './firestore';

// The 유입 경로 survey's storage. Everything here reads and writes with the server service account (no idToken).
// - the option list: managerSettings/acquisitionOptions ({ options, updatedAt, updatedBy }); the starting list until staff save one;
// - the answer: officeSites/<id>.acquisition, written alone (a masked patch) so no other site field is touched.
const SETTINGS_COLLECTION = 'managerSettings';
const OPTIONS_ID = 'acquisitionOptions';

// updateTime is '' while the list was never saved (the starting list is shown).
export async function readAcquisitionOptions(): Promise<{ options: AcquisitionOption[]; updateTime: string }> {
  const read = await getFirestoreDocumentWithVersion<{ options?: unknown }>(SETTINGS_COLLECTION, OPTIONS_ID);
  if (!read) return { options: [...DEFAULT_ACQUISITION_OPTIONS], updateTime: '' };
  // A stored list always passed this check when it was saved; anything unreadable falls back to the starting list.
  let fallbackId = 0;
  const checked = normalizeAcquisitionOptions(read.record.options, () => `opt-stored${++fallbackId}`);
  return { options: checked.ok ? checked.options : [...DEFAULT_ACQUISITION_OPTIONS], updateTime: read.updateTime };
}

// null clears the answer, so the customer is asked again on the next visit.
export async function writeSiteAcquisition(siteId: string, acquisition: SiteAcquisition | null, precondition: FirestorePrecondition) {
  return patchFirestoreFields<Record<string, unknown>>(officeFirestoreCollections.site, siteId, { acquisition }, { precondition });
}
