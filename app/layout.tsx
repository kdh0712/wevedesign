import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: 'WEVE DESIGN | 안양 인테리어 리모델링',
  description: '안양과 수도권 주거 공간을 위한 인테리어 리모델링 스튜디오 WEVE DESIGN입니다.',
  openGraph: {
    title: 'WEVE DESIGN',
    description: '오래 보아도 편안한 공간을 만드는 인테리어 리모델링 스튜디오',
    images: ['/main-bg.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
