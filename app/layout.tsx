import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.wevedesign.co.kr';
const naverVerification = process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION || 'e036b6d500ea7274d9f7163e322558fbc2addb26';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'WEVE DESIGN | 전문 인테리어 리모델링',
  description: '전문 인테리어 리모델링 스튜디오 WEVE DESIGN입니다.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'WEVE DESIGN',
    description: '오래 보아도 편안한 공간을 만드는 인테리어 리모델링 스튜디오',
    url: siteUrl,
    siteName: 'WEVE DESIGN',
    images: ['/main-bg.webp'],
    locale: 'ko_KR',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
  verification: naverVerification
    ? {
        other: {
          'naver-site-verification': naverVerification,
        },
      }
    : undefined,
  icons: {
    icon: [
      { url: '/favicon.ico?v=weve-5', sizes: 'any' },
      { url: '/icon.png?v=weve-5', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/apple-icon.png?v=weve-5', type: 'image/png', sizes: '180x180' }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
