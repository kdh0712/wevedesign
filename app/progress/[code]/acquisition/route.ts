import { NextResponse, type NextRequest } from 'next/server';
import { readAcquisitionOptions, writeSiteAcquisition } from '../../../api/manager/_acquisition-store';
import {
  findSiteByProgressCode,
  getSiteForProgressWithVersion,
  isProgressStoreReady,
  resolveCustomerPhone,
  type ProgressSite,
} from '../../../api/manager/_progress-store';
import { resolveProgressKey } from '../../../api/progress/_access';
import { submitAcquisition, type AcquisitionStore } from '../../../api/progress/_acquisition';

export const runtime = 'nodejs';

// The customer's 유입 경로 answer. It lives under /progress (not /api) because the phone-check cookie is scoped to
// path /progress: the browser sends it here and nowhere else. The decision is in _acquisition.ts.
const store: AcquisitionStore<ProgressSite> = {
  findSiteByCode: findSiteByProgressCode,
  readSite: getSiteForProgressWithVersion,
  resolvePhone: resolveCustomerPhone,
  readOptions: () => readAcquisitionOptions().then((read) => read.options),
  writeAcquisition: (siteId, acquisition, updateTime) => writeSiteAcquisition(siteId, acquisition, { updateTime }),
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = await request.json().catch(() => null);
  const result = await submitAcquisition(isRecord(body) ? { ...body, code } : body, {
    store,
    storeReady: isProgressStoreReady(),
    key: resolveProgressKey(),
    readCookie: (name) => request.cookies.get(name)?.value,
    nowMs: Date.now(),
  });
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
