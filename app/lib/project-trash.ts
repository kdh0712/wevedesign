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
