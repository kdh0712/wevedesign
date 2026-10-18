'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { canAddCommonOptionRow, moveListItem, removeListItem, sanitizeCommonOptions } from '../../lib/estimate-common-options';

// The fields of a DB item these views read; the page's Material fits it.
export type CommonMaterial = {
  category?: string;
  process?: string;
  name?: string;
  spec?: string;
  unit?: string;
  unitPrice?: number;
  commonOptions?: string[] | null;
};

const formatWon = (value?: number) => `${Math.round(Number(value || 0)).toLocaleString('ko-KR')}원`;

type OptionRow = { id: number; value: string };

let optionRowId = 0;
// The saved items in order, or one empty input to start typing in.
const rowsFor = (options?: readonly string[] | null): OptionRow[] =>
  (options?.length ? options : ['']).map((value) => ({ id: ++optionRowId, value }));

function RowButton({ label, title, disabled = false, danger = false, onClick, children }: { label: string; title: string; disabled?: boolean; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title}
      className={`inline-flex h-8 w-7 shrink-0 items-center justify-center rounded-md border bg-white disabled:cursor-not-allowed disabled:opacity-30 ${
        danger ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-[#d5dde2] text-[#4d5d66] hover:bg-[#f7fafb]'
      }`}
    >
      {children}
    </button>
  );
}

