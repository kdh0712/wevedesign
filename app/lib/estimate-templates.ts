// 견적 템플릿 rules (spec docs/superpowers/specs/2026-10-22-estimate-templates-design.md). No imports, so the node tests
// load this file directly; the page, the dialogs and the API all use it.

export type TemplateLine = {
  id: string;
  space: string;
  category: string;
  process: string;
  name: string;
  spec: string;
  unit: string;
  quantity: number;
  customerUnitPrice: number;
  executionUnitPrice: number;
  note: string;
  commonName?: boolean;
  // The 자재 DB item the line was picked from; its current 단가 is what a template load uses.
  materialId?: string;
};

export type TemplateMaterial = { _id?: string; name?: string; spec?: string; unit?: string; unitPrice?: number };
// The boxes that are ticked, by label (NO_CATEGORY / NO_SPACE for blank values).
export type TemplateSelection = { categories: string[]; spaces: string[] };
export type TemplateRefreshResult = {
  lines: TemplateLine[];
  changed: Array<{ name: string; before: number; after: number }>;
  notFound: string[];
};

export const NO_CATEGORY = '(카테고리 없음)';
export const NO_SPACE = '(공간 없음)';
export const TEMPLATE_NAME_MAX = 60;
export const TEMPLATE_LINE_MAX = 2000;

const text = (value: unknown) => (typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value));
const key = (value: unknown) => text(value).trim();
const nameKey = (value: unknown) => text(value).replace(/\s/g, '').toLowerCase();
const number = (value: unknown, fallback = 0) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const categoryLabel = (line: TemplateLine) => key(line.category) || NO_CATEGORY;
const spaceLabel = (line: TemplateLine) => key(line.space) || NO_SPACE;
const lineLabel = (line: TemplateLine) => key(line.name) || '(품명 없음)';

export function normalizeTemplateLines(raw: unknown): TemplateLine[] {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
    .map((item) => ({
      id: text(item.id),
      space: text(item.space),
      category: text(item.category),
      process: text(item.process),
      name: text(item.name),
      spec: text(item.spec),
      unit: text(item.unit),
      quantity: number(item.quantity, 1),
      customerUnitPrice: number(item.customerUnitPrice),
      executionUnitPrice: number(item.executionUnitPrice),
      note: text(item.note),
      ...(item.commonName === true ? { commonName: true } : {}),
      ...(key(item.materialId) ? { materialId: key(item.materialId) } : {}),
    }));
}

function countLabels(lines: TemplateLine[], labelOf: (line: TemplateLine) => string) {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const label = labelOf(line);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts].map(([label, count]) => ({ label, count }));
}

export function templateSelectionOptions(lines: TemplateLine[]) {
  return { categories: countLabels(lines, categoryLabel), spaces: countLabels(lines, spaceLabel) };
}

export function filterTemplateLines(lines: TemplateLine[], selection: TemplateSelection): TemplateLine[] {
  const categories = new Set(selection.categories);
  const spaces = new Set(selection.spaces);
  return lines.filter((line) => categories.has(categoryLabel(line)) && spaces.has(spaceLabel(line)));
}

// 1) the remembered item, 2) for a non-common line, the one item with the same 품명·규격·단위. Two or more such items
// are not guessed between.
export function findTemplateMaterial(line: TemplateLine, materials: TemplateMaterial[]): TemplateMaterial | null {
  const id = key(line.materialId);
  if (id) {
    const remembered = materials.find((material) => material._id === id);
    if (remembered) return remembered;
  }
  if (line.commonName) return null;
  const matches = materials.filter(
    (material) => key(material.name) === key(line.name) && key(material.spec) === key(line.spec) && key(material.unit) === key(line.unit),
  );
  return matches.length === 1 ? matches[0] : null;
}

export function refreshTemplateLines(lines: TemplateLine[], materials: TemplateMaterial[], newId: () => string): TemplateRefreshResult {
  const changed: TemplateRefreshResult['changed'] = [];
  const notFound: string[] = [];
  const refreshed = lines.map((line) => {
    const material = findTemplateMaterial(line, materials);
    if (!material) {
      notFound.push(lineLabel(line));
      return { ...line, id: newId() };
    }
    const price = number(material.unitPrice);
    if (line.customerUnitPrice !== price || line.executionUnitPrice !== price) {
      changed.push({ name: lineLabel(line), before: line.customerUnitPrice, after: price });
    }
    return {
      ...line,
      id: newId(),
      name: line.commonName ? line.name : text(material.name) || line.name,
      spec: text(material.spec),
      unit: text(material.unit),
      customerUnitPrice: price,
      executionUnitPrice: price,
      ...(material._id ? { materialId: material._id } : {}),
    };
  });
  return { lines: refreshed, changed, notFound };
}

