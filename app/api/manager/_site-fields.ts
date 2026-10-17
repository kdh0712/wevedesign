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

const serverOwned: ReadonlySet<string> = new Set(SERVER_OWNED_SITE_FIELDS);

export function stripServerOwnedSiteFields<T extends Record<string, unknown>>(record: T): Omit<T, (typeof SERVER_OWNED_SITE_FIELDS)[number]> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !serverOwned.has(key))) as Omit<T, (typeof SERVER_OWNED_SITE_FIELDS)[number]>;
}
