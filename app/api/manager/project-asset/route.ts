import { NextResponse } from 'next/server';
import { managerClient } from '../_utils';
import { requireManager } from '../_session';

export const runtime = 'nodejs';
export const maxDuration = 60;

// One photo for the 시공 사례 editor (a new representative or 시공 전 사진), stored as a Sanity image asset. The project itself
// is not changed here: the photo is attached when staff press [저장] (app/lib/project-form.ts). The browser shrinks the photo
// first; Vercel caps a request near 4.5MB.
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const MAX_BYTES = 4_000_000;

export async function POST(request: Request) {
  const access = requireManager(request, { anyOf: ['portfolio'] });
  if (access.error) return access.error;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: '사진 파일이 없습니다.' }, { status: 400 });
  if (!imageTypes.has(file.type)) return NextResponse.json({ error: '이미지 파일만 올릴 수 있습니다.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: '사진 용량이 너무 큽니다. 4MB 이하로 줄여서 올려 주세요.' }, { status: 413 });

  try {
    const asset = await managerClient.assets.upload('image', Buffer.from(await file.arrayBuffer()), {
      filename: file.name || 'project-photo.jpg',
      contentType: file.type,
    });
    return NextResponse.json({ assetId: asset._id, url: asset.url || '' });
  } catch (error) {
    console.error('Project photo upload failed:', error);
    return NextResponse.json({ error: '사진을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 502 });
  }
}
