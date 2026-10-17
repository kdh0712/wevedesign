// Request checks for the manager progress API. Pure functions with no Next.js or Firestore imports, so tests can load them directly.
import type { ProgressPhoto } from '../../lib/site-progress';

export const MAX_PHOTO_BYTES = 4_000_000;

const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SANITY_CDN_PREFIX = 'https://cdn.sanity.io/';
const MAX_DESIGNER_LENGTH = 100;
const MAX_WORK_DETAIL_LENGTH = 5000;
const MAX_PHOTOS_PER_UPDATE = 40;

export type CreateUpdateValue = {
  siteId: string;
  reportDate: string;
  designer: string;
  workDetail: string;
  photos: ProgressPhoto[];
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

const isPositiveNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

// Photos arrive from the browser, so each one is rebuilt from the known fields instead of being stored as sent.
function parsePhoto(value: unknown): ProgressPhoto | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Record<string, unknown>;
  const assetId = text(item.assetId);
  const url = text(item.url);
  if (!assetId || !url.startsWith(SANITY_CDN_PREFIX)) return null;
  if (!isPositiveNumber(item.width) || !isPositiveNumber(item.height)) return null;
  return { assetId, url, width: item.width, height: item.height };
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
  const photos: ProgressPhoto[] = [];
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

export function checkPhotoUpload(type: string, size: number): { ok: true } | { ok: false; status: 400 | 413; error: string } {
  if (!PHOTO_TYPES.has(type)) return { ok: false, status: 400, error: 'JPG, PNG, WEBP 사진만 올릴 수 있습니다.' };
  if (!(size > 0)) return { ok: false, status: 400, error: '사진 파일이 비어 있습니다.' };
  if (size > MAX_PHOTO_BYTES) return { ok: false, status: 413, error: '사진 용량이 너무 큽니다. 4MB 이하로 줄여서 올려주세요.' };
  return { ok: true };
}
