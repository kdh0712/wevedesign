import type { Metadata, Viewport } from 'next';

// The staff sign-up page (spec docs/superpowers/specs/2026-11-21-staff-signup-approval-design.md §3.2). Opened from a link
// sent to a new staff member, mostly on a phone. next.config.ts adds no-store, noindex and no-referrer to this path.
export const metadata: Metadata = {
  title: '위브디자인 직원 가입',
  robots: { index: false, follow: false },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function StaffJoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
