import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { buildProjectPatch } from '../../../lib/project-form';
import {
  folderProjectInput,
  galleryGroupsFromFolder,
  newProjectId,
  readFolderUploadBody,
  replacePhotoPatch,
  type FolderUpload,
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

// Each folder arrives arranged in the 정보·사진 정리 popup (spec docs/superpowers/specs/2026-11-27-project-upload-popup-design.md):
// its photos, already stored one by one (/api/manager/project-asset), by asset id in the order and rooms staff chose, and
// for a new project its basic information. A new project is made with the editor's rules (buildProjectPatch), hidden; a
// replacement changes only that project's photos. A folder that fails is reported and the others still go through.
async function handleBulkUpload(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  const body = readFolderUploadBody(raw);
  if ('error' in body) return NextResponse.json({ error: body.error }, { status: 400 });

  // Every photo must be an image this site stored; nothing is written while one is missing.
  const stored = await managerClient.fetch<string[]>('*[_type == "sanity.imageAsset" && _id in $ids]._id', { ids: body.assetIds });
  if (stored.length !== body.assetIds.length) {
    return NextResponse.json({ error: '올린 사진 일부를 찾지 못했습니다. 다시 올려 주세요.' }, { status: 400 });
  }

  const results: UploadResult[] = [];
  for (const folder of body.folders) {
    const imageCount = new Set([folder.coverAssetId, ...(folder.beforeAssetId ? [folder.beforeAssetId] : []), ...folder.groups.flatMap((group) => group.photos.map((photo) => photo.assetId))]).size;
    try {
      results.push(folder.target.mode === 'replace' ? await replacePhotos(folder, imageCount) : await createProject(folder, imageCount));
    } catch (error) {
      console.error('Manager bulk upload failed for a folder:', error);
      results.push({ projectTitle: folder.title, status: 'failed', reason: getUploadErrorMessage(error) });
    }
  }
  return NextResponse.json({ results });
}

async function createProject(folder: FolderUpload, imageCount: number): Promise<UploadResult> {
  const info = folder.info;
  let categoryId = info?.categoryId.trim() || '';
  if (categoryId) {
    const category = await managerClient.fetch<string | null>('*[_type == "category" && _id == $id][0]._id', { id: categoryId });
    if (!category) return { projectTitle: folder.title, status: 'failed', reason: '공간 분류를 찾을 수 없습니다.' };
  } else if (info?.newCategory.trim()) {
    categoryId = (await getOrCreateCategory(info.newCategory.trim()))._id;
  }
  const built = buildProjectPatch(folderProjectInput(folder, categoryId));
  if (!built.ok) return { projectTitle: folder.title, status: 'skipped', reason: built.error };
  const projectId = newProjectId(randomBytes(12).toString('hex'));
  const now = new Date().toISOString();
  await managerClient.create({
    _id: projectId,
    _type: 'project',
    ...built.patch.set,
    // Hidden until staff press [홈페이지에 공개] in the editor.
    isVisible: false,
    createdAt: now,
    updatedAt: now,
  });
  return { projectTitle: folder.title, status: 'created', projectId, imageCount, groupCount: folder.groups.length };
}

async function replacePhotos(folder: FolderUpload, imageCount: number): Promise<UploadResult> {
  if (folder.target.mode !== 'replace') throw new Error('replace target expected');
  const projectId = folder.target.projectId.replace(/^drafts\./, '');
  if (!(await isSanityIdWritable(projectId, 'project'))) {
    return { projectTitle: folder.title, status: 'failed', reason: '바꿀 시공 사례를 찾을 수 없습니다.' };
  }
  const storedProject = await managerClient.fetch<{ title?: string } | null>('*[_id == $id][0]{title}', { id: projectId });
  const title = storedProject?.title || folder.title;
  const patch = replacePhotoPatch({
    title,
    mainAssetId: folder.coverAssetId,
    beforeAssetId: folder.beforeAssetId,
    galleryGroups: galleryGroupsFromFolder(title, folder.groups),
  });
  const updates = { ...patch.set, updatedAt: new Date().toISOString() };
  await managerClient.patch(projectId).set(updates).unset(patch.unset).commit();
  const draftId = `drafts.${projectId}`;
  // Drafts are only visible in the raw perspective (the client's default since API v2025-02-19 is published).
  const draft = await managerClient.fetch<{ _id?: string } | null>('*[_id == $draftId][0]{_id}', { draftId }, { perspective: 'raw' });
  if (draft?._id) await managerClient.patch(draftId).set(updates).unset(patch.unset).commit();
  return { projectTitle: folder.title, status: 'replaced', projectId, imageCount, groupCount: folder.groups.length };
}

function getUploadErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return `Sanity 업로드 실패: ${error.message}`;
  }

  return 'Sanity 업로드 중 알 수 없는 오류가 발생했습니다.';
}
