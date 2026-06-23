import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import WeveDesignLanding from '@/app/page';
import { getProjectBySlug, getProjects } from '@/app/lib/portfolio-data';
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

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: 'article',
      images: [project.mainImage || '/main-bg.webp'],
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

  const url = absoluteUrl(projectPath(project));
  const images = [
    project.mainImage,
    ...(project.galleryGroups || []).flatMap((group) => (group.images || []).map((image) => image.url)),
    ...(project.gallery || []).map((image) => image.url),
  ].filter(Boolean);
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: siteUrl },
      { '@type': 'ListItem', position: 2, name: '포트폴리오', item: `${siteUrl}/portfolio` },
      { '@type': 'ListItem', position: 3, name: project.title, item: url },
    ],
  };
  const portfolioJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: project.title,
    headline: project.title,
    description: projectDetailText(project),
    url,
    image: images,
    datePublished: project.createdAt,
    dateModified: project.updatedAt,
    about: [project.categoryTitle, project.location, project.area && `${project.area}평`].filter(Boolean),
    provider: {
      '@type': ['Organization', 'LocalBusiness', 'HomeAndConstructionBusiness'],
      '@id': `${siteUrl}/#organization`,
      name: '위브디자인 WEVE DESIGN',
      url: siteUrl,
      telephone: '0507-1381-0489',
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(portfolioJsonLd) }} />
      <WeveDesignLanding initialProject={project} />
    </>
  );
}
