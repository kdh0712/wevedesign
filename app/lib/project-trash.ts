// 시공 사례 휴지통 (spec docs/superpowers/specs/2026-11-27-project-trash-design.md): [삭제] moves a project to the 휴지통
// (deletedAt / deletedBy, as the office records' 휴지통), [되돌리기] brings it back as it was, and [완전히 삭제] removes it
// for good (총괄 관리자 only). Pure, no imports, so the Node tests load it directly.

export type ProjectTrashAction = 'trash' | 'restore' | 'deleteForever';

const ACTIONS: readonly ProjectTrashAction[] = ['trash', 'restore', 'deleteForever'];

export function readProjectTrashAction(value: unknown): ProjectTrashAction | null {
  return ACTIONS.find((action) => action === value) ?? null;
}

export function isTrashedProject(project: { deletedAt?: unknown }): boolean {
  return typeof project.deletedAt === 'string' && project.deletedAt !== '';
}

// The list's projects and the 휴지통's (newest deletion first).
export function splitTrashedProjects<P extends { deletedAt?: unknown }>(projects: readonly P[]): { active: P[]; trashed: P[] } {
  const active = projects.filter((project) => !isTrashedProject(project));
  const trashed = projects
    .filter(isTrashedProject)
    .sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
  return { active, trashed };
}

// Why the server refuses an action on the project as stored now (null when it may go ahead).
export function projectTrashBlock(
  action: ProjectTrashAction,
  stored: { deletedAt?: unknown } | null,
  isAdmin: boolean,
): { status: number; error: string } | null {
  if (!stored) return { status: 404, error: '시공 사례를 찾을 수 없습니다. 이미 완전히 삭제되었을 수 있습니다.' };
  const trashed = isTrashedProject(stored);
  if (action === 'trash') return trashed ? { status: 409, error: '이미 휴지통에 있는 시공 사례입니다.' } : null;
  if (action === 'restore') return trashed ? null : { status: 409, error: '휴지통에 없는 시공 사례입니다.' };
  if (!isAdmin) return { status: 403, error: '완전히 삭제는 총괄 관리자만 할 수 있습니다.' };
  return trashed ? null : { status: 409, error: '휴지통에 있는 시공 사례만 완전히 삭제할 수 있습니다.' };
}

// [선택] (spec docs/superpowers/specs/2026-11-27-project-trash-bulk-design.md): the same three actions on several
// projects at once. The manager list reads at most 200 projects, so one request takes at most 200.
export const MAX_TRASH_BATCH = 200;

export function readProjectTrashIds(value: unknown): string[] | { error: string } {
  if (Array.isArray(value) && value.length === 0) return { error: '고른 시공 사례가 없습니다.' };
  const invalid = { error: '고른 시공 사례 목록이 올바르지 않습니다.' };
  if (!Array.isArray(value)) return invalid;
  const ids = new Set<string>();
  for (const id of value) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) || id.startsWith('drafts.') || ids.has(id)) return invalid;
    ids.add(id);
  }
  if (ids.size > MAX_TRASH_BATCH) return { error: `한 번에 ${MAX_TRASH_BATCH}개까지 고를 수 있습니다.` };
  return [...ids];
}

// Which picked projects the action goes ahead on, as they are stored now. One another screen already changed is
// skipped and counted; when none is left, the whole request is refused.
export function planProjectTrashBatch(
  action: ProjectTrashAction,
  ids: readonly string[],
  stored: ReadonlyArray<{ _id: string; deletedAt?: unknown }>,
  isAdmin: boolean,
): { allowed: string[]; skipped: number } | { refused: { status: number; error: string } } {
  if (action === 'deleteForever' && !isAdmin) return { refused: { status: 403, error: '완전히 삭제는 총괄 관리자만 할 수 있습니다.' } };
  const byId = new Map(stored.map((project) => [project._id, project]));
  const allowed = ids.filter((id) => !projectTrashBlock(action, byId.get(id) ?? null, isAdmin));
  if (allowed.length === 0) {
    const error = action === 'trash' ? '고른 시공 사례는 이미 휴지통에 있거나 완전히 삭제되었습니다.' : '고른 시공 사례는 이미 되돌렸거나 완전히 삭제되었습니다.';
    return { refused: { status: 409, error } };
  }
  return { allowed, skipped: ids.length - allowed.length };
}

// The names a confirm box lists: the first five, then how many more.
export function pickedProjectNames(titles: readonly string[], shown = 5): string {
  const lines = titles.slice(0, shown).map((title) => `· ${title || '이름 없음'}`);
  if (titles.length > shown) lines.push(`외 ${titles.length - shown}개`);
  return lines.join('\n');
}
