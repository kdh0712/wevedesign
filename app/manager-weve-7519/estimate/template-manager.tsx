'use client';

import { useEffect, useMemo, useState } from 'react';
import { NumberTextInput } from './number-text-input';
import {
  findTemplateMaterial,
  isBlankEstimateLine,
  normalizeTemplateLines,
  placeTemplateLines,
  templateCustomerTotal,
  templateLinesError,
  templateNameError,
  type TemplateLine,
  type TemplateMaterial,
} from '../../lib/estimate-templates';

// 템플릿 관리 (spec docs/superpowers/specs/2026-10-22-estimate-templates-design.md §2.1): the list of templates and the
// editor where a template is built like an estimate. Templates are stored apart from sites; nothing here touches the
// estimate that is open on the page.

export type EstimateTemplateSummary = { id: string; name: string; lineCount: number; customerTotal: number; updatedAt: string; updatedBy: string };
export type EstimateTemplate = EstimateTemplateSummary & { lines: TemplateLine[]; updateTime: string };
export type TemplateApiData = {
  error?: string;
  templates?: EstimateTemplateSummary[];
  template?: EstimateTemplate;
  estimates?: Array<{ _id?: string; versionLabel?: string; linesJson?: string }>;
  conflict?: 'changed' | 'deleted';
};

type TemplateManagerProps = {
  api: (query: Record<string, string>) => Promise<TemplateApiData>;
  post: (body: Record<string, unknown>) => Promise<Response>;
  materials: TemplateMaterial[];
  sites: Array<{ _id: string; title?: string }>;
  spaceOptions: string[];
  categoryOptions: string[];
  pickFromDb: (onPicked: (lines: TemplateLine[]) => void) => void;
  newLineId: () => string;
  onClose: () => void;
};

type Draft = { id: string; name: string; lines: TemplateLine[]; baseUpdateTime: string };
type ConfirmBox = { message: string; actions: Array<{ label: string; run: () => void; primary?: boolean }> };

const snapshotOf = (draft: Draft | null) => (draft ? JSON.stringify({ name: draft.name.trim(), lines: draft.lines }) : '');
const money = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;
const shortDate = (value: string) => (value ? value.slice(0, 10) : '');
const errorText = (caught: unknown, fallback: string) => (caught instanceof Error && caught.message ? caught.message : fallback);
const emptyTemplateLine = (id: string): TemplateLine => ({
  id,
  space: '',
  category: '',
  process: '',
  name: '',
  spec: '',
  unit: '',
  quantity: 1,
  customerUnitPrice: 0,
  executionUnitPrice: 0,
  note: '',
});

function copyName(name: string, names: string[]) {
  const taken = (candidate: string) => names.some((other) => templateNameError(candidate, [other]) !== '');
  let candidate = `${name} 복사`;
  for (let n = 2; taken(candidate); n += 1) candidate = `${name} 복사 ${n}`;
  return candidate;
}

