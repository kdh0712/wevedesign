// The 시공 사례 form (manager 홈페이지 > 시공 사례): what it accepts and the Sanity patch it saves. Shared by the screen and
// the office API, pure with no imports, so Node tests can load it directly.
// Spec: docs/superpowers/specs/2026-11-21-portfolio-project-editor-design.md §4

export type EditableImage = { key: string; assetId: string; url?: string; alt?: string; caption?: string };
export type EditableGroup = { key: string; title: string; roomType?: string; images: EditableImage[] };

export type ProjectFormInput = {
  title: string;
  categoryId: string;
  location: string;
  area: string;
  year: string;
  materials: string;
  blogUrl: string;
  description: string;
  displayOrder: string;
  featured: boolean;
  mainImageAssetId: string;
  mainImagePositionX: number;
  mainImagePositionY: number;
  // '' means the project has no 시공 전 사진 (or staff removed it).
  beforeImageAssetId: string;
  galleryGroups: EditableGroup[];
};

export type ProjectPatch = { set: Record<string, unknown>; unset: string[] };

const MAX_TITLE = 80;
const MAX_GROUP_TITLE = 20;
const PHOTO_ERROR = '사진 정보가 올바르지 않습니다. 새로고침한 뒤 다시 시도해 주세요.';

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

// '' for no link; https:// is added when the scheme is missing; anything but an http(s) web address is refused (null), so a
// link on the homepage can never run script or point at another kind of resource.
export function normalizeBlogUrl(value: string): string | null {
  const trimmed = text(value);
  if (!trimmed) return '';
  if (/\s/.test(trimmed)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return withScheme;
  } catch {
    return null;
  }
}

export function isSanityImageAssetId(value: string): boolean {
  return /^image-[A-Za-z0-9]+-\d+x\d+-[a-z0-9]+$/.test(value);
}

const imageField = (assetId: string, alt: string) => ({ _type: 'image', asset: { _type: 'reference', _ref: assetId }, alt });

const focus = (value: number) => (Number.isFinite(value) ? Math.round(Math.min(100, Math.max(0, value))) : 50);

export function buildProjectPatch(input: ProjectFormInput): { ok: true; patch: ProjectPatch } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  // A blank optional field is removed from the document, never saved as '' or 0.
  const optional = (key: string, value: unknown) => {
    if (value === '' || value === undefined) unset.push(key);
    else set[key] = value;
  };

  const title = text(input.title);
  if (!title) return fail('이름을 입력해 주세요.');
  if (title.length > MAX_TITLE) return fail(`이름은 ${MAX_TITLE}자까지 입력할 수 있습니다.`);
  set.title = title;

  const categoryId = text(input.categoryId);
  if (!categoryId) return fail('공간 분류를 골라 주세요.');
  set.category = { _type: 'reference', _ref: categoryId };

  const area = text(input.area);
  if (area) {
    const value = Number(area);
    if (!Number.isFinite(value) || value <= 0) return fail('평수는 0보다 큰 숫자로 입력해 주세요.');
    set.area = value;
  } else unset.push('area');

  const order = text(input.displayOrder);
  if (order) {
    if (!/^\d+$/.test(order)) return fail('보이는 순서는 0 이상의 정수로 입력해 주세요.');
    set.displayOrder = Number(order);
  } else unset.push('displayOrder');

  const year = text(input.year);
  if (year && !/^\d{4}$/.test(year)) return fail('시공 연도는 4자리로 입력해 주세요.');
  optional('year', year);

  const blogUrl = normalizeBlogUrl(input.blogUrl);
  if (blogUrl === null) return fail('블로그 주소를 확인해 주세요.');
  optional('blogUrl', blogUrl);

  optional('location', text(input.location));
  optional('materials', text(input.materials));
  optional('description', text(input.description));
  set.featured = input.featured === true;
  set.mainImagePositionX = focus(input.mainImagePositionX);
  set.mainImagePositionY = focus(input.mainImagePositionY);

  // The representative photo can be replaced but never removed.
  const mainAssetId = text(input.mainImageAssetId);
  if (mainAssetId) {
    if (!isSanityImageAssetId(mainAssetId)) return fail(PHOTO_ERROR);
    set.mainImage = imageField(mainAssetId, `${title} 대표 사진`);
  }

  const beforeAssetId = text(input.beforeImageAssetId);
  if (beforeAssetId) {
    if (!isSanityImageAssetId(beforeAssetId)) return fail(PHOTO_ERROR);
    set.beforeImage = imageField(beforeAssetId, `${title} 시공 전 사진`);
  } else unset.push('beforeImage');

  const groups = [];
  for (const [groupIndex, group] of (input.galleryGroups || []).entries()) {
    const groupTitle = text(group.title);
    if (!groupTitle || groupTitle.length > MAX_GROUP_TITLE) return fail(`묶음 이름은 1~${MAX_GROUP_TITLE}자로 입력해 주세요.`);
    const images = [];
    for (const [imageIndex, image] of (group.images || []).entries()) {
      const assetId = text(image.assetId);
      if (!isSanityImageAssetId(assetId) || !text(image.key)) return fail(PHOTO_ERROR);
      const caption = text(image.caption);
      images.push({
        ...imageField(assetId, `${title} ${groupTitle}`),
        _key: text(image.key),
        ...(caption ? { caption } : {}),
        displayOrder: imageIndex + 1,
      });
    }
    if (!text(group.key)) return fail(PHOTO_ERROR);
    groups.push({
      _type: 'object',
      _key: text(group.key),
      title: groupTitle,
      roomType: text(group.roomType) || groupTitle,
      displayOrder: groupIndex + 1,
      images,
    });
  }
  set.galleryGroups = groups;
  // Groups replace the old single-photo list; a project still on the old list keeps it until staff convert it.
  if (groups.length > 0) unset.push('gallery');

  return { ok: true, patch: { set, unset } };
}

// What publishing needs, checked on the stored project by the server and on the form by the screen.
export function publishBlockReason(project: { title?: string; categoryId?: string; mainImageAssetId?: string }): string | null {
  if (!text(project.title)) return '이름을 입력해 주세요.';
  if (!text(project.categoryId)) return '공간 분류를 골라 주세요.';
  if (!text(project.mainImageAssetId)) return '대표 사진을 골라 주세요.';
  return null;
}

// The old single-photo list (gallery) as one group named '사진', in its order.
export function legacyGalleryToGroup(images: EditableImage[]): EditableGroup {
  return { key: 'group-legacy', title: '사진', roomType: '사진', images: [...images] };
}

export function hasDuplicateTitle(title: string, projectId: string, projects: Array<{ _id: string; title?: string }>): boolean {
  const wanted = text(title);
  if (!wanted) return false;
  return projects.some((project) => project._id !== projectId && text(project.title) === wanted);
}

const trimDeep = (value: unknown): unknown => {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(trimDeep);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, trimDeep(item)]));
  return value;
};

export function isProjectFormDirty(initial: ProjectFormInput, current: ProjectFormInput): boolean {
  return JSON.stringify(trimDeep(initial)) !== JSON.stringify(trimDeep(current));
}
