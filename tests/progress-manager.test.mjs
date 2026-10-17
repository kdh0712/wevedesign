import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProgressApi,
  defaultPostToCustomer,
  formatReportDay,
  formatSeoulDateTime,
  memoPreview,
  notifyBlockedReason,
  notifyHistory,
  notifyStatus,
  photoFailureMessages,
  photoProgressLabel,
  postResultMessages,
  predictLinkOnUpload,
  shrinkAndUploadPhotos,
  uploadLinkMessages,
} from '../app/manager-weve-7519/progress-manager.ts';

const link = (enabled, code = 'abc') => ({ enabled, code, url: code ? `https://www.wevedesign.co.kr/progress/${code}` : '', createdAt: '' });
const photo = (n) => ({ assetId: `image-${n}-1600x1200-jpg`, url: `https://cdn.sanity.io/images/p/d/${n}.jpg`, width: 1600, height: 1200 });

test('the upload box starts checked unless the link was switched off', () => {
  assert.equal(defaultPostToCustomer(link(true)), true);
  assert.equal(defaultPostToCustomer(link(false, '')), true, 'no link yet: the first upload creates it');
  assert.equal(defaultPostToCustomer(link(false)), false, 'switched off by staff or closed by 완료');
});

test('predictLinkOnUpload follows the server rule', () => {
  assert.deepEqual(predictLinkOnUpload({ link: link(false, ''), hasCustomerPhone: true }, '공사중'), { action: 'create' });
  assert.deepEqual(predictLinkOnUpload({ link: link(false, ''), hasCustomerPhone: false }), { action: 'none', reason: 'no-customer-phone' });
  assert.deepEqual(predictLinkOnUpload({ link: link(false, ''), hasCustomerPhone: true }, '완료'), { action: 'keep-off', reason: 'site-done' });
  assert.deepEqual(predictLinkOnUpload({ link: link(true), hasCustomerPhone: true }, '완료'), { action: 'keep-on' });
  assert.deepEqual(predictLinkOnUpload({ link: link(false), hasCustomerPhone: true }), { action: 'keep-off', reason: 'link-off' });
});

test('uploadLinkMessages explains link.created and link.reason in Korean', () => {
  assert.deepEqual(uploadLinkMessages({ enabled: true, created: true, url: 'u' }), ['고객 링크를 만들었습니다']);
  assert.deepEqual(uploadLinkMessages({ enabled: true, created: false, url: 'u' }), []);
  assert.deepEqual(uploadLinkMessages({ enabled: false, created: false, url: '', reason: 'no-customer-phone' }), ['고객 연락처가 없어 링크를 켤 수 없습니다']);
  assert.deepEqual(uploadLinkMessages({ enabled: false, created: false, url: 'u', reason: 'link-off' }), ['링크가 꺼져 있어 고객에게 보이지 않습니다']);
  assert.deepEqual(uploadLinkMessages({ enabled: false, created: false, url: '', reason: 'site-done' }), ['완료된 현장이라 링크가 자동으로 열리지 않습니다']);
  assert.deepEqual(uploadLinkMessages({ enabled: false, created: false, url: '', reason: 'something-new' }), []);
});

test('postResultMessages reports the saved record, the link and the alimtalk', () => {
  const update = { _id: 'u1', siteId: 's', reportDate: '2026-10-17', designer: '', workDetail: 'w', photos: [photo(1)], createdAt: '' };
  assert.deepEqual(postResultMessages({ update, link: { enabled: true, created: true, url: 'u' } }, false, 3), {
    tone: 'ok',
    lines: ['진행 기록을 올렸습니다 (사진 3장).', '고객 링크를 만들었습니다'],
  });
  assert.deepEqual(postResultMessages({ update, notify: { ok: true }, link: { enabled: true, created: false, url: 'u' } }, true, 1), {
    tone: 'ok',
    lines: ['진행 기록을 올렸습니다 (사진 1장).', '알림톡을 보냈습니다.'],
  });
  const failed = postResultMessages({ update, notify: { ok: false, error: '고객 휴대폰 번호가 없어 알림톡을 보낼 수 없습니다.' }, link: { enabled: true, created: false, url: 'u' } }, true, 1);
  assert.equal(failed.tone, 'warn');
  assert.deepEqual(failed.lines.slice(1), ['알림톡을 보내지 못했습니다: 고객 휴대폰 번호가 없어 알림톡을 보낼 수 없습니다.', '아래 기록 목록에서 다시 보낼 수 있습니다.']);
  assert.equal(postResultMessages({ update, link: { enabled: false, created: false, url: 'u', reason: 'link-off' } }, false, 1).tone, 'warn');
});

