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
  vendor?: string;
  status?: string;
  note?: string;
  addedFrom?: string;
  addedBy?: string;
  addedAt?: string;
};

export const PHONE_PROCESS_MAX = 40;
export const PHONE_NOTE_MAX = 100;

const text = (value: unknown) => (typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value));

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

// The 실행 part of an estimate's stored totals, as the estimate save computes it.
export function workLineTotals(
  workLines: ReadonlyArray<{ expense?: number; executionAmount?: number }>,
  base: { customerEstimateTotal: number; additionalCostTotal: number },
) {
  const hasWorkLines = workLines.length > 0;
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

const parseList = (json: unknown): Array<Record<string, unknown>> => {
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
