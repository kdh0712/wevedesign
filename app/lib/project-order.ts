// 시공 사례 순서 (spec docs/superpowers/specs/2026-11-27-project-order-drag-design.md): the homepage and the manager list order
// projects by their 보이는 순서 (displayOrder) only, and [순서 변경] sets it by dragging. Pure, no imports, so the Node tests
// load it directly.

// The homepage query puts projects without a 보이는 순서 after every numbered one with this stand-in
// (portfolio-data.ts projectQuery).
export const UNORDERED_PROJECT_ORDER = 1_000_000;
const MAX_ORDERED_PROJECTS = 1000;

// By 보이는 순서 (none last), then the order given (the list arrives newest first). 메인 표시 does not move a project.
export function sortProjectsByOrder<P extends { displayOrder?: number | null }>(projects: readonly P[]): P[] {
  const orderOf = (project: P) => (typeof project.displayOrder === 'number' ? project.displayOrder : UNORDERED_PROJECT_ORDER);
  return projects
    .map((project, index) => ({ project, index }))
    .sort((a, b) => orderOf(a.project) - orderOf(b.project) || a.index - b.index)
    .map(({ project }) => project);
}

// One drag: the item at `from` goes to where the item at `to` was.
export function moveInOrder<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// The ids of a [순서 저장] request, top first: unique published project ids.
export function readProjectOrder(value: unknown): string[] | { error: string } {
  if (!Array.isArray(value) || value.length === 0) return { error: '순서를 정할 시공 사례가 없습니다.' };
  const ids = new Set<string>();
  for (const id of value) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) || id.startsWith('drafts.') || ids.has(id)) {
      return { error: '시공 사례 목록이 올바르지 않습니다.' };
    }
    ids.add(id);
  }
  if (ids.size > MAX_ORDERED_PROJECTS) return { error: '시공 사례 목록이 올바르지 않습니다.' };
  return [...ids];
}