test('notifyStatus: 보냄 once any send worked, 실패 when every send failed, 안 보냄 without a send', () => {
  assert.equal(notifyStatus({}), 'none');
  assert.equal(notifyStatus({ notifyLog: [] }), 'none');
  assert.equal(notifyStatus({ notifyLog: [{ sentAt: '1', ok: false, by: 'a' }] }), 'failed');
  assert.equal(notifyStatus({ notifyLog: [{ sentAt: '1', ok: false, by: 'a' }, { sentAt: '2', ok: true, by: 'a' }] }), 'sent');
  assert.equal(notifyStatus({ notifyLog: [{ sentAt: '1', ok: true, by: 'a' }, { sentAt: '2', ok: false, by: 'a' }] }), 'sent');
});

test('notifyBlockedReason names the first thing that stops a send', () => {
  const ready = { notifyConfigured: true, hasCustomerPhone: true, linkEnabled: true };
  assert.equal(notifyBlockedReason(ready), null);
  assert.equal(notifyBlockedReason({ ...ready, notifyConfigured: false, linkEnabled: false }), '알림톡 템플릿 설정이 필요합니다');
  assert.equal(notifyBlockedReason({ ...ready, hasCustomerPhone: false, linkEnabled: false }), '고객 휴대폰 번호가 없어 알림톡을 보낼 수 없습니다.');
  assert.equal(notifyBlockedReason({ ...ready, linkEnabled: false }), '고객 진행 현황 링크가 꺼져 있어 알림톡을 보낼 수 없습니다.');
});

test('memoPreview keeps the first 40 characters on one line', () => {
  assert.equal(memoPreview('  욕실 방수\n\n  타일 시공  '), '욕실 방수 타일 시공');
  const long = '가'.repeat(45);
  assert.equal(memoPreview(long), `${'가'.repeat(40)}…`);
  assert.equal(memoPreview('가'.repeat(40)), '가'.repeat(40));
  assert.equal(memoPreview('😀'.repeat(41)), `${'😀'.repeat(40)}…`, 'counts characters, not UTF-16 units');
  assert.equal(memoPreview('abcdef', 3), 'abc…');
});

test('notifyHistory lists every send across records, newest first', () => {
  const history = notifyHistory([
    { _id: 'a', reportDate: '2026-10-16', notifyLog: [{ sentAt: '2026-10-16T09:00:00.000Z', ok: false, error: 'x', by: 'kim' }, { sentAt: '2026-10-16T10:00:00.000Z', ok: true, by: 'kim' }] },
    { _id: 'b', reportDate: '2026-10-17', notifyLog: [{ sentAt: '2026-10-17T08:00:00.000Z', ok: true, by: 'lee' }] },
    { _id: 'c', reportDate: '2026-10-18' },
  ]);
  assert.deepEqual(
    history.map((entry) => [entry.updateId, entry.reportDate, entry.sentAt, entry.ok]),
    [
      ['b', '2026-10-17', '2026-10-17T08:00:00.000Z', true],
      ['a', '2026-10-16', '2026-10-16T10:00:00.000Z', true],
      ['a', '2026-10-16', '2026-10-16T09:00:00.000Z', false],
    ],
  );
  assert.equal(history[2].error, 'x');
});

test('formatSeoulDateTime and formatReportDay', () => {
  assert.equal(formatSeoulDateTime('2026-10-17T15:05:00.000Z'), '2026.10.18 00:05');
  assert.equal(formatSeoulDateTime('2026-10-17T05:30:00.000Z'), '2026.10.17 14:30');
  assert.equal(formatSeoulDateTime('not a date'), '');
  assert.equal(formatSeoulDateTime(''), '');
  assert.equal(formatReportDay('2026-10-17'), '2026.10.17 (토)');
  assert.equal(formatReportDay('2026-10-19'), '2026.10.19 (월)');
  assert.equal(formatReportDay('어제'), '어제');
});

