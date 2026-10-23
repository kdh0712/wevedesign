import { NextResponse } from 'next/server';
import { parseAcquisitionChoice, type SiteAcquisition } from '../../../lib/acquisition';
import { readAcquisitionOptions, writeSiteAcquisition } from '../_acquisition-store';
import { getSiteForProgress, isProgressStoreReady } from '../_progress-store';
import { requireManager } from '../_session';

export const runtime = 'nodejs';

// The 유입 경로 survey for staff: the option list, and entering, fixing or clearing a site's answer. Needs the sites
// permission (admins have every permission). The answer is written alone (a masked patch), never by the site form.
const STORE_MISSING = '유입 경로 기능은 Firestore 설정이 필요합니다.';
const SITE_NOT_FOUND = '현장을 찾을 수 없습니다.';
const BAD_REQUEST = '요청 형식이 올바르지 않습니다.';

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const fail = (error: string, status: number) => json({ error }, status);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export async function GET(request: Request) {
  const access = requireManager(request, { anyOf: ['sites'] });
  if (access.error) return access.error;
  if (!isProgressStoreReady()) return fail(STORE_MISSING, 503);
  try {
    return json(await readAcquisitionOptions());
  } catch (error) {
    console.error('Acquisition options load failed:', error);
    return fail('유입 경로 보기를 불러오지 못했습니다.', 500);
  }
}

export async function POST(request: Request) {
  const access = requireManager(request, { anyOf: ['sites'] });
  if (access.error) return access.error;
  if (!isProgressStoreReady()) return fail(STORE_MISSING, 503);

  const body = await request.json().catch(() => null);
  if (!isRecord(body)) return fail(BAD_REQUEST, 400);

  try {
    switch (body.action) {
      case 'setSite':
        return await setSite(body, access.session.loginId);
      case 'clearSite':
        return await clearSite(body);
      default:
        return fail('알 수 없는 요청입니다.', 400);
    }
  } catch (error) {
    console.error('Acquisition request failed:', error);
    return fail('유입 경로를 저장하지 못했습니다.', 500);
  }
}

// Staff may pick a hidden option too, so an old answer can be kept as it was.
async function setSite(body: Record<string, unknown>, loginId: string) {
  const siteId = text(body.siteId);
  if (!siteId || !(await getSiteForProgress(siteId))) return fail(SITE_NOT_FOUND, 404);
  const { options } = await readAcquisitionOptions();
  const parsed = parseAcquisitionChoice(body, options, { allowHidden: true });
  if (!parsed.ok) return fail(parsed.error, 400);
  const acquisition: SiteAcquisition = { status: 'answered', ...parsed.choice, by: 'staff', staffId: loginId, at: new Date().toISOString() };
  await writeSiteAcquisition(siteId, acquisition, { exists: true });
  return json({ acquisition });
}

// The customer is asked again on the next visit.
async function clearSite(body: Record<string, unknown>) {
  const siteId = text(body.siteId);
  if (!siteId || !(await getSiteForProgress(siteId))) return fail(SITE_NOT_FOUND, 404);
  await writeSiteAcquisition(siteId, null, { exists: true });
  return json({ acquisition: null });
}