export function TemplateManager({ api, post, materials, sites, spaceOptions, categoryOptions, pickFromDb, newLineId, onClose }: TemplateManagerProps) {
  const [templates, setTemplates] = useState<EstimateTemplateSummary[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [confirmBox, setConfirmBox] = useState<ConfirmBox | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  // 'changed': someone saved this template after it was opened; 'deleted': it was deleted meanwhile.
  const [conflict, setConflict] = useState<'changed' | 'deleted' | null>(null);
  const [saveAsName, setSaveAsName] = useState('');
  const [copyPanel, setCopyPanel] = useState<{ siteId: string; estimates: NonNullable<TemplateApiData['estimates']>; estimateId: string } | null>(null);

  const isDirty = Boolean(draft) && snapshotOf(draft) !== savedSnapshot;
  const totals = useMemo(() => {
    const lines = draft?.lines || [];
    return {
      customer: templateCustomerTotal(lines),
      execution: Math.round(lines.reduce((sum, line) => sum + line.quantity * line.executionUnitPrice, 0)),
    };
  }, [draft]);

  const run = async (task: () => Promise<void>, fallback: string) => {
    setIsBusy(true);
    setError('');
    setStatus('');
    try {
      await task();
    } catch (caught) {
      setError(errorText(caught, fallback));
    } finally {
      setIsBusy(false);
    }
  };

  const loadList = async () => {
    const data = await api({ part: 'templates' });
    setTemplates(data.templates || []);
  };

  useEffect(() => {
    void run(loadList, '템플릿 목록을 불러오지 못했어요.');
    // Loaded once when the window opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const postJson = async (body: Record<string, unknown>) => {
    const response = await post(body);
    const data = ((await response.json().catch(() => ({}))) || {}) as TemplateApiData;
    return { response, data };
  };

  const readTemplate = async (id: string) => {
    const data = await api({ part: 'template', id });
    if (!data.template) throw new Error('삭제된 템플릿이에요.');
    return data.template;
  };

  // A read of a deleted template fails with the server's '삭제된 템플릿이에요.'; the list is reloaded so it disappears.
  const afterMissing = async (caught: unknown) => {
    setError(errorText(caught, '템플릿을 불러오지 못했어요.'));
    await loadList().catch(() => undefined);
  };

  const openDraft = (next: Draft, saved: boolean) => {
    setDraft(next);
    setSavedSnapshot(saved ? snapshotOf(next) : '');
    setConflict(null);
    setCopyPanel(null);
  };

  const closeDraft = () => {
    setDraft(null);
    setSavedSnapshot('');
    setConflict(null);
    setCopyPanel(null);
    setStatus('');
  };

  // Leaving an edited template asks first, inside this window.
  const guard = (action: () => void) => {
    if (!isDirty) {
      action();
      return;
    }
    setConfirmBox({
      message: '저장하지 않은 변경이 있어요. 버리고 넘어갈까요?',
      actions: [
        { label: '버리고 넘어가기', run: action },
        { label: '계속 작업하기', run: () => undefined, primary: true },
      ],
    });
  };

  const openTemplate = (id: string) =>
    guard(() => {
      void run(async () => {
        try {
          const template = await readTemplate(id);
          openDraft({ id: template.id, name: template.name, lines: template.lines, baseUpdateTime: template.updateTime }, true);
        } catch (caught) {
          await afterMissing(caught);
        }
      }, '템플릿을 불러오지 못했어요.');
    });

  const newTemplate = () => guard(() => openDraft({ id: '', name: '', lines: [emptyTemplateLine(newLineId())], baseUpdateTime: '' }, false));

  const copyTemplate = (summary: EstimateTemplateSummary) =>
    guard(() => {
      void run(async () => {
        try {
          const template = await readTemplate(summary.id);
          const name = copyName(template.name, templates.map((item) => item.name));
          openDraft({ id: '', name, lines: template.lines.map((line) => ({ ...line, id: newLineId() })), baseUpdateTime: '' }, false);
          setStatus('복사본을 열었어요. 저장해야 템플릿으로 생겨요.');
        } catch (caught) {
          await afterMissing(caught);
        }
      }, '템플릿을 복사하지 못했어요.');
    });

  const renameTemplate = (id: string, name: string) =>
    run(async () => {
      const others = templates.filter((item) => item.id !== id).map((item) => item.name);
      const nameError = templateNameError(name, others);
      if (nameError) throw new Error(nameError);
      const template = await readTemplate(id);
      const { response, data } = await postJson({ action: 'saveTemplate', template: { id, name, lines: template.lines, baseUpdateTime: template.updateTime } });
      if (!response.ok) throw new Error(data.error || '이름을 바꾸지 못했어요.');
      setRenaming(null);
      await loadList();
      setStatus('이름을 바꿨어요.');
    }, '이름을 바꾸지 못했어요.');

  const deleteTemplate = (summary: EstimateTemplateSummary) =>
    setConfirmBox({
      message: `'${summary.name}' 템플릿을 삭제할까요? 삭제하면 되돌릴 수 없어요.`,
      actions: [
        {
          label: '삭제',
          run: () =>
            void run(async () => {
              const { response, data } = await postJson({ action: 'deleteTemplate', id: summary.id });
              if (!response.ok) throw new Error(data.error || '템플릿을 삭제하지 못했어요.');
              await loadList();
              setStatus('템플릿을 삭제했어요.');
            }, '템플릿을 삭제하지 못했어요.'),
        },
        { label: '취소', run: () => undefined, primary: true },
      ],
    });

  const saveDraft = (asNew?: { name: string }) =>
    run(async () => {
      if (!draft) return;
      const target = asNew ? { ...draft, id: '', name: asNew.name, baseUpdateTime: '' } : draft;
      const others = templates.filter((item) => item.id !== target.id).map((item) => item.name);
      const problem = templateNameError(target.name, others) || templateLinesError(target.lines);
      if (problem) throw new Error(problem);
      const lines = target.lines.filter((line) => !isBlankEstimateLine(line));
      const { response, data } = await postJson({
        action: 'saveTemplate',
        template: { id: target.id || undefined, name: target.name, lines, baseUpdateTime: target.baseUpdateTime || undefined },
      });
      if (response.status === 409 && data.conflict === 'changed') {
        setConflict('changed');
        setSaveAsName(copyName(target.name, templates.map((item) => item.name)));
        throw new Error('다른 곳에서 먼저 고쳤어요. 상대 내용을 다시 불러오거나, 내 작업을 다른 이름으로 저장해 주세요.');
      }
      if ((response.status === 409 || response.status === 404) && data.conflict === 'deleted') {
        setConflict('deleted');
        setSaveAsName(copyName(target.name, templates.map((item) => item.name)));
        throw new Error('삭제된 템플릿이에요. 내 작업을 다른 이름으로 저장할 수 있어요.');
      }
      if (!response.ok || !data.template) throw new Error(data.error || '템플릿을 저장하지 못했어요.');
      const saved = data.template;
      openDraft({ id: saved.id, name: saved.name, lines: saved.lines, baseUpdateTime: saved.updateTime }, true);
      await loadList();
      setStatus('템플릿을 저장했어요.');
    }, '템플릿을 저장하지 못했어요.');

  const reloadFromServer = () => {
    if (!draft?.id) return;
    const id = draft.id;
    void run(async () => {
      try {
        const template = await readTemplate(id);
        openDraft({ id: template.id, name: template.name, lines: template.lines, baseUpdateTime: template.updateTime }, true);
        setStatus('다른 곳에서 저장한 내용을 다시 불러왔어요.');
      } catch (caught) {
        await afterMissing(caught);
      }
    }, '템플릿을 불러오지 못했어요.');
  };

  const updateLines = (change: (lines: TemplateLine[]) => TemplateLine[]) => setDraft((current) => (current ? { ...current, lines: change(current.lines) } : current));
  const updateLine = (id: string, patch: Partial<TemplateLine>) => updateLines((lines) => lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  const moveLine = (index: number, offset: number) =>
    updateLines((lines) => {
      const target = index + offset;
      if (target < 0 || target >= lines.length) return lines;
      const next = [...lines];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  // Lines picked in the DB picker come in at the end, or in place of an untouched empty line.
  const addFromDb = () => pickFromDb((picked) => updateLines((lines) => placeTemplateLines(lines, picked, 'append')));

  const chooseCopySite = (siteId: string) => {
    setCopyPanel({ siteId, estimates: [], estimateId: '' });
    if (!siteId) return;
    void run(async () => {
      const data = await api({ part: 'estimates', siteId });
      setCopyPanel({ siteId, estimates: data.estimates || [], estimateId: '' });
    }, '현장 견적을 불러오지 못했어요.');
  };

  const copyFromEstimate = () => {
    const estimate = copyPanel?.estimates.find((item) => item._id === copyPanel.estimateId);
    if (!estimate || !draft) return;
    const copied = normalizeTemplateLines(estimate.linesJson).map((line) => ({ ...line, id: newLineId() }));
    const place = (mode: 'replace' | 'append') => {
      updateLines((lines) => placeTemplateLines(lines, copied, mode));
      setCopyPanel(null);
      setStatus(`견적 항목 ${copied.length}개를 가져왔어요. 'DB에서 못 찾음' 표시가 붙은 줄은 DB에서 다시 골라 주세요.`);
    };
    if (draft.lines.every(isBlankEstimateLine)) {
      place('replace');
      return;
    }
    setConfirmBox({
      message: '작업 중인 템플릿에 이미 항목이 있어요. 가져온 항목을 어떻게 넣을까요?',
      actions: [
        { label: '기존 항목 지우고 바꾸기', run: () => place('replace') },
        { label: '뒤에 덧붙이기', run: () => place('append'), primary: true },
        { label: '취소', run: () => undefined },
      ],
    });
  };

  const inputClass = 'w-full min-w-0 rounded-md border border-[#d5dde2] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#38a9bd]';
  const buttonClass = 'rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold text-[#171512] hover:bg-[#f2f6f8] disabled:opacity-50';
  const primaryClass = 'rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';

  return (
    <div className="no-print fixed inset-0 z-40 flex items-center justify-center bg-[#171512]/45 px-4 py-6 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="template-manager-title" className="relative flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-[#d5dde2] bg-white shadow-2xl">
        <datalist id="template-categories">
          {categoryOptions.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
        <header className="flex items-start justify-between gap-4 border-b border-[#edf2f5] p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#38a9bd]">ESTIMATE TEMPLATES</p>
            <h2 id="template-manager-title" className="mt-1 text-xl font-semibold">{draft ? (draft.id ? '템플릿 고치기' : '새 템플릿') : '템플릿 관리'}</h2>
            <p className="mt-1 text-sm text-[#60717d]">평형별 견적을 미리 만들어 두고, 현장 견적에서 &apos;템플릿 불러오기&apos;로 가져와요.</p>
          </div>
          <button type="button" onClick={() => guard(onClose)} className={buttonClass}>닫기</button>
        </header>

        {(error || status) && (
          <p className={`mx-5 mt-4 rounded-md px-4 py-2 text-sm font-semibold ${error ? 'bg-red-50 text-red-700' : 'bg-[#edf8fb] text-[#267d8c]'}`}>{error || status}</p>
        )}

        {!draft ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="mb-3 flex justify-end">
              <button type="button" disabled={isBusy} onClick={newTemplate} className={primaryClass}>새로 만들기</button>
            </div>
            {templates.length === 0 ? (
              <p className="rounded-md bg-[#f7fafb] px-4 py-6 text-center text-sm text-[#60717d]">{isBusy ? '불러오는 중…' : '아직 템플릿이 없어요. 새로 만들기로 시작해 보세요.'}</p>
            ) : (
              <ul className="grid gap-2">
                {templates.map((template) => (
                  <li key={template.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-[#d5dde2] p-3">
                    {renaming?.id === template.id ? (
                      <form
                        className="flex min-w-0 flex-1 gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void renameTemplate(template.id, renaming.name);
                        }}
                      >
                        <input value={renaming.name} onChange={(event) => setRenaming({ id: template.id, name: event.target.value })} aria-label="새 템플릿 이름" autoFocus className={inputClass} />
                        <button type="submit" disabled={isBusy} className={primaryClass}>저장</button>
                        <button type="button" onClick={() => setRenaming(null)} className={buttonClass}>취소</button>
                      </form>
                    ) : (
                      <button type="button" onClick={() => openTemplate(template.id)} className="min-w-0 flex-1 text-left">
                        <span className="block truncate font-semibold">{template.name}</span>
                        <span className="text-xs text-[#60717d]">
                          항목 {template.lineCount}개 · 고객 합계 {money(template.customerTotal)} · {shortDate(template.updatedAt)} {template.updatedBy}
                        </span>
                      </button>
                    )}
                    {renaming?.id !== template.id && (
                      <div className="flex gap-2">
                        <button type="button" disabled={isBusy} onClick={() => copyTemplate(template)} className={buttonClass}>복사</button>
                        <button type="button" disabled={isBusy} onClick={() => setRenaming({ id: template.id, name: template.name })} className={buttonClass}>이름 바꾸기</button>
                        <button type="button" disabled={isBusy} onClick={() => deleteTemplate(template)} className={`${buttonClass} text-red-700`}>삭제</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-wrap items-end gap-2 border-b border-[#edf2f5] p-5">
              <label className="grid min-w-[240px] flex-1 gap-1 text-xs font-semibold text-[#4d5d66]">
                템플릿 이름
                <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="예: 30평형 풀공사" className={inputClass} />
              </label>
              <button type="button" onClick={addFromDb} className={buttonClass}>DB에서 추가</button>
              <button type="button" onClick={() => updateLines((lines) => [...lines, emptyTemplateLine(newLineId())])} className={buttonClass}>줄 추가</button>
              <button type="button" onClick={() => setCopyPanel(copyPanel ? null : { siteId: '', estimates: [], estimateId: '' })} className={buttonClass}>기존 견적에서 복사</button>
              <button type="button" onClick={() => guard(closeDraft)} className={buttonClass}>목록으로</button>
              <button type="button" disabled={isBusy || !isDirty} onClick={() => void saveDraft()} className={primaryClass}>{isBusy ? '저장 중…' : '저장'}</button>
            </div>

            {conflict && (
              <div className="mx-5 mt-4 flex flex-wrap items-end gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                {conflict === 'changed' && <button type="button" disabled={isBusy} onClick={reloadFromServer} className={buttonClass}>상대 내용 다시 불러오기</button>}
                <label className="grid min-w-[220px] flex-1 gap-1 text-xs font-semibold text-[#4d5d66]">
                  다른 이름
                  <input value={saveAsName} onChange={(event) => setSaveAsName(event.target.value)} className={inputClass} />
                </label>
                <button type="button" disabled={isBusy} onClick={() => void saveDraft({ name: saveAsName })} className={primaryClass}>다른 이름으로 저장</button>
              </div>
            )}

            {copyPanel && (
              <div className="mx-5 mt-4 flex flex-wrap items-end gap-2 rounded-md border border-[#d5dde2] bg-[#f7fafb] p-3">
                <label className="grid min-w-[200px] flex-1 gap-1 text-xs font-semibold text-[#4d5d66]">
                  현장
                  <select value={copyPanel.siteId} onChange={(event) => chooseCopySite(event.target.value)} className={inputClass}>
                    <option value="">현장을 고르세요</option>
                    {sites.map((site) => (
                      <option key={site._id} value={site._id}>{site.title || '이름 없는 현장'}</option>
                    ))}
                  </select>
                </label>
                <label className="grid min-w-[200px] flex-1 gap-1 text-xs font-semibold text-[#4d5d66]">
                  견적 버전
                  <select value={copyPanel.estimateId} onChange={(event) => setCopyPanel({ ...copyPanel, estimateId: event.target.value })} disabled={!copyPanel.estimates.length} className={inputClass}>
                    <option value="">{copyPanel.siteId && !isBusy && !copyPanel.estimates.length ? '저장된 견적이 없어요' : '버전을 고르세요'}</option>
                    {copyPanel.estimates.map((estimate) => (
                      <option key={estimate._id} value={estimate._id}>{estimate.versionLabel || '이름 없는 버전'}</option>
                    ))}
                  </select>
                </label>
                <button type="button" disabled={!copyPanel.estimateId} onClick={copyFromEstimate} className={primaryClass}>가져오기</button>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto p-5">
              <table className="w-full min-w-[1180px] table-fixed border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#d5dde2] text-left text-xs text-[#60717d]">
                    <th className="w-24 py-2 pr-2">공간</th>
                    <th className="w-32 py-2 pr-2">카테고리</th>
                    <th className="py-2 pr-2">품명</th>
                    <th className="w-32 py-2 pr-2">규격</th>
                    <th className="w-16 py-2 pr-2">단위</th>
                    <th className="w-20 py-2 pr-2">수량</th>
                    <th className="w-28 py-2 pr-2">고객 단가</th>
                    <th className="w-28 py-2 pr-2">실행 단가</th>
                    <th className="w-36 py-2 pr-2">비고</th>
                    <th className="w-28 py-2">순서·삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.lines.map((line, index) => {
                    const notInDb = !isBlankEstimateLine(line) && !findTemplateMaterial(line, materials);
                    return (
                      <tr key={line.id} className="border-b border-[#edf2f5] align-top">
                        <td className="py-1.5 pr-2">
                          <select value={line.space} onChange={(event) => updateLine(line.id, { space: event.target.value })} aria-label="공간" className={inputClass}>
                            <option value="">-</option>
                            {(spaceOptions.includes(line.space) || !line.space ? spaceOptions : [line.space, ...spaceOptions]).map((space) => (
                              <option key={space} value={space}>{space}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1.5 pr-2"><input value={line.category} onChange={(event) => updateLine(line.id, { category: event.target.value })} list="template-categories" aria-label="카테고리" className={inputClass} /></td>
                        <td className="py-1.5 pr-2">
                          <input value={line.name} onChange={(event) => updateLine(line.id, { name: event.target.value })} aria-label="품명" className={inputClass} />
                          {notInDb && <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">DB에서 못 찾음</span>}
                        </td>
                        <td className="py-1.5 pr-2"><input value={line.spec} onChange={(event) => updateLine(line.id, { spec: event.target.value })} aria-label="규격" className={inputClass} /></td>
                        <td className="py-1.5 pr-2"><input value={line.unit} onChange={(event) => updateLine(line.id, { unit: event.target.value })} aria-label="단위" className={inputClass} /></td>
                        <td className="py-1.5 pr-2"><NumberTextInput value={line.quantity} onChange={(value) => updateLine(line.id, { quantity: value })} ariaLabel="수량" className={inputClass} /></td>
                        <td className="py-1.5 pr-2"><NumberTextInput value={line.customerUnitPrice} onChange={(value) => updateLine(line.id, { customerUnitPrice: value })} ariaLabel="고객 단가" className={inputClass} /></td>
                        <td className="py-1.5 pr-2"><NumberTextInput value={line.executionUnitPrice} onChange={(value) => updateLine(line.id, { executionUnitPrice: value })} ariaLabel="실행 단가" className={inputClass} /></td>
                        <td className="py-1.5 pr-2"><input value={line.note} onChange={(event) => updateLine(line.id, { note: event.target.value })} aria-label="비고" className={inputClass} /></td>
                        <td className="py-1.5">
                          <div className="flex gap-1">
                            <button type="button" aria-label="위로" disabled={index === 0} onClick={() => moveLine(index, -1)} className="rounded border border-[#d5dde2] px-2 py-1 text-xs disabled:opacity-40">↑</button>
                            <button type="button" aria-label="아래로" disabled={index === draft.lines.length - 1} onClick={() => moveLine(index, 1)} className="rounded border border-[#d5dde2] px-2 py-1 text-xs disabled:opacity-40">↓</button>
                            <button type="button" onClick={() => updateLines((lines) => lines.filter((item) => item.id !== line.id))} className="rounded border border-[#d5dde2] px-2 py-1 text-xs text-red-700">삭제</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <footer className="flex flex-wrap justify-end gap-6 border-t border-[#edf2f5] px-5 py-3 text-sm">
              <span>항목 {draft.lines.filter((line) => !isBlankEstimateLine(line)).length}개</span>
              <span>고객 합계 <b>{money(totals.customer)}</b></span>
              <span>실행 합계 <b>{money(totals.execution)}</b></span>
            </footer>
          </div>
        )}

        {confirmBox && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#171512]/30 px-4">
            <section role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-xl border border-[#d5dde2] bg-white p-6 shadow-2xl">
              <p className="text-sm leading-6">{confirmBox.message}</p>
              <div className="mt-5 grid gap-2">
                {confirmBox.actions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => {
                      setConfirmBox(null);
                      action.run();
                    }}
                    className={action.primary ? primaryClass : buttonClass}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