test('photoProgressLabel', () => {
  assert.equal(photoProgressLabel('upload', 2, 5), '사진 2/5 올리는 중');
  assert.equal(photoProgressLabel('resize', 1, 3), '사진 1/3 줄이는 중');
});

function recordingSteps({ shrinkFails = [], uploadFails = [] } = {}) {
  const calls = [];
  let active = 0;
  let maxActive = 0;
  const track = async (label, fail) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    calls.push(label);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active -= 1;
    if (fail) throw new Error(fail);
  };
  return {
    calls,
    maxActive: () => maxActive,
    steps: {
      shrink: async (item) => {
        await track(`shrink:${item.name}`, shrinkFails.includes(item.name) ? `사진을 열 수 없습니다: ${item.name}` : '');
        return `small-${item.name}`;
      },
      upload: async (shrunk, item) => {
        await track(`upload:${shrunk}`, uploadFails.includes(item.name) ? '서버 오류' : '');
        return photo(item.name);
      },
    },
  };
}

const items = (...names) => names.map((name) => ({ name }));

test('shrinkAndUploadPhotos shrinks every photo, then uploads them one at a time in order', async () => {
  const record = recordingSteps();
  const progress = [];
  const result = await shrinkAndUploadPhotos(items('a.jpg', 'b.jpg', 'c.jpg'), {
    ...record.steps,
    onProgress: (stage, done, total) => progress.push(photoProgressLabel(stage, done, total)),
  });
  assert.deepEqual(result, { ok: true, photos: [photo('a.jpg'), photo('b.jpg'), photo('c.jpg')] });
  assert.deepEqual(record.calls, ['shrink:a.jpg', 'shrink:b.jpg', 'shrink:c.jpg', 'upload:small-a.jpg', 'upload:small-b.jpg', 'upload:small-c.jpg']);
  assert.equal(record.maxActive(), 1, 'never two requests at once');
  assert.deepEqual(progress, ['사진 1/3 줄이는 중', '사진 2/3 줄이는 중', '사진 3/3 줄이는 중', '사진 1/3 올리는 중', '사진 2/3 올리는 중', '사진 3/3 올리는 중']);
});

test('a photo the browser cannot open stops everything before any upload and names every such photo', async () => {
  const record = recordingSteps({ shrinkFails: ['b.heic', 'd.txt'] });
  const result = await shrinkAndUploadPhotos(items('a.jpg', 'b.heic', 'c.jpg', 'd.txt'), record.steps);
  assert.deepEqual(result, {
    ok: false,
    stage: 'resize',
    failed: [
      { name: 'b.heic', error: '사진을 열 수 없습니다: b.heic' },
      { name: 'd.txt', error: '사진을 열 수 없습니다: d.txt' },
    ],
  });
  assert.equal(record.calls.filter((call) => call.startsWith('upload:')).length, 0);
  assert.deepEqual(photoFailureMessages(result), [
    '사진을 열 수 없습니다: b.heic',
    '사진을 열 수 없습니다: d.txt',
    'JPG나 PNG 사진으로 바꿔서 다시 올려 주세요. 진행 기록은 만들지 않았습니다.',
  ]);
});

test('a failed upload stops the rest and reports that photo', async () => {
  const record = recordingSteps({ uploadFails: ['b.jpg'] });
  const result = await shrinkAndUploadPhotos(items('a.jpg', 'b.jpg', 'c.jpg'), record.steps);
  assert.deepEqual(result, { ok: false, stage: 'upload', failed: [{ name: 'b.jpg', error: '서버 오류' }] });
  assert.deepEqual(record.calls.filter((call) => call.startsWith('upload:')), ['upload:small-a.jpg', 'upload:small-b.jpg']);
  assert.deepEqual(photoFailureMessages(result), ['사진을 올리지 못했습니다: b.jpg (서버 오류)', '진행 기록은 만들지 않았습니다. 다시 시도해 주세요.']);
});

