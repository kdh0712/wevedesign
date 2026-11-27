'use client';

// 새 시공 사례 올리기, and [사진 다시 올리기] for one project. Each folder is one 시공 사례; when a project with the folder's
// name exists, staff choose before uploading whether to replace its photos or make a new project (nothing is matched by
// name on its own). Each folder is arranged in the 정보·사진 정리 popup: its basic information (new projects) and where
// each photo goes. Specs: docs/superpowers/specs/2026-11-21-portfolio-project-editor-design.md §3.2,
// 2026-11-27-project-upload-per-photo-design.md, 2026-11-27-project-upload-popup-design.md
import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { UploadCloud } from 'lucide-react';
import {
  arrangedPhotos,
  arrangementProblem,
  initialArrangement,
  movePhotos,
  removePhotos,
  type PhotoArrangement,
} from '../lib/project-photo-sort';
import { folderInfoProblem, sameTitleProjects, uploadSummary, type FolderInfo, type UploadResult } from '../lib/project-upload-rules';
import type { CategoryOption, ManagedProject } from './project-types';
import { filesFromDrop, isPhotoFile, projectTitleOfPath, shrinkPhotoForUpload } from './project-upload-files';
import { finalError, runUploadQueue } from '../lib/upload-queue';
import { ProjectUploadDialog } from './project-upload-dialog';

const input = 'w-full rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm outline-none focus:border-[#273541]';
const primaryButton = 'rounded-md bg-[#273541] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d2833] disabled:opacity-50';
const secondaryButton = 'rounded-md border border-[#d5dde2] bg-white px-3 py-1.5 text-xs font-semibold text-[#273541] hover:bg-[#f7fafb] disabled:opacity-50';

export type UploadRequest = { mode: 'new' } | { mode: 'replace'; project: ManagedProject };

// A folder's choice: 'new', 'replace:<id>', or '' (not chosen yet).
type Choice = string;
// One photo of the upload: picked with its folder, or added in the popup to a room.
type PickedPhoto = { key: string; file: File; folder: string };

