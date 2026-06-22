export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.wevedesign.co.kr';

export const siteModifiedDate = '2026-06-22';

export const homepageFaqItems = [
  {
    question: '인테리어 상담 전에 무엇을 준비하면 되나요?',
    answer:
      '현장 주소, 공간의 현재 상태, 원하는 공사 범위와 대략적인 예산을 알려주시면 상담이 빠르게 진행됩니다. 참고하고 싶은 사진이나 도면이 있다면 함께 준비해주세요.',
  },
  {
    question: '위브디자인은 어떤 지역에서 시공하나요?',
    answer:
      '의왕과 안양을 중심으로 경기 남부와 서울을 포함한 전국 현장을 상담합니다. 지역과 공사 범위에 따라 현장 확인 가능 일정을 먼저 안내드립니다.',
  },
  {
    question: '전체 리모델링 외에 부분 시공도 가능한가요?',
    answer:
      '아파트 전체 리모델링뿐 아니라 주거 공간 부분 시공, 상가와 오피스 등 상업 공간 인테리어도 상담할 수 있습니다.',
  },
  {
    question: 'CM 방식과 턴키 방식은 어떻게 다른가요?',
    answer:
      'CM 방식은 고객이 디자인과 주요 자재를 결정하고 위브디자인이 현장을 관리하는 방식입니다. 턴키 방식은 디자인 제안부터 시공과 마감, 사후 관리까지 한 흐름으로 맡기는 방식입니다.',
  },
] as const;
