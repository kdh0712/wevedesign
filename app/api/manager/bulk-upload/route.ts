import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  findUploadTarget,
  galleryGroupsFromPhotos,
  newProjectFields,
  newProjectId,
  parseUploadPath,
  parseUploadTargets,
  planProjectPhotos,
  readBulkUploadBody,
  replacePhotoPatch,
  type UploadResult,
} from '../../../lib/project-upload-rules';
import { getOrCreateCategory, isSanityIdWritable, managerClient } from '../_utils';
import { requireManager } from '../_session';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const access = requireManager(request, { anyOf: ['portfolio'] });
  if (access.error) return access.error;

  try {
    return await handleBulkUpload(request);
  } catch (error) {
    console.error('Manager bulk upload failed:', error);
    return NextResponse.json({ error: getUploadErrorMessage(error) }, { status: 500 });
  }
}

// The photos are already uploaded one by one (/api/manager/project-asset, spec
// docs/superpowers/specs/2026-11-27-project-upload-per-photo-design.md); this request carries each photo's folder path and
// asset id, so it stays small however many photos there are. Each folder is one 시공 사례. The screen says per folder
// (targets) whether it makes a new project, which starts hidden with a random id, or replaces one project's photos, which
// keeps everything else of that project. A folder without a target is skipped; a folder that fails is reported and the
// others still go through.
async function handleBulkUpload(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  const body = readBulkUploadBody(raw);
  if ('error' in body) return NextResponse.json({ error: body.error }, { status: 400 });
  const { photos } = body;

  // Every photo must be an image this site stored; nothing is written while one is missing.
  const assetIds = [...new Set(photos.map((photo) => photo.assetId))];
  const stored = await managerClient.fetch<string[]>('*[_type == "sanity.imageAsset" && _id in $ids]._id', { ids: assetIds });
  if (stored.length !== assetIds.length) {
    return NextResponse.json({ error: '올린 사진 일부를 찾지 못했습니다. 다시 올려 주세요.' }, { status: 400 });
  }

  const targets = parseUploadTargets(body.targets);
  const categoryTitle = body.category;
  let categoryRef = body.categoryId;
  const results: UploadResult[] = [];

  for (const [projectTitle, project] of planProjectPhotos(photos)) {
    const imageCount = photos.filter((photo) => (parseUploadPath(photo.path).projectTitle.trim() || '기타') === projectTitle).length;
    const target = findUploadTarget(targets, projectTitle);
    if (!target) {
      results.push({ projectTitle, status: 'skipped', reason: '올릴 방법이 정해지지 않았습니다.' });
      continue;
    }
    if (!project.cover) {
      results.push({ projectTitle, status: 'skipped', reason: '대표 이미지가 없습니다.' });
      continue;
    }

    try {
      let existingTitle = projectTitle;
      if (target.mode === 'replace') {
        const projectId = target.projectId.replace(/^drafts\./, '');
        if (!(await isSanityIdWritable(projectId, 'project'))) {
          results.push({ projectTitle, status: 'failed', reason: '바꿀 시공 사례를 찾을 수 없습니다.' });
          continue;
        }
        const storedProject = await managerClient.fetch<{ title?: string } | null>('*[_id == $id][0]{title}', { id: projectId });
        existingTitle = storedProject?.title || projectTitle;
      } else if (!categoryRef) {
        if (!categoryTitle) {
          results.push({ projectTitle, status: 'skipped', reason: '공간 분류가 필요합니다.' });
          continue;
        }
        categoryRef = (await getOrCreateCategory(categoryTitle))._id;
      }

      const galleryGroups = galleryGroupsFromPhotos(existingTitle, project.groups);
      const mainAssetId = project.cover.assetId;
      const beforeAssetId = project.before?.assetId || null;

      if (target.mode === 'replace') {
        const projectId = target.projectId.replace(/^drafts\./, '');
        const patch = replacePhotoPatch({ title: existingTitle, mainAssetId, beforeAssetId, galleryGroups });
        const updates = { ...patch.set, updatedAt: new Date().toISOString() };
        await managerClient.patch(projectId).set(updates).unset(patch.unset).commit();
        const draftId = `drafts.${projectId}`;
        const draft = await managerClient.fetch<{ _id?: string } | null>('*[_id == $draftId][0]{_id}', { draftId });
        if (draft?._id) await managerClient.patch(draftId).set(updates).unset(patch.unset).commit();
        results.push({ projectTitle, status: 'replaced', projectId, imageCount, groupCount: galleryGroups.length });
      } else {
        const projectId = newProjectId(randomBytes(12).toString('hex'));
        const now = new Date().toISOString();
        await managerClient.create({
          _id: projectId,
          _type: 'project',
          ...newProjectFields({ title: projectTitle, categoryRef, mainAssetId, beforeAssetId, galleryGroups }),
          createdAt: now,
          updatedAt: now,
        });
        results.push({ projectTitle, status: 'created', projectId, imageCount, groupCount: galleryGroups.length });
      }
    } catch (error) {
      console.error(`Manager bulk upload failed for a folder:`, error);
      results.push({ projectTitle, status: 'failed', reason: getUploadErrorMessage(error) });
    }
  }

  return NextResponse.json({ results });
}

function getUploadErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return `Sanity 업로드 실패: ${error.message}`;
  }

  return 'Sanity 업로드 중 알 수 없는 오류가 발생했습니다.';
}
