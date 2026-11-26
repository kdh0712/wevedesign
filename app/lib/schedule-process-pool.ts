// The 공정 작업 list beside the 공정 달력, by 공사 (spec docs/superpowers/specs/2026-11-26-schedule-bars-and-construction-pool-design.md
// §2): one card per 공사 (the line's 분류) with the 공정 it holds in small text. A card dropped on the calendar makes a task
// named after the 공사. Pure, no imports, so the Node tests load it directly.

export type PoolLine = { category?: string; process?: string; name?: string };
export type ConstructionGroup = { name: string; items: string[] };

// Lines with no 공사, and 실행 내역서 lines with no 공사 whose 공종 is not in the estimate.
export const POOL_OTHER_GROUP = '기타';
const POOL_ITEMS_SHOWN = 6;

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const squash = (value: string) => value.replace(/\s+/g, '');

// In the estimate's order, '기타' last. Under each 공사: each distinct 공종, or the 품명 when the 공종 is named like the 공사
// (imported estimates often repeat the 공사 as the 공종). 실행 내역서 lines join their 분류, else the 공사 of an estimate
// line with the same 공종.
export function buildConstructionPool(lines: readonly PoolLine[], workLines: readonly PoolLine[]): ConstructionGroup[] {
  const groups = new Map<string, { name: string; items: string[]; seen: Set<string> }>();
  // A 실행 line's 공종 → the estimate 공사 it belongs to. A 공사 name itself comes first: the 실행 공종 choices offer the
  // 공사 for estimate lines without a 공종 (workLineProcesses), so such a line joins that 공사 (review finding).
  const categoryOfProcess = new Map<string, string>();
  for (const line of lines) {
    const category = text(line.category);
    if (category && !categoryOfProcess.has(squash(category))) categoryOfProcess.set(squash(category), category);
  }
  for (const line of lines) {
    const category = text(line.category);
    const process = text(line.process);
    if (category && process && !categoryOfProcess.has(squash(process))) categoryOfProcess.set(squash(process), category);
  }

  const add = (groupName: string, process: string, name: string) => {
    const key = squash(groupName);
    let group = groups.get(key);
    if (!group) {
      group = { name: groupName, items: [], seen: new Set() };
      groups.set(key, group);
    }
    const item = process && squash(process) !== key ? process : name;
    if (item && !group.seen.has(squash(item))) {
      group.seen.add(squash(item));
      group.items.push(item);
    }
  };

  for (const line of lines) {
    const category = text(line.category);
    const process = text(line.process);
    const name = text(line.name);
    if (!category && !process && !name) continue;
    add(category || POOL_OTHER_GROUP, process, name);
  }
  for (const line of workLines) {
    const category = text(line.category);
    const process = text(line.process);
    const name = text(line.name);
    if (!category && !process && !name) continue;
    add(category || categoryOfProcess.get(squash(process)) || POOL_OTHER_GROUP, process, name);
  }

  const list = [...groups.values()].map(({ name, items }) => ({ name, items }));
  return [...list.filter((group) => group.name !== POOL_OTHER_GROUP), ...list.filter((group) => group.name === POOL_OTHER_GROUP)];
}

// The small text under a card: up to six 공정, else five and '외 N개'.
export function poolItemsLabel(items: readonly string[], max = POOL_ITEMS_SHOWN): string {
  if (items.length <= max) return items.join(' · ');
  return `${items.slice(0, max - 1).join(' · ')} 외 ${items.length - (max - 1)}개`;
}
