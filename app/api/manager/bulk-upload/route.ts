import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { newProjectFields, newProjectId, parseUploadTargets, replacePhotoPatch, type UploadResult } from '../../../lib/project-upload-rules';
import { getOrCreateCategory, hashId, isSanityIdWritable, managerClient } from '../_utils';
import { requireManager } from '../_session';

export const runtime = 'nodejs';
export const maxDuration = 60;

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const collator = new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' });

type ParsedImage = {
  file: File;
  path: string;
  projectTitle: string;
  kind: 'cover' | 'before' | 'detail';
  roomType: string;
  order: number;
};

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

// Each folder is one 시공 사례. The screen says per folder (targets) whether it makes a new project, which starts hidden with a
// random id, or replaces one project's photos, which keeps everything else of that project. A folder without a target is
// skipped; a folder that fails is reported and the others still go through.
async function handleBulkUpload(request: Request) {
  const formData = await request.formData();
  const files = formData.getAll('files').filter((value): value is File => value instanceof File);
  const paths = safeJsonArray(formData.get('paths'));
  const targets = parseUploadTargets(formData.get('targets'));
  const categoryId = String(formData.get('categoryId') || '').trim();
  const categoryTitle = String(formData.get('category') || '').trim();

  if (files.length === 0) {
    return NextResponse.json({ error: '업로드할 이미지 파일이 없습니다.' }, { status: 400 });
  }

  const parsedImages = files
    .map((file, index) => parseFile(file, paths[index] || file.name))
    .filter((image): image is ParsedImage => Boolean(image));

  if (parsedImages.length === 0) {
    return NextResponse.json({ error: '지원되는 이미지 파일을 찾지 못했습니다.' }, { status: 400 });
  }

  let categoryRef = categoryId;
  const projects = groupBy(parsedImages, (image) => image.projectTitle);
  const results: UploadResult[] = [];

  for (const [projectTitle, images] of projects) {
    const target = targets.get(projectTitle);
    if (!target) {
      results.push({ projectTitle, status: 'skipped', reason: '올릴 방법이 정해지지 않았습니다.' });
      continue;
    }

    const cover = images.find((image) => image.kind === 'cover') || images.find((image) => image.kind === 'detail');
    if (!cover) {
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
        const stored = await managerClient.fetch<{ title?: string } | null>('*[_id == $id][0]{title}', { id: projectId });
        existingTitle = stored?.title || projectTitle;
      } else if (!categoryRef) {
        if (!categoryTitle) {
          results.push({ projectTitle, status: 'skipped', reason: '공간 분류가 필요합니다.' });
          continue;
        }
        categoryRef = (await getOrCreateCategory(categoryTitle))._id;
      }

      const before = images.find((image) => image.kind === 'before');
      const details = images.filter((image) => image.kind === 'detail');
      const [mainAsset, beforeAsset] = await Promise.all([
        uploadImage(cover.file, `${existingTitle} 대표`),
        before ? uploadImage(before.file, `${existingTitle} 시공 전`) : Promise.resolve(null),
      ]);
      const galleryGroups = await buildGalleryGroups(existingTitle, details);

      if (target.mode === 'replace') {
        const projectId = target.projectId.replace(/^drafts\./, '');
        const patch = replacePhotoPatch({ title: existingTitle, mainAssetId: mainAsset._id, beforeAssetId: beforeAsset?._id || null, galleryGroups });
        const updates = { ...patch.set, updatedAt: new Date().toISOString() };
        await managerClient.patch(projectId).set(updates).unset(patch.unset).commit();
        const draftId = `drafts.${projectId}`;
        const draft = await managerClient.fetch<{ _id?: string } | null>('*[_id == $draftId][0]{_id}', { draftId });
        if (draft?._id) await managerClient.patch(draftId).set(updates).unset(patch.unset).commit();
        results.push({ projectTitle, status: 'replaced', projectId, imageCount: images.length, groupCount: galleryGroups.length });
      } else {
        const projectId = newProjectId(randomBytes(12).toString('hex'));
        const now = new Date().toISOString();
        await managerClient.create({
          _id: projectId,
          _type: 'project',
          ...newProjectFields({ title: projectTitle, categoryRef, mainAssetId: mainAsset._id, beforeAssetId: beforeAsset?._id || null, galleryGroups }),
          createdAt: now,
          updatedAt: now,
        });
        results.push({ projectTitle, status: 'created', projectId, imageCount: images.length, groupCount: galleryGroups.length });
      }
    } catch (error) {
      console.error(`Manager bulk upload failed for a folder:`, error);
      results.push({ projectTitle, status: 'failed', reason: getUploadErrorMessage(error) });
    }
  }

  return NextResponse.json({ results });
}

