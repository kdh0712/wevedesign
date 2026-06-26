import { createSign } from 'node:crypto';
import { hashId } from './_utils';

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

let cachedGoogleToken: { token: string; expiresAt: number } | null = null;

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

async function googleAccessToken() {
  if (cachedGoogleToken && Date.now() < cachedGoogleToken.expiresAt - 60_000) return cachedGoogleToken.token;

  const account = serviceAccount();
  if (!account) return '';

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
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

  cachedGoogleToken = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  return cachedGoogleToken.token;
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
) {
  const rows: T[] = [];
  let pageToken = '';

  do {
    const url = new URL(`${docBaseUrl()}/${encodePath(collection)}`);
    url.searchParams.set('pageSize', String(pageSize));
    if (pageToken) url.searchParams.set('pageToken', pageToken);

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

export async function getFirestoreDocument<T extends Record<string, unknown>>(collection: string, id: string, idToken?: string) {
  const response = await fetch(`${docBaseUrl()}/${encodePath(collection, id)}`, {
    headers: await firestoreHeaders(idToken, false),
    cache: 'no-store',
  });
  const data = (await response.json().catch(() => null)) as (FirestoreDocument & { error?: { message?: string } }) | null;
  if (response.status === 404) return null;
  if (!response.ok || !data?.name) {
    throw new Error(firestorePermissionMessage(data?.error?.message || `Firestore document read failed: ${collection}/${id}`));
  }
  return toRecord<T>(data);
}

export async function saveFirestoreDocument<T extends Record<string, unknown>>(
  collection: string,
  record: T,
  idToken?: string,
  preferredId?: string,
) {
  const rawId = String(preferredId || record._id || `${collection}-${hashId(`${Date.now()}-${Math.random()}`)}`).trim();
  const id = rawId.replace(/\//g, '-');
  const previous = await getFirestoreDocument<T>(collection, id, idToken).catch(() => null);
  const next = { ...(previous || {}), ...record, _id: id } as T;

  const response = await fetch(`${docBaseUrl()}/${encodePath(collection, id)}`, {
    method: 'PATCH',
    headers: await firestoreHeaders(idToken),
    body: JSON.stringify({ fields: toFirestoreFields(next) }),
  });
  const data = (await response.json().catch(() => null)) as (FirestoreDocument & { error?: { message?: string } }) | null;
  if (!response.ok || !data?.name) {
    throw new Error(firestorePermissionMessage(data?.error?.message || `Firestore document save failed: ${collection}/${id}`));
  }
  return toRecord<T>(data);
}

export async function deleteFirestoreDocument(collection: string, id: string, idToken?: string) {
  const response = await fetch(`${docBaseUrl()}/${encodePath(collection, id)}`, {
    method: 'DELETE',
    headers: await firestoreHeaders(idToken, false),
  });
  if (response.status === 404) return;
  const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!response.ok) {
    throw new Error(firestorePermissionMessage(data?.error?.message || `Firestore document delete failed: ${collection}/${id}`));
  }
}

const byNewest = <T extends Record<string, unknown>>(dateFields: string[]) => (a: T, b: T) => {
  const aDate = dateFields.map((field) => String(a[field] || '')).find(Boolean) || '';
  const bDate = dateFields.map((field) => String(b[field] || '')).find(Boolean) || '';
  return bDate.localeCompare(aDate);
};

const byText = <T extends Record<string, unknown>>(field: string) => (a: T, b: T) =>
  String(a[field] || '').localeCompare(String(b[field] || ''), 'ko');

export async function readOfficeDataFromFirestore(request: Request) {
  const idToken = requestIdToken(request);
  const [consultations, customers, sites, estimates, sales, inventory, vendors] = await Promise.all([
    listFirestoreCollection('officeConsultations', idToken),
    listFirestoreCollection('officeCustomers', idToken),
    listFirestoreCollection('officeSites', idToken),
    listFirestoreCollection('siteEstimates', idToken),
    listFirestoreCollection('officeSales', idToken),
    listFirestoreCollection('officeInventoryItems', idToken),
    listFirestoreCollection('officeVendors', idToken),
  ]);

  return {
    consultations: consultations.sort(byNewest(['createdAt'])).slice(0, 100),
    customers: customers.sort(byNewest(['createdAt'])).slice(0, 100),
    sites: sites.sort(byNewest(['createdAt'])).slice(0, 200),
    estimates: estimates.sort(byNewest(['updatedAt', 'createdAt'])).slice(0, 300),
    sales: sales.sort(byNewest(['paymentDate', 'createdAt'])).slice(0, 100),
    inventory: inventory.sort(byText('itemName')).slice(0, 200),
    vendors: vendors.sort(byText('name')).slice(0, 100),
  };
}

export async function saveOfficeRecordToFirestore(
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
    ...data,
    createdAt: typeof previous?.createdAt === 'string' ? previous.createdAt : typeof data.createdAt === 'string' ? data.createdAt : now,
    updatedAt: now,
  };
  const documentId = id || `${collection}-${hashId(`${type}-${now}-${Math.random()}`)}`;
  return saveFirestoreDocument(collection, record, idToken, documentId);
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

export async function readEstimateDataFromFirestore(request: Request, options: { includeMaterials?: boolean } = {}) {
  const idToken = requestIdToken(request);
  const includeMaterials = options.includeMaterials !== false;
  const [sites, estimates, vendors, materialsMeta, materials] = await Promise.all([
    listFirestoreCollection('officeSites', idToken),
    listFirestoreCollection('siteEstimates', idToken),
    listFirestoreCollection('officeVendors', idToken),
    readEstimateMaterialMetaFromFirestore(request),
    includeMaterials ? listFirestoreCollection('estimateMaterials', idToken, 5000) : Promise.resolve([]),
  ]);

  const sortedMaterials = materials.sort((a, b) =>
    [String(a.category || ''), String(a.process || ''), String(a.name || '')].join('|')
      .localeCompare([String(b.category || ''), String(b.process || ''), String(b.name || '')].join('|'), 'ko'),
  ).slice(0, 5000);

  return {
    sites: sites.sort(byNewest(['createdAt'])).slice(0, 300),
    estimates: estimates.sort(byNewest(['updatedAt', 'createdAt'])).slice(0, 300),
    ...(includeMaterials ? { materials: sortedMaterials } : {}),
    materialsMeta: materialsMeta || (includeMaterials ? materialMetaFromRows(sortedMaterials) : null),
    vendors: vendors.sort(byText('name')).slice(0, 300),
  };
}

export async function saveEstimateToFirestore(record: Record<string, unknown>, request: Request) {
  return saveFirestoreDocument('siteEstimates', record, requestIdToken(request), String(record._id || ''));
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
