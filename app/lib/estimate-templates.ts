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

export function templateLinesError(lines: unknown[]): string {
  return lines.length > TEMPLATE_LINE_MAX ? '템플릿은 2,000줄까지 저장할 수 있어요. 템플릿을 나눠 주세요.' : '';
}
