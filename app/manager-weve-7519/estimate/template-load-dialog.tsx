'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  filterTemplateLines,
  isBlankEstimateLine,
  refreshTemplateLines,
  templateCustomerTotal,
  templateSelectionOptions,
  type TemplateLine,
  type TemplateMaterial,
  type TemplateRefreshResult,
  type TemplateSelection,
} from '../../lib/estimate-templates';
import type { EstimateTemplate, EstimateTemplateSummary, TemplateApiData } from './template-manager';

// 템플릿 불러오기 (spec docs/superpowers/specs/2026-10-22-estimate-templates-design.md §2.2): pick a template, tick the
// 카테고리 and 공간 to bring in, then put the lines into the open estimate at the current 자재 DB 단가.

type TemplateLoadDialogProps = {
  api: (query: Record<string, string>) => Promise<TemplateApiData>;
  materials: TemplateMaterial[];
  ensureLatestMaterials: () => Promise<TemplateMaterial[]>;
  currentLines: TemplateLine[];
  newLineId: () => string;
  onApply: (lines: TemplateLine[], mode: 'replace' | 'append') => void;
  onClose: () => void;
};

const money = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;
const errorText = (caught: unknown, fallback: string) => (caught instanceof Error && caught.message ? caught.message : fallback);

export function TemplateLoadDialog({ api, materials, ensureLatestMaterials, currentLines, newLineId, onApply, onClose }: TemplateLoadDialogProps) {
  const [templates, setTemplates] = useState<EstimateTemplateSummary[]>([]);
  const [template, setTemplate] = useState<EstimateTemplate | null>(null);
  const [selection, setSelection] = useState<TemplateSelection>({ categories: [], spaces: [] });
  // Lines refreshed at the latest 단가, waiting for 바꾸기 / 덧붙이기 when the estimate already has lines.
  const [pending, setPending] = useState<TemplateRefreshResult | null>(null);
  const [result, setResult] = useState<TemplateRefreshResult | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');

  const loadList = async () => {
    const data = await api({ part: 'templates' });
    setTemplates(data.templates || []);
  };

  useEffect(() => {
    setIsBusy(true);
    loadList()
      .catch((caught) => setError(errorText(caught, '템플릿 목록을 불러오지 못했어요.')))
      .finally(() => setIsBusy(false));
    // Loaded once when the window opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const options = useMemo(() => (template ? templateSelectionOptions(template.lines) : { categories: [], spaces: [] }), [template]);
  const chosen = useMemo(() => (template ? filterTemplateLines(template.lines, selection) : []), [template, selection]);
  // The preview uses the materials on screen; the load itself checks they are current first.
  const preview = useMemo(() => refreshTemplateLines(chosen, materials, () => ''), [chosen, materials]);

  const chooseTemplate = async (id: string) => {
    setIsBusy(true);
    setError('');
    try {
      const data = await api({ part: 'template', id });
      if (!data.template) throw new Error('삭제된 템플릿이에요.');
      const all = templateSelectionOptions(data.template.lines);
      setTemplate(data.template);
      setSelection({ categories: all.categories.map((item) => item.label), spaces: all.spaces.map((item) => item.label) });
    } catch (caught) {
      setError(errorText(caught, '템플릿을 불러오지 못했어요.'));
      await loadList().catch(() => undefined);
    } finally {
      setIsBusy(false);
    }
  };

  // A tick changed while 바꾸기 / 덧붙이기 is asked drops that question: the lines it holds came from the old ticks.
  const toggle = (kind: keyof TemplateSelection, label: string) => {
    setPending(null);
    setSelection((current) => ({
      ...current,
      [kind]: current[kind].includes(label) ? current[kind].filter((item) => item !== label) : [...current[kind], label],
    }));
  };
  const setAll = (kind: keyof TemplateSelection, on: boolean) => {
    setPending(null);
    setSelection((current) => ({ ...current, [kind]: on ? options[kind].map((item) => item.label) : [] }));
  };

  const place = (refreshed: TemplateRefreshResult, mode: 'replace' | 'append') => {
    onApply(refreshed.lines, mode);
    setPending(null);
    setResult(refreshed);
  };

  const load = async () => {
    if (!chosen.length) return;
    setIsBusy(true);
    setError('');
    try {
      let latest: TemplateMaterial[];
      try {
        latest = await ensureLatestMaterials();
      } catch {
        throw new Error('최신 단가를 확인하지 못했어요. 다시 시도해 주세요.');
      }
      const refreshed = refreshTemplateLines(chosen, latest, newLineId);
      if (currentLines.every(isBlankEstimateLine)) place(refreshed, 'replace');
      else setPending(refreshed);
    } catch (caught) {
      setError(errorText(caught, '템플릿을 불러오지 못했어요.'));
    } finally {
      setIsBusy(false);
    }
  };

  const buttonClass = 'rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold text-[#171512] hover:bg-[#f2f6f8] disabled:opacity-50';
  const primaryClass = 'rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';

  const checklist = (kind: keyof TemplateSelection, title: string) => (
    <fieldset className="min-w-0 rounded-lg border border-[#d5dde2] p-3">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <div className="mb-2 flex gap-2 text-xs">
        <button type="button" onClick={() => setAll(kind, true)} className="rounded border border-[#d5dde2] px-2 py-1">모두 켜기</button>
        <button type="button" onClick={() => setAll(kind, false)} className="rounded border border-[#d5dde2] px-2 py-1">모두 끄기</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {options[kind].map((item) => (
          <label key={item.label} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${selection[kind].includes(item.label) ? 'border-[#38a9bd] bg-[#edf8fb]' : 'border-[#d5dde2] bg-white text-[#8a979f]'}`}>
            <input type="checkbox" checked={selection[kind].includes(item.label)} onChange={() => toggle(kind, item.label)} />
            {item.label}
            <span className="text-xs text-[#60717d]">{item.count}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <div className="no-print fixed inset-0 z-40 flex items-center justify-center bg-[#171512]/45 px-4 py-6 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="template-load-title" className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[#d5dde2] bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-[#edf2f5] p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#38a9bd]">LOAD TEMPLATE</p>
            <h2 id="template-load-title" className="mt-1 text-xl font-semibold">템플릿 불러오기</h2>
            <p className="mt-1 text-sm text-[#60717d]">불러올 공사를 고르면 최신 자재 DB 단가로 견적서에 넣어요. 넣은 뒤 저장해야 견적에 남아요.</p>
          </div>
          <button type="button" onClick={onClose} className={buttonClass}>닫기</button>
        </header>

        {error && <p className="mx-5 mt-4 rounded-md bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">{error}</p>}

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {result ? (
            <div className="grid gap-4 text-sm">
              <p className="rounded-md bg-[#edf8fb] px-4 py-3 font-semibold text-[#267d8c]">견적서에 항목 {result.lines.length}개를 넣었어요.</p>
              {result.changed.length > 0 && (
                <div>
                  <h3 className="font-semibold">단가가 바뀐 항목 {result.changed.length}개</h3>
                  <ul className="mt-2 grid gap-1 text-[#4d5d66]">
                    {result.changed.map((item, index) => (
                      <li key={`${item.name}-${index}`}>{item.name}: {money(item.before)} → {money(item.after)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.notFound.length > 0 && (
                <div>
                  <h3 className="font-semibold text-amber-800">DB에서 못 찾은 항목 {result.notFound.length}개 (템플릿 단가 그대로)</h3>
                  <ul className="mt-2 grid gap-1 text-[#4d5d66]">
                    {result.notFound.map((name, index) => (
                      <li key={`${name}-${index}`}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : !template ? (
            templates.length === 0 ? (
              <p className="rounded-md bg-[#f7fafb] px-4 py-6 text-center text-sm text-[#60717d]">{isBusy ? '불러오는 중…' : "템플릿이 없어요. '템플릿 관리'에서 먼저 만들어 주세요."}</p>
            ) : (
              <ul className="grid gap-2">
                {templates.map((item) => (
                  <li key={item.id}>
                    <button type="button" disabled={isBusy} onClick={() => void chooseTemplate(item.id)} className="w-full rounded-lg border border-[#d5dde2] p-3 text-left hover:border-[#38a9bd]">
                      <span className="block font-semibold">{item.name}</span>
                      <span className="text-xs text-[#60717d]">항목 {item.lineCount}개 · 고객 합계 {money(item.customerTotal)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="grid gap-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{template.name}</p>
                <button type="button" onClick={() => setTemplate(null)} className={buttonClass}>다른 템플릿</button>
              </div>
              {checklist('categories', '카테고리')}
              {checklist('spaces', '공간')}
              <div className="grid gap-1 rounded-lg bg-[#f7fafb] p-4 text-sm">
                <p>불러올 항목 <b>{chosen.length}개</b> · 최신 단가 기준 고객 합계 <b>{money(templateCustomerTotal(preview.lines))}</b></p>
                <p className="text-[#60717d]">템플릿 단가와 달라진 항목 {preview.changed.length}개 · DB에서 못 찾은 항목 {preview.notFound.length}개</p>
              </div>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-[#edf2f5] px-5 py-3">
          {result ? (
            <button type="button" onClick={onClose} className={primaryClass}>확인</button>
          ) : pending ? (
            <>
              <p className="mr-auto self-center text-sm">견적서에 이미 항목이 있어요. 템플릿 항목 {pending.lines.length}개를 어떻게 넣을까요?</p>
              <button type="button" onClick={() => place(pending, 'replace')} className={buttonClass}>기존 항목 지우고 바꾸기</button>
              <button type="button" onClick={() => place(pending, 'append')} className={primaryClass}>뒤에 덧붙이기</button>
              <button type="button" onClick={() => setPending(null)} className={buttonClass}>취소</button>
            </>
          ) : (
            template && (
              <button type="button" disabled={isBusy || chosen.length === 0} onClick={() => void load()} className={primaryClass}>
                {isBusy ? '최신 단가 확인 중…' : '불러오기'}
              </button>
            )
          )}
        </footer>
      </section>
    </div>
  );
}
