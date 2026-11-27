// Folder uploads of 시공 사례 (manager bulk upload and scripts/upload-project-folders.mjs). Staff choose per folder whether it
// makes a new project or replaces one project's photos; nothing is matched by name on its own. Pure; its only import is a
// relative .ts module (project-form), so Node tests and the CLI load it directly.
// Spec: docs/superpowers/specs/2026-11-21-portfolio-project-editor-design.md §3.2, §5.1

import { buildProjectPatch, type ProjectFormInput } from './project-form.ts';

export type UploadTarget = { mode: 'new' } | { mode: 'replace'; projectId: string };

export type UploadResult = {
  projectTitle: string;
  status: 'created' | 'replaced' | 'skipped' | 'failed';
  projectId?: string;
  reason?: string;
  imageCount?: number;
  groupCount?: number;
};

// A new project gets a random id: an id made from the title would collide with a renamed project of that original title.
export function newProjectId(randomHex: string): string {
  if (!/^[0-9a-f]{24}$/.test(randomHex)) throw new Error('A new project id needs 24 random hex characters.');
  return `project-${randomHex}`;
}

const imageField = (assetId: string, alt: string) => ({ _type: 'image', asset: { _type: 'reference', _ref: assetId }, alt });

// A new project is hidden and off the main page until staff fill it in and publish it.
export function newProjectFields(input: {
  title: string;
  categoryRef: string;
  mainAssetId: string;
  beforeAssetId: string | null;
  galleryGroups: unknown[];
}): Record<string, unknown> {
  return {
    isVisible: false,
    featured: false,
    title: input.title,
    category: { _type: 'reference', _ref: input.categoryRef },
    mainImage: imageField(input.mainAssetId, `${input.title} 대표 사진`),
    galleryGroups: input.galleryGroups,
    ...(input.beforeAssetId ? { beforeImage: imageField(input.beforeAssetId, `${input.title} 시공 전 사진`) } : {}),
  };
}

// Replacing a project's photos changes only the photos: its name, visibility, main-page flag, category and every field
// staff typed stay. The new representative photo starts centred, and the old single-photo list goes.
export function replacePhotoPatch(input: {
  title: string;
  mainAssetId: string;
  beforeAssetId: string | null;
  galleryGroups: unknown[];
}): { set: Record<string, unknown>; unset: string[] } {
  return {
    set: {
      mainImage: imageField(input.mainAssetId, `${input.title} 대표 사진`),
      mainImagePositionX: 50,
      mainImagePositionY: 50,
      galleryGroups: input.galleryGroups,
      ...(input.beforeAssetId ? { beforeImage: imageField(input.beforeAssetId, `${input.title} 시공 전 사진`) } : {}),
    },
    unset: ['gallery'],
  };
}

export function sameTitleProjects<P extends { _id: string; title?: string }>(folderTitle: string, projects: readonly P[]): P[] {
  const wanted = folderTitle.trim();
  if (!wanted) return [];
  return projects.filter((project) => (project.title || '').trim() === wanted);
}

export function uploadSummary(results: UploadResult[]): string {
  const count = (status: UploadResult['status']) => results.filter((result) => result.status === status).length;
  const failed = count('failed');
  return `새로 만듦 ${count('created')} · 사진 바꿈 ${count('replaced')} · 건너뜀 ${count('skipped')}${failed > 0 ? ` · 실패 ${failed}` : ''}`;
}

// After an upload the editor reopens a project from the reloaded list, never keeping a form that may hold replaced photos:
// the replaced project ([사진 다시 올리기]), else the one new project, else the project that was open (its photos may have
// been replaced from the new-upload panel too). Several new projects also switch the list to the hidden ones.
export function afterUploadSelection(input: {
  results: UploadResult[];
  replaceTargetId: string;
  currentSelectedId: string;
}): { openProjectId: string; showHidden: boolean } {
  const created = input.results.filter((result) => result.status === 'created' && result.projectId);
  const showHidden = created.length > 1;
  if (input.replaceTargetId) return { openProjectId: input.replaceTargetId, showHidden };
  if (created.length === 1) return { openProjectId: created[0].projectId || '', showHidden };
  return { openProjectId: input.currentSelectedId, showHidden };
}

// --- 나눠 올리기 (spec docs/superpowers/specs/2026-11-27-project-upload-per-photo-design.md) -------------------------------
// Each photo is uploaded on its own first (/api/manager/project-asset); the upload request then carries only each photo's
// folder path and asset id, and these rules turn them into projects, as the file-name rules always did.

