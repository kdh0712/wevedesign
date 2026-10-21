import type { Metadata, Viewport } from 'next';

// The staff phone app (spec docs/superpowers/specs/2026-10-20-staff-mobile-app-design.md §2): installed from the browser
// with "홈 화면에 추가" and opened full screen. No service worker in the first version.
export const metadata: Metadata = {
  title: 'WEVE Staff',
  manifest: '/manager-weve-7519/m/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'WEVE Staff', statusBarStyle: 'default' },
  icons: { apple: '/staff-app/apple-touch-icon.png' },
  robots: { index: false, follow: false },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#fffdf8',
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
};

export default function StaffAppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
