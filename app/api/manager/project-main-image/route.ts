import { NextResponse } from 'next/server';
import { assertManager, managerClient } from '../_utils';

export const runtime = 'nodejs';
export const maxDuration = 60;

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

export async function POST(request: Request) {
  const authError = assertManager(request);
  if (authError) return authError;

  try {
    const formData = await request.formData();
    const projectId = String(formData.get('projectId') || '').replace(/^drafts\./, '').trim();
    const file = formData.get('file');
    let assetId = String(formData.get('assetId') || '').trim();
    let assetUrl = String(formData.get('assetUrl') || '').trim();
    const alt = String(formData.get('alt') || '').trim();

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required.' }, { status: 400 });
    }

    const project = await managerClient.fetch<{ _id?: string; title?: string }>(
      '*[_type == "project" && _id == $projectId][0]{_id,title}',
      { projectId },
    );

    if (!project?._id) {
      return NextResponse.json({ error: 'Project를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (file instanceof File && file.size > 0) {
      if (!imageTypes.has(file.type)) {
        return NextResponse.json({ error: '이미지 파일만 업로드할 수 있습니다.' }, { status: 400 });
      }

      const bytes = Buffer.from(await file.arrayBuffer());
      const asset = await managerClient.assets.upload('image', bytes, {
        filename: file.name,
        contentType: file.type,
      });

      assetId = asset._id;
      assetUrl = asset.url || assetUrl;
    }

    if (!assetId) {
      return NextResponse.json({ error: '대표사진으로 사용할 이미지가 없습니다.' }, { status: 400 });
    }

    const updates = {
      mainImage: {
        _type: 'image',
        asset: { _type: 'reference', _ref: assetId },
        alt: alt || `${project.title || 'Project'} 대표 사진`,
      },
      updatedAt: new Date().toISOString(),
    };

    const record = await managerClient.patch(projectId).set(updates).commit();
    const draftId = `drafts.${projectId}`;
    const draft = await managerClient.fetch<{ _id?: string }>('*[_id == $draftId][0]{_id}', { draftId });

    if (draft?._id) {
      await managerClient.patch(draftId).set(updates).commit();
    }

    return NextResponse.json({ ok: true, record, assetId, assetUrl });
  } catch (error) {
    console.error('Project main image save failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : '대표사진 저장 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
