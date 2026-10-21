// 견적 보기 on the phone (spec docs/superpowers/specs/2026-10-21-staff-app-notes-schedule-estimate-design.md §4): the
// customer's figures only, grouped like the PC customer estimate print (category, else process, else 기타 공사; lines
// without a name left out). Execution prices, costs, margins, work lines, purchase orders and the estimate memo are never
// copied, so the phone cannot receive them.

export type CustomerEstimateLine = { name: string; spec: string; unit: string; quantity: number; unitPrice: number; amount: number; note: string };
export type CustomerEstimateGroup = { category: string; subtotal: number; lines: CustomerEstimateLine[] };
export type CustomerEstimateView = {
  versionLabel: string;
  versionType: string;
  updatedAt: string;
  total: number;
  vatNote: '부가세 별도';
  groups: CustomerEstimateGroup[];
};

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
// Blank or text amounts become 0, so the screen never shows NaN. Negative ones stay: the PC editor takes them for
// discount lines (할인, 네고), and the customer's total counts them.
const amount = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};
// Whole won, as the PC estimate shows them (formatMoney rounds); `|| 0` turns -0 into 0.
const won = (value: number) => Math.round(value) || 0;

function readLines(linesJson: unknown): Array<Record<string, unknown>> {
  if (typeof linesJson !== 'string' || !linesJson.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(linesJson);
    return Array.isArray(parsed) ? parsed.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null) : [];
  } catch {
    return [];
  }
}

export function toCustomerEstimateView(estimate: Record<string, unknown>): CustomerEstimateView {
  // Sums use the exact amounts and are rounded once, like the PC (subtotal and total of quantity × customer price).
  const groups = new Map<string, { category: string; exact: number; lines: CustomerEstimateLine[] }>();
  for (const raw of readLines(estimate.linesJson)) {
    const name = text(raw.name);
    if (!name) continue;
    const quantity = amount(raw.quantity);
    const unitPrice = amount(raw.customerUnitPrice);
    const exact = quantity * unitPrice;
    const line: CustomerEstimateLine = {
      name,
      spec: text(raw.spec) || text(raw.space),
      unit: text(raw.unit) || '식',
      quantity,
      unitPrice,
      amount: won(exact),
      note: text(raw.note),
    };
    const category = text(raw.category) || text(raw.process) || '기타 공사';
    const group = groups.get(category) ?? { category, exact: 0, lines: [] };
    group.lines.push(line);
    group.exact += exact;
    groups.set(category, group);
  }
  const list = [...groups.values()];
  return {
    versionLabel: text(estimate.versionLabel),
    versionType: text(estimate.versionType),
    updatedAt: text(estimate.updatedAt) || text(estimate.createdAt),
    total: won(list.reduce((sum, group) => sum + group.exact, 0)),
    vatNote: '부가세 별도',
    groups: list.map((group) => ({ category: group.category, subtotal: won(group.exact), lines: group.lines })),
  };
}