// Detail photos grouped by room (거실1, 거실2 → 거실), each group in file-number order, as Sanity objects.
async function buildGalleryGroups(projectTitle: string, details: ParsedImage[]) {
  const galleryGroups = [];
  const roomGroups = groupBy(details, (image) => image.roomType);

  for (const [groupIndex, [roomType, groupImages]] of Array.from(roomGroups.entries()).entries()) {
    const sortedImages = [...groupImages].sort((a, b) => a.order - b.order || collator.compare(a.path, b.path));
    const uploadedImages = await Promise.all(
      sortedImages.map(async (image, imageIndex) => {
        const asset = await uploadImage(image.file, `${projectTitle} ${roomType} ${imageIndex + 1}`);
        return {
          _type: 'image',
          _key: `image-${hashId(`${image.path}-${imageIndex}-${asset._id}`)}`,
          asset: { _type: 'reference', _ref: asset._id },
          caption: stripExtension(lastPathSegment(image.path)),
          displayOrder: image.order || imageIndex + 1,
          alt: `${projectTitle} ${roomType}`,
        };
      }),
    );

    galleryGroups.push({
      _type: 'object',
      _key: `group-${hashId(`${projectTitle}-${roomType}-${groupIndex}`)}`,
      roomType,
      title: roomType,
      displayOrder: groupIndex + 1,
      images: uploadedImages,
    });
  }

  return galleryGroups;
}

function getUploadErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return `Sanity 업로드 실패: ${error.message}`;
  }

  return 'Sanity 업로드 중 알 수 없는 오류가 발생했습니다.';
}

function parseFile(file: File, originalPath: string): ParsedImage | null {
  if (!imageTypes.has(file.type)) return null;

  const pathParts = originalPath.split(/[\\/]+/).filter(Boolean);
  const fileName = pathParts[pathParts.length - 1] || file.name;
  const projectTitle = pathParts.length > 1 ? pathParts[pathParts.length - 2] : stripExtension(fileName);
  const baseName = stripExtension(fileName).trim();
  const normalized = baseName.toLowerCase().replace(/\s+/g, '');

  if (/^(대표|메인|썸네일|커버|cover|main|thumbnail|thumb)$/i.test(normalized)) {
    return { file, path: originalPath, projectTitle, kind: 'cover', roomType: '대표', order: 1 };
  }

  if (/^(시공전|공사전|before|비포)$/i.test(normalized)) {
    return { file, path: originalPath, projectTitle, kind: 'before', roomType: '시공 전', order: 1 };
  }

  const match = baseName.match(/^(.*?)[\s_-]*(\d+)$/);
  const roomType = (match ? match[1] : baseName).trim() || '상세';
  const order = match ? Number(match[2]) : 1;

  return { file, path: originalPath, projectTitle, kind: 'detail', roomType, order };
}

async function uploadImage(file: File, label: string) {
  const bytes = Buffer.from(await file.arrayBuffer());
  return managerClient.assets.upload('image', bytes, {
    filename: file.name || `${label}.jpg`,
    contentType: file.type || 'image/jpeg',
  });
}

function safeJsonArray(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const map = new Map<string, T[]>();

  for (const item of items) {
    const key = getKey(item).trim() || '기타';
    const group = map.get(key) || [];
    group.push(item);
    map.set(key, group);
  }

  return new Map(Array.from(map.entries()).sort(([a], [b]) => collator.compare(a, b)));
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '');
}

function lastPathSegment(value: string) {
  return value.split(/[\\/]+/).filter(Boolean).pop() || value;
}
