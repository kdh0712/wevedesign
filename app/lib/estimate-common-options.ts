// '공통' DB items and their saved sub-items (공통 항목). Pure functions only, with no imports, so the estimate page and the
// estimate API route share the same rules.
//
// A DB item whose 품명 is '공통' is used in many places with the same spec and price; the estimate line gets the real
// 품명 (for example '안방 욕실'). commonOptions keeps the 품명s staff use often, in their order, so they can be picked
// instead of typed.

export const COMMON_MATERIAL_NAME = '공통';
export const COMMON_OPTIONS_MAX_COUNT = 50;
export const COMMON_OPTION_MAX_LENGTH = 60;

// A leading list marker such as "1." / "2)" / "-" / "•". A number directly followed by another digit ("1.5m") is part of the name.
const LIST_MARKER = /^(?:\d{1,3}\s*[.)](?!\d)|[-*•·])\s*/;

export function isCommonMaterialName(name?: unknown) {
  return String(name ?? '').replace(/\s/g, '') === COMMON_MATERIAL_NAME;
}

function normalizeOption(value: string) {
  const unmarked = value.replace(/\s+/g, ' ').trim().replace(LIST_MARKER, '').trim();
  return Array.from(unmarked).slice(0, COMMON_OPTION_MAX_LENGTH).join('').trim();
}

function normalizeOptions(values: readonly string[]) {
  const options: string[] = [];
  for (const value of values) {
    const option = normalizeOption(value);
    if (option && !options.includes(option)) options.push(option);
    if (options.length >= COMMON_OPTIONS_MAX_COUNT) break;
  }
  return options;
}

// The "공통 항목 (한 줄에 하나)" textarea: one option per line.
export function parseCommonOptions(text: string): string[] {
  return normalizeOptions(String(text ?? '').split(/\r\n|\r|\n/));
}

export function formatCommonOptions(options?: readonly string[] | null): string {
  return (options || []).join('\n');
}

// The server's input check. undefined means the request did not send a list, so the stored options stay as they are.
export function sanitizeCommonOptions(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return normalizeOptions(value.filter((item): item is string => typeof item === 'string'));
}

// What saveMaterial stores: the sanitized list for a '공통' item, [] for any other name (options mean nothing there),
// and undefined (leave the field out) when the request did not send a list.
export function commonOptionsForSave(name: unknown, value: unknown): string[] | undefined {
  const options = sanitizeCommonOptions(value);
  if (!options) return undefined;
  return isCommonMaterialName(name) ? options : [];
}

// The line draft's DB save prefill: the source item's options, then the 품명 typed on the draft if it is not one of them.
export function appendCommonOption(options: readonly string[] | undefined, name: string): string[] {
  return normalizeOptions([...(options || []), name]);
}

export type CommonBulkRow = {
  name: string;
  quantity: number;
  customerUnitPrice: number;
  executionUnitPrice: number;
  note: string;
};

// 공간, 규격 and 단위 entered once in "공통 항목 한번에 추가" for every row.
export type CommonBulkShared = { space: string; spec: string; unit: string };

export type CommonBulkLine = {
  id: string;
  space: string;
  name: string;
  spec: string;
  unit: string;
  quantity: number;
  customerUnitPrice: number;
  executionUnitPrice: number;
  note: string;
  commonName?: boolean;
};

// One row per chosen option, priced like a single pick of the item (견적단가 and 실행단가 both start at the DB 단가).
export function defaultCommonBulkRows(options: readonly string[], unitPrice: unknown): CommonBulkRow[] {
  const price = Number(unitPrice || 0);
  const safePrice = Number.isFinite(price) ? price : 0;
  return options.map((name) => ({ name, quantity: 1, customerUnitPrice: safePrice, executionUnitPrice: safePrice, note: '' }));
}

// '' when every row can be added, otherwise the first problem as a message for staff.
export function validateCommonBulkRows(rows: readonly CommonBulkRow[]): string {
  if (!rows.length) return '추가할 공통 항목이 없습니다.';
  for (const [index, row] of rows.entries()) {
    if (!String(row.name ?? '').trim()) return `${index + 1}번째 항목의 품명을 입력해주세요.`;
    if (!Number.isFinite(row.quantity) || row.quantity < 0) return `${index + 1}번째 항목의 수량은 0 이상으로 입력해주세요.`;
  }
  return '';
}

// template is the line a single pick of the item would give (분류, 공종 and the rest); every row becomes a '공통' line
// with its own 품명, quantity, prices and 비고 plus the shared 공간 / 규격 / 단위.
export function buildCommonBulkLines<L extends CommonBulkLine>(
  template: L,
  shared: CommonBulkShared,
  rows: readonly CommonBulkRow[],
  makeId: () => string,
): L[] {
  return rows.map((row) => ({
    ...template,
    id: makeId(),
    space: shared.space,
    spec: shared.spec,
    unit: shared.unit,
    name: String(row.name ?? '').trim(),
    quantity: row.quantity,
    customerUnitPrice: row.customerUnitPrice,
    executionUnitPrice: row.executionUnitPrice,
    note: row.note,
    commonName: true,
  }));
}

// Replaces lines[index] with the first new line (keeping the replaced line's id) and puts the others right after it.
// An index outside the list appends every new line instead.
export function replaceLineAt<L extends { id: string }>(lines: readonly L[], index: number, newLines: readonly L[]): L[] {
  if (!Number.isInteger(index) || index < 0 || index >= lines.length) return [...lines, ...newLines];
  if (!newLines.length) return [...lines];
  const [first, ...rest] = newLines;
  return [...lines.slice(0, index), { ...first, id: lines[index].id }, ...rest, ...lines.slice(index + 1)];
}

// targetId: the line the picker was opened for. Without one (or when it is gone) the new lines go to the end.
export function placeCommonBulkLines<L extends { id: string }>(lines: readonly L[], newLines: readonly L[], targetId: string): L[] {
  return replaceLineAt(lines, targetId ? lines.findIndex((line) => line.id === targetId) : -1, newLines);
}
