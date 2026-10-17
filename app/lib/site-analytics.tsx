'use client';

import { usePathname } from 'next/navigation';
import Script from 'next/script';
import { Analytics, type BeforeSend } from '@vercel/analytics/next';
import { isProgressPath, scrubProgressUrl } from './analytics-scrub';

// Every analytics script of the site, rendered by the root layout.
// The customer progress link (/progress/<code>) carries a secret code in its URL, so:
//  - Naver wcslog (third party, logs the page URL) is not loaded at all on /progress paths.
//  - Vercel Analytics still runs there, but its events are rewritten to /progress/[code] before they are sent.

const scrubVercelEvent: BeforeSend = (event) => ({ ...event, url: scrubProgressUrl(event.url) });

export function SiteAnalytics({ naverAnalyticsId }: { naverAnalyticsId: string }) {
  const pathname = usePathname();

  return (
    <>
      {naverAnalyticsId && !isProgressPath(pathname) && (
        <Script
          id="naver-analytics"
          strategy="lazyOnload"
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=document.createElement('script');s.src='https://wcs.naver.net/wcslog.js';s.onload=function(){window.wcs_add=window.wcs_add||{};window.wcs_add.wa='${naverAnalyticsId}';if(window.wcs)window.wcs_do();};document.head.appendChild(s);}());`,
          }}
        />
      )}
      <Analytics beforeSend={scrubVercelEvent} />
    </>
  );
}
