import test from 'node:test';
import assert from 'node:assert/strict';
import { runUploadQueue } from '../app/lib/upload-queue.ts';

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
  assert.deepEqual(await runUploadQueue([], async () => 1, { concurrency: 3, retries: 2 }), { results: [], failed: [] });
});