// A template load uses the page's materials only when the server's material version is known and equals the cached one;
// a missing version on either side is not proof that nothing changed.
export function isMaterialListCurrent(cachedVersionKey: string | null, serverVersionKey: string | null, cachedCount: number): boolean {
  return Boolean(cachedVersionKey && serverVersionKey && cachedVersionKey === serverVersionKey && cachedCount > 0);
}

export function isBlankEstimateLine(line: TemplateLine): boolean {
  return !key(line.name) && !key(line.spec) && !key(line.note) && !number(line.customerUnitPrice) && !number(line.executionUnitPrice);
}

export function placeTemplateLines<T extends TemplateLine>(current: T[], incoming: T[], mode: 'replace' | 'append'): T[] {
  if (mode === 'replace') return incoming;
  return [...current.filter((line) => !isBlankEstimateLine(line)), ...incoming];
}

export function templateCustomerTotal(lines: TemplateLine[]): number {
  return Math.round(lines.reduce((sum, line) => sum + number(line.quantity) * number(line.customerUnitPrice), 0)) || 0;
}

export function templateNameError(name: string, otherNames: string[]): string {
  const trimmed = key(name);
  if (!trimmed) return '템플릿 이름을 입력해 주세요.';
  if (trimmed.length > TEMPLATE_NAME_MAX) return `템플릿 이름은 ${TEMPLATE_NAME_MAX}자까지 쓸 수 있어요.`;
  if (otherNames.some((other) => nameKey(other) === nameKey(trimmed))) return '같은 이름의 템플릿이 이미 있어요.';
  return '';
}

// "<name> 복사", then "<name> 복사 2", 3, …: free of every name in names, and cut so the result fits TEMPLATE_NAME_MAX.
export function templateCopyName(name: string, names: string[]): string {
  const taken = new Set(names.map(nameKey));
  for (let n = 1; ; n += 1) {
    const suffix = n === 1 ? ' 복사' : ` 복사 ${n}`;
    const candidate = `${key(name).slice(0, TEMPLATE_NAME_MAX - suffix.length).trim()}${suffix}`;
    if (!taken.has(nameKey(candidate))) return candidate;
  }
}

// A line picked again from the 자재 DB: the first picked line takes the old line's place, id, 공간, 수량 and 비고; further
// lines of a 공통 pick follow it in the same 공간.
export function repickTemplateLine<T extends TemplateLine>(lines: T[], lineId: string, picked: T[]): T[] {
  const index = lines.findIndex((line) => line.id === lineId);
  if (index < 0 || !picked.length) return lines;
  const old = lines[index];
  const [first, ...rest] = picked;
  const placed = [
    { ...first, id: old.id, space: old.space, quantity: old.quantity, note: old.note },
    ...rest.map((line) => ({ ...line, space: old.space })),
  ];
  return [...lines.slice(0, index), ...placed, ...lines.slice(index + 1)];
}

// The 공사 a line belongs to in the template editor and its 세부내역서 preview: the same rule as the estimate documents
// (카테고리, else 공정, else 기타 공사).
export function templateGroupLabel(line: TemplateLine): string {
  return key(line.category) || key(line.process) || '기타 공사';
}

export type TemplateGroup<T extends TemplateLine = TemplateLine> = { label: string; lines: T[]; customerTotal: number; executionTotal: number };

export function groupTemplateLines<T extends TemplateLine>(lines: T[]): Array<TemplateGroup<T>> {
  const groups = new Map<string, T[]>();
  for (const line of lines) {
    const label = templateGroupLabel(line);
    groups.set(label, [...(groups.get(label) || []), line]);
  }
  return [...groups].map(([label, groupLines]) => ({
    label,
    lines: groupLines,
    customerTotal: templateCustomerTotal(groupLines),
    executionTotal: Math.round(groupLines.reduce((sum, line) => sum + number(line.quantity) * number(line.executionUnitPrice), 0)) || 0,
  }));
}

const flattenGroups = <T extends TemplateLine>(groups: Array<{ lines: T[] }>) => groups.flatMap((group) => group.lines);

