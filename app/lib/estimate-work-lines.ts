// The 실행내역서 line rules shared by the estimate save and the phone's direct entry (spec
// docs/superpowers/specs/2026-11-24-phone-work-lines-design.md). Pure; relative .ts imports only, so Node tests load it.
import { isOfficeRecordId } from './mobile-overview.ts';
import { parseReceiptAmount } from './site-receipts.ts';
import { normalizeReceiptId } from './site-receipts.ts';

export type WorkLineInput = {
  id?: string;
  sourceLineId?: string;
  receiptId?: string;
  date?: string;
  space?: string;
  category?: string;
  process?: string;
  name?: string;
  spec?: string;
  unit?: string;
  quantity?: number | string;
  executionUnitPrice?: number | string;
  income?: number | string;
  expense?: number | string;
  executionAmount?: number | string;
  payment?: number | string;
  // 결제 (true) or 미결제 (false); a line saved before has none (workLinePaid).
  paid?: boolean;
  vendor?: string;
  status?: string;
  note?: string;
  addedFrom?: string;
  addedBy?: string;
  addedAt?: string;
};

export const PHONE_PROCESS_MAX = 40;
export const PHONE_NOTE_MAX = 100;

// A text cell as the estimate save always read it (String(value || '')): 0, false, null or undefined are blank.
const text = (value: unknown) => (value ? String(value) : '');

export function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

// A saved 실행 line: numbers read, text trimmed, empty lines dropped. A line made from a receipt keeps its receiptId; a
// line added from the phone keeps addedFrom/addedBy/addedAt (shown on the PC, and used to merge office saves).
export function normalizeWorkLines(lines: readonly WorkLineInput[]) {
  return lines
    .map((line, index) => {
      const quantity = toNumber(line.quantity);
      const executionUnitPrice = toNumber(line.executionUnitPrice);
      const fallbackExpense = Math.round(quantity * executionUnitPrice);
      const expense = toNumber(line.expense) || fallbackExpense;
      const receiptId = normalizeReceiptId(line.receiptId);
      const fromPhone = line.addedFrom === 'phone';
      return {
        id: line.id || `work-${Date.now()}-${index}`,
        ...(receiptId ? { receiptId } : {}),
        sourceLineId: text(line.sourceLineId).trim(),
        date: text(line.date).trim(),
        space: text(line.space).trim(),
        category: text(line.category).trim(),
        process: text(line.process).trim(),
        name: text(line.name).trim(),
        spec: text(line.spec).trim(),
        unit: text(line.unit).trim(),
        quantity,
        executionUnitPrice,
        income: toNumber(line.income),
        expense,
        payment: toNumber(line.payment),
        paid: workLinePaid(line),
        executionAmount: expense,
        vendor: text(line.vendor).trim(),
        status: (text(line.status) || '예정').trim(),
        note: text(line.note).trim(),
        ...(fromPhone ? { addedFrom: 'phone', addedBy: text(line.addedBy).slice(0, 80), addedAt: text(line.addedAt) } : {}),
      };
    })
    .filter((line) => line.name || line.space || line.category || line.process || line.date || line.income || line.expense || line.payment || line.note);
}

export type NormalizedWorkLine = ReturnType<typeof normalizeWorkLines>[number];

// The lines in extra that current lacks (by id), added after what current holds now. The estimate page uses it with the
// phone lines a save answer brought back, on the lines as they are when the answer arrives (edits typed during the
// save stay).
export function appendMissingLines<T extends { id: string }>(current: T[], extra: readonly T[]): T[] {
  const known = new Set(current.map((line) => line.id));
  const missing = extra.filter((line) => !known.has(line.id));
  return missing.length > 0 ? [...current, ...missing] : current;
}

// The 실행 part of an estimate's stored totals, as the estimate save computes it. The 현재 마진 is worked out only once a
// 지출 is recorded; lines with 수입 alone (계약금) or nothing yet leave it at 0, not at the whole 견적 금액.
export function workLineTotals(
  workLines: ReadonlyArray<{ expense?: number; executionAmount?: number }>,
  base: { customerEstimateTotal: number; additionalCostTotal: number },
) {
  const hasWorkLines = workLines.some((line) => Number(line.expense || line.executionAmount || 0) !== 0);
  const actualExecutionCostTotal = hasWorkLines ? Math.round(workLines.reduce((sum, line) => sum + Number(line.expense || line.executionAmount || 0), 0)) : 0;
  const actualMarginAmount = hasWorkLines ? base.customerEstimateTotal - actualExecutionCostTotal - base.additionalCostTotal : 0;
  const actualMarginRate = base.customerEstimateTotal > 0 && hasWorkLines ? Math.round((actualMarginAmount / base.customerEstimateTotal) * 1000) / 10 : 0;
  return {
    actualExecutionCostTotal,
    actualMarginAmount,
    actualMarginRate,
    executionCostTotal: actualExecutionCostTotal,
    marginAmount: actualMarginAmount,
    marginRate: actualMarginRate,
  };
}

