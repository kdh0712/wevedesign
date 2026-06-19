import type { Metadata } from 'next';
import { LocalLandingPage, localLandingMetadata } from '@/app/lib/local-landing-page';
import { localLandingPages } from '@/app/lib/seo-utils';

const config = localLandingPages[1];

export const revalidate = 60;

export const metadata: Metadata = localLandingMetadata(config);

export default function AnyangInteriorPage() {
  return <LocalLandingPage config={config} />;
}
