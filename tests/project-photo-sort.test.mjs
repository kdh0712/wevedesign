import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addRoom,
  arrangedPhotos,
  arrangementProblem,
  initialArrangement,
  isPhotoAt,
  movePhotos,
  placePhotoBefore,
  placedPhotoKeys,
  removePhotos,
} from '../app/lib/project-photo-sort.ts';

// 정보·사진 정리 팝업의 사진 정리 (spec docs/superpowers/specs/2026-11-27-project-upload-popup-design.md).

const photo = (key, name) => ({ key, path: `평촌 34평/${name}`, name });
const start = () =>
  initialArrangement([
    photo('k10', '거실10.jpg'),
    photo('c', '대표.jpg'),
    photo('k2', '거실2.jpg'),
    photo('j1', '주방1.jpg'),
    photo('b', '시공전.jpg'),
    photo('i1', 'IMG_2041.jpg'),
    photo('d1', 'DSC0001.jpg'),
    photo('c2', '대표.png'),
  ]);

test('initialArrangement sorts by file name: 대표, 시공전, Korean rooms in number order; other names unsorted', () => {
  assert.deepEqual(start(), {
    cover: 'c',
    before: 'b',
    rooms: [
      { name: '거실', keys: ['k2', 'k10'] },
      { name: '주방', keys: ['j1'] },
    ],
    // a second 대표 and camera names (no Korean letter) wait in 미분류
    unsorted: ['c2', 'd1', 'i1'],
  });
});

test('initialArrangement puts a room name longer than 20 letters in 미분류', () => {
  const long = '아주아주긴공간이름입니다아주아주긴공간이름입니다';
  assert.deepEqual(initialArrangement([photo('x', `${long}1.jpg`)]).unsorted, ['x']);
});

test('movePhotos moves photos into a room, creating it, and keeps one 대표 / 시공 전 photo', () => {
  let a = movePhotos(start(), ['i1', 'd1'], { kind: 'room', name: '욕실' });
  assert.deepEqual(a.rooms.at(-1), { name: '욕실', keys: ['i1', 'd1'] });
  assert.deepEqual(a.unsorted, ['c2']);
  a = movePhotos(a, ['c2'], { kind: 'cover' });
  assert.equal(a.cover, 'c2');
  assert.deepEqual(a.unsorted, ['c']);
  a = movePhotos(a, ['k2'], { kind: 'before' });
  assert.equal(a.before, 'k2');
  assert.deepEqual(a.rooms[0].keys, ['k10']);
  assert.deepEqual(a.unsorted, ['c', 'b']);
});

test('placePhotoBefore puts a photo before another, in that photo’s room', () => {
  let a = placePhotoBefore(start(), 'k10', 'k2');
  assert.deepEqual(a.rooms[0].keys, ['k10', 'k2']);
  a = placePhotoBefore(a, 'j1', 'k2');
  assert.deepEqual(a.rooms[0].keys, ['k10', 'j1', 'k2']);
  assert.deepEqual(a.rooms[1].keys, []);
  assert.deepEqual(placePhotoBefore(a, 'k2', 'k2'), a);
});

test('addRoom adds an empty room once, 1–20 letters', () => {
  const a = addRoom(start(), ' 작은방 ');
  assert.deepEqual(a.rooms.at(-1), { name: '작은방', keys: [] });
  assert.deepEqual(addRoom(a, '작은방'), { error: '이미 있는 공간입니다.' });
  assert.deepEqual(addRoom(a, '  '), { error: '공간 이름은 1~20자로 입력해 주세요.' });
});

test('removePhotos takes photos out of the upload', () => {
  const a = removePhotos(start(), ['c', 'i1', 'k2']);
  assert.equal(a.cover, null);
  assert.deepEqual(a.rooms[0].keys, ['k10']);
  assert.deepEqual(a.unsorted, ['c2', 'd1']);
});

test('arrangementProblem asks for unsorted photos to be placed and for at least one photo', () => {
  assert.equal(arrangementProblem(start()), '미분류 사진 3장을 공간에 넣거나 빼 주세요.');
  assert.equal(arrangementProblem(removePhotos(start(), ['c2', 'd1', 'i1'])), null);
  assert.equal(arrangementProblem({ cover: null, before: null, rooms: [{ name: '거실', keys: [] }], unsorted: [] }), '올릴 사진이 없습니다.');
});

test('arrangedPhotos gives the cover (else the first room photo), the 시공 전 photo and the non-empty rooms', () => {
  const a = addRoom(removePhotos(start(), ['c', 'c2', 'd1', 'i1']), '작은방');
  assert.deepEqual(arrangedPhotos(a), {
    coverKey: 'k2',
    beforeKey: 'b',
    rooms: [
      { name: '거실', keys: ['k2', 'k10'] },
      { name: '주방', keys: ['j1'] },
    ],
  });
});

test('initialArrangement puts Windows bulk-rename names into one room, and number-only names in 미분류 (review finding)', () => {
  const a = initialArrangement([photo('a', '거실 (2).jpg'), photo('b', '거실 (1).jpg'), photo('c', '12.jpg'), photo('d', '002.jpg')]);
  assert.deepEqual(a.rooms, [{ name: '거실', keys: ['b', 'a'] }]);
  assert.deepEqual(a.unsorted, ['d', 'c']);
});

test('isPhotoAt says whether a photo is already in a place (사진 크게 보기: the same room again keeps its order)', () => {
  const arrangement = { cover: 'c', before: null, rooms: [{ name: '거실', keys: ['a', 'b'] }], unsorted: ['u'] };
  assert.equal(isPhotoAt(arrangement, 'a', { kind: 'room', name: '거실' }), true);
  assert.equal(isPhotoAt(arrangement, 'a', { kind: 'room', name: '주방' }), false);
  assert.equal(isPhotoAt(arrangement, 'c', { kind: 'cover' }), true);
  assert.equal(isPhotoAt(arrangement, 'a', { kind: 'cover' }), false);
  assert.equal(isPhotoAt(arrangement, 'u', { kind: 'unsorted' }), true);
  assert.equal(isPhotoAt(arrangement, 'u', { kind: 'before' }), false);
});

test('placedPhotoKeys lists each photo to send once, even when the first room photo stands in for the cover', () => {
  const noCover = { cover: null, before: 'p', rooms: [{ name: '거실', keys: ['a', 'b'] }, { name: '빈 방', keys: [] }], unsorted: ['u'] };
  assert.deepEqual(placedPhotoKeys(noCover), ['a', 'p', 'b']);
  const withCover = { cover: 'c', before: null, rooms: [{ name: '거실', keys: ['a'] }], unsorted: [] };
  assert.deepEqual(placedPhotoKeys(withCover), ['c', 'a']);
});

