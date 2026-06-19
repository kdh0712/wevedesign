import { ArrowUpRight, CheckCircle2, MapPin } from 'lucide-react';
import { getProjects } from './portfolio-data';
import { absoluteUrl, localLandingPages, projectDetailText, projectPath, siteUrl } from './seo-utils';

type LocalLandingConfig = (typeof localLandingPages)[number];

const defaultFaq = [
  {
    question: '상담 전 어떤 정보를 준비하면 좋나요?',
    answer: '공간 주소, 평수, 희망 공사 범위, 예산 방향, 입주 또는 오픈 희망 시기를 알려주시면 더 정확한 상담이 가능합니다.',
  },
  {
    question: '부분 시공과 전체 리모델링 모두 가능한가요?',
    answer: '네. 아파트 전체 리모델링, 주거 공간 부분 시공, 상가 인테리어처럼 범위가 다른 현장도 상담 후 진행 방향을 정리합니다.',
  },
  {
    question: '현장 관리는 어떻게 진행되나요?',
    answer: '상담과 견적 이후 공정 순서, 자재 반입, 현장 체크, 마감 확인을 한 흐름으로 관리해 시공 과정의 혼선을 줄입니다.',
  },
];

export function localLandingMetadata(config: LocalLandingConfig) {
  const title = `${config.title} | 위브디자인 WEVE DESIGN`;
  const url = absoluteUrl(`/${config.slug}`);

  return {
    title,
    description: config.description,
    alternates: { canonical: url },
    keywords: ['위브디자인', 'WEVE DESIGN', ...config.keywords],
    openGraph: {
      title,
      description: config.description,
      url,
      type: 'website',
      images: ['/main-bg.webp'],
      siteName: '위브디자인',
      locale: 'ko_KR',
    },
  };
}

export async function LocalLandingPage({ config }: { config: LocalLandingConfig }) {
  const projects = await getProjects();
  const representativeProjects = (projects || []).slice(0, 6);
  const url = absoluteUrl(`/${config.slug}`);
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: siteUrl },
      { '@type': 'ListItem', position: 2, name: config.title, item: url },
    ],
  };
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: defaultFaq.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
  const localBusinessJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HomeAndConstructionBusiness',
    name: '위브디자인 WEVE DESIGN',
    url,
    telephone: '0507-1381-0489',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '오리나무1길 12, 1층',
      addressLocality: '의왕시',
      addressRegion: '경기도',
      addressCountry: 'KR',
    },
    areaServed: [config.city, ...config.areas],
    serviceType: config.keywords,
    description: config.description,
  };

  return (
    <main className="min-h-screen bg-[#fffdf8] text-[#171512]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd) }} />

      <header className="border-b border-[#eadfcd] bg-white px-5 py-5 md:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <a href="/" className="text-sm font-bold tracking-[0.2em] text-[#171512]">WEVE DESIGN</a>
          <nav className="flex items-center gap-4 text-sm font-semibold text-[#625d54]">
            <a href="/#portfolio-preview" className="transition hover:text-[#171512]">포트폴리오</a>
            <a href="/#contact" className="rounded-md bg-[#f1c76a] px-4 py-2 text-[#171512]">상담 문의</a>
          </nav>
        </div>
      </header>

      <section className="px-5 py-16 md:px-8 md:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#8f6f43]">위브디자인 지역 인테리어</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-normal md:text-6xl">{config.title}</h1>
            <p className="mt-6 max-w-3xl text-lg leading-9 text-[#625d54]">{config.description}</p>
            <div className="mt-8 flex flex-wrap gap-2">
              {config.keywords.map((keyword) => (
                <span key={keyword} className="rounded-full border border-[#eadfcd] bg-white px-4 py-2 text-sm font-bold text-[#625d54]">
                  {keyword}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-[#eadfcd] bg-white p-6 shadow-[0_20px_60px_rgba(57,46,31,0.08)]">
            <h2 className="text-2xl font-semibold">{config.city}에서 이런 공간을 상담합니다</h2>
            <div className="mt-6 grid gap-3">
              {['아파트 전체 리모델링', '주거 공간 부분 시공', '상가·오피스 인테리어', '자재 제안 및 현장 관리'].map((item) => (
                <p key={item} className="flex items-center gap-3 rounded-md bg-[#fffaf0] px-4 py-3 font-semibold">
                  <CheckCircle2 size={18} className="text-[#8f6f43]" />
                  {item}
                </p>
              ))}
            </div>
            <p className="mt-6 flex items-start gap-3 text-sm leading-7 text-[#625d54]">
              <MapPin size={18} className="mt-1 shrink-0 text-[#8f6f43]" />
              {config.areas.join(', ')} 등 {config.city} 생활권을 중심으로 상담합니다.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-white px-5 py-16 md:px-8 md:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#8f6f43]">Portfolio</p>
              <h2 className="mt-3 text-3xl font-semibold md:text-5xl">위브디자인 대표 포트폴리오</h2>
              <p className="mt-4 max-w-2xl leading-7 text-[#625d54]">
                포트폴리오는 지역별로 제한하지 않고 전국 현장 사례를 함께 보여드립니다. 상담 시 원하는 공간과 비슷한 사례를 기준으로 방향을 잡을 수 있습니다.
              </p>
            </div>
            <a href="/#portfolio-preview" className="inline-flex items-center gap-2 font-bold text-[#8f6f43]">
              전체 포트폴리오 보기
              <ArrowUpRight size={18} />
            </a>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {representativeProjects.map((project) => (
              <a key={project.id} href={projectPath(project)} className="group overflow-hidden rounded-lg border border-[#eadfcd] bg-[#fffdf8] transition hover:-translate-y-1 hover:shadow-[0_20px_60px_rgba(57,46,31,0.12)]">
                {project.mainImage && <img src={`${project.mainImage}?w=900&q=82&fit=max&auto=format`} alt={project.mainImageAlt || project.title} className="aspect-[16/10] w-full object-cover" />}
                <div className="p-5">
                  <p className="text-sm font-bold text-[#8f6f43]">{project.categoryTitle || '인테리어'}</p>
                  <h3 className="mt-2 text-xl font-semibold">{project.title}</h3>
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#625d54]">{projectDetailText(project)}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-16 md:px-8 md:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#8f6f43]">FAQ</p>
            <h2 className="mt-3 text-3xl font-semibold">자주 묻는 질문</h2>
          </div>
          <div className="grid gap-4">
            {defaultFaq.map((item) => (
              <div key={item.question} className="rounded-lg border border-[#eadfcd] bg-white p-5">
                <h3 className="font-semibold">{item.question}</h3>
                <p className="mt-3 leading-7 text-[#625d54]">{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#171512] px-5 py-16 text-white md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#f1c76a]">위브디자인 상담</p>
            <h2 className="mt-3 text-3xl font-semibold">{config.city} 인테리어 상담을 시작해보세요.</h2>
          </div>
          <a href="/#contact" className="hover-shine inline-flex items-center justify-center rounded-md bg-[#f1c76a] px-6 py-3 font-bold text-[#171512]">
            상담 신청하기
          </a>
        </div>
      </section>
    </main>
  );
}
