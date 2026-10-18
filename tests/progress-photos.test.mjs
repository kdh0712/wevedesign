import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { Storage } from '@google-cloud/storage';
import {
  PHOTO_CACHE_CONTROL,
  PHOTO_STORE_MISSING_MESSAGE,
  PHOTO_STORE_PERMISSION_MESSAGE,
  createProgressPhotoStore,
  isStoragePermissionError,
  photoUrlWindow,
  progressPhotoStorageConfig,
  storageErrorSummary,
} from '../app/api/manager/_progress-photos.ts';

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
// 2026-10-18 05:00:00 UTC, on the hour.
const ON_THE_HOUR = Date.UTC(2026, 9, 18, 5, 0, 0);

const stored = (n, overrides = {}) => ({
  id: `${n}`.padStart(16, '0'),
  pathname: `progress/${`${n}`.padStart(24, 'a')}.jpg`,
  width: 1600,
  height: 1200,
  ...overrides,
});

const account = { client_email: 'server@weve-7420b.iam.gserviceaccount.com', private_key: 'test-private-key', project_id: 'weve-7420b' };

// A fake bucket in the shape of @google-cloud/storage's Bucket.file(): records every call, never touches the network.
function fakeBucket({ signFails = false, deleteFails = [] } = {}) {
  const calls = { file: [], save: [], sign: [], delete: [] };
  const bucket = {
    file(pathname) {
      calls.file.push(pathname);
      return {
        save: async (data, options) => {
          calls.save.push({ pathname, data, options });
        },
        getSignedUrl: async (config) => {
          calls.sign.push({ pathname, config });
          if (signFails) throw new Error('fake signing failure');
          return [`https://storage.googleapis.com/bucket/${pathname}?from=${config.accessibleAt}&until=${config.expires}`];
        },
        delete: async (options) => {
          calls.delete.push({ pathname, options });
          if (deleteFails.includes(pathname)) throw Object.assign(new Error('fake delete failure'), { code: 503 });
          return [{}];
        },
      };
    },
  };
  return { bucket, calls };
}

function storeWith(fake, clock = { now: ON_THE_HOUR + 10 * MINUTE }) {
  const logged = [];
  const store = createProgressPhotoStore({ bucket: () => fake.bucket, now: () => clock.now, log: (message, error) => logged.push({ message, error }) });
  return { store, logged, clock };
}

test('storage is configured with the Firebase service account and a bucket name', () => {
  assert.equal(progressPhotoStorageConfig({ account: null, projectId: 'weve-7420b', env: {} }), null, 'no service account');
  assert.deepEqual(progressPhotoStorageConfig({ account, projectId: 'weve-7420b', env: {} }), {
    bucketName: 'weve-7420b.firebasestorage.app',
    projectId: 'weve-7420b',
    credentials: { client_email: account.client_email, private_key: account.private_key },
  });
  assert.equal(progressPhotoStorageConfig({ account, projectId: '', env: {} }), null, 'no bucket name can be made');
});

test('FIREBASE_STORAGE_BUCKET names the bucket when it is set', () => {
  assert.equal(progressPhotoStorageConfig({ account, projectId: 'weve-7420b', env: { FIREBASE_STORAGE_BUCKET: 'other-bucket' } }).bucketName, 'other-bucket');
  assert.equal(progressPhotoStorageConfig({ account, projectId: '', env: { FIREBASE_STORAGE_BUCKET: ' gs://other-bucket/ ' } }).bucketName, 'other-bucket');
  assert.equal(progressPhotoStorageConfig({ account, projectId: 'weve-7420b', env: { FIREBASE_STORAGE_BUCKET: '  ' } }).bucketName, 'weve-7420b.firebasestorage.app');
});

test('the upload refusals name the photo store', () => {
  assert.equal(PHOTO_STORE_MISSING_MESSAGE, '사진 저장소(Firebase Storage)가 설정되지 않았습니다. 관리자에게 문의해 주세요.');
  assert.equal(PHOTO_STORE_PERMISSION_MESSAGE, '사진 저장소 권한이 없습니다. 관리자에게 문의해 주세요.');
});

