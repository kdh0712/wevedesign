// The phone app's install information. Served here, not from public/, so scope and start_url stay next to the app.
const manifest = {
  name: '위브 업무',
  short_name: '위브 업무',
  description: '위브디자인 직원용 업무 앱',
  lang: 'ko',
  start_url: '/manager-weve-7519/m',
  scope: '/manager-weve-7519/m',
  display: 'standalone',
  background_color: '#fffdf8',
  theme_color: '#fffdf8',
  icons: [
    { src: '/staff-app/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/staff-app/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/staff-app/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

export function GET() {
  return new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' } });
}
