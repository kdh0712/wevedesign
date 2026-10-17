import test from 'node:test';
import assert from 'node:assert/strict';
import { fitWithin, jpegFileName } from '../app/lib/resize-image.ts';

test('fitWithin shrinks the long edge to the limit and keeps the aspect ratio', () => {
  assert.deepEqual(fitWithin(4032, 3024, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(3024, 4032, 1600), { width: 1200, height: 1600 });
  assert.deepEqual(fitWithin(5000, 5000, 1600), { width: 1600, height: 1600 });
  assert.deepEqual(fitWithin(4000, 1001, 1600), { width: 1600, height: 400 });
});

test('fitWithin never enlarges a small photo', () => {
  assert.deepEqual(fitWithin(1600, 900, 1600), { width: 1600, height: 900 });
  assert.deepEqual(fitWithin(640, 480, 1600), { width: 640, height: 480 });
});

test('fitWithin keeps at least one pixel on a very thin photo', () => {
  assert.deepEqual(fitWithin(16000, 2, 1600), { width: 1600, height: 1 });
});

test('fitWithin refuses a size it cannot use', () => {
  for (const [width, height] of [
    [0, 100],
    [100, 0],
    [Number.NaN, 100],
    [100, -1],
  ]) {
    assert.throws(() => fitWithin(width, height, 1600), undefined, `${width}x${height}`);
  }
});

test('jpegFileName swaps the extension for .jpg', () => {
  assert.equal(jpegFileName('IMG_0001.HEIC'), 'IMG_0001.jpg');
  assert.equal(jpegFileName('거실 타일.png'), '거실 타일.jpg');
  assert.equal(jpegFileName('photo.2026.10.17.webp'), 'photo.2026.10.17.jpg');
  assert.equal(jpegFileName('noextension'), 'noextension.jpg');
  assert.equal(jpegFileName('.png'), 'photo.jpg');
  assert.equal(jpegFileName(''), 'photo.jpg');
});