test('a 403 from Storage is told apart from other upload failures', () => {
  assert.equal(isStoragePermissionError(Object.assign(new Error('forbidden'), { code: 403 })), true);
  assert.equal(isStoragePermissionError({ status: 403 }), true);
  assert.equal(isStoragePermissionError({ response: { status: 403 } }), true);
  for (const error of [Object.assign(new Error('missing'), { code: 404 }), { code: 412 }, new Error('network'), null, undefined, 'x']) {
    assert.equal(isStoragePermissionError(error), false, String(error?.code ?? error));
  }
});

test('a Storage error is logged as its kind, status and message, never with its request details', () => {
  const error = Object.assign(new Error('server@x.iam.gserviceaccount.com does not have storage.objects.create access'), {
    name: 'ApiError',
    code: 403,
    config: { headers: { Authorization: 'Bearer secret-access-token' } },
    response: { request: { headers: { authorization: 'Bearer secret-access-token' } } },
  });
  assert.equal(storageErrorSummary(error), 'ApiError 403: server@x.iam.gserviceaccount.com does not have storage.objects.create access');
  assert.ok(!storageErrorSummary(error).includes('secret-access-token'));
  assert.equal(storageErrorSummary(new TypeError('fetch failed')), 'TypeError: fetch failed');
  assert.equal(storageErrorSummary('plain'), 'plain');
  assert.equal(storageErrorSummary({ token: 'secret-access-token' }), 'unknown error');
});

test('a photo URL expires at the end of the next full hour, so it stays the same within an hour', () => {
  const window = { accessibleAt: ON_THE_HOUR, expires: ON_THE_HOUR + 2 * HOUR };
  for (const now of [ON_THE_HOUR + 1, ON_THE_HOUR + 10 * MINUTE, ON_THE_HOUR + HOUR - 1, ON_THE_HOUR + HOUR]) {
    assert.deepEqual(photoUrlWindow(now), window, new Date(now).toISOString());
  }
  assert.deepEqual(photoUrlWindow(ON_THE_HOUR + HOUR + 1), { accessibleAt: ON_THE_HOUR + HOUR, expires: ON_THE_HOUR + 3 * HOUR });
  assert.deepEqual(photoUrlWindow(ON_THE_HOUR), { accessibleAt: ON_THE_HOUR - HOUR, expires: ON_THE_HOUR + HOUR });
  // Always usable now, for at least one more hour and at most two.
  for (let now = ON_THE_HOUR; now < ON_THE_HOUR + 2 * HOUR; now += 7 * MINUTE + 13) {
    const { accessibleAt, expires } = photoUrlWindow(now);
    assert.ok(accessibleAt <= now, 'already usable');
    assert.ok(expires - now >= HOUR && expires - now <= 2 * HOUR, `${expires - now} ms left`);
    assert.equal(expires - accessibleAt, 2 * HOUR);
  }
});

test('uploadProgressPhoto stores the bytes under a new progress/<24 hex>.<ext> pathname and never overwrites', async () => {
  const fake = fakeBucket();
  const { store } = storeWith(fake);
  const bytes = Buffer.from('jpeg bytes');
  const first = await store.upload(bytes, 'image/jpeg');
  const second = await store.upload(bytes, 'image/png');

  assert.match(first.pathname, /^progress\/[0-9a-f]{24}\.jpg$/);
  assert.match(second.pathname, /^progress\/[0-9a-f]{24}\.png$/);
  assert.notEqual(first.pathname, second.pathname);
  assert.match(first.id, /^[0-9a-f]{16}$/);
  assert.notEqual(first.id, second.id);
  assert.ok(!first.pathname.includes(first.id), 'the id is not taken from the pathname');
  assert.deepEqual(Object.keys(first), ['id', 'pathname']);

  assert.equal(fake.calls.save.length, 2);
  assert.equal(fake.calls.save[0].pathname, first.pathname);
  assert.equal(fake.calls.save[0].data, bytes);
  assert.deepEqual(fake.calls.save[0].options, {
    contentType: 'image/jpeg',
    metadata: { cacheControl: 'private, max-age=3600' },
    resumable: false,
    preconditionOpts: { ifGenerationMatch: 0 },
  });
  assert.equal(PHOTO_CACHE_CONTROL, 'private, max-age=3600');
});

test('uploadProgressPhoto refuses a type it has no extension for before anything is sent', async () => {
  const fake = fakeBucket();
  const { store } = storeWith(fake);
  await assert.rejects(store.upload(Buffer.from('x'), 'image/gif'));
  assert.equal(fake.calls.save.length, 0);
});

