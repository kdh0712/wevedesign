import { NextResponse } from 'next/server';
import { managerClient, hashId } from '../manager/_utils';

export const runtime = 'nodejs';

const seoulDateKey = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

export async function POST(request: Request) {
  if (!process.env.SANITY_WRITE_TOKEN) {
    return NextResponse.json({ ok: false, error: 'SANITY_WRITE_TOKEN is not configured.' }, { status: 500 });
  }

  const date = seoulDateKey(new Date());
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const visitorKey = hashId(`${date}:${ip}:${userAgent}`);

  try {
    await managerClient.createIfNotExists({
      _id: `siteVisitDaily-${date}`,
      _type: 'siteVisitDaily',
      date,
      count: 0,
      visitors: [],
    });

    const existing = await managerClient.fetch<string | null>(
      '*[_id == $id && $visitorKey in visitors][0]._id',
      { id: `siteVisitDaily-${date}`, visitorKey },
    );

    if (!existing) {
      await managerClient
        .patch(`siteVisitDaily-${date}`)
        .inc({ count: 1 })
        .append('visitors', [visitorKey])
        .commit();
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Visit tracking failed:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
