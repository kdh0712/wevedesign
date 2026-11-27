'use client';

// 새 시공 사례 올리기, and [사진 다시 올리기] for one project. Each folder is one 시공 사례; when a project with the folder's
// name exists, staff choose before uploading whether to replace its photos or make a new project (nothing is matched by
// name on its own). Spec: docs/superpowers/specs/2026-11-21-portfolio-project-editor-design.md §3.2
import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { UploadCloud } from 'lucide-react';
import { sameTitleProjects, uploadSummary, type UploadResult } from '../lib/project-upload-rules';
import type { CategoryOption, ManagedProject } from './project-types';
import { UPLOADABLE_IMAGE_TYPES, buildPreview, filesFromDrop, shrinkPhotoForUpload } from './project-upload-files';
import { runUploadQueue } from '../lib/upload-queue';

const input = 'w-full rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm outline-none focus:border-[#273541]';
const label = 'grid gap-1 text-xs font-semibold text-[#4d5d66]';
const primaryButton = 'rounded-md bg-[#273541] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d2833] disabled:opacity-50';
const secondaryButton = 'rounded-md border border-[#d5dde2] bg-white px-3 py-1.5 text-xs font-semibold text-[#273541] hover:bg-[#f7fafb] disabled:opacity-50';

export type UploadRequest = { mode: 'new' } | { mode: 'replace'; project: ManagedProject };

// A folder's choice: 'new', 'replace:<id>', or '' (not chosen yet).
type Choice = string;

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    return { error: text } as T;
  }
}

