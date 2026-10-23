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

test('the Google Cloud Storage client stays an unbundled server package, the same code the photo tests run', () => {
  assert.ok(nextConfig.serverExternalPackages?.includes('@google-cloud/storage'));
});

test('manager pages, the phone app included, are never cached and never indexed', async () => {
  const rules = await nextConfig.headers();
  const managerIndex = rules.findIndex((rule) => rule.source === '/manager-weve-7519/:path*');
  assert.ok(managerIndex >= 0);
  assert.deepEqual(headerMap(rules[managerIndex]), {
    'Cache-Control': 'private, no-store',
    'X-Robots-Tag': 'noindex, nofollow',
  });
  const siteWideIndex = rules.findIndex((rule) => rule.source === '/:path*');
  assert.ok(siteWideIndex < managerIndex);
});

test('assetlinks is served from /.well-known for the Android app', async () => {
  const rewrites = await nextConfig.rewrites();
  const list = Array.isArray(rewrites) ? rewrites : [...(rewrites.beforeFiles || []), ...(rewrites.afterFiles || []), ...(rewrites.fallback || [])];
  assert.ok(list.some((rule) => rule.source === '/.well-known/assetlinks.json' && rule.destination === '/api/android-assetlinks'));
});

// A worker at /manager-weve-7519/m/sw.js may by default control only /manager-weve-7519/m/ (with the slash), which leaves
// out the app page /manager-weve-7519/m itself; browsers refuse the registration without this header.
test('the staff app service worker may control /manager-weve-7519/m', async () => {
  const rules = await nextConfig.headers();
  const rule = rules.find((item) => item.source === '/manager-weve-7519/m/sw.js');
  assert.ok(rule, 'a header rule for the service worker');
  assert.equal(headerMap(rule)['Service-Worker-Allowed'], '/manager-weve-7519/m');
});

// The manual route reads manuals/*.pdf from disk at run time; without this the Vercel function bundle leaves them out.
test('the manual PDFs ship with the manual download route', () => {
  assert.ok(nextConfig.outputFileTracingIncludes?.['/api/manager/manual']?.includes('./manuals/*.pdf'));
});
