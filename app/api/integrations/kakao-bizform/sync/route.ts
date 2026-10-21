import { after, NextResponse } from 'next/server';
import { importKakaoBizForm } from '../../../manager/_kakao-bizform';
import { notifyNewConsultations } from '../../../manager/_push';
import { requireManager } from '../../../manager/_session';

export const runtime = 'nodejs';

// The PC dashboard's 카카오 비즈니스폼+ sync (button, and every 5 minutes while the dashboard is open). The same import runs on
// a schedule from /api/cron/kakao-bizform, so new responses arrive even when no PC is open.
export async function POST(request: Request) {
  const access = requireManager(request, { anyOf: ['consultations'] });
  if (access.error) return access.error;

  try {
    const { configured, imported } = await importKakaoBizForm();
    if (!configured) return NextResponse.json({ configured: false, imported: 0 });
    if (imported.length > 0) after(() => notifyNewConsultations(imported));
    return NextResponse.json({ configured: true, imported: imported.length, checkedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json(
      { configured: true, error: error instanceof Error ? error.message : '카카오 비즈니스폼+ 동기화에 실패했습니다.' },
      { status: 502 },
    );
  }
}
