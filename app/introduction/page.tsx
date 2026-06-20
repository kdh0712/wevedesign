import { SectionPage, sectionMetadata } from '@/app/lib/section-page';

export const metadata = sectionMetadata('statement');

export default function IntroductionPage() {
  return <SectionPage section="statement" />;
}
