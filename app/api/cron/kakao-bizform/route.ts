import { NextResponse } from 'next/server';
import { isCronAuthorized } from '../../../lib/push-rules';
import { importKakaoBizForm } from '../../manager/_kakao-bizform';
import { notifyNewConsultations } from '../../manager/_push';

export const runtime = 'nodejs';
export const maxDuration = 60;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Scheduled 카카오 비즈니스폼+ import (GitHub Actions, every 10 minutes: .github/workflows/kakao-bizform-sync.yml), so new
// responses and their alerts arrive even when no PC dashboard is open. Only with Authorization: Bearer <CRON_SECRET>;
// with no secret configured the route is closed to everyone.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return json({ error: 'CRON_SECRET이 설정되지 않았습니다.' }, 503);
  if (!isCronAuthorized(request.headers.get('authorization'), secret)) return json({ error: '권한이 없습니다.' }, 401);

  try {
    const { configured, imported } = await importKakaoBizForm();
    if (!configured) return json({ imported: 0, skipped: '카카오 설정 없음' });
    // This caller can wait, so the alerts go out before the answer.
    if (imported.length > 0) await notifyNewConsultations(imported);
    return json({ imported: imported.length });
  } catch (error) {
    console.error('Scheduled Kakao BizForm import failed:', error instanceof Error ? error.message : error);
    return json({ error: '카카오 비즈폼을 가져오지 못했습니다.' }, 500);
  }
}
