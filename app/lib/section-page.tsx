import type { Metadata } from 'next';
import WeveDesignLanding from '@/app/page';

export type SectionKey = 'statement' | 'portfolio-preview' | 'about' | 'work-method' | 'process' | 'location' | 'faq' | 'contact';

const sectionCopy: Record<SectionKey, { path: string; title: string; description: string }> = {
  statement: {
    path: '/introduction',
    title: '위브디자인 소개',
    description: '공간을 오래 쓰기 편하도록 설계하고 시공하는 위브디자인의 방향을 소개합니다.',
  },
  'portfolio-preview': {
    path: '/projects',
    title: '위브디자인 프로젝트',
    description: '위브디자인의 대표 인테리어 리모델링 프로젝트를 확인하세요.',
  },
  about: {
    path: '/about',
    title: '위브디자인 회사 소개',
    description: '상담부터 설계, 시공, 마감 확인까지 현장 중심으로 관리하는 위브디자인을 소개합니다.',
  },
  'work-method': {
    path: '/work-method',
    title: '인테리어 공사 방식',
    description: '공간과 예산에 맞는 위브디자인의 인테리어 공사 진행 방식을 확인하세요.',
  },
  process: {
    path: '/process',
    title: '인테리어 진행 절차',
    description: '상담, 현장 확인, 설계와 견적, 시공으로 이어지는 위브디자인의 진행 절차입니다.',
  },
  location: {
    path: '/location',
    title: '위브디자인 오시는 길',
    description: '위브디자인 사무실 위치와 연락처를 확인하세요.',
  },
  faq: {
    path: '/faq',
    title: '위브디자인 자주 묻는 질문',
    description: '인테리어 상담 전 자주 묻는 예산, 일정, 공사 범위 질문을 확인하세요.',
  },
  contact: {
    path: '/consultation',
    title: '인테리어 상담 신청',
    description: '주거 및 상업 공간 인테리어 리모델링 상담을 신청하세요.',
  },
};

export function sectionMetadata(section: SectionKey): Metadata {
  const copy = sectionCopy[section];
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: copy.path },
  };
}

export function SectionPage({ section }: { section: SectionKey }) {
  return <WeveDesignLanding initialSection={section} />;
}
