// 정보·사진 정리 팝업의 사진 정리 (spec docs/superpowers/specs/2026-11-27-project-upload-popup-design.md): where each photo of
// one folder goes — 대표, 시공 전, a room (in order) or 미분류 — before it is uploaded. Photos are named by a key the page
// gives each picked file. Pure; its only import is a relative .ts module, so Node tests load it directly.
import { parseUploadPath } from './project-upload-rules.ts';

export type SortPhoto = { key: string; path: string; name: string };
export type PhotoArrangement = {
  cover: string | null;
  before: string | null;
  rooms: { name: string; keys: string[] }[];
  unsorted: string[];
};
export type PhotoPlace = { kind: 'cover' } | { kind: 'before' } | { kind: 'unsorted' } | { kind: 'room'; name: string };

export const MAX_ROOM_NAME = 20;
const HANGUL = /[가-힣]/;
const koreanOrder = new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' });

// The file-name rules start the sort: 대표 / 시공전, and 거실1·주방2 into rooms in number order. A name with no Korean
// letter (IMG_2041, DSC0001) or too long for a room, and a second 대표 or 시공전, wait in 미분류.
export function initialArrangement(photos: readonly SortPhoto[]): PhotoArrangement {
  let cover: string | null = null;
  let before: string | null = null;
  const unsorted: { key: string; path: string }[] = [];
  const rooms = new Map<string, { key: string; path: string; order: number }[]>();
  for (const photo of photos) {
    const parsed = parseUploadPath(photo.path);
    if (parsed.kind === 'cover' && cover === null) cover = photo.key;
    else if (parsed.kind === 'before' && before === null) before = photo.key;
    else if (parsed.kind === 'detail' && HANGUL.test(parsed.roomType) && parsed.roomType.length <= MAX_ROOM_NAME) {
      rooms.set(parsed.roomType, [...(rooms.get(parsed.roomType) || []), { key: photo.key, path: photo.path, order: parsed.order }]);
    } else unsorted.push({ key: photo.key, path: photo.path });
  }
  return {
    cover,
    before,
    rooms: [...rooms.keys()]
      .sort((a, b) => koreanOrder.compare(a, b))
      .map((name) => ({
        name,
        keys: [...(rooms.get(name) || [])].sort((a, b) => a.order - b.order || koreanOrder.compare(a.path, b.path)).map((item) => item.key),
      })),
    unsorted: unsorted.sort((a, b) => koreanOrder.compare(a.path, b.path)).map((item) => item.key),
  };
}

// The arrangement without these photos (rooms stay, even empty).
export function removePhotos(arrangement: PhotoArrangement, keys: readonly string[]): PhotoArrangement {
  const gone = new Set(keys);
  return {
    cover: arrangement.cover !== null && gone.has(arrangement.cover) ? null : arrangement.cover,
    before: arrangement.before !== null && gone.has(arrangement.before) ? null : arrangement.before,
    rooms: arrangement.rooms.map((room) => ({ name: room.name, keys: room.keys.filter((key) => !gone.has(key)) })),
    unsorted: arrangement.unsorted.filter((key) => !gone.has(key)),
  };
}

// Moves photos (new ones too) to a place, appended at its end. 대표 and 시공 전 take one photo; the one they had goes to
// 미분류. A room that does not exist yet is made.
export function movePhotos(arrangement: PhotoArrangement, keys: readonly string[], place: PhotoPlace): PhotoArrangement {
  if (keys.length === 0) return arrangement;
  const next = removePhotos(arrangement, keys);
  if (place.kind === 'cover' || place.kind === 'before') {
    const previous = next[place.kind];
    return { ...next, [place.kind]: keys[0], unsorted: [...next.unsorted, ...(previous ? [previous] : []), ...keys.slice(1)] };
  }
  if (place.kind === 'unsorted') return { ...next, unsorted: [...next.unsorted, ...keys] };
  const exists = next.rooms.some((room) => room.name === place.name);
  return {
    ...next,
    rooms: exists
      ? next.rooms.map((room) => (room.name === place.name ? { ...room, keys: [...room.keys, ...keys] } : room))
      : [...next.rooms, { name: place.name, keys: [...keys] }],
  };
}

// A drag: the photo goes just before the target photo, in the target's room (or 미분류; onto 대표 / 시공 전 it takes that
// place).
export function placePhotoBefore(arrangement: PhotoArrangement, key: string, targetKey: string): PhotoArrangement {
  if (key === targetKey) return arrangement;
  if (arrangement.cover === targetKey) return movePhotos(arrangement, [key], { kind: 'cover' });
  if (arrangement.before === targetKey) return movePhotos(arrangement, [key], { kind: 'before' });
  const next = removePhotos(arrangement, [key]);
  const insert = (keys: string[]) => {
    const index = keys.indexOf(targetKey);
    return index < 0 ? keys : [...keys.slice(0, index), key, ...keys.slice(index)];
  };
  if (next.unsorted.includes(targetKey)) return { ...next, unsorted: insert(next.unsorted) };
  if (!next.rooms.some((room) => room.keys.includes(targetKey))) return arrangement;
  return { ...next, rooms: next.rooms.map((room) => (room.keys.includes(targetKey) ? { ...room, keys: insert(room.keys) } : room)) };
}

export function addRoom(arrangement: PhotoArrangement, rawName: string): PhotoArrangement | { error: string } {
  const name = rawName.trim();
  if (!name || name.length > MAX_ROOM_NAME) return { error: `공간 이름은 1~${MAX_ROOM_NAME}자로 입력해 주세요.` };
  if (arrangement.rooms.some((room) => room.name === name)) return { error: '이미 있는 공간입니다.' };
  return { ...arrangement, rooms: [...arrangement.rooms, { name, keys: [] }] };
}

// What still stops the upload: photos left in 미분류, or no photo at all.
export function arrangementProblem(arrangement: PhotoArrangement): string | null {
  if (arrangement.unsorted.length > 0) return `미분류 사진 ${arrangement.unsorted.length}장을 공간에 넣거나 빼 주세요.`;
  if (arrangement.cover === null && !arrangement.rooms.some((room) => room.keys.length > 0)) return '올릴 사진이 없습니다.';
  return null;
}

// What is uploaded: the cover (else the first room photo, as the file-name rules always did), the 시공 전 photo and the
// rooms that hold photos.
export function arrangedPhotos(arrangement: PhotoArrangement): { coverKey: string | null; beforeKey: string | null; rooms: { name: string; keys: string[] }[] } {
  const rooms = arrangement.rooms.filter((room) => room.keys.length > 0).map((room) => ({ name: room.name, keys: [...room.keys] }));
  return { coverKey: arrangement.cover ?? rooms[0]?.keys[0] ?? null, beforeKey: arrangement.before, rooms };
}
