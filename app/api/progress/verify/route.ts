import { NextResponse } from 'next/server';
import {
  findSiteByProgressCode,
  getSiteForProgressWithVersion,
  isProgressStoreReady,
  resolveCustomerPhone,
  saveSiteProgressFields,
  type ProgressSite,
} from '../../manager/_progress-store';
import { resolveProgressKey } from '../_access';
import { verifyProgressAttempt, type VerifyStore } from '../_verify';

export const runtime = 'nodejs';

// The check itself lives in _verify.ts; this route only connects it to Firestore and to the HTTP response.
const store: VerifyStore<ProgressSite> = {
  findSiteByCode: findSiteByProgressCode,
  readSite: getSiteForProgressWithVersion,
  resolvePhone: resolveCustomerPhone,
  // Only progressAccess is written, and only on the version of the site the check read (updateTime precondition).
  writeAccess: (siteId, progressAccess, updateTime) => saveSiteProgressFields(siteId, { progressAccess }, { updateTime }),
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const result = await verifyProgressAttempt(body, {
    store,
    storeReady: isProgressStoreReady(),
    key: resolveProgressKey(),
    nowMs: Date.now(),
  });
  const response = NextResponse.json(result.body, { status: result.status, headers: result.headers });
  if (result.cookie) response.cookies.set(result.cookie);
  return response;
}
