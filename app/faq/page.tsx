import { SectionPage, sectionMetadata } from '@/app/lib/section-page';

export const metadata = sectionMetadata('faq');

export default function FaqPage() {
  return <SectionPage section="faq" />;
}
