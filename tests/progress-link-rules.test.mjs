import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLinkOnUpload, decideLinkOnUpload, progressLinkBaseUrl, shouldCloseLinkOnSave } from '../app/api/manager/_progress-link-rules.ts';

// decideLinkOnUpload: what the first progress upload does to the customer link.

test('no code and a customer phone creates the link', () => {
  assert.deepEqual(decideLinkOnUpload({}, true), { action: 'create' });
  assert.deepEqual(decideLinkOnUpload({ progressEnabled: false }, true), { action: 'create' });
});

test('an empty code counts as no code', () => {
  assert.deepEqual(decideLinkOnUpload({ progressCode: '' }, true), { action: 'create' });
  assert.deepEqual(decideLinkOnUpload({ progressCode: '', progressEnabled: true }, false), { action: 'none', reason: 'no-customer-phone' });
});

test('no code and no customer phone creates nothing', () => {
  assert.deepEqual(decideLinkOnUpload({}, false), { action: 'none', reason: 'no-customer-phone' });
  assert.deepEqual(decideLinkOnUpload({ progressCode: undefined }, false), { action: 'none', reason: 'no-customer-phone' });
});

test('a code with the link on keeps it on, with or without a phone', () => {
  assert.deepEqual(decideLinkOnUpload({ progressCode: 'abc', progressEnabled: true }, true), { action: 'keep-on' });
  assert.deepEqual(decideLinkOnUpload({ progressCode: 'abc', progressEnabled: true }, false), { action: 'keep-on' });
});

test('a code with the link off keeps it off: staff or 완료 turned it off and an upload never turns it back on', () => {
  assert.deepEqual(decideLinkOnUpload({ progressCode: 'abc', progressEnabled: false }, true), { action: 'keep-off', reason: 'link-off' });
  assert.deepEqual(decideLinkOnUpload({ progressCode: 'abc' }, true), { action: 'keep-off', reason: 'link-off' });
  assert.deepEqual(decideLinkOnUpload({ progressCode: 'abc', progressEnabled: false }, false), { action: 'keep-off', reason: 'link-off' });
});

// A site that is already '완료' never gets a link created: 완료 closes links, so the first upload must not open one.

test('a 완료 site with no code and a phone gets no link', () => {
  assert.deepEqual(decideLinkOnUpload({ status: '완료' }, true), { action: 'keep-off', reason: 'site-done' });
  assert.deepEqual(decideLinkOnUpload({ progressCode: '', progressEnabled: false, status: '완료' }, true), { action: 'keep-off', reason: 'site-done' });
});

test('a 완료 site with no code and no phone is site-done, not no-customer-phone', () => {
  assert.deepEqual(decideLinkOnUpload({ status: '완료' }, false), { action: 'keep-off', reason: 'site-done' });
});

test('a 완료 site with an existing enabled code keeps it on: only the move into 완료 closes a link', () => {
  assert.deepEqual(decideLinkOnUpload({ progressCode: 'abc', progressEnabled: true, status: '완료' }, true), { action: 'keep-on' });
  assert.deepEqual(decideLinkOnUpload({ progressCode: 'abc', progressEnabled: true, status: '완료' }, false), { action: 'keep-on' });
});

test('a 완료 site with an existing code that is off stays link-off', () => {
  assert.deepEqual(decideLinkOnUpload({ progressCode: 'abc', progressEnabled: false, status: '완료' }, true), { action: 'keep-off', reason: 'link-off' });
});

test('a site that is not 완료 is decided as before whatever its status', () => {
  assert.deepEqual(decideLinkOnUpload({ status: '시공중' }, true), { action: 'create' });
  assert.deepEqual(decideLinkOnUpload({ status: '상담완료' }, true), { action: 'create' });
  assert.deepEqual(decideLinkOnUpload({ status: '시공중' }, false), { action: 'none', reason: 'no-customer-phone' });
  assert.deepEqual(decideLinkOnUpload({ progressCode: 'abc', progressEnabled: true, status: '시공중' }, true), { action: 'keep-on' });
});

// shouldCloseLinkOnSave: a site saved into '완료' closes its link, once.

test('the transition into 완료 with the link on closes the link', () => {
  assert.equal(shouldCloseLinkOnSave('시공중', '완료', true), true);
  assert.equal(shouldCloseLinkOnSave('견적중', '완료', true), true);
});

test('a re-save of a site that is already 완료 does not close a link staff switched back on', () => {
  assert.equal(shouldCloseLinkOnSave('완료', '완료', true), false);
});

test('a link that is already off or missing is not closed', () => {
  assert.equal(shouldCloseLinkOnSave('시공중', '완료', false), false);
  assert.equal(shouldCloseLinkOnSave('시공중', '완료', undefined), false);
});

test('a save that does not end in 완료 does not close the link', () => {
  assert.equal(shouldCloseLinkOnSave('시공중', '시공중', true), false);
  assert.equal(shouldCloseLinkOnSave('완료', '시공중', true), false);
  assert.equal(shouldCloseLinkOnSave('시공중', undefined, true), false);
  assert.equal(shouldCloseLinkOnSave(undefined, undefined, true), false);
});

test('a record with no earlier status saved as 완료 closes an enabled link', () => {
  assert.equal(shouldCloseLinkOnSave(undefined, '완료', true), true);
});

// applyLinkOnUpload: the first upload creates the link only on the version of the site it read, and decides once more after a conflict.

class Conflict extends Error {}