export type PhotoKind = 'cover' | 'before' | 'detail';
export type ParsedUploadPath = { projectTitle: string; kind: PhotoKind; roomType: string; order: number };
const COVER_NAME = /^(대표|메인|썸네일|커버|cover|main|thumbnail|thumb)$/i;
const BEFORE_NAME = /^(시공전|공사전|before|비포)$/i;
const koreanOrder = new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' });
const stripExtension = (fileName: string) => fileName.replace(/\.[^.]+$/, '');

// The folder that holds the photo is its project; 대표 / 시공전 by name; else the room and its number (거실12 → 거실, 12).
export function parseUploadPath(path: string): ParsedUploadPath {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  const fileName = parts[parts.length - 1] || path;
  const projectTitle = parts.length > 1 ? parts[parts.length - 2] : stripExtension(fileName);
  const baseName = stripExtension(fileName).trim();
  const normalized = baseName.toLowerCase().replace(/\s+/g, '');
  if (COVER_NAME.test(normalized)) return { projectTitle, kind: 'cover', roomType: '대표', order: 1 };
  if (BEFORE_NAME.test(normalized)) return { projectTitle, kind: 'before', roomType: '시공 전', order: 1 };
  // 거실1, 거실 2, 거실_3, and Windows bulk renames: 거실 (4).
  const match = baseName.match(/^(.*?)[\s_-]*\(?(\d+)\)?$/);
  return { projectTitle, kind: 'detail', roomType: (match ? match[1] : baseName).trim() || '상세', order: match ? Number(match[2]) : 1 };
}

// A Sanity image asset id: image-<hash>-<width>x<height>-<format>.
export function isImageAssetId(value: unknown): value is string {
  return typeof value === 'string' && /^image-[A-Za-z0-9]+-\d+x\d+-[a-z0-9]+$/.test(value);
}

// --- 정보·사진 정리 팝업 (spec docs/superpowers/specs/2026-11-27-project-upload-popup-design.md) ---------------------------
// Each folder arrives arranged by staff: its cover, 시공 전 photo and rooms in order, with the basic information of a new
// project. The photos are already stored (/api/manager/project-asset); the request names them by asset id.

export type FolderInfo = {
  title: string;
  categoryId: string;
  // A 공간 분류 typed in the popup instead of picked; the server finds or makes it.
  newCategory: string;
  location: string;
  area: string;
  year: string;
  materials: string;
  blogUrl: string;
  description: string;
  featured: boolean;
};
export type FolderGroup = { roomType: string; photos: { assetId: string; caption: string }[] };
export type FolderUpload = {
  title: string;
  target: UploadTarget;
  // Only for a new project.
  info: FolderInfo | null;
  coverAssetId: string;
  beforeAssetId: string | null;
  groups: FolderGroup[];
};

const MAX_FOLDER_ROOM = 20;

