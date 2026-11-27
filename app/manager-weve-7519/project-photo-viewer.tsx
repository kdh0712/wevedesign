'use client';

// 사진 크게 보기 (정보·사진 정리 팝업, spec docs/superpowers/specs/2026-11-27-project-upload-popup-design.md): a photo opened by
// a double click, shown large from the original file, with the place buttons below it. Placing it moves on to the next
// photo, so a folder can be sorted one photo after another. ← → move through the photos, 1–9 pick a room, Esc closes.
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { addRoom, isPhotoAt, movePhotos, removePhotos, type PhotoArrangement, type PhotoPlace } from '../lib/project-photo-sort';

const button = 'rounded-full border px-3 py-1.5 text-xs font-bold';

// Where a photo is now, for the top bar.
function placeOf(arrangement: PhotoArrangement, key: string): string {
  if (arrangement.cover === key) return '대표 사진';
  if (arrangement.before === key) return '시공 전';
  if (arrangement.unsorted.includes(key)) return '미분류';
  for (const room of arrangement.rooms) {
    const index = room.keys.indexOf(key);
    if (index >= 0) return `${room.name} ${index + 1}번째`;
  }
  return '';
}

export function ProjectPhotoViewer({
  photos,
  urls,
  arrangement,
  startKey,
  onArrangement,
  onClose,
}: {
  // The folder's photos in the order they were picked: the order ← → walk through.
  photos: { key: string; file: File }[];
  urls: Map<string, string>;
  arrangement: PhotoArrangement;
  startKey: string;
  onArrangement: (next: PhotoArrangement) => void;
  onClose: () => void;
}) {
  const [key, setKey] = useState(startKey);
  const [newRoom, setNewRoom] = useState('');
  const [roomError, setRoomError] = useState('');
  // Focus sits on the viewer itself, so keys never reach the photo tile under it, and a new space's name field gives it
  // back once the photo is placed (number keys pick spaces again).
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => box.current?.focus(), []);

  // Photos still in the upload (one taken out with [빼기] leaves the walk).
  const keys = photos.map((photo) => photo.key).filter((item) => placeOf(arrangement, item) !== '');
  const index = keys.indexOf(key);
  const photo = photos.find((item) => item.key === key);
  const next = (from: string[]) => {
    const at = from.indexOf(key);
    return from[at + 1] ?? from[at - 1] ?? '';
  };

  // Placing a photo moves on to the next one (or stays on the last). A photo already there keeps its order.
  const place = (target: PhotoPlace) => {
    if (!key) return;
    if (!isPhotoAt(arrangement, key, target)) onArrangement(movePhotos(arrangement, [key], target));
    const following = keys[index + 1];
    if (following) setKey(following);
  };
  const takeOut = () => {
    if (!key) return;
    const after = next(keys);
    onArrangement(removePhotos(arrangement, [key]));
    if (after) setKey(after);
    else onClose();
  };
  const placeInNewRoom = () => {
    const made = addRoom(arrangement, newRoom);
    if ('error' in made) {
      setRoomError(made.error);
      return;
    }
    const name = newRoom.trim();
    onArrangement(movePhotos(made, [key], { kind: 'room', name }));
    setNewRoom('');
    setRoomError('');
    box.current?.focus();
    const following = keys[index + 1];
    if (following) setKey(following);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      // Typing a room name is not a shortcut.
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === 'ArrowRight' && index < keys.length - 1) setKey(keys[index + 1]);
      else if (event.key === 'ArrowLeft' && index > 0) setKey(keys[index - 1]);
      else if (/^[1-9]$/.test(event.key)) {
        const room = arrangement.rooms[Number(event.key) - 1];
        if (room) place({ kind: 'room', name: room.name });
      } else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const where = key ? placeOf(arrangement, key) : '';

  return (
    <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label="사진 크게 보기" className="fixed inset-0 z-[75] grid grid-rows-[auto_1fr_auto] bg-[#0f0e0c]/95 text-white outline-none">
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <p className="min-w-0 truncate text-sm">
          <span className="font-bold">
            {index + 1} / {keys.length}
          </span>
          <span className="text-white/70"> · {photo?.file.name}</span>
          <span className={`ml-2 rounded px-1.5 py-0.5 text-xs font-bold ${where === '미분류' ? 'bg-[#b45309]' : 'bg-white/15'}`}>지금: {where}</span>
        </p>
        <button type="button" onClick={onClose} aria-label="크게 보기 닫기" className="rounded-full border border-white/30 p-1.5 text-white/80 hover:text-white">
          <X size={18} />
        </button>
      </div>

      <div className="relative flex min-h-0 items-center justify-center px-14">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {key && <img src={urls.get(key)} alt={photo?.file.name || ''} className="max-h-full max-w-full object-contain" />}
        <button
          type="button"
          onClick={() => index > 0 && setKey(keys[index - 1])}
          disabled={index <= 0}
          aria-label="앞 사진"
          className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 hover:bg-white/20 disabled:opacity-20"
        >
          <ChevronLeft size={26} />
        </button>
        <button
          type="button"
          onClick={() => index < keys.length - 1 && setKey(keys[index + 1])}
          disabled={index >= keys.length - 1}
          aria-label="다음 사진"
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 hover:bg-white/20 disabled:opacity-20"
        >
          <ChevronRight size={26} />
        </button>
      </div>

      <div className="grid gap-2 border-t border-white/10 bg-black/40 px-5 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => place({ kind: 'cover' })} className={`${button} border-[#e7c37a] bg-[#fff8e8] text-[#8b6420]`}>
            대표 사진으로
          </button>
          <button type="button" onClick={() => place({ kind: 'before' })} className={`${button} border-[#e7c37a] bg-[#fff8e8] text-[#8b6420]`}>
            시공 전 사진으로
          </button>
          {arrangement.rooms.map((room, roomIndex) => (
            <button key={room.name} type="button" onClick={() => place({ kind: 'room', name: room.name })} className={`${button} border-white/40 bg-white text-[#171512]`}>
              {roomIndex < 9 && <span className="mr-1 text-[#60717d]">{roomIndex + 1}</span>}
              {room.name}
            </button>
          ))}
          <button type="button" onClick={() => place({ kind: 'unsorted' })} className={`${button} border-white/30 bg-transparent text-white/80`}>
            미분류로
          </button>
          <button type="button" onClick={takeOut} className={`${button} border-[#f0b9b4] bg-transparent text-[#f6a59d]`}>
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
                if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) placeInNewRoom();
              }}
              placeholder="새 공간 이름"
              aria-label="새 공간 이름"
              className="w-28 rounded-md border border-white/30 bg-white/10 px-2 py-1 text-xs text-white placeholder:text-white/50"
            />
            <button type="button" onClick={placeInNewRoom} className={`${button} border-dashed border-white/40 bg-transparent text-white`}>
              + 공간 만들고 넣기
            </button>
          </span>
        </div>
        <p className="text-xs text-white/60">
          {roomError || '공간을 누르면 이 사진이 옮겨지고 다음 사진으로 넘어갑니다. ← → 사진 넘기기 · 숫자 키 1~9 공간 고르기 · Esc 닫기'}
        </p>
      </div>
    </div>
  );
}
