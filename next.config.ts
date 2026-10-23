import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Customer progress photos (Firebase Storage). Loaded by Node as installed, like firebase-admin (which wraps it) is by
  // default, instead of being bundled.
  serverExternalPackages: ['@google-cloud/storage'],
  // The staff manuals are read from disk by /api/manager/manual (spec 2026-10-23); file tracing cannot see that read.
  outputFileTracingIncludes: { '/api/manager/manual': ['./manuals/*.pdf'] },
  async rewrites() {
    return [
      // Digital Asset Links for the staff Android app (a TWA around /manager-weve-7519/m): without it the app shows an
      // address bar. Served by a route so the signing fingerprint comes from ANDROID_APP_SHA256.
      { source: '/.well-known/assetlinks.json', destination: '/api/android-assetlinks' },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // Customer progress pages hold per-customer data behind a private link: never cached, never indexed, and the URL (the
        // secret code) is never sent on as a referrer. This rule comes after '/:path*', so its Referrer-Policy wins.
        source: '/progress/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
      {
        // The manager dashboard and the staff phone app (/manager-weve-7519/m) show office data: never cached, never indexed.
        source: '/manager-weve-7519/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      {
        // The push alert worker sits at /manager-weve-7519/m/sw.js, so by default it could control only
        // /manager-weve-7519/m/ (with the slash) and not the app page /manager-weve-7519/m; browsers refuse that registration.
        source: '/manager-weve-7519/m/sw.js',
        headers: [{ key: 'Service-Worker-Allowed', value: '/manager-weve-7519/m' }],
      },
    ];
  },
};

export default nextConfig;
