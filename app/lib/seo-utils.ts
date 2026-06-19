export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.wevedesign.co.kr';

export function absoluteUrl(path = '/') {
  if (/^https?:\/\//.test(path)) return path;
  return `${siteUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

export function slugify(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'project';
}

export function shortId(value?: string) {
  return (value || '')
    .replace(/^drafts\./, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-8)
    .toLowerCase();
}

export function projectSlug(project: { id?: string; _id?: string; title?: string; location?: string; categoryTitle?: string }) {
  const base = slugify([project.categoryTitle, project.title].filter(Boolean).join(' '));
  const suffix = shortId(project.id || project._id);
  return suffix ? `${base}-${suffix}` : base;
}

export function projectPath(project: { id?: string; _id?: string; title?: string; location?: string; categoryTitle?: string }) {
  return `/portfolio/${projectSlug(project)}`;
}

export function projectDetailText(project: { title?: string; location?: string; categoryTitle?: string; area?: number; year?: string; description?: string }) {
  const facts = [
    project.location && `${project.location} 지역`,
    project.categoryTitle && `${project.categoryTitle} 공간`,
    project.area && `${project.area}평`,
    project.year && `${project.year}년 시공`,
  ].filter(Boolean);
  const fallback = `${facts.join(', ')} 인테리어 리모델링 포트폴리오입니다.`;
  return project.description?.trim() || fallback || `${project.title || 'WEVE DESIGN'} 시공 사례입니다.`;
}

export const localLandingPages = [
  {
    slug: 'uiwang-interior',
    city: '의왕',
    title: '의왕 인테리어 리모델링',
    description:
      '위브디자인은 의왕 내손동을 중심으로 아파트, 주거, 상가 인테리어 리모델링을 진행하며 상담부터 현장 관리와 마감 확인까지 함께합니다.',
    keywords: ['의왕 인테리어', '의왕 아파트 리모델링', '의왕 상가 인테리어', '내손동 인테리어'],
    areas: ['내손동', '포일동', '오전동', '청계동', '백운밸리'],
  },
  {
    slug: 'anyang-interior',
    city: '안양',
    title: '안양 인테리어 리모델링',
    description:
      '위브디자인은 안양, 평촌, 인덕원 생활권의 아파트와 상업 공간 인테리어 리모델링을 제안하고 현장 중심으로 관리합니다.',
    keywords: ['안양 인테리어', '평촌 인테리어', '안양 아파트 리모델링', '인덕원 인테리어'],
    areas: ['평촌', '인덕원', '호계동', '비산동', '관양동'],
  },
] as const;
