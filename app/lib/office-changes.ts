// Lets the manager dashboard's 30-second refresh re-read only the ERP lists that changed.
// Every successful write to a tracked collection stores a fresh version token for that collection in the
// marker document managerSettings/officeChanges. A refresh sends the tokens it last got back; the server
// reads the marker (1 read) and lists only the collections whose token differs.
// Shared by the manager UI and the manager API, and loaded by the tests straight from Node, so it must stay
// free of imports and Node-only globals.

export const OFFICE_CHANGES_COLLECTION = 'managerSettings';
export const OFFICE_CHANGES_DOCUMENT_ID = 'officeChanges';

// Tracked Firestore collection -> the dashboard list it fills. Each list comes from exactly one collection.
export const OFFICE_COLLECTION_LISTS = {
  officeConsultations: 'consultations',
  officeCustomers: 'customers',
  officeSites: 'sites',
  siteEstimates: 'estimates',
  officeSales: 'sales',
  officeInventoryItems: 'inventory',
  officeVendors: 'vendors',
} as const;

export type OfficeTrackedCollection = keyof typeof OFFICE_COLLECTION_LISTS;
export type OfficeListKey = (typeof OFFICE_COLLECTION_LISTS)[OfficeTrackedCollection];
// One opaque token per collection. Tokens are only ever compared for equality.
export type OfficeVersions = Partial<Record<OfficeTrackedCollection, string>>;
export type FullOfficeVersions = Record<OfficeTrackedCollection, string>;

export const OFFICE_TRACKED_COLLECTIONS = Object.keys(OFFICE_COLLECTION_LISTS) as readonly OfficeTrackedCollection[];

export const MAX_OFFICE_VERSION_LENGTH = 64;
// Seven collection names with 64-character tokens come to about 850 base64url characters.
export const MAX_OFFICE_VERSIONS_PARAM_LENGTH = 1024;
// The dashboard sends no versions at least this often, so a missed bump or a Firebase console edit shows up.
export const OFFICE_FULL_REFRESH_MS = 10 * 60 * 1000;

const hasOwn = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);

export function isOfficeTrackedCollection(collection: string): collection is OfficeTrackedCollection {
  return hasOwn(OFFICE_COLLECTION_LISTS, collection);
}

// Only the tracked collections bump the marker; materials, settings, managerSettings (the marker itself) never do.
export function shouldBumpOfficeChanges(collection: string): collection is OfficeTrackedCollection {
  return isOfficeTrackedCollection(collection);
}

const isToken = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_OFFICE_VERSION_LENGTH;

function randomHex(bytes: number) {
  const values = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function createOfficeVersionToken(now = new Date()) {
  return `${now.toISOString()}-${randomHex(6)}`;
}

export function createOfficeVersions(now = new Date()): FullOfficeVersions {
  return Object.fromEntries(
    OFFICE_TRACKED_COLLECTIONS.map((collection) => [collection, createOfficeVersionToken(now)]),
  ) as FullOfficeVersions;
}

// The stored marker's tokens, plus fresh tokens for the collections it lacks (all of them when it does not exist yet).
// The caller saves `missing` back to the marker.
export function completeOfficeVersions(stored: Record<string, unknown> | null | undefined, now = new Date()) {
  const versions = {} as FullOfficeVersions;
  const missing: OfficeVersions = {};
  for (const collection of OFFICE_TRACKED_COLLECTIONS) {
    const token = stored?.[collection];
    if (isToken(token)) {
      versions[collection] = token;
    } else {
      versions[collection] = createOfficeVersionToken(now);
      missing[collection] = versions[collection];
    }
  }
  return { versions, missing };
}

// The tracked collections whose current token differs from the client's. Unknown keys in the client map are
// ignored; anything that is not a plain object counts as knowing nothing; a token the server lacks never matches.
export function changedOfficeCollections(current: OfficeVersions, known: unknown): OfficeTrackedCollection[] {
  const knownMap = known && typeof known === 'object' && !Array.isArray(known) ? (known as Record<string, unknown>) : null;
  return OFFICE_TRACKED_COLLECTIONS.filter((collection) => {
    const token = current[collection];
    if (!isToken(token) || !knownMap || !hasOwn(knownMap, collection)) return true;
    return knownMap[collection] !== token;
  });
}

export function unchangedOfficeCollections(changed: readonly string[]): OfficeTrackedCollection[] {
  return OFFICE_TRACKED_COLLECTIONS.filter((collection) => !changed.includes(collection));
}

function toBase64Url(text: string) {
  let binary = '';
  new TextEncoder().encode(text).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string) {
  if (value.length % 4 === 1) throw new Error('Invalid base64url length');
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(base64);
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

// The `versions` query value: base64url (no padding) of the JSON map.
export function encodeOfficeVersionsParam(versions: OfficeVersions) {
  const known = Object.fromEntries(
    OFFICE_TRACKED_COLLECTIONS.filter((collection) => isToken(versions[collection])).map((collection) => [collection, versions[collection]]),
  );
  return toBase64Url(JSON.stringify(known));
}

// The client's map from the `versions` query value. Anything invalid (too long, not base64url JSON of an object,
// an unknown key, a value that is not a 1-64 character string) returns null: the client knows nothing.
export function parseOfficeVersionsParam(value: string | null | undefined): OfficeVersions | null {
  if (!value || value.length > MAX_OFFICE_VERSIONS_PARAM_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(value));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const versions: OfficeVersions = {};
  for (const [key, token] of Object.entries(parsed)) {
    if (!isOfficeTrackedCollection(key) || !isToken(token)) return null;
    versions[key] = token;
  }
  return versions;
}

// What a dashboard refresh sends: '' (read everything) without a version map or when the last full read is
// OFFICE_FULL_REFRESH_MS old, otherwise the encoded map.
export function officeRefreshVersionsParam(versions: OfficeVersions | null | undefined, lastFullReadAt: number, now: number) {
  if (!versions || now - lastFullReadAt >= OFFICE_FULL_REFRESH_MS) return '';
  return encodeOfficeVersionsParam(versions);
}

type OfficeLists = { [K in OfficeListKey]: readonly unknown[] };

// The dashboard's seven lists after a refresh answer: lists of collections the answer reports unchanged keep the
// current arrays; every other list is replaced (missing means empty, as before). An answer without
// unchangedCollections is a full answer and replaces everything.
export function mergeOfficeLists<T extends OfficeLists>(
  current: T,
  answer: { [K in OfficeListKey]?: T[K] } & { unchangedCollections?: unknown },
): Pick<T, OfficeListKey> {
  const unchanged = Array.isArray(answer.unchangedCollections) ? (answer.unchangedCollections as unknown[]) : [];
  const merged: Record<string, unknown> = {};
  for (const collection of OFFICE_TRACKED_COLLECTIONS) {
    const key = OFFICE_COLLECTION_LISTS[collection];
    merged[key] = unchanged.includes(collection) ? current[key] : answer[key] || [];
  }
  return merged as Pick<T, OfficeListKey>;
}
