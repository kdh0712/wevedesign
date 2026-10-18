'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Trash2, X } from 'lucide-react';
import { defaultCommonBulkRows, validateCommonBulkRows, type CommonBulkRow, type CommonBulkShared } from '../../lib/estimate-common-options';
import { CommonMaterialSummary, type CommonMaterial } from './common-options';
import { NumberTextInput } from './number-text-input';

type DraftRow = CommonBulkRow & { key: string };

const inputClass = 'w-full min-w-0 rounded-md border border-[#d5dde2] bg-white px-2 py-2 text-sm outline-none focus:border-[#38a9bd]';
// A ring, so it shows over the inputs' own border and background classes.
const invalidClass = 'ring-2 ring-red-300';
const rowGrid = 'md:grid-cols-[minmax(0,1.5fr)_88px_128px_128px_minmax(0,1.2fr)_40px]';

// htmlFor makes the caption the control's <label>; row captions only show on narrow screens and the controls carry aria-labels.
function Caption({ label, htmlFor, children, hideOnWide = false }: { label: string; htmlFor?: string; children: ReactNode; hideOnWide?: boolean }) {
  const className = `text-[11px] font-bold uppercase tracking-[0.12em] text-[#60717d] ${hideOnWide ? 'md:hidden' : ''}`;
  return (
    <div className="grid min-w-0 gap-1">
      {htmlFor ? (
        <label htmlFor={htmlFor} className={className}>
          {label}
        </label>
      ) : (
        <span className={className}>{label}</span>
      )}
      {children}
    </div>
  );
}

