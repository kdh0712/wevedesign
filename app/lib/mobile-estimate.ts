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
// Blank, text or negative amounts become 0, so the screen never shows NaN.
const amount = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

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
  const groups = new Map<string, CustomerEstimateGroup>();
  for (const raw of readLines(estimate.linesJson)) {
    const name = text(raw.name);
    if (!name) continue;
    const quantity = amount(raw.quantity);
    const unitPrice = amount(raw.customerUnitPrice);
    const line: CustomerEstimateLine = {
      name,
      spec: text(raw.spec) || text(raw.space),
      unit: text(raw.unit) || '식',
      quantity,
      unitPrice,
      amount: quantity * unitPrice,
      note: text(raw.note),
    };
    const category = text(raw.category) || text(raw.process) || '기타 공사';
    const group = groups.get(category) ?? { category, subtotal: 0, lines: [] };
    group.lines.push(line);
    group.subtotal += line.amount;
    groups.set(category, group);
  }
  const list = [...groups.values()];
  return {
    versionLabel: text(estimate.versionLabel),
    versionType: text(estimate.versionType),
    updatedAt: text(estimate.updatedAt) || text(estimate.createdAt),
    total: list.reduce((sum, group) => sum + group.subtotal, 0),
    vatNote: '부가세 별도',
    groups: list,
  };
}
