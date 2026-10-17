import test from 'node:test';
import assert from 'node:assert/strict';
import nextConfig from '../next.config.ts';

const headerMap = (rule) => Object.fromEntries(rule.headers.map(({ key, value }) => [key, value]));

test('customer progress pages send no referrer, are never cached and never indexed', async () => {
  const rules = await nextConfig.headers();
  const progressIndex = rules.findIndex((rule) => rule.source === '/progress/:path*');
  assert.ok(progressIndex >= 0);
  assert.deepEqual(headerMap(rules[progressIndex]), {
    'Cache-Control': 'private, no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'no-referrer',
  });

  // When two rules set the same header, Next.js uses the later one, so the progress rule must come after the site-wide rule.
  const siteWideIndex = rules.findIndex((rule) => rule.source === '/:path*');
  assert.ok(siteWideIndex >= 0 && siteWideIndex < progressIndex);
  assert.equal(headerMap(rules[siteWideIndex])['Referrer-Policy'], 'strict-origin-when-cross-origin');
});
