import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Customer progress photos (Firebase Storage). Loaded by Node as installed, like firebase-admin (which wraps it) is by
  // default, instead of being bundled.
  serverExternalPackages: ['@google-cloud/storage'],
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
    ];
  },
};

export default nextConfig;
