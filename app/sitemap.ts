import type { MetadataRoute } from 'next';
import { getProjects } from '@/app/lib/portfolio-data';
import { projectPath, siteUrl } from '@/app/lib/seo-utils';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const projects = await getProjects();
  const sectionPaths = ['/introduction', '/projects', '/about', '/work-method', '/process', '/location', '/consultation', '/portfolio', '/privacy', '/terms'];

  return [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    ...sectionPaths.map((path) => ({
      url: `${siteUrl}${path}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: path === '/portfolio' || path === '/consultation' ? 0.85 : 0.7,
    })),
    ...(projects || []).map((project) => ({
      url: `${siteUrl}${projectPath(project)}`,
      lastModified: project.updatedAt ? new Date(project.updatedAt) : now,
      changeFrequency: 'monthly' as const,
      priority: project.featured ? 0.85 : 0.75,
    })),
  ];
}
