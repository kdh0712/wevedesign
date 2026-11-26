'use client';

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import {
  executionFollowsCustomer,
  priceEditDbChanges,
  priceEditDbSaveError,
  priceEditDraft,
  priceEditTotals,
  withCustomerPrice,
  type PriceEditDraft,
} from '../../lib/estimate-price-edit';
import { NumberTextInput } from './number-text-input';

// 단가 수정 (spec docs/superpowers/specs/2026-11-26-price-cell-db-popup-design.md): opened by a click on a 견적단가 or
// 실행단가 cell. Shows the line's 품명·규격·단위·prices beside its 자재 DB item's, and applies the new values to this site
// only or to the DB item too.

// The second press of a double-click on the price cell lands on the popup that its first press opened; presses that soon
// after opening, with a click count above 1, are ignored so they neither close the popup nor hit what is under them.
const DOUBLE_CLICK_GUARD_MS = 600;

const won = (value: number) => `${value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원`;
const INPUT = 'w-full min-w-0 rounded-md border px-2.5 py-1.5 text-sm outline-none focus:border-[#38a9bd]';
// A field that differs from the line is outlined in teal.
const inputTone = (changed: boolean) => (changed ? 'border-[#38a9bd] bg-[#f6fbfc]' : 'border-[#d5dde2] bg-white');
const NONE = <span className="text-[#a9b4bb]">-</span>;

type PriceEditLine = {
  name: string;
  spec: string;
  unit: string;
  quantity: number;
  customerUnitPrice: number;
  executionUnitPrice: number;
  process?: string;
};
type PriceEditMaterial = { name?: string; spec?: string; unit?: string; unitPrice?: number; executionUnitPrice?: number };
type Scope = 'site' | 'db';