test('photoFailureMessages adds the file name when the error does not carry it', () => {
  assert.deepEqual(photoFailureMessages({ ok: false, stage: 'resize', failed: [{ name: 'x.png', error: '메모리가 부족합니다' }] })[0], '메모리가 부족합니다 (x.png)');
});

function mockFetch(responses) {
  const requests = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url, init });
    const next = responses.shift() ?? { status: 200, body: {} };
    return new Response(typeof next.body === 'string' ? next.body : JSON.stringify(next.body), { status: next.status });
  };
  return { requests, restore: () => (globalThis.fetch = original) };
}

test('createProgressApi sends the session header and the request shapes the API expects', async () => {
  const mock = mockFetch([
    { status: 200, body: { link: link(true), hasCustomerPhone: true, notifyConfigured: true, updates: [] } },
    { status: 200, body: { photo: photo(1) } },
    { status: 200, body: { update: {}, link: { enabled: true, created: false, url: 'u' } } },
    { status: 200, body: { link: link(false) } },
    { status: 200, body: { ok: true } },
    { status: 200, body: { update: {}, notify: { ok: true } } },
    { status: 200, body: { siteTitle: 't' } },
  ]);
  try {
    const api = createProgressApi(() => ({ Authorization: 'Bearer token-1' }));
    await api.load('site 1');
    await api.uploadPhoto('site 1', new Blob(['x'], { type: 'image/jpeg' }), 'a.jpg');
    await api.createUpdate({ siteId: 'site 1', reportDate: '2026-10-17', designer: 'd', workDetail: 'w', photos: [photo(1)], notify: true });
    await api.setLink('site 1', 'disable');
    await api.deleteUpdate('u1');
    await api.notify('u1', true);
    await api.preview('site 1');

    const [load, upload, create, setLink, remove, notify, preview] = mock.requests;
    assert.equal(load.url, '/api/manager/progress?siteId=site%201');
    assert.equal(load.init.headers.Authorization, 'Bearer token-1');
    assert.equal(preview.url, '/api/manager/progress?siteId=site%201&preview=1');

    assert.equal(upload.init.method, 'POST');
    assert.ok(upload.init.body instanceof FormData);
    assert.equal(upload.init.body.get('action'), 'uploadPhoto');
    assert.equal(upload.init.body.get('siteId'), 'site 1');
    assert.equal(upload.init.body.get('file').name, 'a.jpg');
    assert.equal(upload.init.headers['Content-Type'], undefined, 'the browser sets the multipart boundary');
    assert.equal(upload.init.headers.Authorization, 'Bearer token-1');

    const json = (request) => JSON.parse(request.init.body);
    assert.equal(create.init.headers['Content-Type'], 'application/json');
    assert.deepEqual(json(create), { action: 'createUpdate', siteId: 'site 1', reportDate: '2026-10-17', designer: 'd', workDetail: 'w', photos: [photo(1)], notify: true });
    assert.deepEqual(json(setLink), { action: 'setLink', siteId: 'site 1', mode: 'disable' });
    assert.deepEqual(json(remove), { action: 'deleteUpdate', id: 'u1' });
    assert.deepEqual(json(notify), { action: 'notify', updateId: 'u1', resend: true });
  } finally {
    mock.restore();
  }
});

test('createProgressApi turns an error answer into an Error with the server message', async () => {
  const mock = mockFetch([
    { status: 409, body: { error: '이미 알림톡을 보낸 기록입니다. 다시 보내려면 다시 보내기를 선택해주세요.' } },
    { status: 500, body: '<html>Internal Server Error</html>' },
  ]);
  try {
    const api = createProgressApi(() => ({}));
    await assert.rejects(api.notify('u1', false), (error) => {
      assert.equal(error.message, '이미 알림톡을 보낸 기록입니다. 다시 보내려면 다시 보내기를 선택해주세요.');
      assert.equal(error.status, 409);
      return true;
    });
    await assert.rejects(api.uploadPhoto('s', new Blob(['x']), 'a.jpg'), { message: '사진을 올리지 못했습니다. (HTTP 500)' });
  } finally {
    mock.restore();
  }
});
