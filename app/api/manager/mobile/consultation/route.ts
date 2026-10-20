import { NextResponse } from 'next/server';
import { parseConsultationPatch, toMobileConsultation } from '../../../../lib/mobile-overview';
import { MOBILE_STORE_MISSING } from '../../_mobile-devices';
import { isProgressStoreReady } from '../../_progress-store';
import { requireManager } from '../../_session';
import { getFirestoreDocument, isFirestoreConflictError, officeFirestoreCollections, patchFirestoreFields } from '../../firestore';

export const runtime = 'nodejs';

const NOT_FOUND = '상담을 찾을 수 없습니다.';

// The phone's consultation card changes only the status and the memo. Only those fields (and updatedAt) are written,
// so a PC form saved at the same time never loses its other fields to this change.
export async function POST(request: Request) {
  const access = requireManager(request, { anyOf: ['consultations'] });
  if (access.error) return access.error;
  if (!isProgressStoreReady()) return NextResponse.json({ error: MOBILE_STORE_MISSING }, { status: 503 });

  const parsed = parseConsultationPatch(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const collection = officeFirestoreCollections.consultation;
  try {
    const existing = await getFirestoreDocument<Record<string, unknown>>(collection, parsed.id);
    if (!existing || existing.deletedAt) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    const saved = await patchFirestoreFields<Record<string, unknown>>(
      collection,
      parsed.id,
      { ...parsed.fields, updatedAt: new Date().toISOString() },
      { precondition: { exists: true } },
    );
    return NextResponse.json({ consultation: toMobileConsultation(saved) });
  } catch (error) {
    // exists:true failed: the consultation was deleted between the read and the write.
    if (isFirestoreConflictError(error)) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    console.error('Mobile consultation update failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : '상담을 저장하지 못했습니다.' }, { status: 500 });
  }
}
