import { createSign } from 'node:crypto';
import {
  OFFICE_CHANGES_COLLECTION,
  OFFICE_CHANGES_DOCUMENT_ID,
  OFFICE_COLLECTION_LISTS,
  OFFICE_TRACKED_COLLECTIONS,
  completeOfficeVersions,
  createOfficeVersionToken,
  readOfficeDataWithVersions,
  shouldBumpForPatch,
  shouldBumpOfficeChanges,
  type OfficeListKey,
  type OfficeTrackedCollection,
  type OfficeVersions,
} from '../../lib/office-changes';
import { hashId } from './_utils';
import { PROTECTED_SITE_FIELDS, SERVER_OWNED_SITE_FIELDS, dropBrowserSiteFields, stripServerOwnedSiteFields } from './_site-fields';
import {
  FirestoreConflictError,
  buildPatchQuery,
  isFirestoreConflictError,
  isFirestoreConflictResponse,
  maskedWrite,
  type FirestorePrecondition,
} from './_firestore-rest';

export { FirestoreConflictError, isFirestoreConflictError } from './_firestore-rest';

type FirestorePrimitive =
  | { nullValue: null }
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

type FirestoreValue = FirestorePrimitive;

type FirestoreDocument = {
  name: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
};

type FirestoreListResponse = {
  documents?: FirestoreDocument[];
  nextPageToken?: string;
  error?: { message?: string };
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

export type PrivateOfficeType = 'consultation' | 'customer' | 'site' | 'sale' | 'inventory' | 'vendor';

export const officeFirestoreCollections: Record<PrivateOfficeType, string> = {
  consultation: 'officeConsultations',
  customer: 'officeCustomers',
  site: 'officeSites',
  sale: 'officeSales',
  inventory: 'officeInventoryItems',
  vendor: 'officeVendors',
};

const DATASTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
const cachedGoogleTokens = new Map<string, { token: string; expiresAt: number }>();

function parseServiceAccountJson(raw: string): ServiceAccount | null {
  const candidates = [raw, raw.replace(/\r?\n/g, '')];
  try {
    candidates.push(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    // Ignore invalid base64 input.
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as ServiceAccount | string;
      const account = typeof parsed === 'string' ? (JSON.parse(parsed) as ServiceAccount) : parsed;
      if (account.client_email && account.private_key) {
        return {
          ...account,
          private_key: account.private_key.replace(/\\n/g, '\n'),
        };
      }
    } catch {
      // Try the next input shape.
    }
  }

  return null;
}

const serviceAccount = (): ServiceAccount | null => {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (json) {
    const parsed = parseServiceAccountJson(json);
    if (parsed) return parsed;
  }

  const client_email = process.env.FIREBASE_SERVICE_ACCOUNT_EMAIL?.trim();
  const private_key = process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim().replace(/\\n/g, '\n');
  if (!client_email || !private_key) return null;
  return { client_email, private_key, project_id: process.env.FIREBASE_PROJECT_ID };
};

// The same service account for the other server-only Google API: progress photos in Firebase Storage.
export const firebaseServiceAccount = (): ServiceAccount | null => serviceAccount();

const parsedProjectIdFromDatabaseUrl = () => {
  const url = process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || '';
  const match = url.match(/^https:\/\/([a-z0-9-]+?)(?:-default-rtdb)?\.(?:asia-southeast1\.)?firebasedatabase\.app/i)
    || url.match(/^https:\/\/([a-z0-9-]+?)(?:-default-rtdb)?\.firebaseio\.com/i);
  return match?.[1] || '';
};

const configuredFirestoreProjectId = () =>
  process.env.FIREBASE_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  parsedProjectIdFromDatabaseUrl();

export const firestoreProjectId = () => {
  const accountProjectId = serviceAccount()?.project_id?.trim();
  return accountProjectId || configuredFirestoreProjectId();
};

function firestorePermissionMessage(message: string) {
  if (!/Permission denied on resource project/i.test(message)) return message;

  const account = serviceAccount();
  const envProjectId = configuredFirestoreProjectId();
  const accountProjectId = account?.project_id?.trim() || '';

  if (envProjectId && accountProjectId && envProjectId !== accountProjectId) {
    return [
      `Firestore 프로젝트 권한 오류: ${message}`,
      `현재 FIREBASE_PROJECT_ID는 "${envProjectId}"이고 서비스 계정 JSON의 project_id는 "${accountProjectId}"입니다.`,
      'Vercel의 FIREBASE_PROJECT_ID를 서비스 계정 JSON의 project_id와 같게 수정하거나 비워두면 됩니다.',
    ].join(' ');
  }

  return [
    `Firestore 프로젝트 권한 오류: ${message}`,
    'Firebase 서비스 계정이 해당 프로젝트의 Firestore에 접근할 권한이 있는지 확인해 주세요.',
    'Google Cloud IAM에서 Cloud Datastore User 또는 Cloud Datastore Owner 권한이 필요합니다.',
  ].join(' ');
}

export const isFirestoreConfigured = () => Boolean(firestoreProjectId());

export const isFirestoreServiceAccountConfigured = () => Boolean(serviceAccount());

export const shouldUseFirestoreErp = () => {
  const source = (process.env.WEVE_ERP_DATA_SOURCE || '').trim().toLowerCase();
  if (source === 'sanity') return false;
  if (source === 'firestore') return isFirestoreConfigured();
  return isFirestoreConfigured() && isFirestoreServiceAccountConfigured();
};

export const canUseFirestoreForRequest = (request: Request) =>
  isFirestoreConfigured() && (isFirestoreServiceAccountConfigured() || Boolean(request.headers.get('x-firebase-token')));

export const canUseFirestoreOnServer = () => isFirestoreConfigured() && isFirestoreServiceAccountConfigured();

const base64Url = (value: string | Buffer) =>
  Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

// Service account access token for the given scope; '' when no service account is configured.
export async function googleAccessToken(scope = DATASTORE_SCOPE) {
  const cached = cachedGoogleTokens.get(scope);
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;

  const account = serviceAccount();
  if (!account) return '';

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  signer.end();
  let signature = '';
  try {
    signature = base64Url(signer.sign(account.private_key));
  } catch {
    throw new Error('Firebase 서비스 계정 private_key 형식이 올바르지 않습니다. JSON 전체를 다시 복사하거나 base64로 변환해 환경변수에 넣어주세요.');
  }
  const assertion = `${header}.${claim}.${signature}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = (await response.json().catch(() => null)) as { access_token?: string; expires_in?: number; error_description?: string } | null;
  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error_description || 'Firebase 서비스 계정 인증에 실패했습니다.');
  }

  cachedGoogleTokens.set(scope, {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  });
  return data.access_token;
}

async function firestoreHeaders(idToken?: string, contentType = true) {
  const token = (await googleAccessToken()) || idToken || '';
  if (!token) {
    throw new Error('Firestore 인증 정보가 없습니다. Firebase 서비스 계정 환경변수 또는 Firebase 로그인 토큰이 필요합니다.');
  }

  return {
    Authorization: `Bearer ${token}`,
    ...(contentType ? { 'Content-Type': 'application/json' } : {}),
  };
}

const docBaseUrl = () => {
  const projectId = firestoreProjectId();
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID가 설정되어 있지 않습니다.');
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
};

const encodePath = (...parts: string[]) => parts.map((part) => encodeURIComponent(part)).join('/');

function documentIdFromName(name: string) {
  return decodeURIComponent(name.split('/').pop() || '');
}

function toFirestoreValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((item) => toFirestoreValue(item)) } };
  }
  if (typeof value === 'object') {
    return { mapValue: { fields: toFirestoreFields(value as Record<string, unknown>) } };
  }
  return { stringValue: String(value) };
}

function toFirestoreFields(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, toFirestoreValue(value)]),
  );
}

function fromFirestoreValue(value: FirestoreValue): unknown {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue || 0);
  if ('doubleValue' in value) return Number(value.doubleValue || 0);
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map((item) => fromFirestoreValue(item));
  if ('mapValue' in value) return fromFirestoreFields(value.mapValue.fields || {});
  return null;
}

function fromFirestoreFields(fields: Record<string, FirestoreValue>) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]));
}

function toRecord<T extends Record<string, unknown>>(document: FirestoreDocument): T {
  const id = documentIdFromName(document.name);
  const fields = fromFirestoreFields(document.fields || {});
  return { ...fields, _id: (fields._id as string | undefined) || id } as unknown as T;
}

function requestIdToken(request: Request) {
  return request.headers.get('x-firebase-token') || '';
}

export async function listFirestoreCollection<T extends Record<string, unknown>>(
  collection: string,
  idToken?: string,
  pageSize = 1000,
  fieldPaths?: string[],
) {
  const rows: T[] = [];
  let pageToken = '';

  do {
    const url = new URL(`${docBaseUrl()}/${encodePath(collection)}`);
    url.searchParams.set('pageSize', String(pageSize));
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    // A field mask makes Firestore return only these fields, so large JSON fields are not read or sent.
    fieldPaths?.forEach((fieldPath) => url.searchParams.append('mask.fieldPaths', fieldPath));

    const response = await fetch(url, {
      headers: await firestoreHeaders(idToken, false),
      cache: 'no-store',
    });
    const data = (await response.json().catch(() => null)) as FirestoreListResponse | null;
    if (response.status === 404) return rows;
    if (!response.ok) {
      throw new Error(firestorePermissionMessage(data?.error?.message || `Firestore collection read failed: ${collection}`));
    }

    rows.push(...(data?.documents || []).map((document) => toRecord<T>(document)));
    pageToken = data?.nextPageToken || '';
  } while (pageToken);

  return rows;
}

type FirestoreRunQueryResponse = Array<{ document?: FirestoreDocument; error?: { message?: string } }>;

// Equality query on one string field. Single-field indexes are automatic, so no composite index is needed.
export async function queryFirestoreCollectionByField<T extends Record<string, unknown>>(
  collection: string,
  fieldPath: string,
  value: string,
  idToken?: string,
) {
  const response = await fetch(`${docBaseUrl()}:runQuery`, {
    method: 'POST',
    headers: await firestoreHeaders(idToken),
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: { fieldFilter: { field: { fieldPath }, op: 'EQUAL', value: { stringValue: value } } },
      },
    }),
    cache: 'no-store',
  });
  const data = (await response.json().catch(() => null)) as FirestoreRunQueryResponse | { error?: { message?: string } } | null;
  const results = Array.isArray(data) ? data : [];
  const errorMessage = (Array.isArray(data) ? results.find((item) => item.error)?.error?.message : data?.error?.message) || '';
  if (!response.ok || errorMessage) {
    throw new Error(firestorePermissionMessage(errorMessage || `Firestore query failed: ${collection}.${fieldPath}`));
  }
  return results.flatMap((item) => (item.document ? [toRecord<T>(item.document)] : []));
}

type FirestoreError = { message?: string; status?: string };

// The document and the version it was read at (its updateTime), for a write that must not land on a newer version.
export async function getFirestoreDocumentWithVersion<T extends Record<string, unknown>>(
  collection: string,
  id: string,
  idToken?: string,
): Promise<{ record: T; updateTime: string } | null> {
  const response = await fetch(`${docBaseUrl()}/${encodePath(collection, id)}`, {
    headers: await firestoreHeaders(idToken, false),
    cache: 'no-store',
  });
  const data = (await response.json().catch(() => null)) as (FirestoreDocument & { error?: FirestoreError }) | null;
  if (response.status === 404) return null;
  if (!response.ok || !data?.name) {
    throw new Error(firestorePermissionMessage(data?.error?.message || `Firestore document read failed: ${collection}/${id}`));
  }
  return { record: toRecord<T>(data), updateTime: data.updateTime || '' };
}

// Which of these document ids exist, asked in batches of 100 with only the document name returned (no field data).
// Ids must be plain path segments (no '/').
export async function findExistingFirestoreDocumentIds(collection: string, ids: readonly string[], idToken?: string) {
  const base = docBaseUrl();
  const namePrefix = `${base.replace(/^https:\/\/firestore\.googleapis\.com\/v1\//, '')}/${collection}/`;
  const existing = new Set<string>();
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const response = await fetch(`${base}:batchGet`, {
      method: 'POST',
      headers: await firestoreHeaders(idToken),
      body: JSON.stringify({ documents: chunk.map((id) => `${namePrefix}${id}`), mask: { fieldPaths: ['_id'] } }),
      cache: 'no-store',
    });
    const data = (await response.json().catch(() => null)) as Array<{ found?: { name?: string } }> | { error?: { message?: string } } | null;
    if (!response.ok || !Array.isArray(data)) {
      const message = data && !Array.isArray(data) ? data.error?.message : '';
      throw new Error(firestorePermissionMessage(message || `Firestore batch read failed: ${collection}`));
    }
    data.forEach((item) => {
      if (item.found?.name) existing.add(documentIdFromName(item.found.name));
    });
  }
  return existing;
}

export async function getFirestoreDocument<T extends Record<string, unknown>>(collection: string, id: string, idToken?: string) {
  return (await getFirestoreDocumentWithVersion<T>(collection, id, idToken))?.record ?? null;
}

// Writes only the given top-level fields (one updateMask path per key); every other field of the stored document stays as it is.
// precondition { updateTime } fails when the document changed after that read, { exists: true } when it no longer exists.
// Those failures and contention throw FirestoreConflictError, and nothing was written. Returns the whole saved document.
export async function patchFirestoreFields<T extends Record<string, unknown>>(
  collection: string,
  id: string,
  fields: Record<string, unknown>,
  options: { idToken?: string; precondition?: FirestorePrecondition } = {},
) {
  const query = buildPatchQuery(Object.keys(fields), options.precondition);
  const response = await fetch(`${docBaseUrl()}/${encodePath(collection, id)}?${query}`, {
    method: 'PATCH',
    headers: await firestoreHeaders(options.idToken),
    body: JSON.stringify({ fields: toFirestoreFields(fields) }),
  });
  const data = (await response.json().catch(() => null)) as (FirestoreDocument & { error?: FirestoreError }) | null;
  if (!response.ok || !data?.name) {
    const message = data?.error?.message || `Firestore document save failed: ${collection}/${id}`;
    if (!response.ok && isFirestoreConflictResponse(response.status, data?.error?.status)) {
      throw new FirestoreConflictError(data?.error?.status || `HTTP ${response.status}`, message);
    }
    throw new Error(firestorePermissionMessage(message));
  }
  // Only after a successful write (a conflict threw above and wrote nothing). A patch of only a site's server-owned
  // progress fields does not bump: the dashboard strips them, and the customer verify lockout is public traffic.
  if (shouldBumpForPatch(collection, Object.keys(fields), { officeSites: SERVER_OWNED_SITE_FIELDS })) {
    await bumpOfficeChanges(collection, options.idToken);
  }
  return toRecord<T>(data);
}

// Writes only the given fields of the change marker (managerSettings/officeChanges) with an update mask, creating
// the document when needed, so bumps of different collections never overwrite each other. managerSettings is not
// a tracked collection, so this write never bumps anything itself.
// It gives up after OFFICE_CHANGES_TIMEOUT_MS, so a slow marker write cannot stall the save it follows; the timeout
// is logged like any failed bump.
const OFFICE_CHANGES_TIMEOUT_MS = 5000;

async function patchOfficeChanges(fields: OfficeVersions, idToken?: string) {
  const query = buildPatchQuery(Object.keys(fields));
  const response = await fetch(`${docBaseUrl()}/${encodePath(OFFICE_CHANGES_COLLECTION, OFFICE_CHANGES_DOCUMENT_ID)}?${query}`, {
    method: 'PATCH',
    headers: await firestoreHeaders(idToken),
    body: JSON.stringify({ fields: toFirestoreFields(fields) }),
    signal: AbortSignal.timeout(OFFICE_CHANGES_TIMEOUT_MS),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(firestorePermissionMessage(data?.error?.message || `Firestore change marker update failed (${response.status})`));
  }
  // The updated marker is not needed; cancel the body so the connection is released.
  await response.body?.cancel();
}

// Runs after every successful write or delete, with the write's own credentials, so dashboards re-read that list.
// Awaited because serverless may freeze unawaited work; a failed bump is only logged and never fails the write
// (the dashboard's 10-minute full refresh catches it up).
async function bumpOfficeChanges(collection: string, idToken?: string) {
  if (!shouldBumpOfficeChanges(collection)) return;
  try {
    await patchOfficeChanges({ [collection]: createOfficeVersionToken() }, idToken);
  } catch (error) {
    console.error(`Firestore change marker bump failed for ${collection}:`, error);
  }
}

// preserveFields: fields this save must never write. The PATCH then masks every other field of the merged record and leaves
// these out of the body, so their stored values stay exactly as they are. Without it the whole document is written, as before.
export async function saveFirestoreDocument<T extends Record<string, unknown>>(
  collection: string,
  record: T,
  idToken?: string,
  preferredId?: string,
  preserveFields?: readonly string[],
) {
  const rawId = String(preferredId || record._id || `${collection}-${hashId(`${Date.now()}-${Math.random()}`)}`).trim();
  const id = rawId.replace(/\//g, '-');
  const previous = await getFirestoreDocument<T>(collection, id, idToken).catch(() => null);
  const next = { ...(previous || {}), ...record, _id: id } as T;
  const masked = preserveFields ? maskedWrite(next, preserveFields) : null;

  const response = await fetch(`${docBaseUrl()}/${encodePath(collection, id)}${masked ? `?${buildPatchQuery(masked.fieldPaths)}` : ''}`, {
    method: 'PATCH',
    headers: await firestoreHeaders(idToken),
    body: JSON.stringify({ fields: toFirestoreFields(masked ? masked.fields : next) }),
  });
  const data = (await response.json().catch(() => null)) as (FirestoreDocument & { error?: { message?: string } }) | null;
  if (!response.ok || !data?.name) {
    throw new Error(firestorePermissionMessage(data?.error?.message || `Firestore document save failed: ${collection}/${id}`));
  }
  await bumpOfficeChanges(collection, idToken);
  return toRecord<T>(data);
}

export async function deleteFirestoreDocument(collection: string, id: string, idToken?: string) {
  const response = await fetch(`${docBaseUrl()}/${encodePath(collection, id)}`, {
    method: 'DELETE',
    headers: await firestoreHeaders(idToken, false),
  });
  // Without a precondition Firestore answers 200 even when the document did not exist, so such a delete still bumps
  // the change marker (one harmless extra re-read). A 404, if one ever comes back, changed nothing and does not bump.
  if (response.status === 404) return;
  const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!response.ok) {
    throw new Error(firestorePermissionMessage(data?.error?.message || `Firestore document delete failed: ${collection}/${id}`));
  }
  await bumpOfficeChanges(collection, idToken);
}

const byNewest = <T extends Record<string, unknown>>(dateFields: string[]) => (a: T, b: T) => {
  const aDate = dateFields.map((field) => String(a[field] || '')).find(Boolean) || '';
  const bDate = dateFields.map((field) => String(b[field] || '')).find(Boolean) || '';
  return bDate.localeCompare(aDate);
};

const byText = <T extends Record<string, unknown>>(field: string) => (a: T, b: T) =>
  String(a[field] || '').localeCompare(String(b[field] || ''), 'ko');

// The dashboard only shows estimate summaries (same fields as the Sanity office query). Work lines, schedules,
// purchase orders and legacy workbooks stay in Firestore until the estimate workspace opens the site.
// linesJson stays: the daily report picks work items from the latest estimate's lines.
const estimateSummaryFields = [
  '_id',
  'siteId',
  'siteTitle',
  'customerName',
  'versionType',
  'versionLabel',
  'customerEstimateTotal',
  'executionCostTotal',
  'marginAmount',
  'marginRate',
  'linesJson',
  'updatedAt',
  'createdAt',
];

async function listEstimateSummariesFromFirestore(idToken: string) {
  const rows = await listFirestoreCollection('siteEstimates', idToken, 1000, estimateSummaryFields).catch((error) => {
    console.warn('Firestore estimate field mask failed, reading full documents instead:', error);
    return listFirestoreCollection('siteEstimates', idToken);
  });
  return rows.map((row) =>
    Object.fromEntries(estimateSummaryFields.filter((field) => field in row).map((field) => [field, row[field]])),
  );
}

// Office records in the 휴지통 (trash) carry deletedAt; every list except the trash view leaves them out.
const notTrashed = <T extends Record<string, unknown>>(record: T) => !record.deletedAt;

type OfficeRows = Array<Record<string, unknown>>;
type OfficeLists = Record<OfficeListKey, OfficeRows>;

// Each dashboard list is one collection, filtered, sorted and limited the same way however it is read.
const officeListReaders: Record<OfficeTrackedCollection, (idToken: string) => Promise<OfficeRows>> = {
  officeConsultations: (idToken) =>
    listFirestoreCollection('officeConsultations', idToken).then((rows) => rows.filter(notTrashed).sort(byNewest(['createdAt'])).slice(0, 100)),
  officeCustomers: (idToken) =>
    listFirestoreCollection('officeCustomers', idToken).then((rows) => rows.filter(notTrashed).sort(byNewest(['createdAt'])).slice(0, 100)),
  // The link code and its lockout record are server-owned; no browser gets them (see _site-fields.ts). Full and delta
  // reads both come through here.
  officeSites: (idToken) =>
    listFirestoreCollection('officeSites', idToken).then((rows) =>
      rows.filter(notTrashed).sort(byNewest(['createdAt'])).slice(0, 200).map(stripServerOwnedSiteFields),
    ),
  siteEstimates: (idToken) =>
    listEstimateSummariesFromFirestore(idToken).then((rows) => rows.sort(byNewest(['updatedAt', 'createdAt'])).slice(0, 300)),
  // The dashboard totals add up this list, so it is not cut to the newest 100 like the others.
  officeSales: (idToken) =>
    listFirestoreCollection('officeSales', idToken).then((rows) => rows.filter(notTrashed).sort(byNewest(['paymentDate', 'createdAt'])).slice(0, 1000)),
  officeInventoryItems: (idToken) =>
    listFirestoreCollection('officeInventoryItems', idToken).then((rows) => rows.filter(notTrashed).sort(byText('itemName')).slice(0, 200)),
  officeVendors: (idToken) =>
    listFirestoreCollection('officeVendors', idToken).then((rows) => rows.filter(notTrashed).sort(byText('name')).slice(0, 100)),
};

async function readOfficeListsFromFirestore(idToken: string, collections: readonly OfficeTrackedCollection[]) {
  const lists = await Promise.all(collections.map((collection) => officeListReaders[collection](idToken)));
  return Object.fromEntries(collections.map((collection, index) => [OFFICE_COLLECTION_LISTS[collection], lists[index]])) as Partial<OfficeLists>;
}

export async function readOfficeDataFromFirestore(request: Request) {
  return (await readOfficeListsFromFirestore(requestIdToken(request), OFFICE_TRACKED_COLLECTIONS)) as OfficeLists;
}

// The change marker's tokens. A missing marker (or field) gets fresh tokens, saved with a masked write.
async function readOfficeVersionsFromFirestore(idToken: string) {
  const stored = await getFirestoreDocument<Record<string, unknown>>(OFFICE_CHANGES_COLLECTION, OFFICE_CHANGES_DOCUMENT_ID, idToken);
  const { versions, missing } = completeOfficeVersions(stored);
  if (Object.keys(missing).length) {
    // If this fails the tokens are not stored, so the next refresh makes new ones and re-reads those lists.
    await patchOfficeChanges(missing, idToken).catch((error) => console.error('Firestore change marker create failed:', error));
  }
  return versions;
}

// The dashboard lists for one session plus the change marker's version map. readOfficeDataWithVersions
// (app/lib/office-changes.ts) reads the marker BEFORE the lists (see the comment there for why), lists only the
// readable collections that changed since `known`, and falls back to every readable list when the marker fails.
export async function readOfficeDataWithVersionsFromFirestore(
  request: Request,
  known: OfficeVersions | null,
  readable: readonly OfficeTrackedCollection[],
) {
  const idToken = requestIdToken(request);
  return readOfficeDataWithVersions<Record<string, unknown>>(
    {
      readVersions: () => readOfficeVersionsFromFirestore(idToken),
      readLists: (collections) => readOfficeListsFromFirestore(idToken, collections),
      onVersionsError: (error) => console.error('Firestore change marker read failed, reading every readable list:', error),
    },
    known,
    readable,
  );
}

export async function readOfficeTrashFromFirestore(request: Request) {
  const idToken = requestIdToken(request);
  const trashed = (collection: string) =>
    listFirestoreCollection(collection, idToken).then((rows) =>
      rows.filter((row) => Boolean(row.deletedAt)).sort(byNewest(['deletedAt'])).slice(0, 200),
    );
  const [consultations, customers, sites, sales, inventory, vendors] = await Promise.all([
    trashed('officeConsultations'),
    trashed('officeCustomers'),
    trashed('officeSites').then((rows) => rows.map(stripServerOwnedSiteFields)),
    trashed('officeSales'),
    trashed('officeInventoryItems'),
    trashed('officeVendors'),
  ]);

  return { consultations, customers, sites, sales, inventory, vendors };
}

export async function getOfficeRecordFromFirestore(request: Request, type: PrivateOfficeType, id: string) {
  return getFirestoreDocument<Record<string, unknown>>(officeFirestoreCollections[type], id, requestIdToken(request));
}

// Moves a record into the 휴지통, or back out with trash = null. The whole record is written so a failed re-read
// inside saveFirestoreDocument cannot drop its other fields; a site's server-written fields (progress link, 유입 경로) are
// masked out.
export async function setOfficeRecordTrashInFirestore(
  request: Request,
  type: PrivateOfficeType,
  id: string,
  record: Record<string, unknown>,
  trash: { deletedAt: string; deletedBy: string } | null,
) {
  return saveFirestoreDocument(
    officeFirestoreCollections[type],
    { ...record, deletedAt: trash?.deletedAt ?? null, deletedBy: trash?.deletedBy ?? null },
    requestIdToken(request),
    id,
    type === 'site' ? PROTECTED_SITE_FIELDS : undefined,
  );
}

// Also returns the stored record as it was before this save merged over it (null for a new record), so the caller can tell
// what the save changed, for example a site moving into 완료.
export async function saveOfficeRecordToFirestoreWithPrevious(
  request: Request,
  type: PrivateOfficeType,
  data: Record<string, unknown>,
  id?: string,
) {
  const collection = officeFirestoreCollections[type];
  const idToken = requestIdToken(request);
  const now = new Date().toISOString();
  const previous = id ? await getFirestoreDocument<Record<string, unknown>>(collection, id, idToken).catch(() => null) : null;
  const record = {
    // A site form must not write the server-written fields (progress link, 유입 경로), whatever it sends.
    ...(type === 'site' ? dropBrowserSiteFields(data) : data),
    createdAt: typeof previous?.createdAt === 'string' ? previous.createdAt : typeof data.createdAt === 'string' ? data.createdAt : now,
    updatedAt: now,
  };
  const documentId = id || `${collection}-${hashId(`${type}-${now}-${Math.random()}`)}`;
  // A site save is masked so it never writes the server-written fields: a link or a 유입 경로 answer saved while the form was
  // open stays.
  const saved = await saveFirestoreDocument(collection, record, idToken, documentId, type === 'site' ? PROTECTED_SITE_FIELDS : undefined);
  return { saved, previous };
}

export async function saveOfficeRecordToFirestore(
  request: Request,
  type: PrivateOfficeType,
  data: Record<string, unknown>,
  id?: string,
) {
  return (await saveOfficeRecordToFirestoreWithPrevious(request, type, data, id)).saved;
}

export async function deleteOfficeRecordFromFirestore(request: Request, type: PrivateOfficeType, id: string) {
  return deleteFirestoreDocument(officeFirestoreCollections[type], id, requestIdToken(request));
}

type EstimateMaterialMeta = {
  _id?: string;
  version?: string;
  updatedAt?: string;
  count?: number;
};

const estimateMaterialMetaCollection = 'erpMetadata';
const estimateMaterialMetaId = 'estimateMaterials';

const materialMetaFromRows = (materials: Array<Record<string, unknown>>): EstimateMaterialMeta => {
  const latestUpdatedAt = materials
    .map((item) => String(item.updatedAt || ''))
    .filter(Boolean)
    .sort()
    .at(-1) || '';

  return {
    _id: estimateMaterialMetaId,
    version: latestUpdatedAt || String(materials.length),
    updatedAt: latestUpdatedAt,
    count: materials.length,
  };
};

export async function readEstimateMaterialMetaFromFirestore(request: Request) {
  return getFirestoreDocument<EstimateMaterialMeta>(
    estimateMaterialMetaCollection,
    estimateMaterialMetaId,
    requestIdToken(request),
  ).catch(() => null);
}

export async function touchEstimateMaterialMetaInFirestore(request: Request, count?: number) {
  const now = new Date().toISOString();
  return saveFirestoreDocument(
    estimateMaterialMetaCollection,
    {
      _id: estimateMaterialMetaId,
      version: now,
      updatedAt: now,
      ...(typeof count === 'number' ? { count } : {}),
    },
    requestIdToken(request),
    estimateMaterialMetaId,
  );
}

const estimateMaterialSettingsId = 'estimateMaterialSettings';

// Read for showing the page. A failure is logged and reported as unavailable, never as empty settings, so the page can
// warn instead of offering edits on top of a blank estimate DB.
export async function readEstimateMaterialSettingsFromFirestore(request: Request) {
  try {
    const settings = await getFirestoreDocument<Record<string, unknown>>(estimateMaterialMetaCollection, estimateMaterialSettingsId, requestIdToken(request));
    return { settings, unavailable: false };
  } catch (error) {
    console.warn('Estimate material settings read failed:', error);
    return { settings: null, unavailable: true };
  }
}

// Read for a change: a failed read throws (it must never look like "no settings yet"); a missing document is null.
// The returned updateTime is the version writeEstimateMaterialSettingsIfUnchanged must still find.
export async function readEstimateMaterialSettingsForUpdate(request: Request) {
  return getFirestoreDocumentWithVersion<Record<string, unknown>>(estimateMaterialMetaCollection, estimateMaterialSettingsId, requestIdToken(request));
}

// Writes the settings only if nobody wrote them since that read (updateTime), or creates them only if they are still
// missing (updateTime null). A lost race throws FirestoreConflictError and writes nothing.
export async function writeEstimateMaterialSettingsIfUnchanged(request: Request, fields: Record<string, unknown>, updateTime: string | null) {
  return patchFirestoreFields(estimateMaterialMetaCollection, estimateMaterialSettingsId, { ...fields, _id: estimateMaterialSettingsId }, {
    idToken: requestIdToken(request),
    precondition: updateTime ? { updateTime } : { exists: false },
  });
}

const sortMaterials = (materials: Array<Record<string, unknown>>) =>
  materials.sort((a, b) =>
    [String(a.category || ''), String(a.process || ''), String(a.name || '')].join('|')
      .localeCompare([String(b.category || ''), String(b.process || ''), String(b.name || '')].join('|'), 'ko'),
  ).slice(0, 5000);

// Every version of one site, in full. Falls back to listing the whole collection if the query is rejected.
export async function readSiteEstimatesFromFirestore(request: Request, siteId: string) {
  if (!siteId) return [];
  const idToken = requestIdToken(request);
  const estimates = await queryFirestoreCollectionByField('siteEstimates', 'siteId', siteId, idToken).catch(async (error) => {
    console.warn('Site estimate query failed, listing all estimates instead:', error);
    const all = await listFirestoreCollection('siteEstimates', idToken);
    return all.filter((estimate) => estimate.siteId === siteId);
  });
  return estimates.sort(byNewest(['updatedAt', 'createdAt']));
}

export async function readEstimateMaterialsFromFirestore(request: Request) {
  const [materials, materialsMeta, settingsRead] = await Promise.all([
    listFirestoreCollection('estimateMaterials', requestIdToken(request), 5000),
    readEstimateMaterialMetaFromFirestore(request),
    readEstimateMaterialSettingsFromFirestore(request),
  ]);
  const sortedMaterials = sortMaterials(materials);
  return {
    materials: sortedMaterials,
    materialsMeta: materialsMeta || materialMetaFromRows(sortedMaterials),
    materialSettings: settingsRead.settings,
    ...(settingsRead.unavailable ? { materialSettingsUnavailable: true } : {}),
  };
}

// estimatesSiteId: undefined returns the newest 300 versions of all sites (the original payload);
// a string returns only that site's versions, with '' meaning the newest site.
export async function readEstimateDataFromFirestore(
  request: Request,
  options: { includeMaterials?: boolean; estimatesSiteId?: string } = {},
) {
  const idToken = requestIdToken(request);
  const includeMaterials = options.includeMaterials !== false;
  const isSiteScoped = typeof options.estimatesSiteId === 'string';
  const sitesRequest = listFirestoreCollection('officeSites', idToken).then((sites) => sites.filter(notTrashed).sort(byNewest(['createdAt'])).slice(0, 300));
  const estimatesSiteIdRequest = isSiteScoped
    ? options.estimatesSiteId
      ? Promise.resolve(options.estimatesSiteId)
      : sitesRequest.then((sites) => String(sites[0]?._id || ''))
    : Promise.resolve('');
  const [sites, estimatesSiteId, estimates, vendors, materialsMeta, settingsRead, materials] = await Promise.all([
    sitesRequest,
    estimatesSiteIdRequest,
    isSiteScoped
      ? estimatesSiteIdRequest.then((siteId) => readSiteEstimatesFromFirestore(request, siteId))
      : listFirestoreCollection('siteEstimates', idToken).then((rows) => rows.sort(byNewest(['updatedAt', 'createdAt'])).slice(0, 300)),
    listFirestoreCollection('officeVendors', idToken),
    readEstimateMaterialMetaFromFirestore(request),
    readEstimateMaterialSettingsFromFirestore(request),
    includeMaterials ? listFirestoreCollection('estimateMaterials', idToken, 5000) : Promise.resolve([]),
  ]);

  const sortedMaterials = sortMaterials(materials);

  return {
    sites: sites.map(stripServerOwnedSiteFields),
    estimates,
    ...(isSiteScoped ? { estimatesSiteId } : {}),
    ...(includeMaterials ? { materials: sortedMaterials } : {}),
    materialsMeta: materialsMeta || (includeMaterials ? materialMetaFromRows(sortedMaterials) : null),
    materialSettings: settingsRead.settings,
    ...(settingsRead.unavailable ? { materialSettingsUnavailable: true } : {}),
    vendors: vendors.filter(notTrashed).sort(byText('name')).slice(0, 300),
  };
}

// Saves an estimate version only if it is still the stored version the check accepts, in one conditional write:
// an existing document must keep the updateTime just read, a new one must still be missing. conflictOf decides from the
// stored document (null when missing) whether the save may go ahead; a write that loses the race counts as 'changed'.
export async function saveEstimateIfUnchangedInFirestore<C extends string>(
  record: Record<string, unknown>,
  request: Request,
  conflictOf: (stored: Record<string, unknown> | null) => C | '',
): Promise<{ conflict: C | 'changed' | '' }> {
  const idToken = requestIdToken(request);
  const id = String(record._id || '');
  const current = await getFirestoreDocumentWithVersion<Record<string, unknown>>('siteEstimates', id, idToken);
  const conflict = conflictOf(current?.record ?? null);
  if (conflict) return { conflict };
  try {
    await patchFirestoreFields('siteEstimates', id, record, {
      idToken,
      precondition: current ? { updateTime: current.updateTime } : { exists: false },
    });
    return { conflict: '' };
  } catch (error) {
    if (isFirestoreConflictError(error)) return { conflict: 'changed' };
    throw error;
  }
}

export async function deleteEstimateFromFirestore(request: Request, id: string) {
  return deleteFirestoreDocument('siteEstimates', id, requestIdToken(request));
}

export async function saveMaterialToFirestore(record: Record<string, unknown>, request: Request) {
  return saveFirestoreDocument('estimateMaterials', record, requestIdToken(request), String(record._id || ''));
}

export async function deleteMaterialFromFirestore(request: Request, id: string) {
  return deleteFirestoreDocument('estimateMaterials', id, requestIdToken(request));
}

export async function savePublicConsultationToFirestore(record: Record<string, unknown>) {
  if (!canUseFirestoreOnServer()) return null;
  const id = String(record._id || `officeConsultations-${hashId(`${record.phone || ''}-${record.createdAt || Date.now()}`)}`);
  return saveFirestoreDocument('officeConsultations', record, undefined, id);
}

export async function saveServerRecordToFirestore(collection: string, record: Record<string, unknown>, id?: string) {
  if (!canUseFirestoreOnServer()) throw new Error('Firebase 서비스 계정이 설정되어 있지 않습니다.');
  return saveFirestoreDocument(collection, record, undefined, id);
}
