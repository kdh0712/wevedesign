import { NextResponse } from 'next/server';
import { assertManager, getOrCreateCategory, hashId, managerClient } from '../_utils';

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
  const authError = assertManager(request);
  if (authError) return authError;

  const formData = await request.formData();
  const files = formData.getAll('files').filter((value): value is File => value instanceof File);
  const paths = safeJsonArray(formData.get('paths'));
  const categoryTitle = String(formData.get('category') || '주택').trim() || '주택';
  const featured = formData.get('featured') === 'true';

  if (files.length === 0) {
    return NextResponse.json({ error: '업로드할 이미지 파일이 없습니다.' }, { status: 400 });
  }

  const parsedImages = files
    .map((file, index) => parseFile(file, paths[index] || file.name))
    .filter((image): image is ParsedImage => Boolean(image));

  if (parsedImages.length === 0) {
    return NextResponse.json({ error: '지원되는 이미지 파일을 찾지 못했습니다.' }, { status: 400 });
  }

  const category = await getOrCreateCategory(categoryTitle);
  const projects = groupBy(parsedImages, (image) => image.projectTitle);
  const results = [];

  for (const [projectTitle, images] of projects) {
    const cover = images.find((image) => image.kind === 'cover') || images.find((image) => image.kind === 'detail');
    const before = images.find((image) => image.kind === 'before');
    const details = images.filter((image) => image.kind === 'detail');

    if (!cover) {
      results.push({ projectTitle, status: 'skipped', reason: '대표 이미지가 없습니다.' });
      continue;
    }

    const existing = await managerClient.fetch('*[_type == "project" && title == $title][0]{_id}', { title: projectTitle });
    const projectId = existing?._id || `project-${hashId(projectTitle)}`;
    const mainAsset = await uploadImage(cover.file, `${projectTitle} 대표`);
    const beforeAsset = before ? await uploadImage(before.file, `${projectTitle} 시공 전`) : null;
    const galleryGroups = [];
    const roomGroups = groupBy(details, (image) => image.roomType);

    for (const [groupIndex, [roomType, groupImages]] of Array.from(roomGroups.entries()).entries()) {
      const sortedImages = [...groupImages].sort((a, b) => a.order - b.order || collator.compare(a.path, b.path));
      const uploadedImages = [];

      for (const [imageIndex, image] of sortedImages.entries()) {
        const asset = await uploadImage(image.file, `${projectTitle} ${roomType} ${imageIndex + 1}`);
        uploadedImages.push({
          _type: 'image',
          _key: `image-${hashId(`${image.path}-${imageIndex}`)}`,
          asset: { _type: 'reference', _ref: asset._id },
          caption: stripExtension(lastPathSegment(image.path)),
          displayOrder: image.order || imageIndex + 1,
          alt: `${projectTitle} ${roomType}`,
        });
      }

      galleryGroups.push({
        _type: 'object',
        _key: `group-${hashId(`${projectTitle}-${roomType}`)}`,
        roomType,
        title: roomType,
        displayOrder: groupIndex + 1,
        images: uploadedImages,
      });
    }

    const projectFields: Record<string, unknown> = {
      isVisible: true,
      featured,
      title: projectTitle,
      category: { _type: 'reference', _ref: category._id },
      mainImage: {
        _type: 'image',
        asset: { _type: 'reference', _ref: mainAsset._id },
        alt: `${projectTitle} 대표 사진`,
      },
      galleryGroups,
    };

    if (beforeAsset) {
      projectFields.beforeImage = {
        _type: 'image',
        asset: { _type: 'reference', _ref: beforeAsset._id },
        alt: `${projectTitle} 시공 전 사진`,
      };
    }

    if (existing?._id) {
      await managerClient.patch(projectId).set(projectFields).commit();
    } else {
      await managerClient.create({ _id: projectId, _type: 'project', ...projectFields });
    }

    results.push({
      projectTitle,
      status: existing?._id ? 'updated' : 'created',
      imageCount: images.length,
      groupCount: galleryGroups.length,
    });
  }

  return NextResponse.json({ results });
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
