import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PHOTO_BYTES,
  checkPhotoUpload,
  isProgressPhotoPathname,
  parseCreateUpdate,
  parsePhotoSize,
  progressPhotoPathname,
  readStoredPhoto,
} from '../app/api/manager/_progress-request.ts';

const photo = (overrides = {}) => ({
  id: '0123456789abcdef',
  pathname: 'progress/0123456789abcdef01234567.jpg',
  width: 800,
  height: 600,
  ...overrides,
});

const body = (overrides = {}) => ({
  siteId: 'site-1',
  reportDate: '2026-10-05',
  designer: '김실장',
  workDetail: '도배 초배 작업을 마쳤습니다.',
  photos: [photo()],
  ...overrides,
});

test('parseCreateUpdate accepts a normal body and trims text', () => {
  const parsed = parseCreateUpdate(
    body({ siteId: ' site-1 ', designer: '  김실장 ', workDetail: '  1층 도배\n2층 장판  ', reportDate: ' 2026-10-05 ' }),
  );
  assert.deepEqual(parsed, {
    ok: true,
    value: {
      siteId: 'site-1',
      reportDate: '2026-10-05',
      designer: '김실장',
      workDetail: '1층 도배\n2층 장판',
      photos: [photo()],
      notify: false,
    },
  });
});

test('parseCreateUpdate sends a notification only when notify is exactly true', () => {
  assert.equal(parseCreateUpdate(body({ notify: true })).value.notify, true);
  for (const notify of [false, undefined, 'true', 1, null]) assert.equal(parseCreateUpdate(body({ notify })).value.notify, false);
});

test('parseCreateUpdate keeps only the known photo fields, in order', () => {
  const second = photo({ id: 'fedcba9876543210', pathname: 'progress/ffffffffffffffffffffffff.png', width: 100, height: 100 });
  const parsed = parseCreateUpdate(body({ photos: [photo({ extra: 'x' }), second] }));
  assert.equal(parsed.ok, true);
  assert.deepEqual(Object.keys(parsed.value.photos[0]), ['id', 'pathname', 'width', 'height']);
  assert.deepEqual(parsed.value.photos, [photo(), second]);
});

test('parseCreateUpdate requires at least one photo', () => {
  assert.deepEqual(parseCreateUpdate(body({ photos: [] })), { ok: false, error: '현장 사진을 첨부해주세요.' });
  assert.deepEqual(parseCreateUpdate(body({ photos: undefined })), { ok: false, error: '현장 사진을 첨부해주세요.' });
});

test('parseCreateUpdate requires a work detail', () => {
  assert.deepEqual(parseCreateUpdate(body({ workDetail: '  ' })), { ok: false, error: '상세 작업 내역을 입력해주세요.' });
  assert.deepEqual(parseCreateUpdate(body({ workDetail: undefined })), { ok: false, error: '상세 작업 내역을 입력해주세요.' });
  assert.deepEqual(parseCreateUpdate(body({ workDetail: 42 })), { ok: false, error: '상세 작업 내역을 입력해주세요.' });
});

test('parseCreateUpdate rejects a date that is not a real YYYY-MM-DD day', () => {
  for (const reportDate of ['2026/10/05', '2026-1-5', '20261005', '2026-02-30', '2026-13-01', '', undefined, 20261005]) {
    assert.equal(parseCreateUpdate(body({ reportDate })).ok, false, String(reportDate));
  }
});

const BAD_PATHNAMES = [
  'progress/0123456789abcdef01234567.gif',
  'progress/0123456789ABCDEF01234567.jpg',
  'progress/0123456789abcdef0123456.jpg',
  'progress/0123456789abcdef012345678.jpg',
  'progress/0123456789abcdef01234567.jpg?x=1',
  'progress/0123456789abcdef01234567.jpeg',
  'progress/../0123456789abcdef01234567.jpg',
  'progress/a/0123456789abcdef01234567.jpg',
  '/progress/0123456789abcdef01234567.jpg',
  ' progress/0123456789abcdef01234567.jpg',
  'other/0123456789abcdef01234567.jpg',
  'progress-a1b2c3d4e5f6.jpg',
  'https://abc.private.blob.vercel-storage.com/progress/0123456789abcdef01234567.jpg',
  'https://cdn.sanity.io/images/q2qjj1se/production/abc123-800x600.jpg',
  '',
  undefined,
  42,
];

