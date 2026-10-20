import { NextResponse } from 'next/server';
import { hasAnyPermission } from '../../../../lib/manager-permissions';
import {
  buildMobileSites,
  listedConsultations,
  nextDay,
  pickActiveSiteIds,
  tomorrowTasks,
  type MobileOverview,
} from '../../../../lib/mobile-overview';
import { todayInSeoul } from '../../../../lib/site-progress';
import { MOBILE_STORE_MISSING } from '../../_mobile-devices';
import { isProgressStoreReady } from '../../_progress-store';
import { requireManager } from '../../_session';
import { listFirestoreCollection, officeFirestoreCollections } from '../../firestore';

export const runtime = 'nodejs';

// Only the fields the schedule needs: estimate lines (prices, costs) are never read here.
const ESTIMATE_FIELDS = ['siteId', 'versionType', 'updatedAt', 'createdAt', 'scheduleJson', 'deletedAt'];

// Everything the phone screens show, in one answer. Lists the session may not see are not read at all.
export async function GET(request: Request) {
  const access = requireManager(request);
  if (access.error) return access.error;
  if (!isProgressStoreReady()) return NextResponse.json({ error: MOBILE_STORE_MISSING }, { status: 503 });
  const { session } = access;

  const canSites = hasAnyPermission(session, ['sites']);
  const canConsult = hasAnyPermission(session, ['consultations']);
  // Vendor names and phones come from the estimate schedule, so they follow the estimate or vendor permission.
  const showVendors = hasAnyPermission(session, ['estimates', 'vendors']);

  try {
    const nowMs = Date.now();
    const today = todayInSeoul(nowMs);
    const [siteRecords, estimates, consultations] = await Promise.all([
      canSites ? listFirestoreCollection<Record<string, unknown>>(officeFirestoreCollections.site) : Promise.resolve([]),
      canSites ? listFirestoreCollection<Record<string, unknown>>('siteEstimates', undefined, 1000, ESTIMATE_FIELDS) : Promise.resolve([]),
      canConsult ? listFirestoreCollection<Record<string, unknown>>(officeFirestoreCollections.consultation) : Promise.resolve(null),
    ]);

    const sites = buildMobileSites({ sites: siteRecords, estimates, today, showVendors });
    const activeSiteIds = pickActiveSiteIds(sites);
    const overview: MobileOverview = {
      today,
      sites,
      activeSiteIds,
      tomorrow: tomorrowTasks(sites, activeSiteIds, nextDay(today)),
      ...(consultations ? { consultations: listedConsultations(consultations, nowMs) } : {}),
    };
    return NextResponse.json(overview, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Mobile overview failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : '업무 정보를 불러오지 못했습니다.' }, { status: 500 });
  }
}
