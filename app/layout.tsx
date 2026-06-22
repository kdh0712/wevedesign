import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import Script from 'next/script';
import { siteModifiedDate, siteUrl } from '@/app/lib/site-content';
import './globals.css';

const naverVerification = process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION || 'e036b6d500ea7274d9f7163e322558fbc2addb26';
const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || 'DwNuLGyu0wMNO0zLDMbHPXq78BWLEABnHFHrzykffKM';
const naverAnalyticsId = process.env.NEXT_PUBLIC_NAVER_ANALYTICS_ID || '151969fd25c7b30';
const siteTitle = '위브디자인 WEVE DESIGN | 의왕·안양 인테리어 리모델링';
const siteDescription = '위브디자인은 의왕, 안양, 군포, 과천과 경기 남부 지역의 아파트·주거·상업 공간 인테리어 리모델링을 진행하는 전문 스튜디오입니다.';
const localBusinessJsonLd = {
  '@type': 'HomeAndConstructionBusiness',
  '@id': `${siteUrl}/#organization`,
  name: '위브디자인 WEVE DESIGN',
  alternateName: ['위브디자인', 'WEVE DESIGN', 'WEVE 인테리어 디자인'],
  url: siteUrl,
  logo: `${siteUrl}/weve-symbol.png`,
  image: `${siteUrl}/main-bg.webp`,
  description: siteDescription,
  telephone: '0507-1381-0489',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '오리나무1길 12, 1층',
    addressLocality: '의왕시',
    addressRegion: '경기도',
    addressCountry: 'KR',
  },
  areaServed: ['의왕 인테리어', '안양 인테리어', '군포 인테리어', '과천 인테리어', '경기 남부 인테리어', '서울 인테리어'],
  serviceType: ['아파트 인테리어', '주거 공간 리모델링', '상업 공간 인테리어', '부분 시공', '현장 관리'],
  identifier: '138-05-48056',
  founder: '김현종',
  foundingDate: '2006',
  dateModified: siteModifiedDate,
};

const websiteJsonLd = {
  '@type': 'WebSite',
  '@id': `${siteUrl}/#website`,
  url: siteUrl,
  name: '위브디자인',
  alternateName: 'WEVE DESIGN',
  description: siteDescription,
  inLanguage: 'ko-KR',
  publisher: { '@id': `${siteUrl}/#organization` },
  dateModified: siteModifiedDate,
};

const structuredDataJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [websiteJsonLd, localBusinessJsonLd],
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: '위브디자인 WEVE DESIGN',
  title: siteTitle,
  description: siteDescription,
  keywords: ['위브디자인', 'WEVE DESIGN', '의왕 인테리어', '안양 인테리어', '군포 인테리어', '과천 인테리어', '인테리어 리모델링', '아파트 리모델링', '상가 인테리어'],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: siteUrl,
    siteName: '위브디자인',
    images: ['/main-bg.webp'],
    locale: 'ko_KR',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
  other: {
    'article:modified_time': `${siteModifiedDate}T00:00:00+09:00`,
  },
  verification: naverVerification
    ? {
        google: googleVerification,
        other: {
          'naver-site-verification': naverVerification,
        },
      }
    : undefined,
  icons: {
    icon: [
      { url: '/favicon.ico?v=weve-9', sizes: 'any' },
      { url: '/icon.png?v=weve-9', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/apple-icon.png?v=weve-9', type: 'image/png', sizes: '180x180' }],
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
        <a href="#main-content" className="skip-link">본문으로 건너뛰기</a>
        <div id="main-content" tabIndex={-1}>{children}</div>
        {naverAnalyticsId && (
          <Script
            id="naver-analytics"
            strategy="lazyOnload"
            dangerouslySetInnerHTML={{
              __html: `(function(){var s=document.createElement('script');s.src='https://wcs.naver.net/wcslog.js';s.onload=function(){window.wcs_add=window.wcs_add||{};window.wcs_add.wa='${naverAnalyticsId}';if(window.wcs)window.wcs_do();};document.head.appendChild(s);}());`,
            }}
          />
        )}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredDataJsonLd) }}
        />
        <Analytics />
      </body>
    </html>
  );
}