test('parseCreateUpdate rejects a Sanity-shaped photo', () => {
  const sanity = {
    assetId: 'image-abc123-800x600-jpg',
    url: 'https://cdn.sanity.io/images/q2qjj1se/production/abc123-800x600.jpg',
    width: 800,
    height: 600,
  };
  assert.deepEqual(parseCreateUpdate(body({ photos: [sanity] })), { ok: false, error: '사진 정보가 올바르지 않습니다. 사진을 다시 올려주세요.' });
  assert.equal(parseCreateUpdate(body({ photos: [photo({ pathname: sanity.url })] })).ok, false);
});

test('parseCreateUpdate accepts only a progress/<24 hex>.<jpg|png|webp> pathname', () => {
  for (const pathname of BAD_PATHNAMES) assert.equal(parseCreateUpdate(body({ photos: [photo({ pathname })] })).ok, false, String(pathname));
  for (const pathname of ['progress/0123456789abcdef01234567.png', 'progress/ffffffffffffffffffffffff.webp']) {
    assert.equal(parseCreateUpdate(body({ photos: [photo({ pathname })] })).ok, true, pathname);
  }
  // One bad photo among good ones still fails the whole request.
  assert.equal(parseCreateUpdate(body({ photos: [photo(), photo({ pathname: 'other/x.jpg' })] })).ok, false);
});

test('parseCreateUpdate rejects a photo that carries a url, since a stored record never holds one', () => {
  for (const url of ['https://abc.private.blob.vercel-storage.com/progress/0123456789abcdef01234567.jpg?vercel-blob-signature=x', '', null]) {
    assert.equal(parseCreateUpdate(body({ photos: [photo({ url })] })).ok, false, String(url));
  }
});

test('parseCreateUpdate needs whole-pixel sizes from 1 to 20000', () => {
  for (const width of [0, -5, 1.5, 20001, NaN, Infinity, '800', undefined, null]) {
    assert.equal(parseCreateUpdate(body({ photos: [photo({ width })] })).ok, false, String(width));
  }
  for (const height of [0, -5, 0.5, 20001, NaN, '600', undefined]) {
    assert.equal(parseCreateUpdate(body({ photos: [photo({ height })] })).ok, false, String(height));
  }
  assert.equal(parseCreateUpdate(body({ photos: [photo({ width: 1, height: 20000 })] })).ok, true);
});

test('parseCreateUpdate needs the photo id the upload gave', () => {
  for (const id of ['', undefined, 42, '0123456789ABCDEF', '0123456789abcde', '0123456789abcdef0', 'progress/0123456789abcdef01234567.jpg']) {
    assert.equal(parseCreateUpdate(body({ photos: [photo({ id })] })).ok, false, String(id));
  }
  assert.equal(parseCreateUpdate(body({ photos: ['progress/0123456789abcdef01234567.jpg'] })).ok, false);
  assert.equal(parseCreateUpdate(body({ photos: [null] })).ok, false);
});

test('parseCreateUpdate needs a site and rejects non-object bodies', () => {
  assert.equal(parseCreateUpdate(body({ siteId: '  ' })).ok, false);
  assert.equal(parseCreateUpdate(body({ siteId: undefined })).ok, false);
  for (const value of [null, undefined, 'text', 12, [], true]) assert.equal(parseCreateUpdate(value).ok, false, String(value));
});

