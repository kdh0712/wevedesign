import { SectionPage, sectionMetadata } from '@/app/lib/section-page';

export const metadata = sectionMetadata('portfolio-preview');

export default function ProjectsPage() {
  return <SectionPage section="portfolio-preview" />;
}
