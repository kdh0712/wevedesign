import type { MetadataRoute } from 'next';
import { getProjects } from '@/app/lib/portfolio-data';
import { localLandingPages, projectPath, siteUrl } from '@/app/lib/seo-utils';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const projects = await getProjects();

  return [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    ...localLandingPages.map((page) => ({
      url: `${siteUrl}/${page.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    })),
    ...(projects || []).map((project) => ({
      url: `${siteUrl}${projectPath(project)}`,
      lastModified: project.updatedAt ? new Date(project.updatedAt) : now,
      changeFrequency: 'monthly' as const,
      priority: project.featured ? 0.85 : 0.75,
    })),
  ];
}
