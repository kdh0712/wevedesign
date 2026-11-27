// Runs one upload per item, a few at a time, trying a failed one again (시공 사례 나눠 올리기, spec
// docs/superpowers/specs/2026-11-27-project-upload-per-photo-design.md). Pure, no imports, so the Node tests load it directly.

export type UploadQueueResult<R> = {
  // Each item's result in the items' order; null for an item that failed every try.
  results: (R | null)[];
  // The indexes of the items that failed every try.
  failed: number[];
};

export async function runUploadQueue<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  options: { concurrency: number; retries: number; onProgress?: (done: number, total: number) => void },
): Promise<UploadQueueResult<R>> {
  const results: (R | null)[] = items.map(() => null);
  const failed: number[] = [];
  let next = 0;
  let done = 0;

  const attempt = async (index: number) => {
    for (let tries = 0; tries <= options.retries; tries += 1) {
      try {
        results[index] = await worker(items[index], index);
        return;
      } catch {
        // tried again below, up to options.retries more times
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
  return { results, failed };
}
