import { ANDROID_PACKAGE_NAME, assetLinksFor } from '../../lib/push-rules';

// /.well-known/assetlinks.json (next.config.ts rewrite): proves the staff Android app (a TWA, package
// kr.co.wevedesign.staff) belongs to this site. The signing fingerprint comes from ANDROID_APP_SHA256; without it the
// answer is an empty list and the app still opens, only with an address bar.
export function GET() {
  return Response.json(assetLinksFor(ANDROID_PACKAGE_NAME, process.env.ANDROID_APP_SHA256), {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