export function PriceEditDialog({
  line,
  material,
  focus,
  common,
  isSaving,
  onApplySite,
  onSaveDb,
  onClose,
}: {
  line: PriceEditLine;
  // The line's 자재 DB item, null when none is found.
  material: PriceEditMaterial | null;
  focus: 'customerUnitPrice' | 'executionUnitPrice';
  // A 공통 line (isPriceEditCommon): its 품명 is the line's own, so a DB save keeps the item's 품명.
  common: boolean;
  isSaving: boolean;
  onApplySite: (draft: PriceEditDraft) => void;
  // Resolves false when the DB save failed; the popup then stays open.
  onSaveDb: (draft: PriceEditDraft) => Promise<boolean>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => priceEditDraft(line));
  const [scope, setScope] = useState<Scope>('site');
  const [error, setError] = useState('');
  // Until the 실행단가 is typed, a line priced 실행 = 견적 keeps it equal to the 견적단가 (executionFollowsCustomer).
  const [follow, setFollow] = useState(() => executionFollowsCustomer(line));
  const openedAt = useRef(0);
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    openedAt.current = performance.now();
  }, []);

  // Not while a DB save is on its way: its result would land on a closed popup.
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) onClose();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose, isSaving]);

  const close = () => {
    if (!isSaving) onClose();
  };
  const ignoreDoubleClick = (event: MouseEvent) => {
    if (event.detail > 1 && performance.now() - openedAt.current < DOUBLE_CLICK_GUARD_MS) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const set = (updates: Partial<PriceEditDraft>) => {
    setDraft((current) => ({ ...current, ...updates }));
    setError('');
  };
  const dbChanges = material ? priceEditDbChanges(material, draft, { commonName: common }) : [];
  // While 자재 DB에도 저장 is chosen, the DB values it would change are marked in the DB column.
  const dbTone = (label: string) => (scope === 'db' && dbChanges.includes(label) ? 'font-semibold text-[#b45309]' : '');
  const totals = priceEditTotals(line, draft);
  const quantity = Number(line.quantity) || 0;
  const dbExecution = Number(material?.executionUnitPrice) || 0;

  const textField = (key: 'name' | 'spec' | 'unit', label: string) => (
    <input
      value={draft[key]}
      onChange={(event) => set({ [key]: event.target.value })}
      aria-label={`바꿀 ${label}`}
      className={`${INPUT} ${inputTone(draft[key].trim() !== (line[key] || '').trim())}`}
    />
  );
  const priceField = (key: 'customerUnitPrice' | 'executionUnitPrice', label: string) => (
    <div className={`rounded-md ${draft[key] !== (Number(line[key]) || 0) ? 'ring-2 ring-[#38a9bd]/60' : ''}`}>
      <NumberTextInput
        value={draft[key]}
        onChange={(value) => {
          if (key === 'customerUnitPrice') {
            setDraft((current) => withCustomerPrice(current, value, follow));
            setError('');
            return;
          }
          setFollow(false);
          set({ executionUnitPrice: value });
        }}
        ariaLabel={`바꿀 ${label}`}
        className="w-full text-sm"
        autoFocus={focus === key}
      />
    </div>
  );
  const row = (label: string, now: ReactNode, db: ReactNode, field: ReactNode) => (
    <tr>
      <th className="text-left text-xs font-semibold text-[#60717d]">{label}</th>
      <td className="pr-3 text-right">{now}</td>
      <td className={`pr-3 text-right ${dbTone(label)}`}>{db}</td>
      <td>{field}</td>
    </tr>
  );
  const text = (value?: string) => (value ? value : NONE);
  const change = (before: number, after: number) =>
    before === after ? <b>{won(after)}</b> : (
      <>
        {won(before)} → <b className="text-[#1d6d7b]">{won(after)}</b>
      </>
    );

  const submit = async () => {
    if (scope === 'site') {
      onApplySite(draft);
      return;
    }
    const problem = priceEditDbSaveError(draft, { commonName: common });
    if (problem) {
      setError(problem);
      return;
    }
    if (!(await onSaveDb(draft))) setError('자재 DB에 저장하지 못했어요. 이 줄도 바꾸지 않았어요. 잠시 후 다시 해 주세요.');
  };

  const choice = (value: Scope, title: string, detail: string, disabled = false) => (
    <label
      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${
        disabled ? 'cursor-not-allowed border-[#d5dde2] opacity-45' : scope === value ? 'cursor-pointer border-[#171512] ring-1 ring-[#171512]' : 'cursor-pointer border-[#d5dde2]'
      }`}
    >
      <input type="radio" name="price-edit-scope" checked={scope === value} disabled={disabled} onChange={() => setScope(value)} className="mt-1 accent-[#171512]" />
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs text-[#60717d]">{detail}</span>
      </span>
    </label>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="단가 수정"
      onMouseDownCapture={ignoreDoubleClick}
      onClickCapture={ignoreDoubleClick}
      // Closes only on a press that also started on the backdrop, so a text drag ending there keeps the popup.
      onMouseDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressedBackdrop.current && event.target === event.currentTarget) close();
        pressedBackdrop.current = false;
      }}
      className="no-print fixed inset-0 z-[80] flex items-center justify-center bg-[#171512]/50 p-4"
    >
      <section className="max-h-[calc(100vh-32px)] w-full max-w-[680px] overflow-y-auto rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">단가 수정</h2>
            <p className="mt-1 text-xs text-[#60717d]">
              {line.name || '품명 없음'}
              {line.spec ? ` · ${line.spec}` : ''}
              {line.unit ? ` · ${line.unit}` : ''}
              {line.process ? ` (${line.process})` : ''}
            </p>
            <span
              className={`mt-1.5 inline-block rounded px-1.5 py-0.5 text-[11px] font-bold ${material ? 'bg-[#e8f3f6] text-[#1d6d7b]' : 'bg-amber-100 text-amber-800'}`}
            >
              {material ? '자재 DB 품목과 연결됨' : 'DB에서 못 찾음'}
            </span>
          </div>
          <button type="button" onClick={close} disabled={isSaving} aria-label="닫기" className="rounded-full border border-[#d5dde2] p-1.5 text-[#60717d] disabled:opacity-40">
            <X size={16} />
          </button>
        </div>

        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="text-xs text-[#60717d]">
              <th className="w-[12%] pb-2 text-left font-semibold"></th>
              <th className="w-[23%] pb-2 pr-3 text-right font-semibold">이 견적서 (지금)</th>
              <th className="w-[23%] pb-2 pr-3 text-right font-semibold">자재 DB (지금)</th>
              <th className="pb-2 text-left font-semibold">바꿀 값</th>
            </tr>
          </thead>
          <tbody className="[&_td]:border-t [&_td]:border-[#edf2f5] [&_td]:py-1.5 [&_th]:border-t [&_th]:border-[#edf2f5] [&_th]:py-1.5">
            {row('품명', text(line.name), material ? text(material.name) : NONE, textField('name', '품명'))}
            {row('규격', text(line.spec), material ? text(material.spec) : NONE, textField('spec', '규격'))}
            {row('단위', text(line.unit), material ? text(material.unit) : NONE, textField('unit', '단위'))}
            {row('견적단가', won(Number(line.customerUnitPrice) || 0), material ? won(Number(material.unitPrice) || 0) : NONE, priceField('customerUnitPrice', '견적단가'))}
            {row(
              '실행단가',
              won(Number(line.executionUnitPrice) || 0),
              material ? dbExecution > 0 ? won(dbExecution) : <span className="text-[#a9b4bb]">견적단가와 같음</span> : NONE,
              priceField('executionUnitPrice', '실행단가'),
            )}
          </tbody>
        </table>

        <p className="mt-3 rounded-md bg-[#f6f8f9] px-3 py-2 text-xs text-[#3b4a54]">
          이 줄 (수량 {quantity.toLocaleString('ko-KR')}
          {line.unit}) · 견적 금액 {change(totals.amountBefore, totals.amountAfter)} · 마진 {change(totals.marginBefore, totals.marginAfter)}
        </p>

        {!material && (
          <p className="mt-3 rounded-md border border-[#e7c37a] bg-[#fff8e8] px-3 py-2 text-xs font-semibold text-[#8b6420]">
            이 줄은 자재 DB에서 같은 품목을 못 찾았어요. 이 현장에만 적용할 수 있어요. DB에 새로 넣으려면 줄 메뉴의 ‘DB에 저장’을 써 주세요.
          </p>
        )}
        {material && common && (
          <p className="mt-3 text-xs text-[#60717d]">공통 품목이라 품명은 이 줄에만 바뀌어요. 자재 DB에는 규격·단위·단가만 저장돼요.</p>
        )}

        <div className="mt-4 grid gap-2" role="radiogroup" aria-label="어디에 적용할까요">
          {choice('site', '이 현장에만 적용', '이 견적서의 이 줄만 바뀌어요. 자재 DB와 다른 현장은 그대로예요.')}
          {choice('db', '자재 DB에도 저장', '이 줄과 자재 DB 품목을 함께 바꿔요. 다음에 불러오는 견적부터 새 값이 들어가요.', !material)}
        </div>
        {scope === 'db' && material && (
          <p className={`mt-2 text-xs font-semibold ${dbChanges.length ? 'text-[#b45309]' : 'text-[#60717d]'}`}>
            {dbChanges.length ? `자재 DB에서 바뀌는 값: ${dbChanges.join(', ')}` : '자재 DB 값과 같아요. 이 줄만 바뀌어요.'}
          </p>
        )}

        {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={close} disabled={isSaving} className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40">
            취소
          </button>
          <button type="button" onClick={submit} disabled={isSaving} className="rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {scope === 'db' ? (isSaving ? '저장하는 중…' : '자재 DB에도 저장') : '이 현장에만 적용'}
          </button>
        </div>
      </section>
    </div>
  );
}
