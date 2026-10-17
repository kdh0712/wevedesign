import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANONYMOUS_ASSET_QUERY,
  SANITY_PRIVACY_TIMEOUT_MS,
  SANITY_PRIVACY_UNKNOWN_MESSAGE,
  SANITY_PRIVATE_CACHE_MS,
  SANITY_PUBLIC_DATASET_MESSAGE,
  anonymousAssetQueryUrl,
  classifySanityPrivacy,
  createSanityPrivacyCheck,
  photoStoreRefusal,
} from '../app/api/manager/_sanity-privacy.ts';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fakeFetch(answers) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next(url, init) : next;
  };
  return { fetch, calls };
}

test('the anonymous query asks the live API host for at most one image asset, never the CDN', () => {
  assert.equal(ANONYMOUS_ASSET_QUERY, 'count(*[_type == "sanity.imageAsset"][0...1])');
  const url = new URL(anonymousAssetQueryUrl('q2qjj1se', 'production'));
  assert.equal(url.origin, 'https://q2qjj1se.api.sanity.io');
  assert.equal(url.pathname, '/v2021-10-21/data/query/production');
  assert.equal(url.searchParams.get('query'), ANONYMOUS_ASSET_QUERY);
  assert.equal(url.hostname.includes('apicdn'), false);
});

test('an answer with an image asset means public; none, 401 or 403 mean private; anything else is unknown', () => {
  assert.equal(classifySanityPrivacy(200, { result: 1 }), 'public');
  assert.equal(classifySanityPrivacy(200, { result: 3 }), 'public');
  assert.equal(classifySanityPrivacy(200, { result: 0 }), 'private');
  assert.equal(classifySanityPrivacy(401, null), 'private');
  assert.equal(classifySanityPrivacy(403, { error: 'forbidden' }), 'private');

  for (const [status, body] of [
    [200, null],
    [200, {}],
    [200, { result: '1' }],
    [200, { result: null }],
    [200, { result: Number.NaN }],
    [200, []],
    [404, { result: 0 }],
    [429, null],
    [500, { result: 0 }],
    [503, null],
  ]) {
    assert.equal(classifySanityPrivacy(status, body), 'unknown', `${status} ${JSON.stringify(body)}`);
  }
});

test('the check is anonymous and uncached, with a timeout', async () => {
  const { fetch, calls } = fakeFetch([json({ result: 0 })]);
  const check = createSanityPrivacyCheck({ projectId: 'q2qjj1se', dataset: 'production', fetch, now: () => 0 });
  assert.equal(await check(), 'private');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, anonymousAssetQueryUrl('q2qjj1se', 'production'));
  assert.equal(calls[0].init.cache, 'no-store');
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.equal(new Headers(calls[0].init.headers).has('authorization'), false, 'no token is sent');
  assert.equal(SANITY_PRIVACY_TIMEOUT_MS, 5000);
});

test('private is remembered for 10 minutes; public and unknown are asked again every time', async () => {
  assert.equal(SANITY_PRIVATE_CACHE_MS, 600000);
  let clock = 1_000_000;
  const { fetch, calls } = fakeFetch([json({ result: 1 }), json({}, 500), json({ result: 0 }), json({ result: 1 })]);
  const check = createSanityPrivacyCheck({ projectId: 'q2qjj1se', dataset: 'production', fetch, now: () => clock });

  assert.equal(await check(), 'public');
  assert.equal(await check(), 'unknown');
  assert.equal(await check(), 'private');
  assert.equal(calls.length, 3);

  clock += SANITY_PRIVATE_CACHE_MS - 1;
  assert.equal(await check(), 'private', 'still remembered');
  assert.equal(calls.length, 3);

  clock += 1;
  assert.equal(await check(), 'public', 'asked again after 10 minutes');
  assert.equal(calls.length, 4);
});

test('a network error or a timeout is unknown', async () => {
  const { fetch } = fakeFetch([new TypeError('fetch failed'), new DOMException('The operation timed out.', 'TimeoutError')]);
  const check = createSanityPrivacyCheck({ projectId: 'q2qjj1se', dataset: 'production', fetch, now: () => 0 });
  assert.equal(await check(), 'unknown');
  assert.equal(await check(), 'unknown');

  // A server that never answers is cut off by the timeout.
  const hanging = (url, init) =>
    new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
  const slow = createSanityPrivacyCheck({ projectId: 'q2qjj1se', dataset: 'production', fetch: hanging, now: () => 0, timeoutMs: 20 });
  assert.equal(await slow(), 'unknown');

  // A body that is not JSON.
  const garbled = createSanityPrivacyCheck({ projectId: 'q2qjj1se', dataset: 'production', fetch: async () => new Response('<html>', { status: 200 }), now: () => 0 });
  assert.equal(await garbled(), 'unknown');
});

test('without a usable project id or dataset nothing is asked and the answer is unknown', async () => {
  for (const config of [{}, { projectId: 'q2qjj1se' }, { dataset: 'production' }, { projectId: 'evil.example/x', dataset: 'production' }, { projectId: 'q2qjj1se', dataset: '../x' }]) {
    const { fetch, calls } = fakeFetch([json({ result: 0 })]);
    const check = createSanityPrivacyCheck({ ...config, fetch, now: () => 0 });
    assert.equal(await check(), 'unknown', JSON.stringify(config));
    assert.equal(calls.length, 0);
  }
});

test('uploads are refused unless the dataset is known to be private', () => {
  assert.equal(photoStoreRefusal('private'), null);
  assert.equal(photoStoreRefusal('public'), SANITY_PUBLIC_DATASET_MESSAGE);
  assert.equal(photoStoreRefusal('unknown'), SANITY_PRIVACY_UNKNOWN_MESSAGE);
  assert.equal(SANITY_PUBLIC_DATASET_MESSAGE, '사진 저장소(Sanity)가 공개 상태라 고객 사진을 올릴 수 없습니다. 관리자에게 비공개 전환을 요청해 주세요.');
  assert.equal(SANITY_PRIVACY_UNKNOWN_MESSAGE, '사진 저장소 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
});