function uploadSteps({ first, rereads = [], creates = [] }) {
  const calls = { decide: 0, create: [], reread: 0 };
  return {
    calls,
    steps: {
      first,
      reread: async () => {
        calls.reread += 1;
        return rereads.shift() ?? null;
      },
      decide: async (site) => {
        calls.decide += 1;
        return decideLinkOnUpload(site, true);
      },
      create: async (updateTime) => {
        calls.create.push(updateTime);
        const next = creates.shift();
        if (next instanceof Error) throw next;
        return next;
      },
      isConflict: (error) => error instanceof Conflict,
    },
  };
}

test('a site with no code gets its link created on the version that was read', async () => {
  const created = { _id: 's1', progressCode: 'new', progressEnabled: true };
  const { steps, calls } = uploadSteps({ first: { site: { _id: 's1' }, updateTime: 'v1' }, creates: [created] });
  assert.deepEqual(await applyLinkOnUpload(steps), { site: created, decision: { action: 'create' }, created: true });
  assert.deepEqual(calls.create, ['v1']);
  assert.equal(calls.reread, 0);
});

test('a site that already has a link is left alone: nothing is written', async () => {
  const site = { _id: 's1', progressCode: 'abc', progressEnabled: true };
  const { steps, calls } = uploadSteps({ first: { site, updateTime: 'v1' } });
  assert.deepEqual(await applyLinkOnUpload(steps), { site, decision: { action: 'keep-on' }, created: false });
  assert.deepEqual(calls.create, []);
});

test('a conflict re-reads once: a code another upload just created is kept, not replaced', async () => {
  const other = { _id: 's1', progressCode: 'from-the-other-upload', progressEnabled: true };
  const { steps, calls } = uploadSteps({
    first: { site: { _id: 's1' }, updateTime: 'v1' },
    rereads: [{ site: other, updateTime: 'v2' }],
    creates: [new Conflict('stale')],
  });
  assert.deepEqual(await applyLinkOnUpload(steps), { site: other, decision: { action: 'keep-on' }, created: false });
  assert.deepEqual(calls.create, ['v1']);
  assert.equal(calls.reread, 1);
});

test('a conflict from an unrelated edit re-reads and creates on the new version', async () => {
  const created = { _id: 's1', progressCode: 'new', progressEnabled: true };
  const { steps, calls } = uploadSteps({
    first: { site: { _id: 's1' }, updateTime: 'v1' },
    rereads: [{ site: { _id: 's1', title: 'edited' }, updateTime: 'v2' }],
    creates: [new Conflict('stale'), created],
  });
  assert.deepEqual(await applyLinkOnUpload(steps), { site: created, decision: { action: 'create' }, created: true });
  assert.deepEqual(calls.create, ['v1', 'v2']);
});

test('a second conflict is an error, like any other failed save', async () => {
  const second = new Conflict('stale again');
  const { steps, calls } = uploadSteps({
    first: { site: { _id: 's1' }, updateTime: 'v1' },
    rereads: [{ site: { _id: 's1' }, updateTime: 'v2' }, { site: { _id: 's1' }, updateTime: 'v3' }],
    creates: [new Conflict('stale'), second],
  });
  await assert.rejects(applyLinkOnUpload(steps), (error) => error === second);
  assert.deepEqual(calls.create, ['v1', 'v2']);
  assert.equal(calls.reread, 1);
});

test('an error that is not a conflict is thrown at once, without a re-read', async () => {
  const broken = new Error('Firestore unavailable');
  const { steps, calls } = uploadSteps({ first: { site: { _id: 's1' }, updateTime: 'v1' }, creates: [broken] });
  await assert.rejects(applyLinkOnUpload(steps), (error) => error === broken);
  assert.equal(calls.reread, 0);
});

test('a site that is gone on the re-read is an error', async () => {
  const { steps } = uploadSteps({ first: { site: { _id: 's1' }, updateTime: 'v1' }, rereads: [null], creates: [new Conflict('gone')] });
  await assert.rejects(applyLinkOnUpload(steps), /현장을 찾을 수 없습니다/);
});

// progressLinkBaseUrl: where the customer links point.

test('a Vercel preview links to its own branch URL', () => {
  assert.equal(
    progressLinkBaseUrl({ VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'weve-design-git-feat-progress-team.vercel.app', NEXT_PUBLIC_SITE_URL: 'https://www.wevedesign.co.kr' }),
    'https://weve-design-git-feat-progress-team.vercel.app',
  );
  assert.equal(progressLinkBaseUrl({ VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'branch.vercel.app/' }), 'https://branch.vercel.app');
});

test('production and local use NEXT_PUBLIC_SITE_URL, then the public domain', () => {
  assert.equal(progressLinkBaseUrl({ VERCEL_ENV: 'production', VERCEL_BRANCH_URL: 'branch.vercel.app', NEXT_PUBLIC_SITE_URL: 'https://www.wevedesign.co.kr/' }), 'https://www.wevedesign.co.kr');
  assert.equal(progressLinkBaseUrl({ NEXT_PUBLIC_SITE_URL: 'http://localhost:3000//' }), 'http://localhost:3000');
  assert.equal(progressLinkBaseUrl({ VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: '', NEXT_PUBLIC_SITE_URL: 'https://staging.example' }), 'https://staging.example');
  assert.equal(progressLinkBaseUrl({ VERCEL_ENV: 'preview' }), 'https://www.wevedesign.co.kr');
  assert.equal(progressLinkBaseUrl({ VERCEL_ENV: 'development', VERCEL_BRANCH_URL: 'branch.vercel.app' }), 'https://www.wevedesign.co.kr');
  assert.equal(progressLinkBaseUrl({}), 'https://www.wevedesign.co.kr');
  assert.equal(progressLinkBaseUrl({ NEXT_PUBLIC_SITE_URL: '   ' }), 'https://www.wevedesign.co.kr');
});