export function ProjectUploadPanel({
  request,
  projects,
  categories,
  authHeaders,
  reload,
  onClose,
  setStatus,
  setError,
}: {
  request: UploadRequest;
  projects: ManagedProject[];
  categories: CategoryOption[];
  authHeaders: () => Record<string, string>;
  reload: () => Promise<void>;
  // Called with the results after an upload, without them for [취소].
  onClose: (results?: UploadResult[]) => void;
  setStatus: (text: string) => void;
  setError: (text: string) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  // Files of the picked folders that cannot be uploaded (HEIC, videos …), left out.
  const [leftOut, setLeftOut] = useState(0);
  const busyRef = useRef(false);

  const folders = useMemo(() => buildPreview(files), [files]);
  const replaceTarget = request.mode === 'replace' ? request.project : null;

  // The target each folder will be sent with, or '' while staff still have to choose.
  const targetOf = (folderTitle: string): Choice => {
    if (replaceTarget) return `replace:${replaceTarget._id}`;
    const matches = sameTitleProjects(folderTitle, projects);
    if (matches.length === 0) return 'new';
    return choices[folderTitle] || '';
  };
  const targets = Object.fromEntries(folders.map((folder) => [folder.title, targetOf(folder.title)]));
  const needsCategory = Object.values(targets).some((target) => target === 'new');
  const unchosen = folders.filter((folder) => !targets[folder.title]).map((folder) => folder.title);
  const tooManyFolders = Boolean(replaceTarget) && folders.length > 1;
  const categoryMissing = needsCategory && !categoryId && !newCategory.trim();
  const canUpload = files.length > 0 && unchosen.length === 0 && !tooManyFolders && !categoryMissing && !busy;

  const takeFiles = (picked: File[]) => {
    const photos = picked.filter((file) => UPLOADABLE_IMAGE_TYPES.has(file.type));
    setFiles(photos);
    setLeftOut(picked.filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/')).length - photos.length);
    setChoices({});
  };
  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    takeFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };
  const onDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    try {
      takeFiles(await filesFromDrop(event.dataTransfer));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '끌어온 폴더를 읽지 못했습니다.');
    }
  };

  // One photo: shrunk, then stored as a Sanity image (/api/manager/project-asset); its asset id comes back.
  const uploadOnePhoto = async (file: File) => {
    const body = new FormData();
    body.append('file', await shrinkPhotoForUpload(file));
    const response = await fetch('/api/manager/project-asset', { method: 'POST', headers: authHeaders(), body });
    const data = await readJson<{ assetId?: string; error?: string }>(response);
    if (!response.ok || !data.assetId) throw new Error(data.error || '사진을 올리지 못했습니다.');
    return data.assetId;
  };

  const submit = async () => {
    if (busyRef.current || !canUpload) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      // Each photo is shrunk and uploaded on its own, three at a time (spec 2026-11-27-project-upload-per-photo-design.md),
      // so there is no limit on how many a folder holds. A photo that fails is tried twice more; if one still fails, no
      // project is made or changed, and pressing [올리기] again uploads them again (Sanity keeps one asset per photo).
      setProgress(`사진 올리는 중 0/${files.length}장`);
      const uploaded = await runUploadQueue(files, (file) => uploadOnePhoto(file), {
        concurrency: 3,
        retries: 2,
        onProgress: (done, total) => setProgress(`사진 올리는 중 ${done}/${total}장`),
      });
      if (uploaded.failed.length > 0) {
        setError(`사진 ${uploaded.failed.length}장을 올리지 못했습니다. 인터넷 연결을 확인한 뒤 [올리기]를 다시 눌러 주세요.`);
        return;
      }
      const photos = files.map((file, index) => ({ path: file.webkitRelativePath || file.name, assetId: uploaded.results[index] || '' }));

      setProgress('시공 사례 만드는 중');
      const category = !needsCategory
        ? {}
        : newCategory.trim()
          ? { category: newCategory.trim() }
          : { categoryId, category: categories.find((item) => item._id === categoryId)?.title || '' };
      const response = await fetch('/api/manager/bulk-upload', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos, targets: JSON.stringify(targets), ...category }),
      });
      const data = await readJson<{ results?: UploadResult[]; error?: string }>(response);
      if (!response.ok) {
        setError(data.error || '올리지 못했습니다.');
        return;
      }

      const results = data.results || [];
      const problems = results.filter((result) => result.status === 'skipped' || result.status === 'failed');
      setStatus(uploadSummary(results));
      if (problems.length > 0) setError(problems.map((result) => `${result.projectTitle}: ${result.reason || '처리하지 못했습니다.'}`).join(' / '));
      await reload();

      // The form starts clean next time (it closes); the editor reopens the project to work on (afterUploadSelection).
      onClose(results);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '올리는 중 오류가 발생했습니다.');
    } finally {
      busyRef.current = false;
      setBusy(false);
      setProgress('');
    }
  };

  return (
    <div className="grid gap-4">
      {replaceTarget ? (
        <p className="rounded-md border border-[#d5dde2] bg-[#f7fafb] px-3 py-2 text-sm text-[#273541]">
          ‘{replaceTarget.title || '이름 없음'}’의 사진을 폴더 하나로 통째로 바꿉니다. 이름·공개 여부·입력한 정보는 그대로입니다.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            공간 분류 {needsCategory ? '*' : ''}
            <select className={input} value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={busy || newCategory.trim() !== ''}>
              <option value="">분류 선택</option>
              {categories.map((category) => (
                <option key={category._id} value={category._id}>
                  {category.title}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            새 분류
            <input className={input} value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="목록에 없으면 입력" disabled={busy} />
          </label>
        </div>
      )}

      <label
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => void onDrop(event)}
        className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#9db6c1] bg-[#f7fafb] px-5 py-8 text-center hover:bg-[#eef4f7]"
      >
        <UploadCloud className="mb-2 text-[#273541]" size={30} />
        <span className="font-semibold text-[#171512]">{replaceTarget ? '폴더 하나 선택 또는 끌어오기' : '폴더 선택 또는 끌어오기 (여러 개 가능)'}</span>
        <span className="mt-1 text-xs text-[#60717d]">대표·cover → 대표 사진, 시공전·before → 시공 전 사진, 거실1·주방2 → 공간별 묶음과 순서</span>
        <input type="file" multiple accept="image/*" className="hidden" onChange={onPick} disabled={busy} {...{ webkitdirectory: '', directory: '' }} />
      </label>
      {leftOut > 0 && (
        <p className="text-xs text-[#8a6215]">올릴 수 없는 파일 {leftOut}개(HEIC 사진·동영상 등)는 뺐습니다. HEIC 사진은 JPG로 바꿔 올려 주세요.</p>
      )}

      {folders.length > 0 && (
        <ul className="grid gap-2">
          {folders.map((folder) => {
            const matches = replaceTarget ? [] : sameTitleProjects(folder.title, projects);
            const choice = choices[folder.title] || '';
            return (
              <li key={folder.title} className="grid gap-2 rounded-md border border-[#e3e8eb] px-3 py-2.5 text-sm">
                <span>
                  <span className="font-semibold text-[#171512]">{folder.title}</span>
                  <span className="text-[#60717d]">
                    {' '}
                    · 사진 {folder.count}장 (대표 {folder.coverCount} · 시공 전 {folder.beforeCount}){folder.rooms.length > 0 ? ` · ${folder.rooms.join(', ')}` : ''}
                  </span>
                </span>
                {folder.coverCount === 0 && folder.count - folder.beforeCount === 0 && <span className="text-xs text-[#8a6215]">대표로 쓸 사진이 없어 건너뜁니다.</span>}
                {matches.length > 0 && (
                  <div className="grid gap-1.5 rounded-md border border-[#e2c06d] bg-[#fff8e6] p-2.5 text-[#5c4614]">
                    <span className="text-xs font-semibold">같은 이름의 시공 사례가 있습니다</span>
                    <label className="flex flex-wrap items-center gap-2 text-xs">
                      <input
                        type="radio"
                        name={`target-${folder.title}`}
                        checked={choice.startsWith('replace:')}
                        onChange={() => setChoices((current) => ({ ...current, [folder.title]: `replace:${matches[0]._id}` }))}
                        disabled={busy}
                      />
                      그 사례의 사진 바꾸기
                      {matches.length > 1 && (
                        <select
                          className={`${input} w-auto py-1 text-xs`}
                          value={choice.startsWith('replace:') ? choice.slice('replace:'.length) : matches[0]._id}
                          onChange={(event) => setChoices((current) => ({ ...current, [folder.title]: `replace:${event.target.value}` }))}
                          disabled={busy}
                        >
                          {matches.map((project) => (
                            <option key={project._id} value={project._id}>
                              {project.title} · {project.isVisible === false ? '숨김' : '공개'}
                              {project.location ? ` · ${project.location}` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <input type="radio" name={`target-${folder.title}`} checked={choice === 'new'} onChange={() => setChoices((current) => ({ ...current, [folder.title]: 'new' }))} disabled={busy} />
                      새 사례로 만들기
                    </label>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {tooManyFolders && <p className="text-sm text-[#b42318]">폴더 하나만 골라 주세요.</p>}
      {unchosen.length > 0 && <p className="text-sm text-[#8a6215]">같은 이름의 시공 사례가 있는 폴더는 올릴 방법을 골라 주세요: {unchosen.join(', ')}</p>}
      {categoryMissing && files.length > 0 && <p className="text-sm text-[#8a6215]">새로 만드는 사례가 있어 공간 분류를 골라 주세요.</p>}

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => onClose()} disabled={busy} className={secondaryButton}>
          취소
        </button>
        <button type="button" onClick={() => void submit()} disabled={!canUpload} className={primaryButton}>
          {busy ? progress || '올리는 중' : '올리기'}
        </button>
      </div>
      {!replaceTarget && <p className="text-xs text-[#60717d]">새로 만든 시공 사례는 숨김 상태로 저장됩니다. 정보를 채운 뒤 [홈페이지에 공개]를 누르세요.</p>}
    </div>
  );
}
