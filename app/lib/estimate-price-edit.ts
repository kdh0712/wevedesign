// 단가 수정 팝업 (spec docs/superpowers/specs/2026-11-26-price-cell-db-popup-design.md): a click on a 견적단가 or 실행단가
// cell edits the line's 품명·규격·단위·prices, for this site only or for its 자재 DB item too.

import { isCommonMaterialName } from './estimate-common-options.ts';

export type PriceEditDraft = { name: string; spec: string; unit: string; customerUnitPrice: number; executionUnitPrice: number };

type PriceEditLine = {
  name: string;
  spec: string;
  unit: string;
  quantity: number;
  customerUnitPrice: number;
  executionUnitPrice: number;
  commonName?: boolean;
};

type PriceEditMaterial = {
  _id?: string;
  category?: string;
  process?: string;
  name?: string;
  spec?: string;
  unit?: string;
  note?: string;
  sourceSheet?: string;
  unitPrice?: number;
  executionUnitPrice?: number;
};

const price = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function priceEditDraft(line: PriceEditLine): PriceEditDraft {
  return {
    name: line.name || '',
    spec: line.spec || '',
    unit: line.unit || '',
    customerUnitPrice: price(line.customerUnitPrice),
    executionUnitPrice: price(line.executionUnitPrice),
  };
}

// A line priced like a DB item without its own 실행단가 (실행 = 견적): until the 실행단가 is typed, it follows a new
// 견적단가, so a 견적단가-only DB save keeps the item's "견적단가와 같게" instead of pinning the old price.
export function executionFollowsCustomer(line: PriceEditLine) {
  return price(line.executionUnitPrice) === price(line.customerUnitPrice);
}

export function withCustomerPrice(draft: PriceEditDraft, value: number, follow: boolean): PriceEditDraft {
  return follow ? { ...draft, customerUnitPrice: value, executionUnitPrice: value } : { ...draft, customerUnitPrice: value };
}

// A '공통' line: picked as one, or matched to the 공통 item. Its 품명 is the line's own; the DB item keeps '공통'.
export function isPriceEditCommon(line: { commonName?: boolean }, material: { name?: string } | null) {
  return Boolean(line.commonName) || isCommonMaterialName(material?.name);
}

// Only the fields the popup edits change; the line keeps its materialId, so it stays linked to the DB item. After a DB
// save the saved item's id is given, so a line found by 품명·규격·단위 stays linked once those change.
export function applyPriceEdit<T extends PriceEditLine & { materialId?: string }>(line: T, draft: PriceEditDraft, materialId?: string): T {
  return {
    ...line,
    name: draft.name.trim(),
    spec: draft.spec.trim(),
    unit: draft.unit.trim(),
    customerUnitPrice: price(draft.customerUnitPrice),
    executionUnitPrice: price(draft.executionUnitPrice),
    ...(materialId ? { materialId } : {}),
  };
}

// The saveMaterial payload: the same DB item (its _id) with its own 분류·공종·비고·source. 공통 항목s are never sent, so
// the server keeps the stored list. A 실행단가 equal to the 견적단가 is saved as 0, the DB's "견적단가와 같게". A 공통 line's
// 품명 is the line's own, so the DB item keeps its 품명.
export function priceEditMaterialSave(material: PriceEditMaterial, draft: PriceEditDraft, options: { commonName?: boolean } = {}) {
  const customerUnitPrice = price(draft.customerUnitPrice);
  const executionUnitPrice = price(draft.executionUnitPrice);
  return {
    _id: material._id,
    category: material.category,
    process: material.process,
    name: isPriceEditCommon(options, material) ? material.name : draft.name.trim(),
    spec: draft.spec.trim(),
    unit: draft.unit.trim(),
    unitPrice: customerUnitPrice,
    executionUnitPrice: executionUnitPrice === customerUnitPrice ? 0 : executionUnitPrice,
    note: material.note,
    sourceSheet: material.sourceSheet,
  };
}

// The DB values a save would change, by label, shown before 자재 DB에도 저장 so a value that differs only for this site
// is not pushed unseen. A stored 실행단가 of 0 is "견적단가와 같게".
export function priceEditDbChanges(material: PriceEditMaterial, draft: PriceEditDraft, options: { commonName?: boolean } = {}) {
  const next = priceEditMaterialSave(material, draft, options);
  const text = (value: unknown) => String(value ?? '').trim();
  const changes: string[] = [];
  if (text(next.name) !== text(material.name)) changes.push('품명');
  if (next.spec !== text(material.spec)) changes.push('규격');
  if (next.unit !== text(material.unit)) changes.push('단위');
  if (next.unitPrice !== price(material.unitPrice)) changes.push('견적단가');
  if (next.executionUnitPrice !== Math.max(0, price(material.executionUnitPrice))) changes.push('실행단가');
  return changes;
}

// '' when 자재 DB에도 저장 may go ahead; the server refuses a blank 품명.
export function priceEditDbSaveError(draft: PriceEditDraft, options: { commonName?: boolean } = {}) {
  if (!options.commonName && !draft.name.trim()) return '자재 DB에 저장할 품명을 입력해주세요.';
  return '';
}

export function priceEditTotals(line: PriceEditLine, draft: PriceEditDraft) {
  const quantity = price(line.quantity);
  return {
    amountBefore: quantity * price(line.customerUnitPrice),
    amountAfter: quantity * price(draft.customerUnitPrice),
    marginBefore: quantity * (price(line.customerUnitPrice) - price(line.executionUnitPrice)),
    marginAfter: quantity * (price(draft.customerUnitPrice) - price(draft.executionUnitPrice)),
  };
}
