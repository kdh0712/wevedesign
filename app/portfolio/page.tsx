import type { Metadata } from 'next';
import WeveDesignLanding from '@/app/page';

export const metadata: Metadata = {
  title: '인테리어 포트폴리오',
  description: '위브디자인의 주거 및 상업 공간 인테리어 리모델링 포트폴리오입니다.',
  alternates: { canonical: '/portfolio' },
};

export default function PortfolioPage() {
  return <WeveDesignLanding initialViewMode="portfolio" />;
}
