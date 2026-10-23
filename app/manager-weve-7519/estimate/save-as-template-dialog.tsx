'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  groupColor,
  groupTemplateLines,
  isBlankEstimateLine,
  templateBaseAreaError,
  templateLinesError,
  templateNameError,
  type TemplateLine,
} from '../../lib/estimate-templates';
import type { EstimateTemplateSummary, TemplateApiData } from './template-manager';

// 이 견적을 템플릿으로 저장 (spec docs/superpowers/specs/2026-10-23-estimate-grouped-editor-design.md §5): pick the 공사 to keep,
// then save them as a new template or over an existing one. The site estimate itself is not changed.

type SaveAsTemplateDialogProps = {
  api: (query: Record<string, string>) => Promise<TemplateApiData>;
  post: (body: Record<string, unknown>) => Promise<Response>;
  lines: TemplateLine[];
  isBase: (line: TemplateLine) => boolean;
  newLineId: () => string;
  onClose: () => void;
};

const errorText = (caught: unknown, fallback: string) => (caught instanceof Error && caught.message ? caught.message : fallback);
const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;

export function SaveAsTemplateDialog({ api, post, lines, isBase, newLineId, onClose }: SaveAsTemplateDialogProps) {
  const groups = useMemo(() => groupTemplateLines(lines.filter((line) => !isBlankEstimateLine(line))), [lines]);
  // The 공사 holding the estimate's 기본견적 line starts unticked: it names this site, not the kind of work.
  const [checked, setChecked] = useState<string[]>(() => groups.filter((group) => !group.lines.some(isBase)).map((group) => group.label));
  const [mode, setMode] = useState<'new' | 'overwrite'>('new');
  const [name, setName] = useState('');
  const [baseArea, setBaseArea] = useState('');
  const [templates, setTemplates] = useState<EstimateTemplateSummary[]>([]);
  const [targetId, setTargetId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    api({ part: 'templates' })
      .then((data) => setTemplates(data.templates || []))
      .catch((caught) => setError(errorText(caught, '템플릿 목록을 불러오지 못했어요.')));
    // Loaded once when the window opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chosenLines = groups.filter((group) => checked.includes(group.label)).flatMap((group) => group.lines);
  const target = templates.find((template) => template.id === targetId);

  const send = async (template: Record<string, unknown>) => {
    const response = await post({ action: 'saveTemplate', template });
    const data = ((await response.json().catch(() => ({}))) || {}) as TemplateApiData;
    if (response.status === 409) throw new Error('다른 곳에서 먼저 고쳤어요. 다시 시도해 주세요.');
    if (!response.ok || !data.template) throw new Error(data.error || '템플릿을 저장하지 못했어요.');
    return data.template;
  };

  const save = async () => {
    setError('');
    const fresh = chosenLines.map((line) => ({ ...line, id: newLineId() }));
    const problem = !fresh.length ? '저장할 공사를 하나 이상 골라 주세요.' : templateLinesError(fresh);
    if (problem) {
      setError(problem);
      return;
    }
    if (mode === 'new') {
      const nameProblem = templateNameError(name, templates.map((template) => template.name)) || templateBaseAreaError(baseArea);
      if (nameProblem) {
        setError(nameProblem);
        return;
      }
    } else if (!target) {
      setError('덮어쓸 템플릿을 골라 주세요.');
      return;
    } else if (!confirming) {
      setConfirming(true);
      return;
    }
    setIsBusy(true);
    try {
      if (mode === 'new') {
        const saved = await send({ name: name.trim(), baseArea: baseArea.trim(), lines: fresh });
        setDone(`새 템플릿 '${saved.name}'에 항목 ${fresh.length}개를 저장했어요.`);
      } else {
        const read = await api({ part: 'template', id: targetId });
        if (!read.template) throw new Error('삭제된 템플릿이에요.');
        const saved = await send({ id: targetId, name: read.template.name, baseArea: read.template.baseArea ?? '', lines: fresh, baseUpdateTime: read.template.updateTime });
        setDone(`템플릿 '${saved.name}'을(를) 이 견적의 항목 ${fresh.length}개로 바꿨어요.`);
      }
    } catch (caught) {
      setError(errorText(caught, '템플릿을 저장하지 못했어요.'));
      setConfirming(false);
    } finally {
      setIsBusy(false);
    }
  };

  const inputClass = 'w-full min-w-0 rounded-md border border-[#d5dde2] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#38a9bd]';
  const buttonClass = 'rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold text-[#171512] hover:bg-[#f2f6f8] disabled:opacity-50';
  const primaryClass = 'rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
  const tab = (value: 'new' | 'overwrite', label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(value);
        setConfirming(false);
        setError('');
      }}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold ${mode === value ? 'bg-[#171512] text-white' : 'border border-[#d5dde2] bg-white'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="no-print fixed inset-0 z-40 flex items-center justify-center bg-[#171512]/45 px-4 py-6 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="save-as-template-title" className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[#d5dde2] bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-[#edf2f5] p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#38a9bd]">SAVE AS TEMPLATE</p>
            <h2 id="save-as-template-title" className="mt-1 text-xl font-semibold">이 견적을 템플릿으로 저장</h2>
            <p className="mt-1 text-sm text-[#60717d]">고른 공사의 항목을 템플릿으로 저장해요. 현장 견적은 바뀌지 않아요.</p>
          </div>
          <button type="button" onClick={onClose} className={buttonClass}>닫기</button>
        </header>
        {error && <p className="mx-5 mt-4 rounded-md bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">{error}</p>}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {done ? (
            <p className="rounded-md bg-[#edf8fb] px-4 py-3 text-sm font-semibold text-[#267d8c]">{done}</p>
          ) : (
            <div className="grid gap-4">
              <fieldset className="rounded-lg border border-[#d5dde2] p-3">
                <legend className="px-1 text-sm font-semibold">저장할 공사</legend>
                <div className="flex flex-wrap gap-2">
                  {groups.map((group, index) => {
                    const color = groupColor(index);
                    const on = checked.includes(group.label);
                    return (
                      <label key={group.label} className="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm" style={on ? { borderColor: color.accent, background: color.soft } : undefined}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => {
                            setConfirming(false);
                            setChecked((current) => (on ? current.filter((item) => item !== group.label) : [...current, group.label]));
                          }}
                        />
                        <span style={on ? { color: color.accent } : undefined}>{group.label}</span>
                        <span className="text-xs text-[#60717d]">{group.lines.length}개 · {won(group.customerTotal)}</span>
                        {group.lines.some(isBase) && <span className="text-xs text-[#8b6420]">기본견적</span>}
                      </label>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-[#60717d]">항목 {chosenLines.length}개를 저장해요. 고객 단가·실행 단가·DB 연결은 그대로 들어가요.</p>
              </fieldset>
              <div className="flex gap-2">
                {tab('new', '새 템플릿')}
                {tab('overwrite', '기존 템플릿에 덮어쓰기')}
              </div>
              {mode === 'new' ? (
                <div className="flex flex-wrap gap-3">
                  <label className="grid min-w-[240px] flex-1 gap-1 text-xs font-semibold text-[#4d5d66]">
                    템플릿 이름
                    <input value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 30평형 풀공사" className={inputClass} />
                  </label>
                  <label className="grid w-28 gap-1 text-xs font-semibold text-[#4d5d66]">
                    기준 평형
                    <input value={baseArea} onChange={(event) => setBaseArea(event.target.value)} inputMode="decimal" placeholder="예: 30" aria-label="기준 평형" className={inputClass} />
                  </label>
                </div>
              ) : (
                <div className="grid gap-2">
                  {templates.length === 0 && <p className="text-sm text-[#60717d]">아직 템플릿이 없어요. &apos;새 템플릿&apos;으로 저장해 주세요.</p>}
                  {templates.map((template) => (
                    <label key={template.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${targetId === template.id ? 'border-[#171512]' : 'border-[#d5dde2]'}`}>
                      <input
                        type="radio"
                        name="overwrite-target"
                        checked={targetId === template.id}
                        onChange={() => {
                          setTargetId(template.id);
                          setConfirming(false);
                        }}
                      />
                      <span className="font-semibold">{template.name}</span>
                      <span className="text-xs text-[#60717d]">항목 {template.lineCount}개{template.baseArea ? ` · ${template.baseArea}평 기준` : ''}</span>
                    </label>
                  ))}
                  {confirming && target && (
                    <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                      &apos;{target.name}&apos; 템플릿의 항목을 이 견적으로 바꿀까요? 기존 항목은 사라져요. 한 번 더 누르면 저장해요.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-[#edf2f5] px-5 py-3">
          {done ? (
            <button type="button" onClick={onClose} className={primaryClass}>확인</button>
          ) : (
            <button type="button" disabled={isBusy} onClick={() => void save()} className={primaryClass}>
              {isBusy ? '저장 중…' : mode === 'new' ? '새 템플릿으로 저장' : confirming ? '덮어쓰기 확인' : '덮어쓰기'}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
