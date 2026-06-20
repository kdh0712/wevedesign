import { SectionPage, sectionMetadata } from '@/app/lib/section-page';

export const metadata = sectionMetadata('about');

export default function AboutPage() {
  return <SectionPage section="about" />;
}
