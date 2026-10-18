'use client';

import { useState } from 'react';
import { formatCommonOptions, parseCommonOptions } from '../../lib/estimate-common-options';

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

// "공통 항목 (한 줄에 하나)" for a '공통' DB item. The text stays as typed while editing and every change sends the parsed
// list up; leaving the field shows the list as it will be saved. A list that changes from outside (another item loaded
// into the form) replaces the text.
export function CommonOptionsField({ options, onChange, className = '' }: { options?: readonly string[] | null; onChange: (options: string[]) => void; className?: string }) {
  const formatted = formatCommonOptions(options);
  const [text, setText] = useState(formatted);
  // The list the text stands for, as last sent up or loaded.
  const [shownList, setShownList] = useState(formatted);
  if (formatted !== shownList) {
    setShownList(formatted);
    setText(formatted);
  }
  const count = parseCommonOptions(text).length;

  return (
    <label className={`grid gap-1 text-xs font-bold text-[#60717d] ${className}`}>
      공통 항목 (한 줄에 하나)
      <textarea
        value={text}
        rows={4}
        onChange={(event) => {
          const parsed = parseCommonOptions(event.target.value);
          setText(event.target.value);
          setShownList(formatCommonOptions(parsed));
          onChange(parsed);
        }}
        onBlur={() => setText(formatCommonOptions(parseCommonOptions(text)))}
        placeholder={'안방 욕실\n거실 욕실'}
        className="min-h-[96px] resize-y rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-normal leading-6 text-[#171512] outline-none focus:border-[#38a9bd]"
      />
      <span className="font-normal leading-5">
        견적서에서 이 품목을 고르면 여기 적은 항목 중에서 품명을 고르거나 여러 개를 한 번에 추가할 수 있습니다.{count ? ` (${count}개)` : ''}
      </span>
    </label>
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