export function orderTemplateLinesByGroup<T extends TemplateLine>(lines: T[]): T[] {
  return flattenGroups(groupTemplateLines(lines));
}

// Every change below also gathers each 공사's lines together, in the order the 공사 first appear.
export function moveTemplateGroup<T extends TemplateLine>(lines: T[], label: string, offset: number): T[] {
  const groups = groupTemplateLines(lines);
  const index = groups.findIndex((group) => group.label === label);
  const target = index + offset;
  if (index >= 0 && target >= 0 && target < groups.length) [groups[index], groups[target]] = [groups[target], groups[index]];
  return flattenGroups(groups);
}

export function moveTemplateLineInGroup<T extends TemplateLine>(lines: T[], lineId: string, offset: number): T[] {
  const groups = groupTemplateLines(lines);
  for (const group of groups) {
    const index = group.lines.findIndex((line) => line.id === lineId);
    const target = index + offset;
    if (index >= 0 && target >= 0 && target < group.lines.length) {
      const next = [...group.lines];
      [next[index], next[target]] = [next[target], next[index]];
      group.lines = next;
    }
  }
  return flattenGroups(groups);
}

// Lines added to a 공사 take its 카테고리 and follow its last line; a 공사 that is not there yet starts at the end.
export function insertIntoTemplateGroup<T extends TemplateLine>(lines: T[], label: string, added: T[]): T[] {
  const name = key(label);
  const tagged = added.map((line) => ({ ...line, category: name }));
  const groups = groupTemplateLines(lines);
  const group = groups.find((item) => item.label === name);
  if (group) group.lines = [...group.lines, ...tagged];
  return group ? flattenGroups(groups) : [...flattenGroups(groups), ...tagged];
}

// The line leaves its 공사 without moving the other 공사 around, and goes to the end of its new one.
export function setTemplateLineCategory<T extends TemplateLine>(lines: T[], lineId: string, category: string): T[] {
  const line = lines.find((item) => item.id === lineId);
  if (!line) return lines;
  const next = { ...line, category: key(category) };
  const groups = groupTemplateLines(lines);
  if (templateGroupLabel(next) === templateGroupLabel(line)) {
    return flattenGroups(groups).map((item) => (item.id === lineId ? next : item));
  }
  const remaining = groups
    .map((group) => ({ ...group, lines: group.lines.filter((item) => item.id !== lineId) }))
    .filter((group) => group.lines.length);
  const target = remaining.find((group) => group.label === templateGroupLabel(next));
  if (target) target.lines = [...target.lines, next];
  return target ? flattenGroups(remaining) : [...flattenGroups(remaining), next];
}

// The 공사 already named like this, comparing as template names do (spaces and case ignored), or null.
export function findTemplateGroupLabel(lines: TemplateLine[], label: string): string | null {
  const wanted = nameKey(label);
  return groupTemplateLines(lines).find((group) => nameKey(group.label) === wanted)?.label ?? null;
}

export function templateGroupExists(lines: TemplateLine[], label: string): boolean {
  return findTemplateGroupLabel(lines, label) !== null;
}

// New lines at the end of their 공사 (a new 공사 at the end); blank rows already there stay.
export function appendTemplateLines<T extends TemplateLine>(lines: T[], added: T[]): T[] {
  return orderTemplateLinesByGroup([...lines, ...added]);
}

// Renames a 공사: every line takes the new 카테고리. A name another 공사 already has merges the lines after its own.
export function renameTemplateGroup<T extends TemplateLine>(lines: T[], from: string, to: string): T[] {
  const name = key(to);
  const groups = groupTemplateLines(lines);
  const source = groups.find((group) => group.label === key(from));
  if (!name || !source) return lines;
  const target = groups.find((group) => group !== source && nameKey(group.label) === nameKey(name));
  const renamed = source.lines.map((line) => ({ ...line, category: target ? target.label : name }));
  if (target) {
    target.lines = [...target.lines, ...renamed];
    return flattenGroups(groups.filter((group) => group !== source));
  }
  source.lines = renamed;
  return flattenGroups(groups);
}

// "<공사> 복사", then "<공사> 복사 2", 3, … : a name no 공사 has yet.
export function templateCopyGroupName(label: string, labels: string[]): string {
  const taken = new Set(labels.map(nameKey));
  for (let n = 1; ; n += 1) {
    const candidate = `${key(label)}${n === 1 ? ' 복사' : ` 복사 ${n}`}`;
    if (!taken.has(nameKey(candidate))) return candidate;
  }
}

