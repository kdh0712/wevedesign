// Fields on an office site that only /api/manager/progress (setLink and the customer verify flow) may write.
// Every site record sent to a browser drops them, and every site record received from a browser drops them before it is merged
// over the stored one, so a stale form can neither read the secret link code nor overwrite or revive it.
// Pure, with no imports, so tests can load it directly.
export const SERVER_OWNED_SITE_FIELDS = ['progressCode', 'progressEnabled', 'progressCodeCreatedAt', 'progressAccess'] as const;

const serverOwned: ReadonlySet<string> = new Set(SERVER_OWNED_SITE_FIELDS);

export function stripServerOwnedSiteFields<T extends Record<string, unknown>>(record: T): Omit<T, (typeof SERVER_OWNED_SITE_FIELDS)[number]> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !serverOwned.has(key))) as Omit<T, (typeof SERVER_OWNED_SITE_FIELDS)[number]>;
}
