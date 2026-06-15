const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.wevedesign.co.kr';

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function GET() {
  const now = new Date().toUTCString();
  const items = [
    {
      title: 'WEVE DESIGN 인테리어 리모델링',
      link: siteUrl,
      description: '오래 보아도 편안한 공간을 만드는 전문 인테리어 리모델링 스튜디오입니다.',
    },
    {
      title: 'WEVE DESIGN 프로젝트',
      link: `${siteUrl}/#portfolio-preview`,
      description: '주거 및 상업 공간 시공 프로젝트와 포트폴리오를 확인할 수 있습니다.',
    },
    {
      title: 'WEVE DESIGN 상담 문의',
      link: `${siteUrl}/#contact`,
      description: '공간 유형, 평수, 일정, 예산을 남기면 인테리어 상담을 안내합니다.',
    },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml('WEVE DESIGN')}</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>${escapeXml('전문 인테리어 리모델링 스튜디오 WEVE DESIGN')}</description>
    <language>ko</language>
    <lastBuildDate>${now}</lastBuildDate>
${items
  .map(
    (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid>${escapeXml(item.link)}</guid>
      <description>${escapeXml(item.description)}</description>
      <pubDate>${now}</pubDate>
    </item>`,
  )
  .join('\n')}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600',
    },
  });
}