export function copyTemplateGroup<T extends TemplateLine>(lines: T[], label: string, newLabel: string, newId: () => string): T[] {
  const groups = groupTemplateLines(lines);
  const index = groups.findIndex((group) => group.label === key(label));
  if (index < 0) return lines;
  const copies = groups[index].lines.map((line) => ({ ...line, id: newId(), category: key(newLabel) }));
  return [...flattenGroups(groups.slice(0, index + 1)), ...copies, ...flattenGroups(groups.slice(index + 1))];
}

export function removeTemplateGroup<T extends TemplateLine>(lines: T[], label: string): { lines: T[]; removedIds: string[] } {
  const groups = groupTemplateLines(lines);
  const removed = groups.find((group) => group.label === key(label));
  return {
    lines: flattenGroups(groups.filter((group) => group !== removed)),
    removedIds: removed ? removed.lines.map((line) => line.id) : [],
  };
}

export function duplicateTemplateLine<T extends TemplateLine>(lines: T[], lineId: string, newId: () => string): T[] {
  const ordered = orderTemplateLinesByGroup(lines);
  const index = ordered.findIndex((line) => line.id === lineId);
  if (index < 0) return lines;
  return [...ordered.slice(0, index + 1), { ...ordered[index], id: newId() }, ...ordered.slice(index + 1)];
}

// A dragged line lands before another line of the same 공사, or at its end (null). Any other target changes nothing.
export function moveTemplateLineBefore<T extends TemplateLine>(lines: T[], lineId: string, beforeLineId: string | null): T[] {
  const groups = groupTemplateLines(lines);
  const group = groups.find((item) => item.lines.some((line) => line.id === lineId));
  if (!group || lineId === beforeLineId) return lines;
  if (beforeLineId !== null && !group.lines.some((line) => line.id === beforeLineId)) return lines;
  const moving = group.lines.find((line) => line.id === lineId)!;
  const rest = group.lines.filter((line) => line.id !== lineId);
  const at = beforeLineId === null ? rest.length : rest.findIndex((line) => line.id === beforeLineId);
  group.lines = [...rest.slice(0, at), moving, ...rest.slice(at)];
  return flattenGroups(groups);
}

// A dragged 공사 lands before another 공사, or at the end (null).
export function moveTemplateGroupBefore<T extends TemplateLine>(lines: T[], label: string, beforeLabel: string | null): T[] {
  const groups = groupTemplateLines(lines);
  const moving = groups.find((group) => group.label === key(label));
  if (!moving || key(label) === beforeLabel) return flattenGroups(groups);
  const rest = groups.filter((group) => group !== moving);
  const found = beforeLabel === null ? -1 : rest.findIndex((group) => group.label === key(beforeLabel));
  const at = found < 0 ? rest.length : found;
  return flattenGroups([...rest.slice(0, at), moving, ...rest.slice(at)]);
}

// The 공사 holding the estimate's 기본견적 line always comes first.
export function pinBaseGroupFirst<T extends TemplateLine>(lines: T[], isBase: (line: T) => boolean): T[] {
  const groups = groupTemplateLines(lines);
  const pinned = groups.filter((group) => group.lines.some(isBase));
  return flattenGroups([...pinned, ...groups.filter((group) => !pinned.includes(group))]);
}

// 공사 colors on screen only (never printed): a dark accent readable on white, and a soft background.
export const GROUP_COLORS: ReadonlyArray<{ accent: string; soft: string }> = [
  { accent: '#2563b8', soft: '#e8f0fb' },
  { accent: '#c2410c', soft: '#fdeee4' },
  { accent: '#15803d', soft: '#e6f4ea' },
  { accent: '#7c3aed', soft: '#f0eafd' },
  { accent: '#be185d', soft: '#fce8f1' },
  { accent: '#0e7490', soft: '#e1f3f6' },
  { accent: '#92400e', soft: '#f6ede2' },
  { accent: '#3730a3', soft: '#e9e8f8' },
];

export function groupColor(index: number) {
  return GROUP_COLORS[((index % GROUP_COLORS.length) + GROUP_COLORS.length) % GROUP_COLORS.length];
}

// Lines the 세부내역서 shows: those with a 품명, as the estimate documents. Saved lines may miss fields, so nothing here
// assumes a string.
export function namedTemplateLines<T extends TemplateLine>(lines: T[]): T[] {
  return lines.filter((line) => key(line?.name));
}