const timeOf = (value: unknown) => {
  const ms = Date.parse(text(value));
  return Number.isFinite(ms) ? ms : 0;
};

// The version a phone line goes into: the newest live 최종안 (final), else the newest live version — the version the
// phone's schedule uses too.
export function pickWorkLineTarget<T extends { versionType?: unknown; updatedAt?: unknown; createdAt?: unknown; deletedAt?: unknown }>(estimates: readonly T[]): T | null {
  const live = estimates.filter((estimate) => !estimate.deletedAt);
  const finals = live.filter((estimate) => estimate.versionType === 'final');
  const pool = finals.length > 0 ? finals : live;
  return pool.reduce<T | null>((best, item) => (!best || timeOf(item.updatedAt || item.createdAt) > timeOf(best.updatedAt || best.createdAt) ? item : best), null);
}

// Lines from a saved JSON list, or the lines themselves (the PC page passes them as they are).
const parseList = (json: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(json)) return json.filter((item) => typeof item === 'object' && item !== null);
  if (typeof json !== 'string' || !json.trim()) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'object' && item !== null) : [];
  } catch {
    return [];
  }
};

// The 공종 the phone offers: the version's estimate lines (process, else category), then the 실행 lines' 공종, each once,
// in the order first seen. Names only: no amounts leave the server.
export function workLineProcesses(linesJson: unknown, workLinesJson: unknown): string[] {
  const names: string[] = [];
  const add = (value: unknown) => {
    const name = text(value).trim();
    if (name && !names.includes(name)) names.push(name);
  };
  for (const line of parseList(linesJson)) add(text(line.process).trim() || line.category);
  for (const line of parseList(workLinesJson)) add(line.process);
  return names;
}

export type PhoneWorkLineInput = { siteId: string; date: string; process: string; expense: number; note: string };

const isCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export function parsePhoneWorkLine(body: unknown): { ok: true; value: PhoneWorkLineInput } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, error: '알 수 없는 요청입니다.' };
  const input = body as Record<string, unknown>;
  if (!isOfficeRecordId(input.siteId)) return { ok: false, error: '현장을 골라 주세요.' };
  const date = text(input.date).trim();
  if (!isCalendarDate(date)) return { ok: false, error: '날짜를 확인해 주세요.' };
  const process = text(input.process).trim();
  if (!process) return { ok: false, error: '공종을 골라 주세요.' };
  if (process.length > PHONE_PROCESS_MAX) return { ok: false, error: `공종은 ${PHONE_PROCESS_MAX}자까지 쓸 수 있어요.` };
  const amount = parseReceiptAmount(input.expense);
  if (!amount.ok) return amount;
  if (amount.amount === null || amount.amount < 1) return { ok: false, error: '지출 금액을 적어 주세요.' };
  const note = text(input.note).trim();
  if (note.length > PHONE_NOTE_MAX) return { ok: false, error: `비고는 ${PHONE_NOTE_MAX}자까지 쓸 수 있어요.` };
  return { ok: true, value: { siteId: input.siteId, date, process, expense: amount.amount, note } };
}

// A phone line: a normal, already-bought (완료) 실행 line marked with who added it from the phone and when.
export function newPhoneWorkLine(input: PhoneWorkLineInput, author: { name: string; loginId: string }, nowIso: string, hex: string): NormalizedWorkLine {
  return normalizeWorkLines([
    {
      id: `work-phone-${hex}`,
      date: input.date,
      process: input.process,
      expense: input.expense,
      note: input.note,
      status: '완료',
      paid: true,
      addedFrom: 'phone',
      addedBy: (author.name || author.loginId).slice(0, 80),
      addedAt: nowIso,
    },
  ])[0];
}

// When the office saves a version, the phone lines stored in it that its request leaves out and its editor never saw
// (not in seenIds): they arrived while it was open, so they are put back. A phone line the editor saw and removed stays
// removed. seenIds null (an editor from before this rule) puts every missing phone line back.
export function unseenPhoneLines(storedWorkLinesJson: unknown, incomingIds: ReadonlySet<string>, seenIds: ReadonlySet<string> | null): NormalizedWorkLine[] {
  const stored = normalizeWorkLines(parseList(storedWorkLinesJson) as WorkLineInput[]);
  return stored.filter((line) => line.addedFrom === 'phone' && !incomingIds.has(line.id) && !(seenIds && seenIds.has(line.id)));
}

// 실행 내역서 결제/미결제와 공종 고르기 (spec docs/superpowers/specs/2026-11-26-work-ledger-paid-filter-design.md).