// "공통 항목 한번에 추가": several saved 공통 항목 of one DB item become estimate lines at once. 공간, 규격 and 단위 are
// entered once for every row; each row has its own 품명, 수량, 견적단가, 실행단가 and 비고. Cancel and close change nothing.
// replacedLine: the line row 1 will replace (it starts with that line's 수량 and 비고); null when every row is added.
export function CommonBulkAddDialog({
  material,
  category,
  options,
  defaultSpace,
  replacedLine = null,
  returnFocusTo = null,
  spaceOptions,
  onCancel,
  onAdd,
}: {
  material: CommonMaterial;
  category: string;
  options: string[];
  defaultSpace: string;
  replacedLine?: { quantity: number; note: string } | null;
  returnFocusTo?: HTMLElement | null;
  spaceOptions: string[];
  onCancel: () => void;
  onAdd: (shared: CommonBulkShared, rows: CommonBulkRow[]) => void;
}) {
  const [shared, setShared] = useState<CommonBulkShared>(() => ({ space: defaultSpace, spec: material.spec || '', unit: material.unit || '' }));
  const [rows, setRows] = useState<DraftRow[]>(() =>
    defaultCommonBulkRows(options, material.unitPrice, replacedLine).map((row, index) => ({ ...row, key: `row-${index}` })),
  );
  const [error, setError] = useState('');
  const [showProblems, setShowProblems] = useState(false);
  const firstFieldRef = useRef<HTMLSelectElement | null>(null);
  const returnFocusRef = useRef(returnFocusTo);
  const fieldId = useId();

  // Focus starts in the dialog and goes back to the cell that opened the picker when the dialog closes, if it is still there.
  useEffect(() => {
    firstFieldRef.current?.focus();
    const opener = returnFocusRef.current;
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  // Escape cancels wherever focus is, even outside the dialog.
  useEffect(() => {
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', cancelOnEscape);
    return () => document.removeEventListener('keydown', cancelOnEscape);
  }, [onCancel]);

  const spaces = shared.space && !spaceOptions.includes(shared.space) ? [shared.space, ...spaceOptions] : spaceOptions;

  const updateRow = (key: string, updates: Partial<CommonBulkRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...updates } : row)));
    setError('');
  };

  const removeRow = (key: string) => {
    setRows((current) => current.filter((row) => row.key !== key));
    setError('');
  };

  const submit = () => {
    const plainRows = rows.map((row) => ({
      name: row.name,
      quantity: row.quantity,
      customerUnitPrice: row.customerUnitPrice,
      executionUnitPrice: row.executionUnitPrice,
      note: row.note,
    }));
    const message = validateCommonBulkRows(plainRows);
    if (message) {
      setError(message);
      setShowProblems(true);
      return;
    }
    onAdd(shared, plainRows);
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#171512]/45 px-4 py-6 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="common-bulk-add-title"
        className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[#d5dde2] bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[#edf2f5] p-5">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#38a9bd]">COMMON ITEMS</p>
            <h2 id="common-bulk-add-title" className="mt-1 text-2xl font-semibold">공통 항목 한번에 추가</h2>
            <p className="mt-1 text-sm text-[#60717d]">항목마다 수량과 단가를 입력한 뒤 추가하면 견적서에 한 번에 들어갑니다.</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="닫기" className="rounded-full border border-[#d5dde2] p-2 text-[#60717d] hover:bg-[#f7fafb]">
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          <CommonMaterialSummary category={category} material={material} />
          {replacedLine && (
            <p className="mt-3 rounded-lg border border-[#cde6ec] bg-[#edf8fb] px-4 py-2.5 text-sm font-semibold text-[#267d8c]">
              선택한 줄은 1번째 항목으로 바뀌고, 나머지 항목은 그 바로 아래에 추가됩니다.
            </p>
          )}

          <div className="mt-4 rounded-lg border border-[#e7d8bd] bg-[#fffdf8] p-3">
            <p className="text-xs font-bold text-[#8b6420]">모든 항목에 똑같이 들어가는 값</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <Caption label="공간" htmlFor={`${fieldId}-space`}>
                <select
                  id={`${fieldId}-space`}
                  ref={firstFieldRef}
                  value={shared.space}
                  onChange={(event) => setShared((current) => ({ ...current, space: event.target.value }))}
                  className={inputClass}
                >
                  <option value="">선택</option>
                  {spaces.map((space) => (
                    <option key={space} value={space}>{space}</option>
                  ))}
                </select>
              </Caption>
              <Caption label="규격" htmlFor={`${fieldId}-spec`}>
                <input id={`${fieldId}-spec`} value={shared.spec} onChange={(event) => setShared((current) => ({ ...current, spec: event.target.value }))} className={inputClass} />
              </Caption>
              <Caption label="단위" htmlFor={`${fieldId}-unit`}>
                <input id={`${fieldId}-unit`} value={shared.unit} onChange={(event) => setShared((current) => ({ ...current, unit: event.target.value }))} className={inputClass} />
              </Caption>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            <div className={`hidden gap-2 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#60717d] md:grid ${rowGrid}`}>
              <span>품명</span>
              <span className="text-right">수량</span>
              <span className="text-right">견적단가</span>
              <span className="text-right">실행단가</span>
              <span>비고</span>
              <span className="sr-only">빼기</span>
            </div>
            {rows.map((row, index) => {
              const nameMissing = showProblems && !row.name.trim();
              const quantityInvalid = showProblems && (!Number.isFinite(row.quantity) || row.quantity < 0);
              return (
                <div key={row.key} className={`grid gap-2 rounded-lg border border-[#d5dde2] p-3 md:items-end md:border-0 md:p-1 ${rowGrid}`}>
                  <Caption label="품명" hideOnWide>
                    <input
                      value={row.name}
                      aria-label={`${index + 1}번째 품명`}
                      aria-invalid={nameMissing || undefined}
                      onChange={(event) => updateRow(row.key, { name: event.target.value })}
                      className={`${inputClass} font-semibold ${nameMissing ? invalidClass : ''}`}
                    />
                  </Caption>
                  <Caption label="수량" hideOnWide>
                    <NumberTextInput
                      value={row.quantity}
                      ariaLabel={`${index + 1}번째 수량`}
                      onChange={(value) => updateRow(row.key, { quantity: value })}
                      className={`w-full min-w-0 bg-white text-sm ${quantityInvalid ? invalidClass : ''}`}
                    />
                  </Caption>
                  <Caption label="견적단가" hideOnWide>
                    <NumberTextInput
                      value={row.customerUnitPrice}
                      ariaLabel={`${index + 1}번째 견적단가`}
                      onChange={(value) => updateRow(row.key, { customerUnitPrice: value })}
                      className="w-full min-w-0 bg-white text-sm"
                    />
                  </Caption>
                  <Caption label="실행단가" hideOnWide>
                    <NumberTextInput
                      value={row.executionUnitPrice}
                      ariaLabel={`${index + 1}번째 실행단가`}
                      onChange={(value) => updateRow(row.key, { executionUnitPrice: value })}
                      className="w-full min-w-0 bg-white text-sm"
                    />
                  </Caption>
                  <Caption label="비고" hideOnWide>
                    <input value={row.note} aria-label={`${index + 1}번째 비고`} onChange={(event) => updateRow(row.key, { note: event.target.value })} className={inputClass} />
                  </Caption>
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    aria-label={`${row.name || `${index + 1}번째 항목`} 빼기`}
                    title="이 항목 빼기"
                    className="inline-flex h-9 w-full items-center justify-center rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50 md:w-10"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
            {rows.length === 0 && (
              <p className="rounded-lg border border-dashed border-[#d5dde2] bg-[#f7fafb] p-6 text-center text-sm text-[#60717d]">
                추가할 항목이 없습니다. 취소한 뒤 공통 항목을 다시 골라주세요.
              </p>
            )}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[#edf2f5] p-4">
          {error && (
            <p role="alert" className="mr-auto text-sm font-semibold text-red-600">
              {error}
            </p>
          )}
          <button type="button" onClick={onCancel} className="rounded-md border border-[#d5dde2] bg-white px-4 py-2.5 text-sm font-semibold">
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!rows.length}
            className="rounded-md bg-[#171512] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {rows.length}개 항목 추가
          </button>
        </footer>
      </section>
    </div>
  );
}
