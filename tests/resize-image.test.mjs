import test from 'node:test';
import assert from 'node:assert/strict';
import { fitWithin, jpegFileName, resizeImageFile } from '../app/lib/resize-image.ts';

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

// The browser pieces resizeImageFile uses, faked so the canvas can be inspected after the call.
function fakeBrowser(blob) {
  const saved = { Image: globalThis.Image, document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  const canvases = [];
  globalThis.Image = class {
    naturalWidth = 4032;
    naturalHeight = 3024;
    src = '';
    async decode() {}
  };
  globalThis.document = {
    createElement: () => {
      const canvas = {
        width: 300,
        height: 150,
        encodedAt: null,
        getContext: () => ({ fillRect() {}, drawImage() {}, fillStyle: '', imageSmoothingQuality: '' }),
        toBlob(callback) {
          canvas.encodedAt = [canvas.width, canvas.height];
          callback(blob);
        },
      };
      canvases.push(canvas);
      return canvas;
    },
  };
  URL.createObjectURL = () => 'blob:photo';
  URL.revokeObjectURL = () => {};
  return {
    canvases,
    restore() {
      globalThis.Image = saved.Image;
      if (saved.document === undefined) delete globalThis.document;
      else globalThis.document = saved.document;
      URL.createObjectURL = saved.create;
      URL.revokeObjectURL = saved.revoke;
    },
  };
}

test('resizeImageFile releases the canvas once the JPEG is made, which frees memory on iPhones', async () => {
  const blob = new Blob(['jpeg'], { type: 'image/jpeg' });
  const browser = fakeBrowser(blob);
  try {
    const result = await resizeImageFile(new File(['x'], 'IMG_0001.HEIC'), 1600);
    assert.deepEqual(result, { blob, width: 1600, height: 1200 });
    const [canvas] = browser.canvases;
    assert.deepEqual(canvas.encodedAt, [1600, 1200], 'encoded at full size');
    assert.equal(canvas.width, 0);
    assert.equal(canvas.height, 0);
  } finally {
    browser.restore();
  }
});

test('resizeImageFile releases the canvas when encoding fails too', async () => {
  const browser = fakeBrowser(null);
  try {
    await assert.rejects(resizeImageFile(new File(['x'], 'big.png'), 1600), { message: '사진을 줄이지 못했습니다: big.png' });
    assert.equal(browser.canvases[0].width, 0);
    assert.equal(browser.canvases[0].height, 0);
  } finally {
    browser.restore();
  }
});
