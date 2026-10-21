'use client';

import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CustomerEstimateView } from '../../lib/mobile-estimate';
import { Card, EmptyText, Notice } from './mobile-ui';

// 견적 보기 (spec 2026-10-21 §4): read only, customer figures only (the server leaves costs and margins out).

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
const shortDay = (iso: string) => {
  const ms = Date.parse(iso);
  if (!iso || Number.isNaN(ms)) return '';
  const seoul = new Date(ms + 9 * 3600000);
  return `${seoul.getUTCFullYear()}.${seoul.getUTCMonth() + 1}.${seoul.getUTCDate()} 수정`;
};

export function EstimateView({
  siteId,
  siteTitle,
  load,
  onBack,
}: {
  siteId: string;
  siteTitle: string;
  load: (siteId: string) => Promise<CustomerEstimateView | null>;
  onBack: () => void;
}) {
  const [estimate, setEstimate] = useState<CustomerEstimateView | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let alive = true;
    setEstimate(undefined);
    setError('');
    loadRef
      .current(siteId)
      .then((view) => alive && setEstimate(view))
      .catch((loadError) => alive && setError(loadError instanceof Error && loadError.message ? loadError.message : '견적을 불러오지 못했어요.'));
    return () => {
      alive = false;
    };
  }, [siteId, attempt]);

  const toggle = (category: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="-ml-1 flex h-10 items-center gap-1 pr-3 text-sm text-[#625d54]">
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        {siteTitle}
      </button>

      {error ? (
        <Notice onRetry={() => setAttempt((value) => value + 1)}>{error}</Notice>
      ) : estimate === undefined ? (
        <p className="py-10 text-center text-sm text-[#8b8276]">견적을 불러오는 중…</p>
      ) : estimate === null ? (
        <EmptyText>이 현장에는 견적이 없어요.</EmptyText>
      ) : (
        <>
          <Card>
            <p className="text-sm text-[#625d54]">
              {[estimate.versionLabel || (estimate.versionType === 'final' ? '확정 견적' : '최근 견적'), shortDay(estimate.updatedAt)]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="mt-1 text-[22px] font-bold text-[#171512]">{won(estimate.total)}</p>
            <p className="text-xs text-[#8b8276]">({estimate.vatNote})</p>
          </Card>

          {estimate.groups.length === 0 ? (
            <EmptyText>견적에 항목이 없어요.</EmptyText>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[#eadfcd] bg-white">
              {estimate.groups.map((group, index) => {
                const isOpen = open.has(group.category);
                return (
                  <div key={group.category} className={index > 0 ? 'border-t border-[#f1ebe0]' : ''}>
                    <button
                      type="button"
                      onClick={() => toggle(group.category)}
                      aria-expanded={isOpen}
                      className="flex min-h-[52px] w-full items-center gap-2 px-4 py-2 text-left active:bg-[#faf6ef]"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-[#8b8276]" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-[#8b8276]" aria-hidden="true" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#171512]">{group.category}</span>
                      <span className="shrink-0 text-sm font-semibold text-[#171512]">{won(group.subtotal)}</span>
                    </button>
                    {isOpen && (
                      <ul className="space-y-2 bg-[#faf6ef] px-4 py-3">
                        {group.lines.map((line, lineIndex) => (
                          <li key={`${lineIndex}-${line.name}`} className="text-sm">
                            <p className="break-words font-semibold text-[#171512]">
                              {line.name}
                              {line.spec ? <span className="font-normal text-[#625d54]"> · {line.spec}</span> : null}
                            </p>
                            <p className="text-xs text-[#625d54]">
                              {line.quantity.toLocaleString('ko-KR')} {line.unit} × {won(line.unitPrice)} = <b className="text-[#171512]">{won(line.amount)}</b>
                            </p>
                            {line.note && <p className="break-words text-xs text-[#8f6f43]">{line.note}</p>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="px-1 text-xs text-[#8b8276]">고칠 때는 PC 견적 화면에서 고쳐 주세요.</p>
        </>
      )}
    </div>
  );
}
