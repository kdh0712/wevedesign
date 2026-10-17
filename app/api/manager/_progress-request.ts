// Request checks for the manager progress API. Pure functions with no Next.js or Firestore imports, so tests can load them directly.
import type { StoredProgressPhoto } from '../../lib/site-progress';

export const MAX_PHOTO_BYTES = 4_000_000;

const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_DESIGNER_LENGTH = 100;
const MAX_WORK_DETAIL_LENGTH = 5000;
const MAX_PHOTOS_PER_UPDATE = 40;
const MAX_PHOTO_EDGE = 20000;

// The two shapes the server gives a photo at upload: its place in the photo bucket and its id.
const PHOTO_PATHNAME = /^progress\/[0-9a-f]{24}\.(jpg|png|webp)$/;
const PHOTO_ID = /^[0-9a-f]{16}$/;

export type CreateUpdateValue = {
  siteId: string;
  reportDate: string;
  designer: string;
  workDetail: string;
  photos: StoredProgressPhoto[];
  notify: boolean;
};

export type ParseResult = { ok: true; value: CreateUpdateValue } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

// Only a real calendar day written as YYYY-MM-DD counts ("2026-02-30" does not).
function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

// A photo's width or height: whole pixels from 1 to 20000. The browser measured them when it shrank the photo.
const isPhotoEdge = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_PHOTO_EDGE;

export const isProgressPhotoPathname = (value: unknown): value is string => typeof value === 'string' && PHOTO_PATHNAME.test(value);

// Photos arrive from the browser, so each one is rebuilt from the known fields instead of being stored as sent. A photo with
// a url is refused, not cleaned: the record keeps only the pathname from the upload, and a url here means the browser sent
// a photo it was shown (a signed URL that expires) instead of one it uploaded.
function parsePhoto(value: unknown): StoredProgressPhoto | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Record<string, unknown>;
  if (item.url !== undefined) return null;
  if (typeof item.id !== 'string' || !PHOTO_ID.test(item.id) || !isProgressPhotoPathname(item.pathname)) return null;
  if (!isPhotoEdge(item.width) || !isPhotoEdge(item.height)) return null;
  return { id: item.id, pathname: item.pathname, width: item.width, height: item.height };
}

// A photo as read back from a stored record: only the known fields (a url is never copied out of a record). Anything
// without a progress photo pathname, such as an old Sanity-shaped photo, is dropped; no such photos exist in production.
export function readStoredPhoto(value: unknown): StoredProgressPhoto | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (!isProgressPhotoPathname(item.pathname)) return null;
  return { id: typeof item.id === 'string' ? item.id : '', pathname: item.pathname, width: Number(item.width) || 0, height: Number(item.height) || 0 };
}

// The width and height form fields of an upload ("1600"), as whole pixels from 1 to 20000; null when either is unusable.
export function parsePhotoSize(width: unknown, height: unknown): { width: number; height: number } | null {
  const edge = (value: unknown) => (typeof value === 'string' && /^[1-9][0-9]{0,4}$/.test(value) ? Number(value) : NaN);
  const size = { width: edge(width), height: edge(height) };
  return isPhotoEdge(size.width) && isPhotoEdge(size.height) ? size : null;
}

export function parseCreateUpdate(body: unknown): ParseResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return fail('요청 형식이 올바르지 않습니다.');
  const input = body as Record<string, unknown>;

  const siteId = text(input.siteId);
  if (!siteId) return fail('현장 정보가 없습니다.');

  const reportDate = text(input.reportDate);
  if (!isCalendarDate(reportDate)) return fail('작업 날짜를 확인해주세요.');

  const rawPhotos = Array.isArray(input.photos) ? input.photos : [];
  if (rawPhotos.length === 0) return fail('현장 사진을 첨부해주세요.');
  if (rawPhotos.length > MAX_PHOTOS_PER_UPDATE) return fail(`사진은 한 번에 ${MAX_PHOTOS_PER_UPDATE}장까지 올릴 수 있습니다.`);
  const photos: StoredProgressPhoto[] = [];
  for (const raw of rawPhotos) {
    const photo = parsePhoto(raw);
    if (!photo) return fail('사진 정보가 올바르지 않습니다. 사진을 다시 올려주세요.');
    photos.push(photo);
  }

  const workDetail = text(input.workDetail);
  if (!workDetail) return fail('상세 작업 내역을 입력해주세요.');
  if (workDetail.length > MAX_WORK_DETAIL_LENGTH) return fail(`상세 작업 내역은 ${MAX_WORK_DETAIL_LENGTH}자까지 입력할 수 있습니다.`);

  const designer = text(input.designer);
  if (designer.length > MAX_DESIGNER_LENGTH) return fail('담당 실장 이름이 너무 깁니다.');

  return { ok: true, value: { siteId, reportDate, designer, workDetail, photos, notify: input.notify === true } };
}

const PHOTO_EXTENSIONS = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

// Where a progress photo is stored in the bucket: progress/<24 random hex>.<ext>, the extension taken from its type.
// Nothing from the site or the phone goes into it (staff phone photos are often named after the customer or the site).
export function progressPhotoPathname(contentType: string, randomHex: string): string {
  const extension = PHOTO_EXTENSIONS.get(contentType);
  if (!extension) throw new Error(`No progress photo extension for ${contentType}`);
  if (!/^[0-9a-f]{24}$/.test(randomHex)) throw new Error('A progress photo pathname needs 24 random hex characters.');
  return `progress/${randomHex}.${extension}`;
}

export function checkPhotoUpload(type: string, size: number): { ok: true } | { ok: false; status: 400 | 413; error: string } {
  if (!PHOTO_TYPES.has(type)) return { ok: false, status: 400, error: 'JPG, PNG, WEBP 사진만 올릴 수 있습니다.' };
  if (!(size > 0)) return { ok: false, status: 400, error: '사진 파일이 비어 있습니다.' };
  if (size > MAX_PHOTO_BYTES) return { ok: false, status: 413, error: '사진 용량이 너무 큽니다. 4MB 이하로 줄여서 올려주세요.' };
  return { ok: true };
}
