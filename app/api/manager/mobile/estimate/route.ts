import { NextResponse } from 'next/server';
import { toCustomerEstimateView } from '../../../../lib/mobile-estimate';
import { isOfficeRecordId } from '../../../../lib/mobile-overview';
import { pickScheduleEstimate } from '../../../../lib/site-progress';
import { MOBILE_STORE_MISSING } from '../../_mobile-devices';
import { isProgressStoreReady } from '../../_progress-store';
import { requireManager } from '../../_session';
import { readSiteEstimatesFromFirestore } from '../../firestore';

export const runtime = 'nodejs';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// 견적 보기 on the phone (spec 2026-10-21 §4): the same estimate the schedule uses (newest final, else newest), turned into
// customer figures on the server. Costs and margins are read here but never leave it.
export async function GET(request: Request) {
  const access = requireManager(request, { anyOf: ['estimates'] });
  if (access.error) return access.error;
  if (!isProgressStoreReady()) return json({ error: MOBILE_STORE_MISSING }, 503);

  const siteId = new URL(request.url).searchParams.get('siteId');
  if (!isOfficeRecordId(siteId)) return json({ error: '현장을 선택해 주세요.' }, 400);
  try {
    const estimates = (await readSiteEstimatesFromFirestore(request, siteId)) as Array<Record<string, unknown>>;
    const picked = pickScheduleEstimate(
      estimates
        .filter((estimate) => !estimate.deletedAt)
        .map((estimate) => ({
          ...estimate,
          versionType: typeof estimate.versionType === 'string' ? estimate.versionType : undefined,
          updatedAt: typeof estimate.updatedAt === 'string' ? estimate.updatedAt : undefined,
          createdAt: typeof estimate.createdAt === 'string' ? estimate.createdAt : undefined,
        })),
    );
    return json({ estimate: picked ? toCustomerEstimateView(picked) : null });
  } catch (error) {
    console.error('Mobile estimate failed:', error);
    return json({ error: '견적을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' }, 500);
  }
}