test('signProgressPhotoUrls signs a V4 read URL per photo for the current hour window and maps id, width and height through', async () => {
  const fake = fakeBucket();
  const { store } = storeWith(fake);
  const photos = [stored(1), stored(2, { width: 900, height: 1600 })];
  const views = await store.sign(photos);

  const { accessibleAt, expires } = photoUrlWindow(ON_THE_HOUR + 10 * MINUTE);
  assert.deepEqual(fake.calls.sign, photos.map((photo) => ({ pathname: photo.pathname, config: { version: 'v4', action: 'read', accessibleAt, expires } })));
  assert.deepEqual(views, [
    { id: photos[0].id, url: `https://storage.googleapis.com/bucket/${photos[0].pathname}?from=${accessibleAt}&until=${expires}`, width: 1600, height: 1200 },
    { id: photos[1].id, url: `https://storage.googleapis.com/bucket/${photos[1].pathname}?from=${accessibleAt}&until=${expires}`, width: 900, height: 1600 },
  ]);
});

test('signProgressPhotoUrls gives the same URL all hour and a new one the next hour', async () => {
  const fake = fakeBucket();
  const { store, clock } = storeWith(fake);
  const [first] = await store.sign([stored(1)]);
  clock.now += 45 * MINUTE;
  const [later] = await store.sign([stored(1)]);
  clock.now += 10 * MINUTE;
  const [nextHour] = await store.sign([stored(1)]);
  assert.equal(later.url, first.url);
  assert.notEqual(nextHour.url, first.url);
});

test('signProgressPhotoUrls never puts the pathname on a view photo', async () => {
  const fake = fakeBucket();
  const { store } = storeWith(fake);
  const views = await store.sign([stored(1), stored(2)]);
  for (const view of views) assert.deepEqual(Object.keys(view), ['id', 'url', 'width', 'height']);
});

test('signProgressPhotoUrls asks for nothing when there are no photos', async () => {
  const fake = fakeBucket();
  const { store } = storeWith(fake);
  assert.deepEqual(await store.sign([]), []);
  assert.equal(fake.calls.file.length, 0);
});

test('a signing failure rejects, so the caller can catch it', async () => {
  const fake = fakeBucket({ signFails: true });
  const { store } = storeWith(fake);
  await assert.rejects(store.sign([stored(1)]), /fake signing failure/);
  const unconfigured = createProgressPhotoStore({
    bucket: () => {
      throw new Error('Firebase Storage is not configured.');
    },
  });
  await assert.rejects(unconfigured.sign([stored(1)]), /not configured/);
});

test('signUpdates signs every record in one go and keeps each photo in its place', async () => {
  const fake = fakeBucket();
  const { store } = storeWith(fake);
  const updates = [
    { _id: 'u1', siteId: 's', reportDate: '2026-10-18', designer: 'd', workDetail: 'w', photos: [stored(1), stored(2)], createdAt: 'c', notifyLog: [] },
    { _id: 'u2', siteId: 's', reportDate: '2026-10-17', designer: 'd', workDetail: 'w', photos: [], createdAt: 'c' },
    { _id: 'u3', siteId: 's', reportDate: '2026-10-16', designer: 'd', workDetail: 'w', photos: [stored(3)], createdAt: 'c' },
  ];
  const result = await store.signUpdates(updates);
  assert.equal(result.photosUnavailable, false);
  assert.deepEqual(result.updates.map((update) => update.photos.map((photo) => photo.id)), [[stored(1).id, stored(2).id], [], [stored(3).id]]);
  assert.ok(result.updates[0].photos[1].url.includes(stored(2).pathname));
  assert.deepEqual({ ...result.updates[0], photos: [] }, { ...updates[0], photos: [] });
  assert.ok(!JSON.stringify(result).includes('"pathname"'));
});

test('signUpdates logs a signing failure and answers every photo with an empty url and photosUnavailable', async () => {
  const fake = fakeBucket({ signFails: true });
  const { store, logged } = storeWith(fake);
  const updates = [{ _id: 'u1', siteId: 's', reportDate: '2026-10-18', designer: 'd', workDetail: 'w', photos: [stored(1)], createdAt: 'c' }];
  const result = await store.signUpdates(updates);
  assert.equal(result.photosUnavailable, true);
  assert.deepEqual(result.updates[0].photos, [{ id: stored(1).id, url: '', width: 1600, height: 1200 }]);
  assert.equal(logged.length, 1);
  assert.match(logged[0].message, /not signed/);
});

