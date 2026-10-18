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

type MaterialKeyFields = { category?: unknown; process?: unknown; name?: unknown; spec?: unknown; unit?: unknown };

const trimmed = (value: unknown) => String(value ?? '').trim();

// The string saveMaterial in the estimate route hashes into a new item's id (materialId: category, name, spec and unit,
// trimmed, with '미분류' for an empty category). A save without _id writes to the item whose id came from the same string.
export function materialSaveKey(fields: MaterialKeyFields): string {
  return [trimmed(fields.category) || '미분류', trimmed(fields.name), trimmed(fields.spec), trimmed(fields.unit)].join('|');
}

// The '공통' item a save of { category, spec, unit } named '공통' without an _id will overwrite: the item whose own id fields
// give the same key. An item edited after it was created can carry another category than the one in its id, so when no item
// matches exactly, one whose 공종 (process, else category) matches is used.
export function findCommonSaveTarget<M extends MaterialKeyFields>(
  materials: readonly M[],
  draft: { category: string; spec: string; unit: string },
): M | undefined {
  const key = materialSaveKey({ ...draft, name: COMMON_MATERIAL_NAME });
  const exact = materials.find((item) => materialSaveKey(item) === key);
  if (exact) return exact;
  return materials.find((item) => materialSaveKey({ ...item, category: trimmed(item.process) || item.category }) === key);
}

export type CommonBulkRow = {
  space: string;
  name: string;
  quantity: number;
  customerUnitPrice: number;
  executionUnitPrice: number;
  note: string;
};

// 규격 and 단위 entered once in "공통 항목 한번에 추가" for every row. 공간 is per row: each 공통 항목 can be another room.
export type CommonBulkShared = { spec: string; unit: string };

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

const withoutSpaces = (value: unknown) => String(value ?? '').replace(/\s/g, '');

// One row per chosen option, priced like a single pick of the item (견적단가 and 실행단가 both start at the DB 단가).
// - replacedLine: the line row 1 will replace. Like a single pick onto that line, row 1 keeps its 수량 and 비고.
// - 공간: an option named after one of spaceOptions (spaces ignored) starts in that 공간. Otherwise row 1 takes
//   firstRowSpace (the 공간 of the line or draft the picker was opened for) and the other rows start empty.
export function defaultCommonBulkRows(
  options: readonly string[],
  unitPrice: unknown,
  {
    replacedLine = null,
    spaceOptions = [],
    firstRowSpace = '',
  }: { replacedLine?: { quantity?: number; note?: string } | null; spaceOptions?: readonly string[]; firstRowSpace?: string } = {},
): CommonBulkRow[] {
  const price = Number(unitPrice || 0);
  const safePrice = Number.isFinite(price) ? price : 0;
  const namedSpace = (name: string) => spaceOptions.find((space) => withoutSpaces(space) && withoutSpaces(space) === withoutSpaces(name)) || '';
  return options.map((name, index) => {
    const kept = index === 0 ? replacedLine : null;
    const quantity = kept && Number.isFinite(kept.quantity) ? Number(kept.quantity) : 1;
    const space = namedSpace(name) || (index === 0 ? firstRowSpace : '');
    return { space, name, quantity, customerUnitPrice: safePrice, executionUnitPrice: safePrice, note: kept ? kept.note || '' : '' };
  });
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
// with its own 공간, 품명, quantity, prices and 비고 plus the shared 규격 / 단위.
export function buildCommonBulkLines<L extends CommonBulkLine>(
  template: L,
  shared: CommonBulkShared,
  rows: readonly CommonBulkRow[],
  makeId: () => string,
): L[] {
  return rows.map((row) => ({
    ...template,
    id: makeId(),
    space: String(row.space ?? ''),
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