const emptyInfo = (folder: string): FolderInfo => ({
  title: folder,
  categoryId: '',
  newCategory: '',
  location: '',
  area: '',
  year: '',
  materials: '',
  blogUrl: '',
  description: '',
  featured: false,
});
const pathOf = (file: File) => file.webkitRelativePath || file.name;
const captionOf = (file: File) => file.name.replace(/\.[^.]+$/, '');

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
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [arrangements, setArrangements] = useState<Record<string, PhotoArrangement>>({});
  const [infos, setInfos] = useState<Record<string, FolderInfo>>({});
  const [openFolder, setOpenFolder] = useState('');
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  // Videos in the picked folders, left out.
  const [leftOut, setLeftOut] = useState(0);
  // Photos already stored by an earlier try of this upload: pressing [올리기] again sends only the rest.
  const storedAssets = useRef(new Map<File, string>());
  const nextKey = useRef(0);
  const busyRef = useRef(false);

  const folders = useMemo(() => [...new Set(photos.map((photo) => photo.folder))], [photos]);
  const photoByKey = useMemo(() => new Map(photos.map((photo) => [photo.key, photo])), [photos]);
  const dialogPhotos = useMemo(() => photos.filter((photo) => photo.folder === openFolder).map(({ key, file }) => ({ key, file })), [photos, openFolder]);
  const replaceTarget = request.mode === 'replace' ? request.project : null;

  // The target each folder will be sent with, or '' while staff still have to choose.
  const targetOf = (folderTitle: string): Choice => {
    if (replaceTarget) return `replace:${replaceTarget._id}`;
    const matches = sameTitleProjects(folderTitle, projects);
    if (matches.length === 0) return 'new';
    return choices[folderTitle] || '';
  };
  const targets = Object.fromEntries(folders.map((folder) => [folder, targetOf(folder)]));
  // What still stops one folder, shown on its row; null when it is ready.
  const folderProblem = (folder: string): string | null => {
    if (!targets[folder]) return '같은 이름의 사례가 있어 올릴 방법을 골라 주세요.';
    if (targets[folder] === 'new') {
      const problem = folderInfoProblem(infos[folder] || emptyInfo(folder));
      if (problem) return `기본 정보: ${problem}`;
    }
    const problem = arrangementProblem(arrangements[folder]);
    if (problem === '올릴 사진이 없습니다.') return '사진이 없습니다. 이 폴더를 빼 주세요.';
    return problem ? `사진: ${problem}` : null;
  };
  const tooManyFolders = Boolean(replaceTarget) && folders.length > 1;
  const ready = folders.length > 0 && !tooManyFolders && folders.every((folder) => folderProblem(folder) === null);

  const makeKeys = (files: File[], folder: string): PickedPhoto[] =>
    files.map((file) => {
      nextKey.current += 1;
      return { key: `photo-${nextKey.current}`, file, folder };
    });
  // Folders picked or dropped are added to the ones already here (review finding: picking again wiped what was typed). A
  // folder of the same name gets the new photos in 미분류.
  const takeFiles = (picked: File[]) => {
    const usable = picked.filter(isPhotoFile);
    if (usable.length === 0) {
      setError('고른 폴더에 올릴 수 있는 사진이 없습니다.');
      return;
    }
    const added = usable.flatMap((file) => makeKeys([file], projectTitleOfPath(pathOf(file), file.name).trim() || '사진'));
    const names = [...new Set(added.map((photo) => photo.folder))];
    const fresh = names.filter((folder) => !arrangements[folder]);
    setPhotos((current) => [...current, ...added]);
    setArrangements((current) => {
      const next = { ...current };
      for (const folder of names) {
        const keys = added.filter((photo) => photo.folder === folder);
        next[folder] = current[folder]
          ? movePhotos(current[folder], keys.map((photo) => photo.key), { kind: 'unsorted' })
          : initialArrangement(keys.map((photo) => ({ key: photo.key, path: pathOf(photo.file), name: photo.file.name })));
      }
      return next;
    });
    setInfos((current) => ({ ...Object.fromEntries(fresh.map((folder) => [folder, emptyInfo(folder)])), ...current }));
    setLeftOut((current) => current + picked.filter((file) => file.type.startsWith('video/')).length);
    // The first folder picked opens at once, unless it first needs the replace / new choice.
    if (folders.length === 0 && names.length === 1 && targetOf(names[0])) setOpenFolder(names[0]);
  };
  // [폴더 빼기]: the folder leaves this upload.
  const dropFolder = (folder: string) => {
    setPhotos((current) => current.filter((photo) => photo.folder !== folder));
    const without = <T,>(record: Record<string, T>) => Object.fromEntries(Object.entries(record).filter(([key]) => key !== folder));
    setArrangements(without);
    setInfos(without);
    setChoices(without);
    if (openFolder === folder) setOpenFolder('');
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
  // [+ 사진 추가] in a room of the popup, or photos dropped on it from the computer ('' = 미분류).
  const addPhotos = (folder: string, files: File[], roomName: string) => {
    const added = makeKeys(files.filter(isPhotoFile), folder);
    if (added.length === 0) return;
    setPhotos((current) => [...current, ...added]);
    setArrangements((current) => ({
      ...current,
      [folder]: movePhotos(current[folder], added.map((photo) => photo.key), roomName ? { kind: 'room', name: roomName } : { kind: 'unsorted' }),
    }));
  };

  // One photo: shrunk, then stored as a Sanity image (/api/manager/project-asset); its asset id comes back. A photo that
  // cannot be opened or stays too large is marked skip (left out, the rest goes on); a request the server refuses is not
  // tried again; a network or server failure is.
  const uploadOnePhoto = async (file: File) => {
    const stored = storedAssets.current.get(file);
    if (stored) return stored;
    let small: File;
    try {
      small = await shrinkPhotoForUpload(file);
    } catch (caught) {
      throw Object.assign(finalError(caught instanceof Error ? caught.message : '사진을 열 수 없습니다'), { skip: true });
    }
    const body = new FormData();
    body.append('file', small);
    const response = await fetch('/api/manager/project-asset', { method: 'POST', headers: authHeaders(), body });
    const data = await readJson<{ assetId?: string; error?: string }>(response);
    if (!response.ok || !data.assetId) {
      const message = data.error || '사진을 올리지 못했습니다.';
      const refused = response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429;
      throw refused ? finalError(message) : new Error(message);
    }
    storedAssets.current.set(file, data.assetId);
    return data.assetId;
  };

  const submit = async () => {
    if (busyRef.current || !ready) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      // Only the photos placed in the popup go: each shrunk and uploaded on its own, three at a time, a failed one tried
      // twice more after 1 and 3 seconds. If one still fails, nothing is made and the error names it; [올리기] again
      // sends only the photos not stored yet. A photo that cannot be opened is left out with a note.
      const keys = [
        ...new Set(
          folders.flatMap((folder) => {
            const arranged = arrangedPhotos(arrangements[folder]);
            return [arranged.coverKey, arranged.beforeKey, ...arranged.rooms.flatMap((room) => room.keys)].filter((key): key is string => Boolean(key));
          }),
        ),
      ];
      const nameOf = (key: string) => photoByKey.get(key)?.file.name || key;
      setProgress(`사진 올리는 중 0/${keys.length}장`);
      const uploaded = await runUploadQueue(keys, (key) => uploadOnePhoto((photoByKey.get(key) as PickedPhoto).file), {
        concurrency: 3,
        retries: 2,
        retryDelays: [1000, 3000],
        onProgress: (done, total) => setProgress(`사진 올리는 중 ${done}/${total}장`),
      });
      // 'a.jpg(사유), b.jpg(사유) 외 N장'
      const describe = (indexes: number[]) =>
        indexes
          .slice(0, 3)
          .map((index) => `${nameOf(keys[index])}(${uploaded.errors[index]?.message || '알 수 없는 오류'})`)
          .join(', ') + (indexes.length > 3 ? ` 외 ${indexes.length - 3}장` : '');
      const skipped = uploaded.failed.filter((index) => (uploaded.errors[index] as { skip?: boolean } | null)?.skip);
      const blocked = uploaded.failed.filter((index) => !skipped.includes(index));
      if (blocked.length > 0) {
        setError(`사진 ${blocked.length}장을 올리지 못했습니다: ${describe(blocked)}. 인터넷 연결을 확인한 뒤 [올리기]를 다시 누르면 못 올린 사진만 다시 올립니다.`);
        return;
      }
      const skippedKeys = skipped.map((index) => keys[index]);
      const assetOf = (key: string) => uploaded.results[keys.indexOf(key)] || '';
      const empty: string[] = [];
      const payload = folders.flatMap((folder) => {
        const arranged = arrangedPhotos(removePhotos(arrangements[folder], skippedKeys));
        if (!arranged.coverKey) {
          empty.push(folder);
          return [];
        }
        return [
          {
            title: folder,
            target: targets[folder],
            ...(targets[folder] === 'new' ? { info: infos[folder] } : {}),
            coverAssetId: assetOf(arranged.coverKey),
            beforeAssetId: arranged.beforeKey ? assetOf(arranged.beforeKey) : null,
            groups: arranged.rooms.map((room) => ({
              roomType: room.name,
              photos: room.keys.map((key) => ({ assetId: assetOf(key), caption: captionOf((photoByKey.get(key) as PickedPhoto).file) })),
            })),
          },
        ];
      });
      const notes = [
        skipped.length > 0 ? `열 수 없거나 너무 큰 사진 ${skipped.length}장은 빼고 올렸습니다: ${describe(skipped)}` : '',
        empty.length > 0 ? `올릴 수 있는 사진이 없어 건너뛴 폴더: ${empty.join(', ')}` : '',
      ].filter(Boolean);
      if (payload.length === 0) {
        setError(notes.join(' / ') || '올릴 사진이 없습니다.');
        return;
      }

      setProgress('시공 사례 만드는 중');
      const response = await fetch('/api/manager/bulk-upload', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ folders: payload }),
      });
      const data = await readJson<{ results?: UploadResult[]; error?: string }>(response);
      if (!response.ok) {
        setError(data.error || '올리지 못했습니다.');
        return;
      }

      const results = data.results || [];
      const problems = results.filter((result) => result.status === 'skipped' || result.status === 'failed');
      setStatus(uploadSummary(results));
      const problemNote = problems.map((result) => `${result.projectTitle}: ${result.reason || '처리하지 못했습니다.'}`).join(' / ');
      if (problemNote || notes.length > 0) setError([problemNote, ...notes].filter(Boolean).join(' / '));
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

  const countOf = (arrangement: PhotoArrangement | undefined) =>
    arrangement ? (arrangement.cover ? 1 : 0) + (arrangement.before ? 1 : 0) + arrangement.unsorted.length + arrangement.rooms.reduce((sum, room) => sum + room.keys.length, 0) : 0;

  return (
    <div className="grid gap-4">
      {replaceTarget && (
        <p className="rounded-md border border-[#d5dde2] bg-[#f7fafb] px-3 py-2 text-sm text-[#273541]">
          ‘{replaceTarget.title || '이름 없음'}’의 사진을 폴더 하나로 통째로 바꿉니다. 이름·공개 여부·입력한 정보는 그대로입니다.
        </p>
      )}

      <label
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => void onDrop(event)}
        className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#9db6c1] bg-[#f7fafb] px-5 py-8 text-center hover:bg-[#eef4f7]"
      >
        <UploadCloud className="mb-2 text-[#273541]" size={30} />
        <span className="font-semibold text-[#171512]">{replaceTarget ? '폴더 하나 선택 또는 끌어오기' : '폴더 선택 또는 끌어오기 (여러 개 가능)'}</span>
        <span className="mt-1 text-xs text-[#60717d]">고른 뒤 [정보·사진 정리]에서 기본 정보를 넣고 사진을 공간별로 정리합니다. 파일 이름이 대표·시공전·거실1처럼 되어 있으면 미리 나눠 둡니다.</span>
        <input type="file" multiple accept="image/*" className="hidden" onChange={onPick} disabled={busy} {...{ webkitdirectory: '', directory: '' }} />
      </label>
      {leftOut > 0 && <p className="text-xs text-[#8a6215]">동영상 {leftOut}개는 뺐습니다. 사진만 올라갑니다.</p>}

      {folders.length > 0 && (
        <ul className="grid gap-2">
          {folders.map((folder) => {
            const matches = replaceTarget ? [] : sameTitleProjects(folder, projects);
            const choice = choices[folder] || '';
            const problem = folderProblem(folder);
            return (
              <li key={folder} className="grid gap-2 rounded-md border border-[#e3e8eb] px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-semibold text-[#171512]">{targets[folder] === 'new' ? infos[folder]?.title.trim() || folder : folder}</span>
                    <span className="text-[#60717d]"> · 사진 {countOf(arrangements[folder])}장</span>
                  </span>
                  <span className="flex gap-1.5">
                    <button type="button" onClick={() => setOpenFolder(folder)} disabled={busy || !targets[folder]} className={secondaryButton}>
                      정보·사진 정리
                    </button>
                    <button type="button" onClick={() => dropFolder(folder)} disabled={busy} className={secondaryButton} aria-label={`${folder} 폴더 빼기`}>
                      빼기
                    </button>
                  </span>
                </div>
                <span className={`text-xs font-semibold ${problem ? 'text-[#b45309]' : 'text-[#277a46]'}`}>{problem || '준비됨 ✓'}</span>
                {matches.length > 0 && (
                  <div className="grid gap-1.5 rounded-md border border-[#e2c06d] bg-[#fff8e6] p-2.5 text-[#5c4614]">
                    <span className="text-xs font-semibold">같은 이름의 시공 사례가 있습니다</span>
                    <label className="flex flex-wrap items-center gap-2 text-xs">
                      <input
                        type="radio"
                        name={`target-${folder}`}
                        checked={choice.startsWith('replace:')}
                        onChange={() => setChoices((current) => ({ ...current, [folder]: `replace:${matches[0]._id}` }))}
                        disabled={busy}
                      />
                      그 사례의 사진 바꾸기
                      {matches.length > 1 && (
                        <select
                          className={`${input} w-auto py-1 text-xs`}
                          value={choice.startsWith('replace:') ? choice.slice('replace:'.length) : matches[0]._id}
                          onChange={(event) => setChoices((current) => ({ ...current, [folder]: `replace:${event.target.value}` }))}
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
                      <input type="radio" name={`target-${folder}`} checked={choice === 'new'} onChange={() => setChoices((current) => ({ ...current, [folder]: 'new' }))} disabled={busy} />
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

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => onClose()} disabled={busy} className={secondaryButton}>
          취소
        </button>
        <button type="button" onClick={() => void submit()} disabled={!ready || busy} className={primaryButton}>
          {busy ? progress || '올리는 중' : '올리기'}
        </button>
      </div>
      {!replaceTarget && <p className="text-xs text-[#60717d]">새로 만든 시공 사례는 숨김 상태로 저장됩니다. 편집 화면에서 [홈페이지에 공개]를 누르세요.</p>}

      {openFolder && arrangements[openFolder] && (
        <ProjectUploadDialog
          key={openFolder}
          folderTitle={openFolder}
          photos={dialogPhotos}
          arrangement={arrangements[openFolder]}
          info={targets[openFolder] === 'new' ? infos[openFolder] || emptyInfo(openFolder) : null}
          duplicateTitle={
            targets[openFolder] === 'new' && sameTitleProjects((infos[openFolder] || emptyInfo(openFolder)).title, projects).length > 0
          }
          categories={categories}
          onArrangement={(next) => setArrangements((current) => ({ ...current, [openFolder]: next }))}
          onInfo={(next) => setInfos((current) => ({ ...current, [openFolder]: next }))}
          onAddPhotos={(files, roomName) => addPhotos(openFolder, files, roomName)}
          onClose={() => setOpenFolder('')}
        />
      )}
    </div>
  );
}