// "품명 · 규격" for delete questions, or '이 항목'.
export function templateLineLabel(line: Partial<TemplateLine>): string {
  return [key(line.name), key(line.spec)].filter(Boolean).join(' · ') || '이 항목';
}

// 평형에 맞춰 수량 조정 (spec 2026-10-23 §4): area units are ticked by default; any ticked unit is scaled.
const AREA_UNITS = new Set(['m2', '㎡', 'm²', '평']);

export function isAreaUnit(unit: string): boolean {
  return AREA_UNITS.has(text(unit).replace(/\s/g, '').toLowerCase());
}

export function templateUnitOptions(lines: TemplateLine[]): Array<{ unit: string; count: number; area: boolean }> {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const unit = key(line.unit);
    if (unit) counts.set(unit, (counts.get(unit) || 0) + 1);
  }
  return [...counts].map(([unit, count]) => ({ unit, count, area: isAreaUnit(unit) }));
}

// Quantities of lines in the ticked units × ratio, rounded to one decimal. A ratio that is not a positive number changes
// nothing.
export function scaleTemplateQuantities<T extends TemplateLine>(lines: T[], ratio: number, units: string[]): { lines: T[]; scaledCount: number } {
  if (!Number.isFinite(ratio) || ratio <= 0) return { lines, scaledCount: 0 };
  const ticked = new Set(units.map(key));
  let scaledCount = 0;
  const scaled = lines.map((line) => {
    if (!ticked.has(key(line.unit))) return line;
    scaledCount += 1;
    return { ...line, quantity: Math.round(number(line.quantity) * ratio * 10) / 10 };
  });
  return { lines: scaled, scaledCount };
}

const isBlankValue = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && !value.trim());

// 기준 평형 of a template: may be left empty; otherwise a number from 1 to 500.
export function templateBaseAreaError(value: unknown): string {
  if (isBlankValue(value)) return '';
  // Only a number, or a plain decimal like "24.5": not true, [30], "1e2" or "30평".
  const plain = typeof value === 'number' || (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim()));
  const area = plain ? Number(typeof value === 'string' ? value.trim() : value) : Number.NaN;
  return Number.isFinite(area) && area >= 1 && area <= 500 ? '' : '기준 평형은 1~500 사이 숫자로 넣어 주세요.';
}

export function normalizeBaseArea(value: unknown): number | null {
  if (isBlankValue(value) || templateBaseAreaError(value)) return null;
  return Number(typeof value === 'string' ? value.trim() : value);
}

// 현장 평형 ÷ 기준 평형, or NaN unless both are positive numbers (then nothing may be scaled).
export function templateAreaRatio(baseArea: string, siteArea: string): number {
  if (!key(baseArea) || !key(siteArea)) return Number.NaN;
  const base = Number(key(baseArea));
  const site = Number(key(siteArea));
  return Number.isFinite(base) && Number.isFinite(site) && base > 0 && site > 0 ? site / base : Number.NaN;
}

// While the site estimate is filtered to one 공간, lines added there take that 공간 so they do not vanish from view.
export function withTemplateSpace<T extends TemplateLine>(lines: T[], space: string): T[] {
  return space ? lines.map((line) => ({ ...line, space })) : lines;
}

// The 세부내역서 (preview and print) lists each 공사's lines gathered by 품명, in the order the 품명 first appear.
export function clusterTemplateLinesByName<T extends TemplateLine>(lines: T[]): T[] {
  const clusters = new Map<string, T[]>();
  for (const line of lines) {
    const name = key(line.name);
    clusters.set(name, [...(clusters.get(name) || []), line]);
  }
  return [...clusters.values()].flat();
}

// How many rows each 품명 cell spans: a run of the same 품명 shows it once (0 = covered by the row above). Blank names
// are never merged.
export function templateNameRowSpans(lines: TemplateLine[]): number[] {
  const spans = lines.map(() => 1);
  lines.forEach((line, index) => {
    const name = key(line.name);
    if (!name || spans[index] === 0) return;
    let end = index + 1;
    while (end < lines.length && key(lines[end].name) === name) {
      spans[end] = 0;
      end += 1;
    }
    spans[index] = end - index;
  });
  return spans;
}

export function templateLinesError(lines: unknown[]): string {
  return lines.length > TEMPLATE_LINE_MAX ? '템플릿은 2,000줄까지 저장할 수 있어요. 템플릿을 나눠 주세요.' : '';
}
