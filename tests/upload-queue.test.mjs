import test from 'node:test';
import assert from 'node:assert/strict';
import { finalError, runUploadQueue } from '../app/lib/upload-queue.ts';

// 시공 사례 나눠 올리기 (spec docs/superpowers/specs/2026-11-27-project-upload-per-photo-design.md): photos go a few at a time,
// a failed one is tried again, and the screen shows how many are done.

test('runUploadQueue runs a few at a time, keeps the order, retries a failure and reports progress', async () => {
  let running = 0;
  let maxRunning = 0;
  const attempts = {};
  const progress = [];
  const worker = async (item) => {
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    attempts[item] = (attempts[item] || 0) + 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    running -= 1;
    if (item === 'flaky' && attempts[item] < 2) throw new Error('once');
    if (item === 'bad') throw new Error('always');
    return item.toUpperCase();
  };
  const out = await runUploadQueue(['a', 'flaky', 'b', 'bad', 'c'], worker, {
    concurrency: 2,
    retries: 2,
    onProgress: (done, total) => progress.push(`${done}/${total}`),
  });
  assert.deepEqual(out.results, ['A', 'FLAKY', 'B', null, 'C']);
  assert.deepEqual(out.failed, [3]);
  assert.equal(attempts.bad, 3);
  assert.equal(attempts.flaky, 2);
  assert.ok(maxRunning <= 2);
  assert.equal(progress.at(-1), '5/5');
});

test('runUploadQueue with nothing to do returns at once', async () => {
  assert.deepEqual(await runUploadQueue([], async () => 1, { concurrency: 3, retries: 2 }), { results: [], failed: [], errors: [] });
});

test('runUploadQueue keeps the last error of each failed item and does not retry an error marked final (review finding)', async () => {
  const attempts = {};
  const out = await runUploadQueue(
    ['ok', 'final', 'flaky'],
    async (item) => {
      attempts[item] = (attempts[item] || 0) + 1;
      if (item === 'final') throw finalError('열 수 없는 사진');
      if (item === 'flaky') throw new Error(`try ${attempts[item]}`);
      return item;
    },
    { concurrency: 1, retries: 2 },
  );
  assert.deepEqual(out.failed, [1, 2]);
  assert.equal(attempts.final, 1);
  assert.equal(attempts.flaky, 3);
  assert.equal(out.errors[0], null);
  assert.equal(out.errors[1].message, '열 수 없는 사진');
  assert.equal(out.errors[2].message, 'try 3');
});

test('runUploadQueue waits between tries (review finding: a short drop used up every try at once)', async () => {
  const times = [];
  await runUploadQueue(
    ['x'],
    async () => {
      times.push(Date.now());
      throw new Error('down');
    },
    { concurrency: 1, retries: 2, retryDelays: [40, 80] },
  );
  assert.equal(times.length, 3);
  assert.ok(times[1] - times[0] >= 35, `first wait ${times[1] - times[0]}ms`);
  assert.ok(times[2] - times[1] >= 75, `second wait ${times[2] - times[1]}ms`);
});
