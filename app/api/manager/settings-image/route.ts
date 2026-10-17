import { NextResponse } from 'next/server';
import { managerClient } from '../_utils';
import { requireManager } from '../_session';

export const runtime = 'nodejs';

const imageFields = new Set(['heroImage', 'heroImage2', 'heroImage3', 'popupImage', 'popupUpload']);

export async function POST(request: Request) {
  const access = requireManager(request, { anyOf: ['portfolio'] });
  if (access.error) return access.error;

  try {
    const formData = await request.formData();
    const field = String(formData.get('field') || '');
    const file = formData.get('file');

    if (!imageFields.has(field)) {
      return NextResponse.json({ error: '지원하지 않는 이미지 영역입니다.' }, { status: 400 });
    }

    if (!(file instanceof File) || !file.type.startsWith('image/')) {
      return NextResponse.json({ error: '이미지 파일을 선택해 주세요.' }, { status: 400 });
    }

    await managerClient.createIfNotExists({
      _id: 'siteSettings',
      _type: 'siteSettings',
      title: 'WEVE DESIGN 홈페이지 설정',
    });

    const bytes = Buffer.from(await file.arrayBuffer());
    const asset = await managerClient.assets.upload('image', bytes, {
      filename: file.name,
      contentType: file.type,
    });

    if (field === 'popupUpload') {
      return NextResponse.json({ assetUrl: asset.url });
    }

    const settings = await managerClient
      .patch('siteSettings')
      .set({
        [field]: {
          _type: 'image',
          asset: { _type: 'reference', _ref: asset._id },
        },
      })
      .commit();

    return NextResponse.json({ settings, assetUrl: asset.url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '이미지를 저장하지 못했습니다.' }, { status: 500 });
  }
}
