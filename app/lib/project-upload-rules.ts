// Folder uploads of 시공 사례 (manager bulk upload and scripts/upload-project-folders.mjs). Staff choose per folder whether it
// makes a new project or replaces one project's photos; nothing is matched by name on its own. Pure, no imports.
// Spec: docs/superpowers/specs/2026-11-21-portfolio-project-editor-design.md §3.2, §5.1

export type UploadTarget = { mode: 'new' } | { mode: 'replace'; projectId: string };

export type UploadResult = {
  projectTitle: string;
  status: 'created' | 'replaced' | 'skipped' | 'failed';
  projectId?: string;
  reason?: string;
  imageCount?: number;
  groupCount?: number;
};

// The upload's targets field: a JSON object of folder name → 'new' | 'replace:<project id>'. Anything else is dropped, so
// such a folder is skipped rather than guessed.
export function parseUploadTargets(raw: unknown): Map<string, UploadTarget> {
  const targets = new Map<string, UploadTarget>();
  if (typeof raw !== 'string') return targets;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return targets;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return targets;
  for (const [folder, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value === 'new') targets.set(folder, { mode: 'new' });
    else if (typeof value === 'string' && value.startsWith('replace:') && value.length > 'replace:'.length) {
      targets.set(folder, { mode: 'replace', projectId: value.slice('replace:'.length) });
    }
  }
  return targets;
}

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

export type UploadedPhoto = { path: string; assetId: string };
export type PhotoKind = 'cover' | 'before' | 'detail';
export type ParsedUploadPath = { projectTitle: string; kind: PhotoKind; roomType: string; order: number };
export type RoomPhotos = { roomType: string; photos: (UploadedPhoto & ParsedUploadPath)[] };
export type ProjectPhotoPlan = {
  // 대표 (or the first detail photo when there is none); null only when the folder has no usable photo.
  cover: (UploadedPhoto & ParsedUploadPath) | null;
  before: (UploadedPhoto & ParsedUploadPath) | null;
  groups: RoomPhotos[];
};

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
  const match = baseName.match(/^(.*?)[\s_-]*(\d+)$/);
  return { projectTitle, kind: 'detail', roomType: (match ? match[1] : baseName).trim() || '상세', order: match ? Number(match[2]) : 1 };
}

// Folders and rooms in Korean order with numbers read as numbers; photos of a room by their number, then their path.
export function planProjectPhotos(photos: readonly UploadedPhoto[]): Map<string, ProjectPhotoPlan> {
  const byProject = new Map<string, (UploadedPhoto & ParsedUploadPath)[]>();
  for (const photo of photos) {
    const parsed = { ...photo, ...parseUploadPath(photo.path) };
    const key = parsed.projectTitle.trim() || '기타';
    byProject.set(key, [...(byProject.get(key) || []), parsed]);
  }
  const plan = new Map<string, ProjectPhotoPlan>();
  for (const projectTitle of [...byProject.keys()].sort((a, b) => koreanOrder.compare(a, b))) {
    const items = byProject.get(projectTitle) || [];
    const details = items.filter((item) => item.kind === 'detail');
    const rooms = new Map<string, (UploadedPhoto & ParsedUploadPath)[]>();
    for (const item of details) rooms.set(item.roomType, [...(rooms.get(item.roomType) || []), item]);
    const groups = [...rooms.keys()]
      .sort((a, b) => koreanOrder.compare(a, b))
      .map((roomType) => ({
        roomType,
        photos: [...(rooms.get(roomType) || [])].sort((a, b) => a.order - b.order || koreanOrder.compare(a.path, b.path)),
      }));
    plan.set(projectTitle, {
      cover: items.find((item) => item.kind === 'cover') || details[0] || null,
      before: items.find((item) => item.kind === 'before') || null,
      groups,
    });
  }
  return plan;
}

// The project's galleryGroups: one group per room, one image per photo, captioned with its file name.
export function galleryGroupsFromPhotos(projectTitle: string, groups: readonly RoomPhotos[]) {
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
      caption: stripExtension(photo.path.split(/[\\/]+/).filter(Boolean).pop() || photo.path),
      displayOrder: photo.order || imageIndex + 1,
      alt: `${projectTitle} ${group.roomType}`,
    })),
  }));
}

// A Sanity image asset id: image-<hash>-<width>x<height>-<format>.
export function isImageAssetId(value: unknown): value is string {
  return typeof value === 'string' && /^image-[A-Za-z0-9]+-\d+x\d+-[a-z0-9]+$/.test(value);
}

// The bulk-upload request: every photo must carry a path and a Sanity image asset id, or nothing is written (a photo that
// went missing on the way would otherwise leave a project short of it). targets may come as the JSON string the page sends
// or as an object.
export function readBulkUploadBody(
  body: unknown,
): { photos: UploadedPhoto[]; targets: string; categoryId: string; category: string } | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: '요청 형식이 올바르지 않습니다.' };
  const raw = body as Record<string, unknown>;
  if (!Array.isArray(raw.photos) || raw.photos.length === 0) return { error: '올린 사진이 없습니다.' };
  const photos: UploadedPhoto[] = [];
  for (const item of raw.photos) {
    const photo = item as Partial<UploadedPhoto> | null;
    if (!photo || typeof photo.path !== 'string' || !photo.path.trim() || !isImageAssetId(photo.assetId)) {
      return { error: '사진 정보가 올바르지 않습니다. 다시 올려 주세요.' };
    }
    photos.push({ path: photo.path, assetId: photo.assetId });
  }
  const targets =
    typeof raw.targets === 'string' ? raw.targets : raw.targets && typeof raw.targets === 'object' ? JSON.stringify(raw.targets) : '';
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  return { photos, targets, categoryId: text(raw.categoryId), category: text(raw.category) };
}

// A folder's target, also when the page sent its name with spaces around it (the server reads folder names trimmed).
export function findUploadTarget(targets: ReadonlyMap<string, UploadTarget>, projectTitle: string): UploadTarget | undefined {
  const exact = targets.get(projectTitle);
  if (exact) return exact;
  for (const [folder, target] of targets) if (folder.trim() === projectTitle.trim()) return target;
  return undefined;
}
