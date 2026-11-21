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
