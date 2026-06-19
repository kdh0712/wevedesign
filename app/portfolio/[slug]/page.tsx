import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, MapPin, Ruler, CalendarDays } from 'lucide-react';
import { getProjectBySlug, getProjects, type GalleryImage, type PortfolioProject } from '@/app/lib/portfolio-data';
import { absoluteUrl, projectDetailText, projectPath, projectSlug, siteUrl } from '@/app/lib/seo-utils';

type PageProps = {
  params: Promise<{ slug: string }>;
};

export const revalidate = 60;

function decodeSlug(slug: string) {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

function imageUrl(url?: string, width = 1400) {
  if (!url) return '';
  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}w=${width}&q=86&fit=max&auto=format`;
}

function allProjectImages(project: PortfolioProject) {
  const grouped = (project.galleryGroups || []).flatMap((group) => group.images || []);
  const legacy = project.gallery || [];
  return [project.mainImage && { url: project.mainImage, alt: project.mainImageAlt }, ...grouped, ...legacy].filter(Boolean) as GalleryImage[];
}

function projectFacts(project: PortfolioProject) {
  return [
    project.location && { label: '지역', value: project.location, icon: MapPin },
    project.area && { label: '면적', value: `${project.area}평`, icon: Ruler },
    project.year && { label: '연도', value: project.year, icon: CalendarDays },
    project.categoryTitle && { label: '분류', value: project.categoryTitle, icon: MapPin },
  ].filter(Boolean) as Array<{ label: string; value: string; icon: typeof MapPin }>;
}

export async function generateStaticParams() {
  const projects = await getProjects();
  return (projects || []).map((project) => ({ slug: projectSlug(project) }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getProjectBySlug(decodeSlug(slug));
  if (!project) return {};

  const title = `${project.title} | ${project.location || '위브디자인'} 인테리어 포트폴리오`;
  const description = projectDetailText(project);
  const url = absoluteUrl(projectPath(project));
  const image = project.mainImage || '/main-bg.webp';

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: 'article',
      images: [image],
      siteName: '위브디자인',
      locale: 'ko_KR',
    },
    keywords: [
      '위브디자인',
      project.location && `${project.location} 인테리어`,
      project.location && `${project.location} 리모델링`,
      project.categoryTitle && `${project.categoryTitle} 인테리어`,
      project.title,
    ].filter(Boolean) as string[],
  };
}

export default async function PortfolioDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const project = await getProjectBySlug(decodeSlug(slug));
  if (!project) notFound();

  const images = allProjectImages(project);
  const facts = projectFacts(project);
  const url = absoluteUrl(projectPath(project));
  const description = projectDetailText(project);
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: siteUrl },
      { '@type': 'ListItem', position: 2, name: '포트폴리오', item: `${siteUrl}/#portfolio-preview` },
      { '@type': 'ListItem', position: 3, name: project.title, item: url },
    ],
  };
  const portfolioJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: project.title,
    headline: project.title,
    description,
    url,
    image: images.map((image) => image.url).filter(Boolean),
    datePublished: project.createdAt,
    dateModified: project.updatedAt,
    about: [project.categoryTitle, project.location, project.area && `${project.area}평`].filter(Boolean),
    provider: {
      '@type': 'HomeAndConstructionBusiness',
      name: '위브디자인 WEVE DESIGN',
      url: siteUrl,
      telephone: '0507-1381-0489',
      areaServed: [project.location, '의왕', '안양', '경기 남부'].filter(Boolean),
    },
  };
  const imageJsonLd = images.slice(0, 8).map((image, index) => ({
    '@context': 'https://schema.org',
    '@type': 'ImageObject',
    contentUrl: image.url,
    name: image.alt || image.caption || `${project.title} 시공 사진 ${index + 1}`,
    caption: image.caption || image.alt || `${project.title} 인테리어 시공 사진`,
  }));

  return (
    <main className="min-h-screen bg-[#fffdf8] text-[#171512]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(portfolioJsonLd) }} />
      {imageJsonLd.map((item, index) => (
        <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }} />
      ))}

      <header className="border-b border-[#eadfcd] bg-[#171512] px-5 py-5 text-white md:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <a href="/" className="inline-flex items-center gap-3 text-sm font-semibold text-white/84 transition hover:text-white">
            <ArrowLeft size={18} />
            위브디자인 홈
          </a>
          <a href="/#contact" className="hover-shine rounded-md bg-[#f1c76a] px-4 py-2 text-sm font-bold text-[#171512]">
            상담 문의
          </a>
        </div>
      </header>

      <section className="px-5 py-14 md:px-8 md:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-start">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#8f6f43]">WEVE PORTFOLIO</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-normal md:text-6xl">{project.title}</h1>
            <p className="mt-6 max-w-3xl whitespace-pre-line text-lg leading-9 text-[#625d54]">{description}</p>
          </div>
          <div className="rounded-lg border border-[#eadfcd] bg-white p-5 shadow-[0_18px_55px_rgba(57,46,31,0.08)]">
            <dl className="grid gap-4">
              {facts.map((fact) => {
                const Icon = fact.icon;
                return (
                  <div key={fact.label} className="grid grid-cols-[92px_1fr] items-center gap-4 border-b border-[#f0e8dc] pb-4 last:border-b-0 last:pb-0">
                    <dt className="flex items-center gap-2 text-sm font-bold text-[#8f6f43]">
                      <Icon size={16} />
                      {fact.label}
                    </dt>
                    <dd className="font-semibold text-[#171512]">{fact.value}</dd>
                  </div>
                );
              })}
            </dl>
            {project.blogUrl && (
              <a
                href={project.blogUrl}
                target="_blank"
                rel="noreferrer"
                className="hover-shine mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#f1c76a] px-5 py-3 font-bold text-[#171512] shadow-[0_14px_30px_rgba(191,143,51,0.22)] transition hover:-translate-y-0.5"
              >
                블로그에서 자세히 보기
                <ArrowUpRight size={18} />
              </a>
            )}
          </div>
        </div>
      </section>

      {project.mainImage && (
        <section className="px-5 md:px-8">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-lg bg-[#e3dbcf]">
            <img src={imageUrl(project.mainImage, 1800)} alt={project.mainImageAlt || project.title} className="h-auto w-full object-contain" />
          </div>
        </section>
      )}

      <section className="px-5 py-16 md:px-8 md:py-20">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-semibold">상세 사진</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {images.slice(project.mainImage ? 1 : 0).map((image, index) => (
              <figure key={`${image.url}-${index}`} className="overflow-hidden rounded-lg border border-[#eadfcd] bg-white">
                <img
                  src={imageUrl(image.url, 1200)}
                  alt={image.alt || image.caption || `${project.title} 상세 사진 ${index + 1}`}
                  className="h-auto w-full object-contain"
                  loading="lazy"
                />
                {(image.caption || image.roomType) && <figcaption className="px-4 py-3 text-sm font-semibold text-[#625d54]">{image.caption || image.roomType}</figcaption>}
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#171512] px-5 py-16 text-white md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#f1c76a]">위브디자인 상담</p>
            <h2 className="mt-3 text-3xl font-semibold">비슷한 공간의 인테리어를 준비 중이신가요?</h2>
          </div>
          <a href="/#contact" className="hover-shine inline-flex items-center justify-center rounded-md bg-[#f1c76a] px-6 py-3 font-bold text-[#171512]">
            상담 신청하기
          </a>
        </div>
      </section>
    </main>
  );
}