// "공통 항목" for a '공통' DB item: one input per item, numbered in saved order, with "+ 항목 추가" (or Enter) for the next
// one, ↑/↓ to reorder and a delete button per row. Every change sends the cleaned list up (sanitizeCommonOptions: trimmed,
// empties and duplicates dropped, list markers stripped, 50 items of 60 characters), so empty rows never reach the save.
// A list that changes from outside (another item loaded into the form) replaces the rows.
export function CommonOptionsField({ options, onChange, className = '' }: { options?: readonly string[] | null; onChange: (options: string[]) => void; className?: string }) {
  const listKey = JSON.stringify(options || []);
  const [rows, setRows] = useState<OptionRow[]>(() => rowsFor(options));
  // The list the rows stand for, as last sent up or loaded.
  const [syncedKey, setSyncedKey] = useState(listKey);
  if (listKey !== syncedKey) {
    setSyncedKey(listKey);
    setRows(rowsFor(options));
  }
  const labelId = useId();
  const inputRefs = useRef(new Map<number, HTMLInputElement>());
  const pendingFocus = useRef<number | null>(null);
  const canAdd = canAddCommonOptionRow(rows.length);
  const count = (sanitizeCommonOptions(rows.map((row) => row.value)) || []).length;

  useEffect(() => {
    if (pendingFocus.current === null) return;
    inputRefs.current.get(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  });

  const commit = (nextRows: OptionRow[]) => {
    const list = sanitizeCommonOptions(nextRows.map((row) => row.value)) || [];
    setRows(nextRows);
    setSyncedKey(JSON.stringify(list));
    onChange(list);
  };

  // An empty last row is reused instead of stacking another one.
  const addRow = () => {
    const last = rows[rows.length - 1];
    if (last && !last.value.trim()) {
      inputRefs.current.get(last.id)?.focus();
      return;
    }
    if (!canAdd) return;
    const row = { id: ++optionRowId, value: '' };
    pendingFocus.current = row.id;
    setRows([...rows, row]);
  };

  const removeRow = (index: number) => {
    const remaining = removeListItem(rows, index);
    const nextRows = remaining.length ? remaining : rowsFor([]);
    pendingFocus.current = nextRows[Math.min(index, nextRows.length - 1)].id;
    commit(nextRows);
  };

  return (
    // No font weight on the group: the site's global styles make inputs and buttons inherit it.
    <div role="group" aria-labelledby={labelId} className={`grid min-w-0 max-w-xl gap-1.5 text-xs text-[#60717d] ${className}`}>
      <span id={labelId} className="font-bold">
        공통 항목
      </span>
      <ol className="grid min-w-0 gap-1.5">
        {rows.map((row, index) => (
          <li key={row.id} className="flex min-w-0 items-center gap-1">
            <span aria-hidden="true" className="w-5 shrink-0 text-right text-[11px] font-bold text-[#8a98a2]">
              {index + 1}
            </span>
            <input
              ref={(element) => {
                if (element) inputRefs.current.set(row.id, element);
                else inputRefs.current.delete(row.id);
              }}
              value={row.value}
              aria-label={`${index + 1}번째 공통 항목`}
              placeholder="예: 안방 욕실"
              onChange={(event) => commit(rows.map((item) => (item.id === row.id ? { ...item, value: event.target.value } : item)))}
              onKeyDown={(event) => {
                // Enter adds the next item and never submits a surrounding form; Enter that finishes Hangul composition is left alone.
                if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.keyCode === 229) return;
                event.preventDefault();
                addRow();
              }}
              className="min-w-0 flex-1 rounded-md border border-[#d5dde2] bg-white px-2.5 py-1.5 text-sm text-[#171512] outline-none focus:border-[#38a9bd]"
            />
            <RowButton label={`${index + 1}번째 공통 항목 위로`} title="위로" disabled={index === 0} onClick={() => commit(moveListItem(rows, index, -1))}>
              <ChevronUp size={14} />
            </RowButton>
            <RowButton label={`${index + 1}번째 공통 항목 아래로`} title="아래로" disabled={index === rows.length - 1} onClick={() => commit(moveListItem(rows, index, 1))}>
              <ChevronDown size={14} />
            </RowButton>
            <RowButton label={`${index + 1}번째 공통 항목 삭제`} title="삭제" danger onClick={() => removeRow(index)}>
              <Trash2 size={13} />
            </RowButton>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={addRow}
        disabled={!canAdd}
        className="justify-self-start rounded-md border border-dashed border-[#38a9bd] bg-white px-3 py-1.5 text-xs font-semibold text-[#267d8c] hover:bg-[#edf8fb] disabled:cursor-not-allowed disabled:opacity-40"
      >
        + 항목 추가
      </button>
      {!canAdd && <span className="font-semibold text-[#8b6420]">공통 항목은 50개까지 저장할 수 있습니다.</span>}
      <span className="leading-5">
        견적서에서 이 품목을 고르면 여기 적은 항목 중에서 품명을 고르거나 여러 개를 한 번에 추가할 수 있습니다.{count ? ` (${count}개)` : ''}
      </span>
    </div>
  );
}

// 분류 · 공종 · 규격 · 단위 · 단가 of the '공통' item being placed.
export function CommonMaterialSummary({ category, material }: { category: string; material: CommonMaterial }) {
  const parts: Array<[string, string]> = [
    ['분류', category || material.category || ''],
    ['공종', material.process || material.category || ''],
    ['규격', material.spec || ''],
    ['단위', material.unit || ''],
    ['단가', formatWon(material.unitPrice)],
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[#f7fafb] px-4 py-3 text-sm text-[#60717d]">
      <span className="rounded-full bg-[#fff3c7] px-2.5 py-0.5 text-xs font-bold text-[#8b6420]">공통</span>
      {parts.map(([label, value], index) => (
        <span key={label} className="inline-flex items-center gap-2">
          {index > 0 && <span aria-hidden="true">·</span>}
          <span>
            {label} <b className="text-[#171512]">{value || '-'}</b>
          </span>
        </span>
      ))}
    </div>
  );
}

// The picker's view for a '공통' item with saved 공통 항목: tick one to use it as the 품명, or several to enter them together.
export function CommonOptionPicker({
  material,
  category,
  onBack,
  onDirect,
  onSubmit,
}: {
  material: CommonMaterial;
  category: string;
  onBack: () => void;
  onDirect: () => void;
  onSubmit: (options: string[]) => void;
}) {
  const options = material.commonOptions || [];
  const [selected, setSelected] = useState<string[]>([]);
  const allSelected = options.length > 0 && selected.length === options.length;
  const toggle = (option: string) =>
    setSelected((current) => (current.includes(option) ? current.filter((item) => item !== option) : [...current, option]));

  return (
    <div>
      <CommonMaterialSummary category={category} material={material} />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[#60717d]">하나를 고르면 품명으로 바로 들어가고, 여러 개를 고르면 수량과 단가를 한 번에 입력하는 창이 열립니다.</p>
        <button
          type="button"
          onClick={() => setSelected(allSelected ? [] : [...options])}
          className="rounded-md border border-[#d5dde2] bg-white px-3 py-1.5 text-xs font-semibold text-[#4d5d66] hover:bg-[#f7fafb]"
        >
          {allSelected ? '전체 해제' : '전체 선택'}
        </button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((option) => {
          const checked = selected.includes(option);
          return (
            <label
              key={option}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm font-semibold transition ${
                checked ? 'border-[#38a9bd] bg-[#edf8fb]' : 'border-[#d5dde2] bg-white hover:border-[#38a9bd]'
              }`}
            >
              <input type="checkbox" checked={checked} onChange={() => toggle(option)} className="h-4 w-4 shrink-0 accent-[#171512]" />
              <span className="min-w-0 break-words">{option}</span>
            </label>
          );
        })}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[#edf2f5] pt-4">
        <button type="button" onClick={onBack} className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold text-[#4d5d66] hover:bg-[#f7fafb]">
          다른 품목 고르기
        </button>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onDirect}
            title="품명을 비워 두고 견적서에서 직접 입력합니다."
            className="rounded-md border border-[#171512] bg-white px-4 py-2 text-sm font-semibold text-[#171512]"
          >
            직접 입력
          </button>
          <button
            type="button"
            disabled={!selected.length}
            onClick={() => onSubmit(options.filter((option) => selected.includes(option)))}
            className="rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            선택 완료{selected.length ? ` (${selected.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
