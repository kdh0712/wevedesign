'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  detailDisplayChanges,
  detailDisplayPreview,
  hasDetailDisplay,
  normalizeDetailDisplay,
  type DetailDisplay,
  type DisplayLine,
} from '../../lib/estimate-detail-display';
import { NumberTextInput } from './number-text-input';

// 세부내역서 표시 바꾸기 (spec docs/superpowers/specs/2026-11-26-detail-display-design.md): the 품명, 규격, 단위 and 수량 one
// estimate line shows on the 세부내역서. The amount stays the estimate's; the 단가 shown is that amount ÷ the shown 수량.

const won = (value: number) => `${value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원`;
const INPUT = 'w-full min-w-0 rounded-md border px-2.5 py-1.5 text-sm outline-none focus:border-[#38a9bd]';
// A field that differs from the estimate line is outlined in teal.
const inputTone = (changed: boolean) => (changed ? 'border-[#38a9bd] bg-[#f6fbfc]' : 'border-[#d5dde2] bg-white');
const FIXED = 'w-full rounded-md border border-[#e3e9ec] bg-[#f4f6f7] px-2.5 py-1.5 text-right text-sm text-[#3b4a54]';

export function DetailDisplayDialog({
  line,
  onApply,
  onClose,
}: {
  line: DisplayLine;
  // undefined: show the line as the estimate has it.
  onApply: (display: DetailDisplay | undefined) => void;
  onClose: () => void;
}) {
  // A display set for another 품명 (the line was re-picked) is not shown here, as on the documents.
  const stored = hasDetailDisplay(line) ? normalizeDetailDisplay(line.detailDisplay) : undefined;
  const [fields, setFields] = useState({
    name: stored?.name ?? line.name,
    spec: stored?.spec ?? line.spec,
    unit: stored?.unit ?? line.unit,
    quantity: stored?.quantity ?? (Number(line.quantity) || 0),
  });

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  const changes = detailDisplayChanges(line, fields);
  const preview = detailDisplayPreview(line, changes ?? {});
  const edited = (key: 'name' | 'spec' | 'unit' | 'quantity') => Boolean(changes && key in changes);
  const field = (key: 'name' | 'spec' | 'unit') => (
    <input
      autoFocus={key === 'name'}
      placeholder={key === 'spec' ? '비우면 규격 없이' : line[key]}
      value={fields[key]}
      onChange={(event) => setFields((current) => ({ ...current, [key]: event.target.value }))}
      aria-label={`세부내역서 ${key === 'name' ? '품명' : key === 'spec' ? '규격' : '단위'}`}
      className={`${INPUT} ${inputTone(edited(key))}`}
    />
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="세부내역서 표시 바꾸기"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="no-print fixed inset-0 z-[80] flex items-center justify-center bg-[#171512]/50 p-4"
    >
      <section className="w-full max-w-[640px] rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">세부내역서 표시 바꾸기</h2>
            <p className="mt-1 text-xs text-[#60717d]">
              {[line.category || line.process, line.name].filter(Boolean).join(' · ')} · 금액 {won(preview.amount)}은 바뀌지 않아요. 견적서 값은 그대로예요.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded-full border border-[#d5dde2] p-1.5 text-[#60717d]">
            <X size={16} />
          </button>
        </div>

        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-[#60717d]">
              <th className="w-[16%] pb-2 font-semibold"></th>
              <th className="w-[36%] pb-2 font-semibold">견적서 (그대로)</th>
              <th className="pb-2 font-semibold">세부내역서에 보일 값</th>
            </tr>
          </thead>
          <tbody className="[&_td]:border-t [&_td]:border-[#edf2f5] [&_td]:py-1.5 [&_th]:border-t [&_th]:border-[#edf2f5] [&_th]:py-1.5">
            <tr>
              <th className="text-left text-xs font-semibold text-[#60717d]">품명</th>
              <td className="pr-3">{line.name}</td>
              <td>{field('name')}</td>
            </tr>
            <tr>
              <th className="text-left text-xs font-semibold text-[#60717d]">규격</th>
              <td className="pr-3">{line.spec || <span className="text-[#a9b4bb]">-</span>}</td>
              <td>{field('spec')}</td>
            </tr>
            <tr>
              <th className="text-left text-xs font-semibold text-[#60717d]">단위</th>
              <td className="pr-3">{line.unit || <span className="text-[#a9b4bb]">-</span>}</td>
              <td>{field('unit')}</td>
            </tr>
            <tr>
              <th className="text-left text-xs font-semibold text-[#60717d]">수량</th>
              <td className="pr-3">{(Number(line.quantity) || 0).toLocaleString('ko-KR')}</td>
              <td>
                {/* The number field draws its own border, so a changed 수량 gets a ring around it instead. */}
                <div className={`rounded-md ${edited('quantity') ? 'ring-2 ring-[#38a9bd]/60' : ''}`}>
                  <NumberTextInput
                    value={fields.quantity}
                    onChange={(quantity) => setFields((current) => ({ ...current, quantity }))}
                    ariaLabel="세부내역서 수량"
                    className="w-full text-right text-sm"
                  />
                </div>
              </td>
            </tr>
            <tr>
              <th className="text-left text-xs font-semibold text-[#60717d]">단가</th>
              <td className="pr-3">{won(Number(line.customerUnitPrice) || 0)}</td>
              <td>
                <div className={FIXED}>{won(preview.unitPrice)} (자동)</div>
              </td>
            </tr>
            <tr>
              <th className="text-left text-xs font-semibold text-[#60717d]">금액</th>
              <td className="pr-3">{won(preview.amount)}</td>
              <td>
                <div className={FIXED}>{won(preview.amount)} (그대로)</div>
              </td>
            </tr>
          </tbody>
        </table>

        {preview.fractional && (
          <p className="mt-3 rounded-md border border-[#e7c37a] bg-[#fff8e8] px-3 py-2 text-xs font-semibold text-[#8b6420]">
            금액이 수량으로 나누어떨어지지 않아 단가에 소수점이 생겨요. 서류에는 금액은 그대로, 단가는 소수점까지 나와요.
          </p>
        )}
        <p className="mt-3 text-xs text-[#60717d]">품명·단위를 비우거나 수량을 0으로 두면 견적서 값으로 나와요. 규격은 비우면 빈칸으로 나와요.</p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onApply(undefined)}
            disabled={!stored && !changes}
            className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40"
          >
            원래대로
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold">
              취소
            </button>
            <button type="button" onClick={() => onApply(changes)} className="rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white">
              적용
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
