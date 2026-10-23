// Fields on an office site that only the server writes. Each writer sends these fields alone (a masked Firestore write), so
// none of them can revert a staff edit to the rest of the site:
// - /api/manager/progress: setLink (on, off, new link) and the link created by the first upload;
// - /api/progress/verify: progressAccess (failed attempts and the lock);
// - the office site save: closes the link (progressEnabled = false) when a site moves into 완료.
// The office site save itself masks them out, so a staff edit never writes them. Every site record sent to a browser drops
// them, and every site record received from a browser drops them before it is merged over the stored one, so a stale form
// can neither read the secret link code nor overwrite or revive it.
// Pure, with no imports, so tests can load it directly.
export const SERVER_OWNED_SITE_FIELDS = ['progressCode', 'progressEnabled', 'progressCodeCreatedAt', 'progressAccess'] as const;

// Fields the server writes that are not secret: browsers may read them, but a site save never writes them.
// - acquisition (유입 경로): /api/progress/acquisition (the customer) and /api/manager/acquisition (staff).
export const SERVER_WRITTEN_SITE_FIELDS = ['acquisition'] as const;

// Masked out of every office site save and dropped from every site record a browser sends.
export const PROTECTED_SITE_FIELDS: readonly string[] = [...SERVER_OWNED_SITE_FIELDS, ...SERVER_WRITTEN_SITE_FIELDS];

const serverOwned: ReadonlySet<string> = new Set(SERVER_OWNED_SITE_FIELDS);
const protectedFields: ReadonlySet<string> = new Set(PROTECTED_SITE_FIELDS);

type ProtectedSiteField = (typeof SERVER_OWNED_SITE_FIELDS)[number] | (typeof SERVER_WRITTEN_SITE_FIELDS)[number];

// For site records going to a browser.
export function stripServerOwnedSiteFields<T extends Record<string, unknown>>(record: T): Omit<T, (typeof SERVER_OWNED_SITE_FIELDS)[number]> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !serverOwned.has(key))) as Omit<T, (typeof SERVER_OWNED_SITE_FIELDS)[number]>;
}

// For site records coming from a browser, before they are merged over the stored one.
export function dropBrowserSiteFields<T extends Record<string, unknown>>(record: T): Omit<T, ProtectedSiteField> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !protectedFields.has(key))) as Omit<T, ProtectedSiteField>;
}