type LedgerLine = {
  process?: unknown;
  income?: unknown;
  expense?: unknown;
  quantity?: unknown;
  executionUnitPrice?: unknown;
  paid?: unknown;
  payment?: unknown;
  addedFrom?: unknown;
  receiptId?: unknown;
};

// 결제 (true) or 미결제: the saved choice. A line saved before the choice existed reads 결제 when it came from the phone or
// a receipt (something already bought), or when its old 결제 amount covers its 지출; a line paid only in part stays 미결제,
// so what is still owed shows.
export function workLinePaid(line: LedgerLine): boolean {
  if (typeof line.paid === 'boolean') return line.paid;
  if (line.addedFrom === 'phone' || text(line.receiptId).trim()) return true;
  const payment = toNumber(line.payment);
  return payment > 0 && payment >= ledgerExpense(line);
}

const ledgerExpense = (line: LedgerLine) => toNumber(line.expense) || toNumber(line.quantity) * toNumber(line.executionUnitPrice);

// 건수, 수입, 지출 and 미결제 지출 of one 공종's lines (trimmed), or of every line when process is left out.
export function workLedgerSums(lines: readonly LedgerLine[], process?: string) {
  const picked = process === undefined ? lines : lines.filter((line) => text(line.process).trim() === process.trim());
  const sum = (amount: (line: LedgerLine) => number) => Math.round(picked.reduce((total, line) => total + amount(line), 0)) || 0;
  return {
    count: picked.length,
    income: sum((line) => toNumber(line.income)),
    expense: sum(ledgerExpense),
    unpaid: sum((line) => (workLinePaid(line) ? 0 : ledgerExpense(line))),
  };
}

// The 공종 buttons above the ledger: each 공종 its lines use, with how many, in the order given (the estimate's 공종 list),
// then the others as first seen, a blank 공종 last.
export function workLedgerFilterOptions(lines: readonly { process?: unknown }[], order: readonly string[]): Array<{ process: string; count: number }> {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const process = text(line.process).trim();
    counts.set(process, (counts.get(process) || 0) + 1);
  }
  const named = [...counts.keys()].filter(Boolean);
  const ordered = [...new Set([...order.map((name) => name.trim()).filter((name) => counts.has(name)), ...named])];
  return [...ordered, ...(counts.has('') ? [''] : [])].map((process) => ({ process, count: counts.get(process) || 0 }));
}

const UNPAID_WORDS = new Set(['-', 'x', '×', 'n', 'no', '없음']);

// An old ledger's 결제 cell (과거 엑셀 불러오기): anything written there (an amount above 0, a date, 카드, 완료, O…) is
// 결제; blank, 0, '-', X/N, 없음 or anything starting with 미 (미결제, 미지급) is 미결제.
export function parsePaidCell(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  const word = String(value ?? '').replace(/\s+/g, '').toLowerCase();
  if (!word || word.startsWith('미') || UNPAID_WORDS.has(word)) return false;
  if (/^\d{4}[-./]\d{1,2}[-./]\d{1,2}\.?$/.test(word)) return true;
  if (/^[0-9.,\-원₩]+$/.test(word)) return toNumber(word) > 0;
  return true;
}

// 받는 돈에는 부가세가 들어 있어서, 남은 받을 금액은 견적 금액 (부가세 별도) + 10%에서 셈한다.
const VAT_RATE = 0.1;

// The money cards above the 실행 내역서 (spec docs/superpowers/specs/2026-11-26-current-margin-design.md): 받은 금액 (수입),
// 남은 받을 금액 (견적 금액 + 부가세 − 받은 금액; minus when more came in), 현장 잔액 (받은 금액 − 지출), and the 현재 마진
// (견적 금액 − 지출 − 추가 비용) with how much of the 견적 예상원가 is spent. Before any 지출 the margin is null (미작성).
export function workLedgerMoney(
  estimate: { customerEstimateTotal: number; estimateExecutionCostTotal: number; additionalCostTotal: number },
  sums: { income: number; expense: number; unpaid: number },
) {
  const customer = Number(estimate.customerEstimateTotal) || 0;
  const budget = Number(estimate.estimateExecutionCostTotal) || 0;
  const hasExpense = sums.expense !== 0;
  const currentMargin = hasExpense ? customer - sums.expense - (Number(estimate.additionalCostTotal) || 0) : null;
  return {
    received: sums.income,
    receivable: Math.round(customer * (1 + VAT_RATE)) - sums.income,
    expense: sums.expense,
    unpaid: sums.unpaid,
    cashOnHand: sums.income - sums.expense,
    currentMargin,
    currentMarginRate: currentMargin !== null && customer > 0 ? Math.round((currentMargin / customer) * 1000) / 10 : null,
    budgetUsedRate: hasExpense && budget > 0 ? Math.round((sums.expense / budget) * 100) : null,
  };
}