export function readFolderUploadBody(body: unknown): { folders: FolderUpload[]; assetIds: string[] } | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: '요청 형식이 올바르지 않습니다.' };
  const rawFolders = (body as { folders?: unknown }).folders;
  if (!Array.isArray(rawFolders) || rawFolders.length === 0) return { error: '올릴 시공 사례가 없습니다.' };
  const str = (value: unknown) => (typeof value === 'string' ? value : '');
  const photoError = { error: '사진 정보가 올바르지 않습니다. 다시 올려 주세요.' };
  const folders: FolderUpload[] = [];
  const assetIds = new Set<string>();
  for (const item of rawFolders) {
    if (!item || typeof item !== 'object') return { error: '요청 형식이 올바르지 않습니다.' };
    const raw = item as Record<string, unknown>;
    const title = str(raw.title).trim();
    if (!title) return { error: '요청 형식이 올바르지 않습니다.' };
    const targetText = str(raw.target);
    const target: UploadTarget | null =
      targetText === 'new'
        ? { mode: 'new' }
        : /^replace:[A-Za-z0-9][A-Za-z0-9._-]*$/.test(targetText)
          ? { mode: 'replace', projectId: targetText.slice('replace:'.length) }
          : null;
    if (!target) return { error: '올릴 방법이 정해지지 않은 폴더가 있습니다.' };
    let info: FolderInfo | null = null;
    if (target.mode === 'new') {
      if (!raw.info || typeof raw.info !== 'object') return { error: '새 시공 사례의 기본 정보가 없습니다.' };
      const rawInfo = raw.info as Record<string, unknown>;
      info = {
        title: str(rawInfo.title),
        categoryId: str(rawInfo.categoryId),
        newCategory: str(rawInfo.newCategory),
        location: str(rawInfo.location),
        area: str(rawInfo.area),
        year: str(rawInfo.year),
        materials: str(rawInfo.materials),
        blogUrl: str(rawInfo.blogUrl),
        description: str(rawInfo.description),
        featured: rawInfo.featured === true,
      };
    }
    if (!isImageAssetId(raw.coverAssetId)) return photoError;
    if (raw.beforeAssetId !== null && raw.beforeAssetId !== undefined && !isImageAssetId(raw.beforeAssetId)) return photoError;
    if (!Array.isArray(raw.groups)) return photoError;
    const groups: FolderGroup[] = [];
    for (const rawGroup of raw.groups) {
      const group = (rawGroup || {}) as Record<string, unknown>;
      const roomType = str(group.roomType).trim();
      if (!roomType || roomType.length > MAX_FOLDER_ROOM) return { error: `공간 이름은 1~${MAX_FOLDER_ROOM}자로 입력해 주세요.` };
      if (!Array.isArray(group.photos) || group.photos.length === 0) return photoError;
      const photos: FolderGroup['photos'] = [];
      for (const rawPhoto of group.photos) {
        const photo = (rawPhoto || {}) as Record<string, unknown>;
        if (!isImageAssetId(photo.assetId) || (photo.caption !== undefined && typeof photo.caption !== 'string')) return photoError;
        photos.push({ assetId: photo.assetId, caption: str(photo.caption).trim().slice(0, 200) });
        assetIds.add(photo.assetId);
      }
      groups.push({ roomType, photos });
    }
    const coverAssetId = raw.coverAssetId as string;
    const beforeAssetId = isImageAssetId(raw.beforeAssetId) ? raw.beforeAssetId : null;
    assetIds.add(coverAssetId);
    if (beforeAssetId) assetIds.add(beforeAssetId);
    folders.push({ title, target, info, coverAssetId, beforeAssetId, groups });
  }
  return { folders, assetIds: [...assetIds] };
}

// A new folder as the editor's form, so the same rules (buildProjectPatch) check and save it.
export function folderProjectInput(folder: FolderUpload, categoryId: string): ProjectFormInput {
  const info = folder.info;
  return {
    title: info?.title ?? folder.title,
    categoryId,
    location: info?.location ?? '',
    area: info?.area ?? '',
    year: info?.year ?? '',
    materials: info?.materials ?? '',
    blogUrl: info?.blogUrl ?? '',
    description: info?.description ?? '',
    displayOrder: '',
    featured: info?.featured === true,
    mainImageAssetId: folder.coverAssetId,
    mainImagePositionX: 50,
    mainImagePositionY: 50,
    beforeImageAssetId: folder.beforeAssetId ?? '',
    galleryGroups: folder.groups.map((group, groupIndex) => ({
      key: `group-${groupIndex + 1}`,
      title: group.roomType,
      roomType: group.roomType,
      images: group.photos.map((photo, imageIndex) => ({ key: `image-${groupIndex + 1}-${imageIndex + 1}`, assetId: photo.assetId, caption: photo.caption })),
    })),
  };
}

// The galleryGroups a photo replacement writes, in the shape the file-name upload always wrote.
export function galleryGroupsFromFolder(projectTitle: string, groups: readonly FolderGroup[]) {
  return groups.map((group, groupIndex) => ({
    _type: 'object',
    _key: `group-${groupIndex + 1}`,
    roomType: group.roomType,
    title: group.roomType,
    displayOrder: groupIndex + 1,
    images: group.photos.map((photo, imageIndex) => ({
      _type: 'image',
      _key: `image-${groupIndex + 1}-${imageIndex + 1}`,
      asset: { _type: 'reference', _ref: photo.assetId },
      ...(photo.caption ? { caption: photo.caption } : {}),
      displayOrder: imageIndex + 1,
      alt: `${projectTitle} ${group.roomType}`,
    })),
  }));
}

// What stops a new folder's information: 이름 and 공간 분류 (picked or typed), then the editor's own checks (평수, 시공 연도,
// 블로그 주소 …), run on stand-in photos.
export function folderInfoProblem(info: FolderInfo): string | null {
  if (!info.title.trim()) return '이름을 입력해 주세요.';
  if (!info.categoryId.trim() && !info.newCategory.trim()) return '공간 분류를 골라 주세요.';
  const folder: FolderUpload = { title: info.title, target: { mode: 'new' }, info, coverAssetId: 'image-check-1x1-jpg', beforeAssetId: null, groups: [] };
  const built = buildProjectPatch(folderProjectInput(folder, info.categoryId.trim() || 'new-category'));
  return built.ok ? null : built.error;
}
