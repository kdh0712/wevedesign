import { templateGroupLabel, type TemplateLine } from './estimate-templates.ts';

// 세부내역서 품명 한 줄로 합치기 (spec docs/superpowers/specs/2026-11-25-detail-one-line-design.md). A 품명 with two or
// more lines in one 공사, any of them marked, is drawn on the 세부내역서 as one line: empty 규격, 단위 '식', 수량 1,
// 단가 = the lines' summed amount. Amounts never change; only the documents' rows do. 품명 and 공사 match as the
// documents match them (trimmed 품명, templateGroupLabel).
// A mark (`detailOneLine`) holds the 품명 it was set for, so a line given another 품명 (re-picked, retyped) is no longer
// marked and never pulls its new 품명 into one line.

export type OneLineLine = TemplateLine & { detailOneLine?: string };

const nameOf = (line: TemplateLine) => String(line?.name ?? '').trim();
const oneLineKey = (line: TemplateLine) => `${templateGroupLabel(line)}\u0000${nameOf(line)}`;
const number = (value: unknown) => Number(value) || 0;
const isMarked = (line: OneLineLine) => Boolean(nameOf(line)) && line.detailOneLine === nameOf(line);

// The lines of each named 품명, by 공사 + 품명.
function namedGroups<T extends OneLineLine>(lines: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const line of lines) {
    if (!nameOf(line)) continue;
    const key = oneLineKey(line);
    groups.set(key, [...(groups.get(key) || []), line]);
  }
  return groups;
}

function mergedKeys<T extends OneLineLine>(lines: T[]): Set<string> {
  return new Set(
    [...namedGroups(lines)].filter(([, group]) => group.length > 1 && group.some(isMarked)).map(([key]) => key),
  );
}

// Whether the line's 품명 has two or more lines in its 공사, so the line menu offers to draw them as one.
export function canMergeDetailLine<T extends OneLineLine>(lines: T[], lineId: string): boolean {
  const line = lines.find((item) => item.id === lineId);
  if (!line || !nameOf(line)) return false;
  return (namedGroups(lines).get(oneLineKey(line))?.length || 0) > 1;
}

// Ids of the lines the 세부내역서 draws as one, including a line added later to a marked 품명.
export function mergedDetailLineIds<T extends OneLineLine>(lines: T[]): Set<string> {
  const keys = mergedKeys(lines);
  return new Set(lines.filter((line) => nameOf(line) && keys.has(oneLineKey(line))).map((line) => line.id));
}

// Turns the line's 품명 (in its 공사) to one line, marking all its lines with the 품명, or, when it is drawn as one line,
// back to separate lines, clearing them all.
export function toggleDetailOneLine<T extends OneLineLine>(lines: T[], lineId: string): T[] {
  const target = lines.find((item) => item.id === lineId);
  if (!target || !nameOf(target)) return lines;
  const key = oneLineKey(target);
  const sameName = (line: T) => Boolean(nameOf(line)) && oneLineKey(line) === key;
  const turnOn = !mergedKeys(lines).has(key);
  return lines.map((line) => {
    if (!sameName(line)) return line;
    if (turnOn) return { ...line, detailOneLine: nameOf(line) };
    const next = { ...line };
    delete next.detailOneLine;
    return next;
  });
}

// The lines as the 세부내역서 draws them: each merged 품명 becomes one line where its first line was (id `<first>-one-line`),
// its 비고 the lines' distinct notes joined with ' · '.
export function mergeDetailOneLines<T extends OneLineLine>(lines: T[]): T[] {
  const keys = mergedKeys(lines);
  if (keys.size === 0) return lines;
  const groups = namedGroups(lines);
  const drawn = new Set<string>();
  const result: T[] = [];
  for (const line of lines) {
    const key = nameOf(line) ? oneLineKey(line) : '';
    if (!key || !keys.has(key)) {
      result.push(line);
      continue;
    }
    if (drawn.has(key)) continue;
    drawn.add(key);
    const group = groups.get(key) || [line];
    const notes = [...new Set(group.map((item) => String(item.note ?? '').trim()).filter(Boolean))];
    result.push({
      ...line,
      id: `${line.id}-one-line`,
      name: nameOf(line),
      space: '',
      spec: '',
      unit: '식',
      quantity: 1,
      customerUnitPrice: group.reduce((sum, item) => sum + number(item.quantity) * number(item.customerUnitPrice), 0),
      executionUnitPrice: group.reduce((sum, item) => sum + number(item.quantity) * number(item.executionUnitPrice), 0),
      note: notes.join(' · '),
    });
  }
  return result;
}