test('parseCreateUpdate allows a missing designer but caps the text sizes', () => {
  const parsed = parseCreateUpdate(body({ designer: undefined }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.designer, '');
  assert.equal(parseCreateUpdate(body({ designer: 'a'.repeat(101) })).ok, false);
  assert.equal(parseCreateUpdate(body({ workDetail: 'a'.repeat(5001) })).ok, false);
  assert.equal(parseCreateUpdate(body({ workDetail: 'a'.repeat(5000) })).ok, true);
  assert.equal(parseCreateUpdate(body({ photos: Array.from({ length: 41 }, () => photo()) })).ok, false);
  assert.equal(parseCreateUpdate(body({ photos: Array.from({ length: 40 }, () => photo()) })).ok, true);
});

test('checkPhotoUpload accepts jpeg, png and webp within the size limit', () => {
  assert.equal(MAX_PHOTO_BYTES, 4_000_000);
  assert.deepEqual(checkPhotoUpload('image/jpeg', 500_000), { ok: true });
  assert.deepEqual(checkPhotoUpload('image/png', 500_000), { ok: true });
  assert.deepEqual(checkPhotoUpload('image/webp', 500_000), { ok: true });
  assert.deepEqual(checkPhotoUpload('image/jpeg', 4_000_000), { ok: true });
});

test('checkPhotoUpload rejects other types with 400 and oversize files with 413', () => {
  for (const type of ['image/heic', 'image/gif', 'application/pdf', 'text/html', '']) {
    const result = checkPhotoUpload(type, 500_000);
    assert.equal(result.ok, false, type);
    assert.equal(result.status, 400, type);
    assert.ok(result.error, type);
  }
  const tooBig = checkPhotoUpload('image/jpeg', 4_000_001);
  assert.equal(tooBig.ok, false);
  assert.equal(tooBig.status, 413);
  assert.ok(tooBig.error);
  // The type is judged first, so an oversize HEIC is a 400 (wrong kind of file), not a 413.
  assert.equal(checkPhotoUpload('image/heic', 9_000_000).status, 400);
});

test('checkPhotoUpload rejects an empty file', () => {
  const result = checkPhotoUpload('image/jpeg', 0);
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test('a photo is stored as progress/<24 random hex>.<ext>, the extension taken from its type, never its own file name', () => {
  assert.equal(progressPhotoPathname('image/jpeg', '0123456789abcdef01234567'), 'progress/0123456789abcdef01234567.jpg');
  assert.equal(progressPhotoPathname('image/png', '000000000000000000000000'), 'progress/000000000000000000000000.png');
  assert.equal(progressPhotoPathname('image/webp', 'ffffffffffffffffffffffff'), 'progress/ffffffffffffffffffffffff.webp');
  assert.throws(() => progressPhotoPathname('image/gif', '0123456789abcdef01234567'));
  for (const random of ['', 'a1b2c3d4e5f6', '0123456789ABCDEF01234567', '0123456789abcdef0123456', '0123456789abcdef012345678', '홍길동_거실.jpg', '0123456789abcdef01234567/x']) {
    assert.throws(() => progressPhotoPathname('image/jpeg', random), random);
  }
});

test('isProgressPhotoPathname accepts exactly the shape progressPhotoPathname makes', () => {
  assert.equal(isProgressPhotoPathname(progressPhotoPathname('image/jpeg', '0123456789abcdef01234567')), true);
  assert.equal(isProgressPhotoPathname('progress/ffffffffffffffffffffffff.webp'), true);
  for (const pathname of BAD_PATHNAMES) assert.equal(isProgressPhotoPathname(pathname), false, String(pathname));
});

test('parsePhotoSize reads the width and height form fields as whole pixels from 1 to 20000', () => {
  assert.deepEqual(parsePhotoSize('1600', '1200'), { width: 1600, height: 1200 });
  assert.deepEqual(parsePhotoSize('1', '20000'), { width: 1, height: 20000 });
  for (const value of ['0', '20001', '1.5', '-1', '1e3', '0x10', ' 1600', '1600 ', '01600', '', null, undefined, 1600]) {
    assert.equal(parsePhotoSize(value, '1200'), null, `width ${String(value)}`);
    assert.equal(parsePhotoSize('1600', value), null, `height ${String(value)}`);
  }
});

test('a stored photo is read back as id, pathname, width and height only, never with a url', () => {
  const stored = { id: '0123456789abcdef', pathname: 'progress/0123456789abcdef01234567.jpg', width: 1600, height: 1200 };
  assert.deepEqual(readStoredPhoto(stored), stored);
  assert.deepEqual(readStoredPhoto({ ...stored, url: 'https://abc.private.blob.vercel-storage.com/x', extra: 1 }), stored);
  assert.deepEqual(readStoredPhoto({ ...stored, width: 'x', height: undefined }), { ...stored, width: 0, height: 0 });
});

test('an old Sanity-shaped stored photo, or anything without a photo pathname, is dropped', () => {
  assert.equal(readStoredPhoto({ assetId: 'image-abc-800x600-jpg', url: 'https://cdn.sanity.io/images/p/d/abc-800x600.jpg', width: 800, height: 600 }), null);
  for (const value of [null, undefined, 'progress/0123456789abcdef01234567.jpg', [], { id: 'a', pathname: 'other/x.jpg', width: 1, height: 1 }]) {
    assert.equal(readStoredPhoto(value), null, JSON.stringify(value));
  }
});