test('deleteProgressPhotos deletes each photo pathname once, ignoring one that is already gone, and skips anything else', async () => {
  const fake = fakeBucket();
  const { store } = storeWith(fake);
  await store.remove([stored(1).pathname, stored(2).pathname, stored(1).pathname, 'https://cdn.sanity.io/images/p/d/a.jpg', '']);
  assert.deepEqual(fake.calls.delete, [
    { pathname: stored(1).pathname, options: { ignoreNotFound: true } },
    { pathname: stored(2).pathname, options: { ignoreNotFound: true } },
  ]);
  await store.remove([]);
  assert.equal(fake.calls.delete.length, 2, 'nothing to delete, no call');
});

test('deleteProgressPhotos logs a failed delete, still deletes the rest and never throws', async () => {
  const fake = fakeBucket({ deleteFails: [stored(1).pathname] });
  const { store, logged } = storeWith(fake);
  assert.equal(await store.remove([stored(1).pathname, stored(2).pathname]), undefined);
  assert.equal(fake.calls.delete.length, 2);
  assert.equal(logged.length, 1);
  assert.match(logged[0].message, /not deleted \(1 of 2\)/);
  assert.match(String(logged[0].error), /fake delete failure/);

  const unconfigured = createProgressPhotoStore({
    bucket: () => {
      throw new Error('Firebase Storage is not configured.');
    },
    log: (message, error) => logged.push({ message, error }),
  });
  assert.equal(await unconfigured.remove([stored(1).pathname]), undefined);
  assert.equal(logged.length, 2);
});

// The real library, with every network call blocked: V4 signing must be local work with the service-account key, and
// with the window's accessibleAt the URL is the same string for the whole hour.
test('@google-cloud/storage signs the V4 read URL locally and gives the same URL within the hour', async () => {
  const blocked = [];
  const saved = { fetch: globalThis.fetch, httpRequest: http.request, httpsRequest: https.request, httpGet: http.get, httpsGet: https.get };
  // An emulator host in the environment would move the signed URL to the emulator; this test is about the real endpoint.
  const savedEmulatorHost = process.env.STORAGE_EMULATOR_HOST;
  delete process.env.STORAGE_EMULATOR_HOST;
  const block = (name) => () => {
    blocked.push(name);
    throw new Error(`network blocked in tests: ${name}`);
  };
  globalThis.fetch = block('fetch');
  http.request = block('http.request');
  https.request = block('https.request');
  http.get = block('http.get');
  https.get = block('https.get');
  try {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const storage = new Storage({ projectId: 'test-project', credentials: { client_email: 'test@test-project.iam.gserviceaccount.com', private_key: privateKey } });
    const clock = { now: Date.now() };
    const store = createProgressPhotoStore({ bucket: () => storage.bucket('test-project.firebasestorage.app'), now: () => clock.now });
    const photo = stored(1, { pathname: 'progress/0123456789abcdef01234567.jpg' });

    const [first] = await store.sign([photo]);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const [again] = await store.sign([photo]);
    assert.equal(again.url, first.url, 'the same URL a second later');

    const url = new URL(first.url);
    const { accessibleAt } = photoUrlWindow(clock.now);
    assert.equal(url.origin + url.pathname, 'https://storage.googleapis.com/test-project.firebasestorage.app/progress/0123456789abcdef01234567.jpg');
    assert.equal(url.searchParams.get('X-Goog-Algorithm'), 'GOOG4-RSA-SHA256');
    assert.equal(url.searchParams.get('X-Goog-Date'), new Date(accessibleAt).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''));
    assert.equal(url.searchParams.get('X-Goog-Expires'), '7200');
    assert.ok(url.searchParams.get('X-Goog-Signature'));
    assert.ok(!first.url.includes('PRIVATE KEY'));
    assert.deepEqual(blocked, [], 'no network call');
  } finally {
    globalThis.fetch = saved.fetch;
    http.request = saved.httpRequest;
    https.request = saved.httpsRequest;
    http.get = saved.httpGet;
    https.get = saved.httpsGet;
    if (savedEmulatorHost === undefined) delete process.env.STORAGE_EMULATOR_HOST;
    else process.env.STORAGE_EMULATOR_HOST = savedEmulatorHost;
  }
});
