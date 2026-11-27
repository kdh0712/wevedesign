'use client';

// 정보·사진 정리 팝업 (spec docs/superpowers/specs/2026-11-27-project-upload-popup-design.md): one folder of a 시공 사례 upload.
// The 기본 정보 tab (new projects only) takes the editor's fields; the 사진 정리 tab places each photo — 대표, 시공 전, a room
// in order, or 미분류 — and adds photos to a room from the computer. Every change goes straight to the upload panel.
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent } from 'react';
import { Plus, X } from 'lucide-react';
import {
  addRoom,
  arrangementProblem,
  movePhotos,
  placePhotoBefore,
  removePhotos,
  type PhotoArrangement,
  type PhotoPlace,
} from '../lib/project-photo-sort';
import { folderInfoProblem, type FolderInfo } from '../lib/project-upload-rules';
import type { CategoryOption } from './project-types';

export type DialogPhoto = { key: string; file: File };

const input = 'w-full rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm outline-none focus:border-[#273541]';
const label = 'grid gap-1 text-xs font-semibold text-[#4d5d66]';
const chip = 'rounded-full border px-3 py-1 text-xs font-bold disabled:cursor-default disabled:opacity-40';

type Tab = 'info' | 'photos';

export function ProjectUploadDialog({
  folderTitle,
  photos,
  arrangement,
  info,
  categories,
  onArrangement,
  onInfo,
  onAddPhotos,
  onClose,
}: {
  folderTitle: string;
  // The folder's photos (picked and added), by key.
  photos: DialogPhoto[];
  arrangement: PhotoArrangement;
  // null for [사진 다시 올리기]: the project's information is not changed.
  info: FolderInfo | null;
  categories: CategoryOption[];
  onArrangement: (next: PhotoArrangement) => void;
  onInfo: (next: FolderInfo) => void;
  // Files picked with a room's [+ 사진 추가], to go into that room.
  onAddPhotos: (files: File[], roomName: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(info ? 'info' : 'photos');
  const [selected, setSelected] = useState<string[]>([]);
  const [lastClicked, setLastClicked] = useState('');
  const [dragging, setDragging] = useState('');
  const [newRoom, setNewRoom] = useState('');
  const [roomError, setRoomError] = useState('');
  const [addTarget, setAddTarget] = useState('');
  const addInput = useRef<HTMLInputElement>(null);

  // Thumbnails from the picked files themselves, made and released by the same effect (so React's double run in
  // development never leaves released addresses on screen), released when the popup closes or the photos change.
  const [urls, setUrls] = useState<Map<string, string>>(() => new Map());
  useEffect(() => {
    const made = new Map(photos.map((photo) => [photo.key, URL.createObjectURL(photo.file)]));
    setUrls(made);
    return () => made.forEach((url) => URL.revokeObjectURL(url));
  }, [photos]);
  const nameOf = useMemo(() => new Map(photos.map((photo) => [photo.key, photo.file.name])), [photos]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  // Every photo in the order it is shown, for Shift-click ranges.
  const shownOrder = [
    ...arrangement.unsorted,
    ...(arrangement.cover ? [arrangement.cover] : []),
    ...(arrangement.before ? [arrangement.before] : []),
    ...arrangement.rooms.flatMap((room) => room.keys),
  ];
  const infoProblem = info ? folderInfoProblem(info) : null;
  const photoProblem = arrangementProblem(arrangement);

  const click = (event: MouseEvent, key: string) => {
    if (event.shiftKey && lastClicked) {
      const from = shownOrder.indexOf(lastClicked);
      const to = shownOrder.indexOf(key);
      if (from >= 0 && to >= 0) {
        const range = shownOrder.slice(Math.min(from, to), Math.max(from, to) + 1);
        setSelected((current) => [...new Set([...current, ...range])]);
        setLastClicked(key);
        return;
      }
    }
    setSelected((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
    setLastClicked(key);
  };
  const moveSelected = (place: PhotoPlace) => {
    onArrangement(movePhotos(arrangement, selected, place));
    setSelected([]);
    setLastClicked('');
  };
  const dropOnPhoto = (event: DragEvent, targetKey: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (dragging) onArrangement(placePhotoBefore(arrangement, dragging, targetKey));
    setDragging('');
  };
  const dropOnPlace = (event: DragEvent, place: PhotoPlace) => {
    event.preventDefault();
    if (dragging) onArrangement(movePhotos(arrangement, [dragging], place));
    setDragging('');
  };
  const allowDrop = (event: DragEvent) => {
    if (dragging) event.preventDefault();
  };
  const makeRoom = () => {
    const next = addRoom(arrangement, newRoom);
    if ('error' in next) {
      setRoomError(next.error);
      return;
    }
    onArrangement(next);
    setNewRoom('');
    setRoomError('');
  };
  const pickForRoom = (roomName: string) => {
    setAddTarget(roomName);
    addInput.current?.click();
  };
  const onAddPicked = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length > 0 && addTarget) onAddPhotos(files, addTarget);
  };
  const setInfo = (patch: Partial<FolderInfo>) => info && onInfo({ ...info, ...patch });

  const tile = (key: string, number?: number) => (
    <div
      key={key}
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', key);
        setDragging(key);
      }}
      onDragEnd={() => setDragging('')}
      onDragOver={allowDrop}
      onDrop={(event) => dropOnPhoto(event, key)}
      onClick={(event) => click(event, key)}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          setSelected((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
        }
      }}
      aria-pressed={selected.includes(key)}
      title={nameOf.get(key)}
      className={`relative aspect-[4/3] cursor-pointer select-none overflow-hidden rounded-md border-2 bg-[#edf2f5] ${
        selected.includes(key) ? 'border-[#1d6d7b] ring-2 ring-[#38a9bd]/50' : 'border-transparent'
      } ${dragging === key ? 'opacity-40' : ''}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={urls.get(key)} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
      {number !== undefined && <span className="absolute left-1 top-1 rounded bg-[#171512]/65 px-1 text-[10px] font-bold text-white">{number}</span>}
      {selected.includes(key) && <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-[#1d6d7b] text-[10px] text-white">✓</span>}
      <span className="absolute inset-x-0 bottom-0 truncate bg-white/85 px-1 text-[10px] text-[#273541]">{nameOf.get(key)}</span>
    </div>
  );
  const section = (title: string, keys: string[], place: PhotoPlace, extra?: { numbered?: boolean; onAdd?: () => void; tone?: string }) => (
    <section className="grid gap-1.5" onDragOver={allowDrop} onDrop={(event) => dropOnPlace(event, place)}>
      <div className="flex items-center gap-2">
        <h4 className={`text-sm font-bold ${extra?.tone || 'text-[#171512]'}`}>
          {title} <span className="font-semibold text-[#60717d]">{keys.length}장</span>
        </h4>
        {extra?.onAdd && (
          <button type="button" onClick={extra.onAdd} className="inline-flex items-center gap-0.5 rounded border border-[#d5dde2] px-1.5 py-0.5 text-[11px] font-semibold text-[#273541]">
            <Plus size={11} /> 사진 추가
          </button>
        )}
      </div>
      <div className={`grid min-h-12 grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2 rounded-md border border-dashed p-1 ${dragging ? 'border-[#9db6c1]' : 'border-transparent'}`}>
        {keys.map((key, index) => tile(key, extra?.numbered ? index + 1 : undefined))}
        {keys.length === 0 && <p className="col-span-full self-center px-1 text-xs text-[#9aa6ad]">사진을 끌어 놓거나 골라서 옮기세요.</p>}
      </div>
    </section>
  );

  const dot = (ok: boolean) => <span className={`ml-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${ok ? 'bg-[#277a46]' : 'bg-[#d92d20]'}`} />;

  return (
    <div role="dialog" aria-modal="true" aria-label="정보·사진 정리" className="fixed inset-0 z-[70] flex items-center justify-center bg-[#171512]/50 p-4">
      <section className="grid h-[min(760px,calc(100vh-32px))] w-full max-w-[1000px] grid-rows-[auto_auto_1fr_auto] overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-4">
          <h2 className="text-base font-semibold">정보·사진 정리 · {folderTitle}</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded-full border border-[#d5dde2] p-1.5 text-[#60717d]">
            <X size={16} />
          </button>
        </div>
        <div className="flex gap-1 border-b border-[#edf2f5] px-5" role="tablist">
          {info && (
            <button type="button" role="tab" aria-selected={tab === 'info'} onClick={() => setTab('info')} className={`border-b-2 px-3 py-2 text-sm font-bold ${tab === 'info' ? 'border-[#171512] text-[#171512]' : 'border-transparent text-[#60717d]'}`}>
              기본 정보{dot(!infoProblem)}
            </button>
          )}
          <button type="button" role="tab" aria-selected={tab === 'photos'} onClick={() => setTab('photos')} className={`border-b-2 px-3 py-2 text-sm font-bold ${tab === 'photos' ? 'border-[#171512] text-[#171512]' : 'border-transparent text-[#60717d]'}`}>
            사진 정리{dot(!photoProblem)}
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {tab === 'info' && info ? (
            <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
              <label className={label}>
                이름 *
                <input className={input} value={info.title} onChange={(event) => setInfo({ title: event.target.value })} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>
                  공간 분류 *
                  <select className={input} value={info.categoryId} onChange={(event) => setInfo({ categoryId: event.target.value, newCategory: '' })}>
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
                  <input className={input} value={info.newCategory} placeholder="목록에 없으면" onChange={(event) => setInfo({ newCategory: event.target.value, categoryId: '' })} />
                </label>
              </div>
              <label className={label}>
                지역
                <input className={input} value={info.location} placeholder="예: 안양시 평촌동" onChange={(event) => setInfo({ location: event.target.value })} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>
                  평수
                  <input className={input} value={info.area} placeholder="예: 34" onChange={(event) => setInfo({ area: event.target.value })} />
                </label>
                <label className={label}>
                  시공 연도
                  <input className={input} value={info.year} placeholder="예: 2026" onChange={(event) => setInfo({ year: event.target.value })} />
                </label>
              </div>
              <label className={label}>
                주요 자재
                <input className={input} value={info.materials} placeholder="예: 강마루, 포세린 타일" onChange={(event) => setInfo({ materials: event.target.value })} />
              </label>
              <label className={label}>
                블로그 링크
                <input className={input} value={info.blogUrl} placeholder="blog.naver.com/…" onChange={(event) => setInfo({ blogUrl: event.target.value })} />
              </label>
              <label className={`${label} sm:col-span-2`}>
                짧은 설명
                <textarea className={`${input} min-h-24`} value={info.description} placeholder="줄바꿈 그대로 보여요" onChange={(event) => setInfo({ description: event.target.value })} />
              </label>
              <label className="flex items-center gap-2 text-sm text-[#273541]">
                <input type="checkbox" checked={info.featured} onChange={(event) => setInfo({ featured: event.target.checked })} />
                메인에도 보이기
              </label>
              {infoProblem && <p className="text-sm font-semibold text-[#b45309] sm:col-span-2">{infoProblem}</p>}
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="sticky top-0 z-[1] -mx-1 flex flex-wrap items-center gap-1.5 bg-white px-1 pb-2">
                <span className="mr-1 text-xs font-semibold text-[#60717d]">고른 {selected.length}장을</span>
                <button type="button" disabled={selected.length !== 1} onClick={() => moveSelected({ kind: 'cover' })} className={`${chip} border-[#e7c37a] bg-[#fff8e8] text-[#8b6420]`}>
                  대표 사진으로
                </button>
                <button type="button" disabled={selected.length !== 1} onClick={() => moveSelected({ kind: 'before' })} className={`${chip} border-[#e7c37a] bg-[#fff8e8] text-[#8b6420]`}>
                  시공 전 사진으로
                </button>
                {arrangement.rooms.map((room) => (
                  <button key={room.name} type="button" disabled={selected.length === 0} onClick={() => moveSelected({ kind: 'room', name: room.name })} className={`${chip} border-[#d5dde2] bg-white text-[#273541]`}>
                    {room.name}
                  </button>
                ))}
                <button type="button" disabled={selected.length === 0} onClick={() => moveSelected({ kind: 'unsorted' })} className={`${chip} border-[#d5dde2] bg-white text-[#60717d]`}>
                  미분류로
                </button>
                <button
                  type="button"
                  disabled={selected.length === 0}
                  onClick={() => {
                    onArrangement(removePhotos(arrangement, selected));
                    setSelected([]);
                  }}
                  className={`${chip} border-[#f0b9b4] bg-white text-[#b42318]`}
                >
                  빼기
                </button>
                <span className="ml-auto flex items-center gap-1">
                  <input
                    value={newRoom}
                    onChange={(event) => {
                      setNewRoom(event.target.value);
                      setRoomError('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') makeRoom();
                    }}
                    placeholder="새 공간 이름"
                    aria-label="새 공간 이름"
                    className="w-28 rounded-md border border-[#d5dde2] px-2 py-1 text-xs"
                  />
                  <button type="button" onClick={makeRoom} className={`${chip} border-dashed border-[#9db6c1] bg-white text-[#273541]`}>
                    + 공간 추가
                  </button>
                </span>
                {roomError && <p className="w-full text-right text-xs font-semibold text-[#b42318]">{roomError}</p>}
              </div>
              {arrangement.unsorted.length > 0 && section('미분류', arrangement.unsorted, { kind: 'unsorted' }, { tone: 'text-[#b45309]' })}
              <div className="grid gap-4 sm:grid-cols-2">
                {section('대표 사진', arrangement.cover ? [arrangement.cover] : [], { kind: 'cover' })}
                {section('시공 전', arrangement.before ? [arrangement.before] : [], { kind: 'before' })}
              </div>
              {arrangement.rooms.map((room) =>
                section(room.name, room.keys, { kind: 'room', name: room.name }, { numbered: true, onAdd: () => pickForRoom(room.name) }),
              )}
              {arrangement.rooms.length === 0 && <p className="text-sm text-[#60717d]">공간이 없습니다. 위에서 공간을 추가하세요.</p>}
              <input ref={addInput} type="file" multiple accept="image/*" className="hidden" onChange={onAddPicked} />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#edf2f5] px-5 py-3">
          <p className="text-xs text-[#60717d]">
            {[info ? (infoProblem ? `기본 정보: ${infoProblem}` : '기본 정보 됨') : '', photoProblem ? `사진: ${photoProblem}` : '사진 정리 됨'].filter(Boolean).join(' · ')}
          </p>
          <button type="button" onClick={onClose} className="rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white">
            완료
          </button>
        </div>
      </section>
    </div>
  );
}
