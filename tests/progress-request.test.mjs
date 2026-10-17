import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PHOTO_BYTES, checkPhotoUpload, parseCreateUpdate, progressPhotoFileName } from '../app/api/manager/_progress-request.ts';

const photo = (overrides = {}) => ({
  assetId: 'image-abc123-800x600-jpg',
  url: 'https://cdn.sanity.io/images/q2qjj1se/production/abc123-800x600.jpg',
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
  const parsed = parseCreateUpdate(body({ photos: [photo({ extra: 'x' }), photo({ assetId: 'image-def456-100x100-png', url: 'https://cdn.sanity.io/images/q2qjj1se/production/def456-100x100.png', width: 100, height: 100 })] }));
  assert.equal(parsed.ok, true);
  assert.deepEqual(Object.keys(parsed.value.photos[0]), ['assetId', 'url', 'width', 'height']);
  assert.deepEqual(parsed.value.photos.map((item) => item.assetId), ['image-abc123-800x600-jpg', 'image-def456-100x100-png']);
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

test('parseCreateUpdate rejects photos that are not Sanity CDN images', () => {
  for (const url of [
    'http://cdn.sanity.io/images/q2qjj1se/production/a.jpg',
    'https://cdn.sanity.io.evil.example/images/a.jpg',
    'https://example.com/a.jpg',
    'javascript:alert(1)',
    '',
    undefined,
  ]) {
    assert.equal(parseCreateUpdate(body({ photos: [photo({ url })] })).ok, false, String(url));
  }
  // One bad photo among good ones still fails the whole request.
  assert.equal(parseCreateUpdate(body({ photos: [photo(), photo({ url: 'https://example.com/a.jpg' })] })).ok, false);
});

test('parseCreateUpdate rejects photos without an asset id or a usable size', () => {
  assert.equal(parseCreateUpdate(body({ photos: [photo({ assetId: '' })] })).ok, false);
  assert.equal(parseCreateUpdate(body({ photos: [photo({ assetId: undefined })] })).ok, false);
  for (const width of [0, -5, NaN, Infinity, '800', undefined]) assert.equal(parseCreateUpdate(body({ photos: [photo({ width })] })).ok, false, String(width));
  for (const height of [0, -5, NaN, undefined]) assert.equal(parseCreateUpdate(body({ photos: [photo({ height })] })).ok, false, String(height));
  assert.equal(parseCreateUpdate(body({ photos: ['https://cdn.sanity.io/images/q2qjj1se/production/a.jpg'] })).ok, false);
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

test('a photo is uploaded under a neutral name taken from its type, never its own file name', () => {
  assert.equal(progressPhotoFileName('image/jpeg', 'a1b2c3d4e5f6'), 'progress-a1b2c3d4e5f6.jpg');
  assert.equal(progressPhotoFileName('image/png', '000000000000'), 'progress-000000000000.png');
  assert.equal(progressPhotoFileName('image/webp', 'ffffffffffff'), 'progress-ffffffffffff.webp');
  assert.throws(() => progressPhotoFileName('image/gif', 'a1b2c3d4e5f6'));
  for (const random of ['', 'a1b2c3', 'A1B2C3D4E5F6', '홍길동_거실.jpg', 'a1b2c3d4e5f6/x']) {
    assert.throws(() => progressPhotoFileName('image/jpeg', random), random);
  }
});
