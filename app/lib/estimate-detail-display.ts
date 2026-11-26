import { mergeDetailOneLines, type OneLineLine } from './estimate-detail-one-line.ts';

// 세부내역서 표시 바꾸기 (spec docs/superpowers/specs/2026-11-26-detail-display-design.md): a line can show another 품명,
// 규격, 단위 and 수량 on the 세부내역서 than in the estimate. Its amount never changes; the 단가 shown is that amount ÷ the
// shown 수량. Only the documents' rows change (print, the live preview, the Excel export); totals and the 갑지 do not.

// What a line shows instead: a field left out shows the estimate's own. 규격 and 단위 may be blank on purpose; a blank 품명
// would drop the line from the documents, so it never counts.
export type DetailDisplay = { name?: string; spec?: string; unit?: string; quantity?: number };
export type DisplayLine = OneLineLine & { detailDisplay?: DetailDisplay };

const TEXT_MAX = 120;
const number = (value: unknown) => Number(value) || 0;
const text = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, TEXT_MAX) : null);
// Leftover float digits (410,000 × 5.4) off a shown 단가, keeping real fractions.
const clean = (value: number) => Math.round(value * 1e6) / 1e6;

// The stored form, also how the estimate save keeps it; nothing at all when no field is set.
export function normalizeDetailDisplay(raw: unknown): DetailDisplay | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const input = raw as Record<string, unknown>;
  const display: DetailDisplay = {};
  const name = text(input.name);
  if (name) display.name = name;
  const spec = text(input.spec);
  if (spec !== null) display.spec = spec;
  const unit = text(input.unit);
  if (unit !== null) display.unit = unit;
  if (typeof input.quantity === 'number' && Number.isFinite(input.quantity) && input.quantity > 0) display.quantity = input.quantity;
  return Object.keys(display).length > 0 ? display : undefined;
}

export function hasDetailDisplay(line: { detailDisplay?: unknown }): boolean {
  return normalizeDetailDisplay(line.detailDisplay) !== undefined;
}

// The line as the 세부내역서 shows it, or the line itself when it has no display.
export function applyDetailDisplay<T extends DisplayLine>(line: T): T {
  const display = normalizeDetailDisplay(line.detailDisplay);
  if (!display) return line;
  const quantity = number(line.quantity);
  const shownQuantity = display.quantity ?? quantity;
  const per = (unitPrice: unknown) => (shownQuantity > 0 ? clean((number(unitPrice) * quantity) / shownQuantity) : number(unitPrice));
  return {
    ...line,
    name: display.name ?? line.name,
    spec: display.spec ?? line.spec,
    unit: display.unit ?? line.unit,
    quantity: shownQuantity,
    customerUnitPrice: per(line.customerUnitPrice),
    executionUnitPrice: per(line.executionUnitPrice),
  };
}

// The display to store from the dialog's fields: only what differs from the line itself (a blank 품명 or a 수량 that is
// not above 0 means "as the estimate"), or nothing when everything matches.
export function detailDisplayChanges(line: DisplayLine, fields: { name: string; spec: string; unit: string; quantity: number }): DetailDisplay | undefined {
  const same = (a: unknown, b: unknown) => String(a ?? '').trim() === String(b ?? '').trim();
  const changes: DetailDisplay = {};
  if (fields.name.trim() && !same(fields.name, line.name)) changes.name = fields.name;
  if (!same(fields.spec, line.spec)) changes.spec = fields.spec;
  if (!same(fields.unit, line.unit)) changes.unit = fields.unit;
  if (fields.quantity > 0 && fields.quantity !== number(line.quantity)) changes.quantity = fields.quantity;
  return normalizeDetailDisplay(changes);
}

// What the dialog shows for a display being typed: the amount (fixed), the 단가 it gives and whether that has a fraction.
export function detailDisplayPreview(line: DisplayLine, display: DetailDisplay): { amount: number; unitPrice: number; fractional: boolean } {
  const amount = clean(number(line.quantity) * number(line.customerUnitPrice));
  const shown = applyDetailDisplay({ ...line, detailDisplay: display });
  return { amount, unitPrice: shown.customerUnitPrice, fractional: !Number.isInteger(shown.customerUnitPrice) };
}

// The lines as the 세부내역서 draws them: a 품명 set to 세부내역서에서 한 줄로 is merged first (the merge wins over its lines'
// own displays), then every other line shows its display.
export function detailDocumentLines<T extends DisplayLine>(lines: T[]): T[] {
  const originals = new Set(lines);
  return mergeDetailOneLines(lines).map((line) => {
    if (originals.has(line)) return applyDetailDisplay(line);
    const merged = { ...line };
    delete merged.detailDisplay;
    return merged;
  });
}
