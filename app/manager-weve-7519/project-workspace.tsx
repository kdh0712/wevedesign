'use client';

// 홈페이지 > 시공 사례: the project list on the left and one form for new and existing projects on the right.
// Spec: docs/superpowers/specs/2026-11-21-portfolio-project-editor-design.md §3
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import {
  buildProjectPatch,
  formFromStoredProject,
  hasDuplicateTitle,
  isProjectFormDirty,
  legacyGalleryToGroup,
  legacyImagesFromStored,
  publishBlockReason,
  type EditableGroup,
  type EditableImage,
  type ProjectFormInput,
} from '../lib/project-form';
import { Panel } from './office-ui';
import { afterUploadSelection, type UploadResult } from '../lib/project-upload-rules';
import { moveInOrder, sortProjectsByOrder } from '../lib/project-order';
import type { CategoryOption, ManagedProject } from './project-types';
import { shrinkPhotoForUpload } from './project-upload-files';

const input = 'w-full rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm outline-none focus:border-[#273541]';
const label = 'grid content-start gap-1 text-xs font-semibold text-[#4d5d66]';
// A narrow field (focus point numbers, group names): the same look without the full width.
const narrowInput = 'rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm outline-none focus:border-[#273541]';
const primaryButton = 'rounded-md bg-[#273541] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d2833] disabled:opacity-50';
const secondaryButton = 'rounded-md border border-[#d5dde2] bg-white px-3 py-1.5 text-xs font-semibold text-[#273541] hover:bg-[#f7fafb] disabled:opacity-50';
const LEAVE_CONFIRM = '저장하지 않은 변경이 있습니다. 버리고 넘어갈까요?';

type VisibilityFilter = 'all' | 'visible' | 'hidden';

const isVisible = (project: ManagedProject) => project.isVisible !== false;

// The homepage's order: by 보이는 순서 (none last), then newest (the list arrives newest first). app/lib/project-order.ts
const sortForList = (projects: ManagedProject[]) => sortProjectsByOrder(projects);

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    return { error: text } as T;
  }
}

export type ProjectWorkspaceProps = {
  projects: ManagedProject[];
  categories: CategoryOption[];
  authHeaders: () => Record<string, string>;
  reload: () => Promise<void>;
  setStatus: (text: string) => void;
  setError: (text: string) => void;
  // The upload panel (Task 7) for a new project or for one project's photos.
  renderUpload?: (request: { mode: 'new' } | { mode: 'replace'; project: ManagedProject }, close: (results?: UploadResult[]) => void) => ReactNode;
};

