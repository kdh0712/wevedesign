// Runs one upload per item, a few at a time, trying a failed one again (시공 사례 나눠 올리기, spec
// docs/superpowers/specs/2026-11-27-project-upload-per-photo-design.md). Pure, no imports, so the Node tests load it directly.

export type UploadQueueResult<R> = {
  // Each item's result in the items' order; null for an item that failed every try.
  results: (R | null)[];
  // The indexes of the items that failed every try.
  failed: number[];
  // Each item's last error (null when it went through), so the screen can say which photo failed and why.
  errors: (Error | null)[];
};

// An error trying again cannot fix (a photo that cannot be opened, a request the server refuses): not retried.
export function finalError(message: string): Error & { retry: false } {
  return Object.assign(new Error(message), { retry: false as const });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runUploadQueue<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  options: {
    concurrency: number;
    retries: number;
    // Waits before the 1st, 2nd … retry, so a short network drop does not use up every try at once.
    retryDelays?: readonly number[];
    onProgress?: (done: number, total: number) => void;
  },
): Promise<UploadQueueResult<R>> {
  const results: (R | null)[] = items.map(() => null);
  const errors: (Error | null)[] = items.map(() => null);
  const failed: number[] = [];
  let next = 0;
  let done = 0;

  const attempt = async (index: number) => {
    for (let tries = 0; tries <= options.retries; tries += 1) {
      try {
        results[index] = await worker(items[index], index);
        errors[index] = null;
        return;
      } catch (caught) {
        errors[index] = caught instanceof Error ? caught : new Error(String(caught));
        if ((caught as { retry?: boolean } | null)?.retry === false) break;
        if (tries < options.retries) await wait(options.retryDelays?.[tries] ?? 0);
      }
    }
    failed.push(index);
  };

  const lane = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await attempt(index);
      done += 1;
      options.onProgress?.(done, items.length);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(options.concurrency, items.length)) }, lane));
  failed.sort((a, b) => a - b);
  return { results, failed, errors };
}

// At most `slots` tasks at a time, whoever starts them: the photos uploaded in the background after [완료] in the 정보·사진
// 정리 popup and those of [올리기] share it, so the browser never sends more than a few at once.
export function createLimiter(slots: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  // A freed slot goes straight to the next waiting task, so a task starting meanwhile cannot take it too.
  const acquire = () => {
    if (running < slots) {
      running += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => waiting.push(resolve));
  };
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else running -= 1;
  };
  return async <R>(task: () => Promise<R>): Promise<R> => {
    await acquire();
    try {
      return await task();
    } finally {
      release();
    }
  };
}