export function ProjectWorkspace({ projects, categories, authHeaders, reload, setStatus, setError, renderUpload }: ProjectWorkspaceProps) {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [visibility, setVisibility] = useState<VisibilityFilter>('all');
  const [selectedId, setSelectedId] = useState('');
  const [initial, setInitial] = useState<ProjectFormInput | null>(null);
  const [form, setForm] = useState<ProjectFormInput | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [previewUrls, setPreviewUrls] = useState<{ main: string; before: string }>({ main: '', before: '' });
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState<{ mode: 'new' } | { mode: 'replace'; project: ManagedProject } | null>(null);
  // [순서 변경]: the projects in the order being set (null while not reordering) and the row being dragged.
  const [orderDraft, setOrderDraft] = useState<ManagedProject[] | null>(null);
  const [draggingId, setDraggingId] = useState('');
  const [dropTargetId, setDropTargetId] = useState('');
  const busyRef = useRef(false);

  const selected = projects.find((project) => project._id === selectedId);
  // The project a request was started for; a result that comes back after staff moved on is dropped.
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const dirty = Boolean(form && initial && (isProjectFormDirty(initial, form) || newCategory.trim() !== ''));

  const listed = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, '');
    return sortForList(projects).filter((project) => {
      if (categoryFilter && project.categoryId !== categoryFilter) return false;
      if (visibility === 'visible' && !isVisible(project)) return false;
      if (visibility === 'hidden' && isVisible(project)) return false;
      if (!q) return true;
      return [project.title, project.location].some((value) => (value || '').toLowerCase().replace(/\s+/g, '').includes(q));
    });
  }, [projects, query, categoryFilter, visibility]);

  const open = (project: ManagedProject | undefined) => {
    if (!project) {
      setSelectedId('');
      setForm(null);
      setInitial(null);
      return;
    }
    const next = formFromStoredProject(project);
    setSelectedId(project._id);
    setForm(next);
    setInitial(next);
    setNewCategory('');
    setPreviewUrls({ main: project.mainImage || '', before: project.beforeImage || '' });
  };

  const requestOpen = (project: ManagedProject | undefined) => {
    if (dirty && !window.confirm(LEAVE_CONFIRM)) return false;
    open(project);
    return true;
  };

  // One request at a time from this screen; a fast second click does nothing.
  const run = async (task: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await task();
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : '처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // [순서 변경] (spec 2026-11-27-project-order-drag-design.md) closes the editor first: an open form holds the old 보이는
  // 순서 and would put it back on [저장].
  const startReorder = () => {
    if (dirty && !window.confirm(LEAVE_CONFIRM)) return;
    open(undefined);
    setUpload(null);
    setOrderDraft(sortForList(projects));
  };
  const moveTo = (fromId: string, toId: string) =>
    setOrderDraft((current) => {
      if (!current) return current;
      return moveInOrder(
        current,
        current.findIndex((project) => project._id === fromId),
        current.findIndex((project) => project._id === toId),
      );
    });
  const endDrag = () => {
    setDraggingId('');
    setDropTargetId('');
  };
  const saveOrder = () =>
    run(async () => {
      if (!orderDraft) return;
      setError('');
      const response = await fetch('/api/manager/office', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'project', action: 'setOrder', ids: orderDraft.map((project) => project._id) }),
      });
      const data = await readJson<{ error?: string }>(response);
      if (!response.ok) {
        setError(data.error || '순서를 저장하지 못했습니다.');
        return;
      }
      await reload();
      setOrderDraft(null);
      setStatus('시공 사례 순서를 저장했습니다. 홈페이지에는 몇 분 안에 반영됩니다.');
    });

  const set = (patch: Partial<ProjectFormInput>) => setForm((current) => (current ? { ...current, ...patch } : current));
  const setGroups = (update: (groups: EditableGroup[]) => EditableGroup[]) => setForm((current) => (current ? { ...current, galleryGroups: update(current.galleryGroups) } : current));

  const uploadPhoto = async (file: File): Promise<{ assetId: string; url: string } | null> => {
    let shrunk: File;
    try {
      shrunk = await shrinkPhotoForUpload(file);
    } catch (caught) {
      setError(`${caught instanceof Error ? caught.message : '사진을 열 수 없습니다'}. 다른 사진(JPG·PNG)을 골라 주세요.`);
      return null;
    }
    const body = new FormData();
    body.append('file', shrunk);
    const response = await fetch('/api/manager/project-asset', { method: 'POST', headers: authHeaders(), body });
    const data = await readJson<{ assetId?: string; url?: string; error?: string }>(response);
    if (!response.ok || !data.assetId) {
      setError(data.error || '사진을 올리지 못했습니다.');
      return null;
    }
    return { assetId: data.assetId, url: data.url || '' };
  };

  const save = () =>
    run(async () => {
      if (!form || !selected) return;
      setError('');
      const startedId = selected._id;
      let next = form;
      if (newCategory.trim()) {
        const response = await fetch('/api/manager/office', {
          method: 'POST',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'category', data: { title: newCategory.trim() } }),
        });
        const data = await readJson<{ record?: { _id?: string }; error?: string }>(response);
        if (!response.ok || !data.record?._id) {
          setError(data.error || '새 분류를 만들지 못했습니다.');
          return;
        }
        next = { ...form, categoryId: data.record._id };
      }
      const check = buildProjectPatch(next);
      if (!check.ok) {
        setError(check.error);
        return;
      }
      const response = await fetch('/api/manager/office', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        // 보이는 순서 goes only when staff changed it here, so a form opened before [순서 저장] keeps the new order.
        body: JSON.stringify({
          type: 'project',
          id: selected._id,
          rev: selected._rev,
          data: initial && next.displayOrder === initial.displayOrder ? { ...next, displayOrder: undefined } : next,
        }),
      });
      const data = await readJson<{ error?: string }>(response);
      if (!response.ok) {
        setError(data.error || '시공 사례를 저장하지 못했습니다.');
        return;
      }
      if (selectedIdRef.current !== startedId) return;
      setForm(next);
      setInitial(next);
      setNewCategory('');
      await reload();
      setStatus('시공 사례를 저장했습니다.');
    });

  const toggleVisibility = () =>
    run(async () => {
      if (!form || !selected) return;
      setError('');
      if (dirty) {
        setError('저장한 뒤에 공개할 수 있습니다.');
        return;
      }
      const next = !isVisible(selected);
      if (next) {
        const blocked = publishBlockReason({ title: form.title, categoryId: form.categoryId, mainImageAssetId: form.mainImageAssetId });
        if (blocked) {
          setError(blocked);
          return;
        }
      }
      const response = await fetch('/api/manager/office', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'project', id: selected._id, action: 'setVisibility', isVisible: next }),
      });
      const data = await readJson<{ error?: string }>(response);
      if (!response.ok) {
        setError(data.error || '공개 상태를 바꾸지 못했습니다.');
        return;
      }
      await reload();
      setStatus(next ? '홈페이지에 공개했습니다.' : '홈페이지에서 숨겼습니다.');
    });

  const replacePhoto = (kind: 'main' | 'before', file: File | undefined) =>
    run(async () => {
      if (!file || !selected) return;
      setError('');
      const startedId = selected._id;
      const uploaded = await uploadPhoto(file);
      if (!uploaded || selectedIdRef.current !== startedId) return;
      if (kind === 'main') {
        set({ mainImageAssetId: uploaded.assetId, mainImagePositionX: 50, mainImagePositionY: 50 });
        setPreviewUrls((current) => ({ ...current, main: uploaded.url }));
      } else {
        set({ beforeImageAssetId: uploaded.assetId });
        setPreviewUrls((current) => ({ ...current, before: uploaded.url }));
      }
      setStatus('사진을 올렸습니다. [저장]을 누르면 시공 사례에 붙습니다.');
    });

  const focusFrom = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    set({
      mainImagePositionX: Math.round(Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100))),
      mainImagePositionY: Math.round(Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100))),
    });
  };

  const legacyImages = useMemo(() => legacyImagesFromStored(selected?.gallery), [selected]);
  const onLegacyOnly = Boolean(form && form.galleryGroups.length === 0 && legacyImages.length > 0);
  // Photos that can become the representative one: every group photo, the old single photos, and the current one.
  const mainOptions = useMemo(() => {
    if (!form) return [];
    const seen = new Set<string>();
    return [...form.galleryGroups.flatMap((group) => group.images.map((image) => ({ ...image, from: group.title }))), ...legacyImages.map((image) => ({ ...image, from: '옛 사진' }))].filter(
      (image) => image.url && !seen.has(image.assetId) && seen.add(image.assetId),
    );
  }, [form, legacyImages]);

  const objectPosition = form ? `${form.mainImagePositionX}% ${form.mainImagePositionY}%` : '50% 50%';
  const duplicateTitle = form && selected ? hasDuplicateTitle(form.title, selected._id, projects) : false;

  // After an upload the editor never keeps its old form: the project to work on reopens from the reloaded list (below), so
  // replaced photos show and a later save cannot put the old ones back. [취소] (no results) changes nothing.
  const closeUpload = (results?: UploadResult[]) => {
    const replaceTargetId = upload?.mode === 'replace' ? upload.project._id : '';
    setUpload(null);
    if (!results) return;
    const next = afterUploadSelection({ results, replaceTargetId, currentSelectedId: selectedId });
    if (next.showHidden) setVisibility('hidden');
    setForm(null);
    setInitial(null);
    setSelectedId(next.openProjectId);
  };

  // A project chosen without a form yet (just uploaded or re-uploaded) opens when the list has it.
  useEffect(() => {
    if (selectedId && !form && selected) open(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, form, selected]);

  return (
    <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr] xl:items-start">
      <Panel title="시공 사례">
        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => {
              if (dirty) {
                if (!window.confirm(LEAVE_CONFIRM)) return;
                // Discarded, as the question says.
                setForm(initial);
                setNewCategory('');
              }
              setUpload({ mode: 'new' });
            }}
            disabled={busy || !renderUpload || Boolean(orderDraft)}
            className={`${primaryButton} justify-self-start`}
          >
            + 새 시공 사례 올리기
          </button>
          {orderDraft ? (
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-[#edf8fb] px-3 py-2">
                <p className="text-xs text-[#1d6d7b]">사례를 잡고 위아래로 끌어 놓으세요. [순서 저장]을 누르면 홈페이지 시공 사례 목록이 이 순서로 바뀝니다.</p>
                <span className="flex gap-2">
                  <button type="button" onClick={() => setOrderDraft(null)} disabled={busy} className={secondaryButton}>
                    취소
                  </button>
                  <button type="button" onClick={saveOrder} disabled={busy} className={primaryButton}>
                    {busy ? '저장하는 중…' : '순서 저장'}
                  </button>
                </span>
              </div>
              <ol
                className="grid gap-1.5"
                aria-label="시공 사례 순서"
                // A drop in the gap between rows lands where the line shows.
                onDragOver={(event) => {
                  if (draggingId) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggingId && dropTargetId) moveTo(draggingId, dropTargetId);
                  endDrag();
                }}
              >
                {orderDraft.map((project, index) => {
                  const fromIndex = orderDraft.findIndex((item) => item._id === draggingId);
                  const isTarget = Boolean(draggingId) && dropTargetId === project._id && draggingId !== project._id;
                  // The line shows where the dragged row lands: above a row it moves up to, below one it moves down to.
                  const line = isTarget ? (fromIndex > index ? 'shadow-[inset_0_3px_0_#38a9bd]' : 'shadow-[inset_0_-3px_0_#38a9bd]') : '';
                  return (
                    <li
                      key={project._id}
                      draggable={!busy}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', project._id);
                        setDraggingId(project._id);
                      }}
                      onDragOver={(event) => {
                        if (!draggingId) return;
                        event.preventDefault();
                        setDropTargetId(project._id);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        // Handled here; the list's own drop (for the gaps) must not move it again.
                        event.stopPropagation();
                        if (draggingId) moveTo(draggingId, project._id);
                        endDrag();
                      }}
                      onDragEnd={endDrag}
                      className={`flex cursor-grab items-center gap-2.5 rounded-md border border-[#e3e8eb] bg-white px-2.5 py-1.5 active:cursor-grabbing ${draggingId === project._id ? 'opacity-40' : ''} ${line}`}
                    >
                      <span aria-hidden="true" className="select-none text-base leading-none tracking-[-2px] text-[#87949c]">
                        ⋮⋮
                      </span>
                      <span className="w-6 shrink-0 text-center text-xs font-bold text-[#60717d]">{index + 1}</span>
                      {project.mainImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={project.mainImage} alt="" draggable={false} className="h-10 w-14 shrink-0 rounded object-cover" />
                      ) : (
                        <span className="h-10 w-14 shrink-0 rounded bg-[#edf2f5]" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[#171512]">{project.title || '이름 없음'}</span>
                        <span className="block truncate text-xs text-[#60717d]">{[project.categoryTitle, project.location].filter(Boolean).join(' · ') || '분류 없음'}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs font-semibold">
                        <span className={isVisible(project) ? 'text-[#277a46]' : 'text-[#8a6215]'}>{isVisible(project) ? '공개' : '숨김'}</span>
                        {project.featured && <span className="text-[#273541]">메인</span>}
                      </span>
                      {/* For the keyboard and for a long move without dragging. */}
                      <span className="flex shrink-0 flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={() => index > 0 && moveTo(project._id, orderDraft[index - 1]._id)}
                          disabled={busy || index === 0}
                          aria-label={`${project.title || '이름 없음'} 위로`}
                          className="rounded border border-[#d5dde2] p-0.5 text-[#4d5d66] disabled:opacity-30"
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => index < orderDraft.length - 1 && moveTo(project._id, orderDraft[index + 1]._id)}
                          disabled={busy || index === orderDraft.length - 1}
                          aria-label={`${project.title || '이름 없음'} 아래로`}
                          className="rounded border border-[#d5dde2] p-0.5 text-[#4d5d66] disabled:opacity-30"
                        >
                          <ArrowDown size={12} />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : (
          <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[#60717d]">홈페이지에 보이는 순서대로 나옵니다.</span>
            <button type="button" onClick={startReorder} disabled={busy || projects.length < 2 || Boolean(upload)} className={secondaryButton}>
              순서 변경
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름·지역" aria-label="시공 사례 검색" className={`${input} min-w-40 flex-1`} />
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="공간 분류" className={`${input} w-auto`}>
              <option value="">전체 분류</option>
              {categories.map((category) => (
                <option key={category._id} value={category._id}>
                  {category.title}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-1.5" role="group" aria-label="공개 상태">
            {(
              [
                ['all', '전체'],
                ['visible', '공개'],
                ['hidden', '숨김'],
              ] as const
            ).map(([key, text]) => (
              <button
                key={key}
                type="button"
                onClick={() => setVisibility(key)}
                aria-pressed={visibility === key}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${visibility === key ? 'border-[#273541] bg-[#273541] text-white' : 'border-[#d5dde2] bg-white text-[#4d5d66]'}`}
              >
                {text}
              </button>
            ))}
          </div>
          {listed.length === 0 ? (
            <p className="rounded-md border border-dashed border-[#d5dde2] px-3 py-6 text-center text-sm text-[#60717d]">
              {projects.length === 0 ? '등록된 시공 사례가 없습니다.' : '조건에 맞는 시공 사례가 없습니다.'}
            </p>
          ) : (
            <ul className="grid gap-2">
              {listed.map((project) => (
                <li key={project._id}>
                  <button
                    type="button"
                    onClick={() => requestOpen(project)}
                    disabled={busy}
                    className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left ${project._id === selectedId ? 'border-[#273541] bg-[#f3f6f8]' : 'border-[#e3e8eb] bg-white hover:bg-[#f7fafb]'}`}
                  >
                    {project.mainImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={project.mainImage} alt="" className="h-12 w-16 shrink-0 rounded object-cover" />
                    ) : (
                      <span className="h-12 w-16 shrink-0 rounded bg-[#edf2f5]" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[#171512]">{project.title || '이름 없음'}</span>
                      <span className="block truncate text-xs text-[#60717d]">{[project.categoryTitle, project.location].filter(Boolean).join(' · ') || '분류 없음'}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1 text-xs font-semibold">
                      <span className={isVisible(project) ? 'text-[#277a46]' : 'text-[#8a6215]'}>{isVisible(project) ? '공개' : '숨김'}</span>
                      {project.featured && <span className="text-[#273541]">메인</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          </>
          )}
        </div>
      </Panel>

      <Panel title={upload ? (upload.mode === 'new' ? '새 시공 사례 올리기' : '사진 다시 올리기') : selected ? '시공 사례 수정' : '시공 사례'}>
        {upload && renderUpload ? (
          renderUpload(upload, closeUpload)
        ) : !selected || !form ? (
          <p className="text-sm text-[#60717d]">왼쪽에서 시공 사례를 고르거나 [+ 새 시공 사례 올리기]로 폴더를 올리세요.</p>
        ) : (
          <div className="grid gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-[#171512]">{selected.title || '이름 없음'}</h3>
              <span className="flex items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${isVisible(selected) ? 'bg-[#e8f5ed] text-[#277a46]' : 'bg-[#fff3d6] text-[#8a6215]'}`}>
                  {isVisible(selected) ? '공개' : '숨김'}
                </span>
                <button type="button" onClick={() => void toggleVisibility()} disabled={busy} className={secondaryButton}>
                  {isVisible(selected) ? '숨기기' : '홈페이지에 공개'}
                </button>
              </span>
            </div>
            {!isVisible(selected) && <p className="rounded-md border border-[#e2c06d] bg-[#fff8e6] px-3 py-2 text-sm text-[#5c4614]">아직 홈페이지에 보이지 않습니다. 정보를 채운 뒤 공개하세요.</p>}

            <section className="grid gap-3" aria-label="기본 정보">
              <p className="text-sm font-bold text-[#273541]">기본 정보</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={label}>
                  이름 *
                  <input className={input} value={form.title} onChange={(event) => set({ title: event.target.value })} disabled={busy} />
                  {duplicateTitle && <span className="font-normal text-[#8a6215]">같은 이름의 시공 사례가 있습니다.</span>}
                </label>
                <label className={label}>
                  공간 분류 *
                  <select className={input} value={form.categoryId} onChange={(event) => set({ categoryId: event.target.value })} disabled={busy || newCategory.trim() !== ''}>
                    <option value="">분류 선택</option>
                    {categories.map((category) => (
                      <option key={category._id} value={category._id}>
                        {category.title}
                      </option>
                    ))}
                  </select>
                  <input className={input} value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="목록에 없으면 새 분류 이름" disabled={busy} />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className={label}>
                  지역
                  <input className={input} value={form.location} onChange={(event) => set({ location: event.target.value })} disabled={busy} />
                </label>
                <label className={label}>
                  평수
                  <input className={input} inputMode="decimal" value={form.area} onChange={(event) => set({ area: event.target.value })} placeholder="예: 32" disabled={busy} />
                </label>
                <label className={label}>
                  시공 연도
                  <input className={input} inputMode="numeric" value={form.year} onChange={(event) => set({ year: event.target.value })} placeholder="예: 2026" disabled={busy} />
                </label>
              </div>
              <label className={label}>
                주요 자재
                <input className={input} value={form.materials} onChange={(event) => set({ materials: event.target.value })} disabled={busy} />
              </label>
              <label className={label}>
                블로그 링크
                <input className={input} value={form.blogUrl} onChange={(event) => set({ blogUrl: event.target.value })} placeholder="blog.naver.com/…" disabled={busy} />
              </label>
              <label className={label}>
                짧은 설명 (줄바꿈 그대로 보입니다)
                <textarea className={`${input} min-h-24`} value={form.description} onChange={(event) => set({ description: event.target.value })} disabled={busy} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={label}>
                  보이는 순서
                  <input className={input} inputMode="numeric" value={form.displayOrder} onChange={(event) => set({ displayOrder: event.target.value })} disabled={busy} />
                  <span className="font-normal text-[#60717d]">비우면 순서 없음, 순서 있는 사례 뒤</span>
                </label>
                <label className="flex items-center gap-2 self-center text-sm text-[#273541]">
                  <input type="checkbox" checked={form.featured} onChange={(event) => set({ featured: event.target.checked })} disabled={busy} />
                  메인에도 보이기
                </label>
              </div>
            </section>

            <section className="grid gap-3" aria-label="대표 사진">
              <p className="text-sm font-bold text-[#273541]">대표 사진</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className={`${secondaryButton} cursor-pointer`}>
                  새 사진 올리기
                  <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(event) => void replacePhoto('main', event.target.files?.[0])} />
                </label>
                <span className="text-xs text-[#60717d]">또는 아래 상세 사진을 누르세요.</span>
              </div>
              {previewUrls.main ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ['목록 카드 (4:3)', 'aspect-[4/3]'],
                      ['사례 창 위 (16:9)', 'aspect-video'],
                    ] as const
                  ).map(([text, ratio]) => (
                    <div key={ratio} className="grid gap-1">
                      <span className="text-xs font-semibold text-[#4d5d66]">{text}</span>
                      <div onPointerDown={focusFrom} className={`relative ${ratio} cursor-crosshair overflow-hidden rounded-md border border-[#d5dde2] bg-[#edf2f5]`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={previewUrls.main} alt="" draggable={false} className="h-full w-full select-none object-cover" style={{ objectPosition }} />
                        <span
                          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#273541]/70"
                          style={{ left: `${form.mainImagePositionX}%`, top: `${form.mainImagePositionY}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[#8a6215]">대표 사진이 없습니다. 공개하려면 대표 사진을 골라 주세요.</p>
              )}
              <div className="flex flex-wrap items-center gap-3 text-xs text-[#4d5d66]">
                <span>중심점: 사진을 눌러 정하기</span>
                <label className="flex items-center gap-1">
                  X
                  <input className={`${narrowInput} w-16`} inputMode="numeric" value={form.mainImagePositionX} onChange={(event) => set({ mainImagePositionX: Number(event.target.value) })} disabled={busy} />
                </label>
                <label className="flex items-center gap-1">
                  Y
                  <input className={`${narrowInput} w-16`} inputMode="numeric" value={form.mainImagePositionY} onChange={(event) => set({ mainImagePositionY: Number(event.target.value) })} disabled={busy} />
                </label>
              </div>
              {mainOptions.length > 0 && (
                <div className="flex flex-wrap gap-2" aria-label="상세 사진 중 고르기">
                  {mainOptions.map((image) => (
                    <button
                      key={image.assetId}
                      type="button"
                      onClick={() => {
                        set({ mainImageAssetId: image.assetId, mainImagePositionX: 50, mainImagePositionY: 50 });
                        setPreviewUrls((current) => ({ ...current, main: image.url || '' }));
                      }}
                      title={image.from}
                      className={`overflow-hidden rounded border-2 ${form.mainImageAssetId === image.assetId ? 'border-[#273541]' : 'border-transparent'}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.url} alt="" className="h-12 w-16 object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="grid gap-3" aria-label="시공 전 사진">
              <p className="text-sm font-bold text-[#273541]">시공 전 사진</p>
              <div className="flex flex-wrap items-center gap-2">
                {form.beforeImageAssetId && previewUrls.before && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrls.before} alt="" className="h-16 w-24 rounded object-cover" />
                )}
                <label className={`${secondaryButton} cursor-pointer`}>
                  {form.beforeImageAssetId ? '바꾸기' : '올리기'}
                  <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(event) => void replacePhoto('before', event.target.files?.[0])} />
                </label>
                {form.beforeImageAssetId && (
                  <button type="button" onClick={() => set({ beforeImageAssetId: '' })} disabled={busy} className={secondaryButton}>
                    빼기
                  </button>
                )}
              </div>
            </section>

            <section className="grid gap-3" aria-label="공간별 사진">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-[#273541]">
                  공간별 사진 <span className="font-normal text-[#60717d]">(묶음 {form.galleryGroups.length} · 사진 {form.galleryGroups.reduce((sum, group) => sum + group.images.length, 0)}장)</span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (dirty) {
                      setError('저장하지 않은 변경이 있습니다. 먼저 저장한 뒤 사진을 다시 올려 주세요.');
                      return;
                    }
                    setUpload({ mode: 'replace', project: selected });
                  }}
                  disabled={busy || !renderUpload}
                  className={secondaryButton}
                >
                  사진 다시 올리기
                </button>
              </div>
              {onLegacyOnly ? (
                <div className="grid gap-2 rounded-md border border-dashed border-[#d5dde2] p-3">
                  <p className="text-sm text-[#4d5d66]">옛 방식 사진 {legacyImages.length}장 (묶음 없음)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {legacyImages.map((image) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={image.key} src={image.url} alt="" className="h-12 w-16 rounded object-cover" />
                    ))}
                  </div>
                  <button type="button" onClick={() => set({ galleryGroups: [legacyGalleryToGroup(legacyImages)] })} disabled={busy} className={`${secondaryButton} justify-self-start`}>
                    묶음으로 바꾸기
                  </button>
                </div>
              ) : (
                form.galleryGroups.map((group, groupIndex) => (
                  <div key={group.key} className="grid gap-2 rounded-md border border-[#e3e8eb] p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        className={`${narrowInput} w-40`}
                        value={group.title}
                        aria-label="묶음 이름"
                        onChange={(event) => setGroups((groups) => groups.map((item, index) => (index === groupIndex ? { ...item, title: event.target.value } : item)))}
                        disabled={busy}
                      />
                      <span className="text-xs text-[#60717d]">{group.images.length}장</span>
                      <button
                        type="button"
                        aria-label="묶음 위로"
                        onClick={() => setGroups((groups) => (groupIndex === 0 ? groups : groups.map((item, index) => (index === groupIndex - 1 ? groups[groupIndex] : index === groupIndex ? groups[groupIndex - 1] : item))))}
                        disabled={busy || groupIndex === 0}
                        className={secondaryButton}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label="묶음 아래로"
                        onClick={() =>
                          setGroups((groups) =>
                            groupIndex === groups.length - 1 ? groups : groups.map((item, index) => (index === groupIndex + 1 ? groups[groupIndex] : index === groupIndex ? groups[groupIndex + 1] : item)),
                          )
                        }
                        disabled={busy || groupIndex === form.galleryGroups.length - 1}
                        className={secondaryButton}
                      >
                        <ArrowDown size={14} />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {group.images.map((image) => (
                        <span key={image.key} className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={image.url} alt="" className="h-14 w-20 rounded object-cover" />
                          <button
                            type="button"
                            aria-label="사진 빼기"
                            onClick={() =>
                              setGroups((groups) => groups.map((item, index) => (index === groupIndex ? { ...item, images: item.images.filter((photo) => photo.key !== image.key) } : item)))
                            }
                            disabled={busy}
                            className="absolute right-0.5 top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </section>

            <div className="flex justify-end">
              <button type="button" onClick={() => void save()} disabled={busy} className={primaryButton}>
                저장
              </button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
