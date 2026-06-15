'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Script from 'next/script';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Camera,
  Check,
  ChevronRight,
  Home,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  Ruler,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';

type Category = {
  title: string;
  value: string;
};

type GalleryImage = {
  url?: string;
  roomType?: string;
  caption?: string;
  displayOrder?: number;
  alt?: string;
};

type GalleryGroup = {
  roomType?: string;
  title?: string;
  displayOrder?: number;
  images?: GalleryImage[];
};

type Project = {
  id: string;
  title: string;
  category?: string;
  categoryTitle?: string;
  description?: string;
  area?: number;
  location?: string;
  year?: string;
  materials?: string;
  blogUrl?: string;
  featured?: boolean;
  mainImagePosition?: string;
  mainImagePositionX?: number;
  mainImagePositionY?: number;
  mainImage?: string;
  mainImageAlt?: string;
  beforeImage?: string;
  galleryGroups?: GalleryGroup[];
  gallery?: GalleryImage[];
};

type HomepagePopupItem = {
  _key?: string;
  enabled?: string;
  layout?: string;
  position?: string;
  width?: string;
  imageFit?: string;
  startDate?: string;
  endDate?: string;
  title?: string;
  body?: string;
  buttonLabel?: string;
  buttonUrl?: string;
  image?: string;
  imageUrl?: string;
};

type SiteSettings = {
  heroImage?: string;
  heroImage2?: string;
  heroImage3?: string;
  heroImageAlt?: string;
  heroImage2Alt?: string;
  heroImage3Alt?: string;
  heroLabel?: string;
  heroTitle?: string;
  heroDescription?: string;
  primaryButtonLabel?: string;
  secondaryButtonLabel?: string;
  statementLabel?: string;
  statementTitle?: string;
  statementBody?: string;
  projectSectionTitle?: string;
  projectButtonLabel?: string;
  portfolioTitle?: string;
  aboutLabel?: string;
  aboutTitle?: string;
  aboutBody?: string;
  processLabel?: string;
  processTitle?: string;
  locationLabel?: string;
  locationTitle?: string;
  address?: string;
  lotAddress?: string;
  mapLocation?: {
    lat?: number;
    lng?: number;
  };
  phone?: string;
  mapLat?: number;
  mapLng?: number;
  contactLabel?: string;
  contactTitle?: string;
  contactBody?: string;
  consultationEmail?: string;
  representativeName?: string;
  businessNumber?: string;
  companyStartYear?: string;
  consultationPropertyQuestion?: string;
  consultationPropertyOptions?: string;
  consultationAreaQuestion?: string;
  consultationAreaOptions?: string;
  consultationStatusQuestion?: string;
  consultationStatusOptions?: string;
  consultationReasonQuestion?: string;
  consultationReasonOptions?: string;
  consultationBudgetQuestion?: string;
  consultationBudgetOptions?: string;
  consultationTimelineQuestion?: string;
  consultationTimelineOptions?: string;
  consultationPrivacyText?: string;
  consultationSurveyConfig?: string;
  kakaoUrl?: string;
  kakaoChannelManagerUrl?: string;
  popupEnabled?: string;
  popupLayout?: string;
  popupPosition?: string;
  popupWidth?: string;
  popupImageFit?: string;
  popupStartDate?: string;
  popupEndDate?: string;
  popupTitle?: string;
  popupBody?: string;
  popupButtonLabel?: string;
  popupButtonUrl?: string;
  popupImage?: string;
  popups?: HomepagePopupItem[];
};

type DaumPostcodeData = {
  zonecode?: string;
  roadAddress?: string;
  jibunAddress?: string;
  buildingName?: string;
  apartment?: 'Y' | 'N';
};

type ConsultationData = {
  propertyType: string;
  areaRange: string;
  homeStatus: string;
  reason: string;
  budget: string;
  timeline: string;
  name: string;
  phone: string;
  postcode: string;
  address: string;
  detailAddress: string;
  message: string;
  privacyAgreed: boolean;
};

type ConsultationStepKey = 'propertyType' | 'areaRange' | 'homeStatus' | 'reason' | 'budget' | 'timeline';

type ConsultationStep = {
  key: ConsultationStepKey;
  title: string;
  description?: string;
  options: string[];
};

type ConsultationAreaGroup = {
  id: string;
  label: string;
  propertyOptions: string[];
  step?: ConsultationStep;
  steps?: ConsultationStep[];
};

type ConsultationSurveyConfig = {
  propertyStep: ConsultationStep;
  areaGroups: ConsultationAreaGroup[];
  commonSteps: ConsultationStep[];
};

declare global {
  interface Window {
    daum?: {
      Postcode: new (options: { oncomplete: (data: DaumPostcodeData) => void }) => { open: () => void };
    };
  }
}

const defaultSettings: Required<SiteSettings> = {
  heroImage: '/hero-living-bright.webp',
  heroImage2: '/hero-kitchen-bright.webp',
  heroImage3: '/main-bg.webp',
  heroImageAlt: 'WEVE DESIGN 거실 인테리어',
  heroImage2Alt: 'WEVE DESIGN 주방 인테리어',
  heroImage3Alt: 'WEVE DESIGN 공간 인테리어',
  heroLabel: 'RESIDENTIAL REMODELING',
  heroTitle: '오래 보아도 편안한 공간을 만듭니다.',
  heroDescription: '상담, 설계, 시공, 마감 확인까지 한 흐름으로 관리하며 오래 쓰기 편한 공간을 제안합니다.',
  primaryButtonLabel: '상담 신청',
  secondaryButtonLabel: 'Project 보기',
  statementLabel: 'WEVE STANDARD',
  statementTitle: '보여주기 위한 디자인보다, 매일의 생활이 편해지는 완성도를 먼저 생각합니다.',
  statementBody: '공간의 분위기, 동선, 수납, 빛의 방향을 함께 검토해 시간이 지나도 부담스럽지 않은 균형을 제안합니다.',
  projectSectionTitle: 'PROJECT',
  projectButtonLabel: '전체 Project',
  portfolioTitle: 'Project를 둘러보세요.',
  aboutLabel: 'About WEVE',
  aboutTitle: '현장의 조건과 생활 방식을 함께 읽습니다.',
  aboutBody:
    'WEVE DESIGN은 자재의 분위기, 동선, 수납, 빛의 방향을 함께 검토합니다. 공간을 예쁘게 바꾸는 것에서 멈추지 않고, 시간이 지나도 부담스럽지 않은 균형을 제안합니다.',
  processLabel: 'Process',
  processTitle: '상담부터 마감까지 흐름이 보이게 진행합니다.',
  locationLabel: 'Location',
  locationTitle: '전문 인테리어 상담을 시작합니다.',
  address: '경기도 의왕시 오리나무1길 12, 1층',
  lotAddress: '경기도 의왕시 내손동 810-3',
  mapLocation: {
    lat: 37.38104,
    lng: 126.97482,
  },
  phone: '010-6346-3882',
  mapLat: 37.38104,
  mapLng: 126.97482,
  contactLabel: 'Consultation',
  contactTitle: '공간 이야기를 남겨주세요.',
  contactBody: '이름, 연락처, 현장 주소, 원하는 시공 범위를 보내주시면 확인 후 연락드립니다.',
  consultationEmail: 'ehogh1@gmail.com',
  representativeName: '김동호',
  businessNumber: '',
  companyStartYear: '2026',
  consultationPropertyQuestion: '반갑습니다. 고객님! 인테리어가 필요한 공간은 어디인가요?',
  consultationPropertyOptions: '아파트\n빌라\n단독주택\n오피스텔\n상가\n오피스',
  consultationAreaQuestion: '인테리어 공간의 평수를 선택해주세요.',
  consultationAreaOptions: '10~20평대\n30평대\n40평대\n50평대 이상',
  consultationStatusQuestion: '인테리어 할 집은 어떤 상태인가요?',
  consultationStatusOptions: '집보관 후 살면서 공사예정\n현재 공실\n시공 시 공실 예정\n신축입주\n기타 (부동산 미계약 상태)',
  consultationReasonQuestion: '인테리어를 고려하시게 된 주요 이유를 선택해주세요.',
  consultationReasonOptions: '집을 구매하여 리모델링 계획 중\n사는 집을 새롭게 바꾸기 위해\n매매나 임대를 위한 리모델링\n기타',
  consultationBudgetQuestion: '인테리어 예산은 총 얼마를 생각하시나요?',
  consultationBudgetOptions: '5백만원 이하\n1천만원 이하\n2천만원 이하\n3천만원 이하\n4천만원 이하\n5천만원 이하\n6천만원 이하\n7천만원 이하\n1억원 이하\n1억원 이상\n아직 미정이에요',
  consultationTimelineQuestion: '인테리어가 언제 시작되길 희망하시나요?',
  consultationTimelineOptions: '1개월 이내\n2개월 이내\n3개월 이내\n3개월 이후\n6개월 이후',
  consultationPrivacyText:
    '수집 항목: 이름, 연락처, 시공 주소, 상담 설문 답변, 요청사항\n수집 목적: 인테리어 상담, 실측 및 견적 안내, 고객 문의 응대\n보유 기간: 상담 완료 후 1년 또는 고객 삭제 요청 시까지\n제공받는 자: WEVE DESIGN 상담 및 시공 담당자\n동의를 거부할 권리가 있으나, 동의하지 않을 경우 상담 신청이 제한될 수 있습니다.',
  consultationSurveyConfig: '',
  kakaoUrl: 'https://pf.kakao.com/_xxxx',
  kakaoChannelManagerUrl: '',
  popupEnabled: 'false',
  popupLayout: 'imageTop',
  popupPosition: 'center',
  popupWidth: '520',
  popupImageFit: 'cover',
  popupStartDate: '',
  popupEndDate: '',
  popupTitle: '',
  popupBody: '',
  popupButtonLabel: '',
  popupButtonUrl: '',
  popupImage: '',
  popups: [],
};

const fallbackHeroSlides = [
  {
    image: '/hero-living-bright.webp',
    label: 'RESIDENTIAL REMODELING',
    title: '오래 보아도 편안한 공간을 만듭니다.',
  },
  {
    image: '/hero-kitchen-bright.webp',
    label: 'KITCHEN & DINING',
    title: '생활의 중심을 더 밝고 실용적으로 설계합니다.',
  },
  {
    image: '/main-bg.webp',
    label: 'WEVE DESIGN STUDIO',
    title: '현장의 조건에 맞는 균형을 제안합니다.',
  },
];

const serviceLines = ['아파트 전체 리모델링', '주거 공간 부분 시공', '상업 공간 인테리어', '자재 제안 및 현장 관리'];

const initialConsultationData: ConsultationData = {
  propertyType: '',
  areaRange: '',
  homeStatus: '',
  reason: '',
  budget: '',
  timeline: '',
  name: '',
  phone: '',
  postcode: '',
  address: '',
  detailAddress: '',
  message: '',
  privacyAgreed: false,
};

const defaultConsultationSteps: ConsultationStep[] = [
  {
    key: 'propertyType',
    title: '반갑습니다. 고객님! 인테리어가 필요한 공간은 어디인가요?',
    options: ['아파트', '빌라', '단독주택', '오피스텔', '상가', '오피스'],
  },
  {
    key: 'areaRange',
    title: '인테리어 공간의 평수를 선택해주세요.',
    options: ['10~20평대', '30평대', '40평대', '50평대 이상'],
  },
  {
    key: 'homeStatus',
    title: '인테리어 할 집은 어떤 상태인가요?',
    options: ['집보관 후 살면서 공사예정', '현재 공실', '시공 시 공실 예정', '신축입주', '기타 (부동산 미계약 상태)'],
  },
  {
    key: 'reason',
    title: '인테리어를 고려하시게 된 주요 이유를 선택해주세요.',
    options: ['집을 구매하여 리모델링 계획 중', '사는 집을 새롭게 바꾸기 위해', '매매나 임대를 위한 리모델링', '기타'],
  },
  {
    key: 'budget',
    title: '인테리어 예산은 총 얼마를 생각하시나요?',
    description: '예산 선택 시 더 정확한 상담이 가능하며, 상담 중 변경할 수 있습니다.',
    options: ['5백만원 이하', '1천만원 이하', '2천만원 이하', '3천만원 이하', '4천만원 이하', '5천만원 이하', '6천만원 이하', '7천만원 이하', '1억원 이하', '1억원 이상', '아직 미정이에요'],
  },
  {
    key: 'timeline',
    title: '인테리어가 언제 시작되길 희망하시나요?',
    description: '신청일 기준으로 가장 가까운 일정을 골라주세요.',
    options: ['1개월 이내', '2개월 이내', '3개월 이내', '3개월 이후', '6개월 이후'],
  },
] as const;

const defaultConsultationSurveyConfig: ConsultationSurveyConfig = {
  propertyStep: defaultConsultationSteps[0],
  areaGroups: [
    {
      id: 'residential',
      label: '주거 공간',
      propertyOptions: ['아파트', '빌라', '단독주택', '오피스텔'],
      steps: defaultConsultationSteps.slice(1, 4),
    },
    {
      id: 'commercial',
      label: '상업 공간',
      propertyOptions: ['상가', '오피스'],
      steps: [
        {
          key: 'areaRange',
          title: '인테리어 공간의 규모를 선택해주세요.',
          options: ['10평 이하', '10~20평대', '30평대', '40평대', '50평대 이상', '100평 이상'],
        },
        {
          key: 'homeStatus',
          title: '상업 공간은 현재 어떤 상태인가요?',
          options: ['영업 중', '공실', '오픈 준비 중', '계약 전 검토 중', '기타'],
        },
        {
          key: 'reason',
          title: '상업 공간 인테리어를 진행하는 이유를 선택해주세요.',
          options: ['신규 매장 오픈', '기존 매장 리뉴얼', '사무실 이전/확장', '임대/매매를 위한 정비', '기타'],
        },
      ],
    },
  ],
  commonSteps: defaultConsultationSteps.slice(4),
};

const settingOptions = (value: string | undefined, fallback: string[]) => {
  const options = (value || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

  return options.length > 0 ? options : fallback;
};

const parseConsultationSurveyConfig = (settings: SiteSettings): ConsultationSurveyConfig => {
  if (settings.consultationSurveyConfig) {
    try {
      const parsed = JSON.parse(settings.consultationSurveyConfig) as Partial<ConsultationSurveyConfig>;
      if (parsed.propertyStep?.options?.length && parsed.areaGroups?.length && parsed.commonSteps?.length) {
        const parsedCommonSteps = parsed.commonSteps.length > 2 ? parsed.commonSteps.slice(2) : parsed.commonSteps;
        return {
          propertyStep: {
            ...defaultConsultationSurveyConfig.propertyStep,
            ...parsed.propertyStep,
            key: 'propertyType',
          },
          areaGroups: parsed.areaGroups.map((group, index) => ({
            id: group.id || `group-${index + 1}`,
            label: group.label || `묶음 ${index + 1}`,
            propertyOptions: group.propertyOptions?.filter(Boolean) || [],
            steps: (group.steps?.length ? group.steps : [group.step, parsed.commonSteps?.[0], parsed.commonSteps?.[1]])
              .filter(Boolean)
              .slice(0, 3)
              .map((step, stepIndex) => ({
                ...defaultConsultationSteps[stepIndex + 1],
                ...step,
              })) as ConsultationStep[],
          })),
          commonSteps: parsedCommonSteps.map((step, index) => ({
            ...defaultConsultationSurveyConfig.commonSteps[index],
            ...step,
          })) as ConsultationStep[],
        };
      }
    } catch {
      // 관리자 설정이 손상되면 기존 개별 필드 설정으로 안전하게 돌아갑니다.
    }
  }

  return {
    propertyStep: {
      key: 'propertyType',
      title: settings.consultationPropertyQuestion || defaultConsultationSurveyConfig.propertyStep.title,
      options: settingOptions(settings.consultationPropertyOptions, defaultConsultationSurveyConfig.propertyStep.options),
    },
    areaGroups: [
      {
        ...defaultConsultationSurveyConfig.areaGroups[0],
        steps: [
          {
            ...defaultConsultationSteps[1],
            title: settings.consultationAreaQuestion || defaultConsultationSteps[1].title,
            options: settingOptions(settings.consultationAreaOptions, defaultConsultationSteps[1].options),
          },
          {
            ...defaultConsultationSteps[2],
            title: settings.consultationStatusQuestion || defaultConsultationSteps[2].title,
            options: settingOptions(settings.consultationStatusOptions, defaultConsultationSteps[2].options),
          },
          {
            ...defaultConsultationSteps[3],
            title: settings.consultationReasonQuestion || defaultConsultationSteps[3].title,
            options: settingOptions(settings.consultationReasonOptions, defaultConsultationSteps[3].options),
          },
        ],
      },
      defaultConsultationSurveyConfig.areaGroups[1],
    ],
    commonSteps: [
      {
        key: 'budget',
        title: settings.consultationBudgetQuestion || defaultConsultationSteps[4].title,
        description: defaultConsultationSteps[4].description,
        options: settingOptions(settings.consultationBudgetOptions, defaultConsultationSteps[4].options),
      },
      {
        key: 'timeline',
        title: settings.consultationTimelineQuestion || defaultConsultationSteps[5].title,
        description: defaultConsultationSteps[5].description,
        options: settingOptions(settings.consultationTimelineOptions, defaultConsultationSteps[5].options),
      },
    ],
  };
};

const strengths = [
  {
    title: '현장을 직접 보는 관리',
    body: '상담부터 마감 확인까지 한 흐름으로 관리해 결정이 빠르고 결과가 일관됩니다.',
    icon: ShieldCheck,
  },
  {
    title: '사진으로 확인하는 완성도',
    body: '대표 사진과 상세 컷으로 공간의 분위기, 마감, 동선을 확인할 수 있습니다.',
    icon: Camera,
  },
  {
    title: '생활 동선을 먼저 고려',
    body: '보기 좋은 장면보다 오래 쓰기 편한 구조와 수납, 빛의 방향을 먼저 봅니다.',
    icon: Home,
  },
];

const processSteps = [
  {
    number: '01',
    title: '상담',
    body: '원하는 분위기, 예산, 현장 위치를 확인하고 필요한 범위를 정리합니다.',
  },
  {
    number: '02',
    title: '현장 확인',
    body: '구조, 동선, 기존 마감 상태를 보고 실제 가능한 방향을 검토합니다.',
  },
  {
    number: '03',
    title: '제안과 견적',
    body: '우선순위에 맞춰 시공 범위와 자재, 마감 방향을 제안합니다.',
  },
  {
    number: '04',
    title: '시공 관리',
    body: '공정별 체크와 마감 확인으로 완성도를 끝까지 관리합니다.',
  },
];

const constructionModels = [
  {
    id: 'cm',
    label: 'CM 방식',
    eyebrow: 'Construction Management',
    title: '디자인은 고객이 정하고, WEVE는 현장을 관리합니다.',
    summary:
      '원하는 디자인 자료, 레퍼런스, 자재 방향이 이미 있는 고객에게 맞는 방식입니다. 고객이 큰 디자인 방향과 주요 선택을 잡고, WEVE DESIGN은 공정 일정, 현장 소통, 품질 체크, 마감 확인을 맡아 공사가 흔들리지 않도록 중심을 잡습니다. 여러 공정이 동시에 움직이는 리모델링 현장에서 순서와 품질을 놓치지 않게 관리하는 방식입니다.',
    bestFor: '원하는 스타일이 분명하고, 직접 선택해 총 공사 금액을 조정하고 싶은 경우',
    workflow: [
      { title: '레퍼런스 정리', body: '고객이 준비한 이미지, 도면, 자재 방향을 확인하고 구현 가능한 범위를 나눕니다.' },
      { title: '시공 범위 확정', body: '철거, 목공, 전기, 타일, 필름 등 필요한 공정을 분리해 일정과 우선순위를 정합니다.' },
      { title: '현장 조율', body: '공정 간 충돌을 줄이고 현장 상황에 맞춰 순서, 인원, 자재 반입을 조율합니다.' },
      { title: '품질 체크', body: '마감선, 수평·수직, 자재 적용 상태를 확인해 문제를 빠르게 잡습니다.' },
      { title: '마감 확인', body: '고객이 선택한 디자인 의도와 실제 결과가 맞는지 최종 점검합니다.' },
    ],
    customerRole: [
      '원하는 디자인 이미지와 분위기 자료를 준비합니다.',
      '자재, 색감, 가구, 조명 등 주요 디자인 선택을 직접 결정합니다.',
      '예산 우선순위와 꼭 지키고 싶은 부분을 명확히 정합니다.',
      '공사 중 변경하고 싶은 부분이 생기면 빠르게 의사결정합니다.',
    ],
    pros: [
      '디자인 선택권이 큽니다.',
      '공사 현장 관리 부담을 줄일 수 있습니다.',
      '필요한 범위만 맡겨 예산 조정이 유연합니다.',
      '디자인 제안과 통합 관리 범위가 줄어 턴키 방식보다 총 공사 금액이 낮아질 수 있습니다.',
    ],
    cons: ['디자인과 자재 결정은 고객의 판단이 더 많이 필요합니다.', '디자인 책임과 A/S 범위는 참여 주체별로 사전 확인이 필요합니다.'],
  },
  {
    id: 'turnkey',
    label: '턴키 방식',
    eyebrow: 'Turnkey Remodeling',
    title: '디자인 제안부터 마감, 이후 A/S까지 한 흐름으로 맡깁니다.',
    summary:
      '무엇부터 결정해야 할지 막막하거나, 디자인과 시공을 한 회사에서 책임 있게 관리받고 싶은 고객에게 맞는 방식입니다. 생활 방식 상담부터 디자인 제안, 자재 선택, 견적, 공정 관리, 마감 확인, 추후 A/S까지 WEVE DESIGN이 한 흐름으로 관리합니다. 고객은 중요한 취향과 예산 기준을 정하고, 복잡한 실행 과정은 회사가 책임지는 구조입니다.',
    bestFor: '디자인 제안부터 시공 관리와 추후 A/S까지 한 번에 맡기고 싶은 경우',
    workflow: [
      { title: '생활 방식 상담', body: '가족 구성, 수납, 동선, 취향, 예산을 확인해 공간의 방향을 잡습니다.' },
      { title: '디자인 제안', body: '톤앤매너, 자재, 조명, 가구 배치까지 전체 분위기를 함께 제안합니다.' },
      { title: '견적·일정 확정', body: '선택된 디자인을 기준으로 공사 범위, 예산, 공정표를 정리합니다.' },
      { title: '통합 시공 관리', body: '현장 공정과 품질을 한 곳에서 관리해 디자인 의도가 흔들리지 않게 합니다.' },
      { title: '마감·A/S 관리', body: '마감 상태를 확인하고 입주 후 필요한 보완까지 연결해 관리합니다.' },
    ],
    customerRole: [
      '생활 방식, 취향, 예산 범위를 알려줍니다.',
      '제안받은 디자인과 자재 중 마음에 드는 방향을 선택합니다.',
      '공사 전 최종 견적과 일정을 확인합니다.',
      '완료 후 사용 중 불편한 부분을 A/S 기준에 맞춰 공유합니다.',
    ],
    pros: ['결정 과정이 단순해집니다.', '디자인과 시공의 책임 주체가 명확합니다.', '마감 이후 A/S까지 연결해 관리합니다.'],
    cons: ['CM 방식보다 초기 상담과 제안 과정이 더 깊게 진행됩니다.', '전체 범위를 맡기는 만큼 예산 계획을 초기에 더 꼼꼼히 잡아야 합니다.'],
  },
] as const;

const clamp = (value: number, min = 0, max = 1) => Math.min(Math.max(value, min), max);

const optimizedImage = (src: string | undefined, width: number, quality = 88) => {
  if (!src) return '';
  if (!src.includes('cdn.sanity.io')) return src;

  const separator = src.includes('?') ? '&' : '?';
  return `${src}${separator}auto=format&w=${width}&q=${quality}&fit=max`;
};

const mixRgb = (from: [number, number, number], to: [number, number, number], progress: number) => {
  const ratio = clamp(progress);
  const [r, g, b] = from.map((channel, index) => Math.round(channel + (to[index] - channel) * ratio));

  return `rgb(${r} ${g} ${b})`;
};

const formatPhoneNumber = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);

  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};

const locationTitleText = (value?: string) => {
  if (!value || value.includes('안양')) return '전문 인테리어 상담을 시작합니다.';
  return value;
};

const imageObjectPosition = (value?: string, x?: number, y?: number) => {
  if (typeof x === 'number' || typeof y === 'number') {
    return `${Math.round(x ?? 50)}% ${Math.round(y ?? 50)}%`;
  }

  const positions: Record<string, string> = {
    top: 'center top',
    bottom: 'center bottom',
    left: 'left center',
    right: 'right center',
    center: 'center center',
  };

  return positions[value || 'center'] || positions.center;
};

export default function WeveDesignLanding() {
  const [viewMode, setViewMode] = useState<'main' | 'portfolio'>('main');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filter, setFilter] = useState('all');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<'home' | 'about' | 'portfolio' | 'location' | 'contact'>('home');
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);
  const [consultationStep, setConsultationStep] = useState(0);
  const [formData, setFormData] = useState<ConsultationData>(initialConsultationData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('');
  const [submitErrorMessage, setSubmitErrorMessage] = useState('');
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  const [hiddenHomepagePopupKeys, setHiddenHomepagePopupKeys] = useState<string[]>([]);
  const [isHeaderScrolled, setIsHeaderScrolled] = useState(false);
  const [showTopButton, setShowTopButton] = useState(false);
  const [mapStatus, setMapStatus] = useState('');
  const [activeConstructionModel, setActiveConstructionModel] = useState<(typeof constructionModels)[number]['id']>('cm');
  const [methodProgress, setMethodProgress] = useState(0);
  const methodSectionRef = useRef<HTMLElement | null>(null);
  const heroSlides = useMemo(
    () => [
      {
        image: settings.heroImage || defaultSettings.heroImage,
        alt: settings.heroImageAlt || defaultSettings.heroImageAlt,
        label: settings.heroLabel || fallbackHeroSlides[0].label,
        title: settings.heroTitle || fallbackHeroSlides[0].title,
      },
      {
        image: settings.heroImage2 || defaultSettings.heroImage2,
        alt: settings.heroImage2Alt || defaultSettings.heroImage2Alt,
        label: fallbackHeroSlides[1].label,
        title: fallbackHeroSlides[1].title,
      },
      {
        image: settings.heroImage3 || defaultSettings.heroImage3,
        alt: settings.heroImage3Alt || defaultSettings.heroImage3Alt,
        label: fallbackHeroSlides[2].label,
        title: fallbackHeroSlides[2].title,
      },
    ],
    [
      settings.heroImage,
      settings.heroImage2,
      settings.heroImage3,
      settings.heroImageAlt,
      settings.heroImage2Alt,
      settings.heroImage3Alt,
      settings.heroLabel,
      settings.heroTitle,
    ],
  );
  const activeHero = heroSlides[activeHeroIndex] || heroSlides[0];
  const naverMapClientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID || '';
  const consultationSurveyConfig = useMemo(() => parseConsultationSurveyConfig(settings), [settings]);
  const homepagePopups = useMemo(() => normalizeHomepagePopups(settings), [settings]);
  const visibleHomepagePopups = useMemo(
    () => homepagePopups.filter((popup) => popup.enabled === 'true' && isPopupWithinDateRange(popup.startDate, popup.endDate) && !hiddenHomepagePopupKeys.includes(popup._key || '')),
    [homepagePopups, hiddenHomepagePopupKeys],
  );
  const consultationSteps = useMemo<ConsultationStep[]>(() => {
    const selectedAreaGroup =
      consultationSurveyConfig.areaGroups.find((group) => group.propertyOptions.includes(formData.propertyType)) ||
      consultationSurveyConfig.areaGroups[0];

    return [consultationSurveyConfig.propertyStep, ...(selectedAreaGroup.steps || []).slice(0, 3), ...consultationSurveyConfig.commonSteps];
  }, [consultationSurveyConfig, formData.propertyType]);
  const consultationTotalSteps = consultationSteps.length + 1;

  useEffect(() => {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const storageKey = `weve-visit-tracked-${today}`;

    if (window.localStorage.getItem(storageKey)) return;

    window.localStorage.setItem(storageKey, '1');
    fetch('/api/track-visit', { method: 'POST', keepalive: true }).catch(() => {
      window.localStorage.removeItem(storageKey);
    });
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('reveal');
        });
      },
      { threshold: 0.12 },
    );

    document.querySelectorAll('.fade-up, .scroll-reveal, .image-reveal').forEach((element) => {
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, [viewMode, filter, projects]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveHeroIndex((current) => (current + 1) % heroSlides.length);
    }, 5600);

    return () => window.clearInterval(timer);
  }, [heroSlides.length]);

  useEffect(() => {
    if (activeHeroIndex >= heroSlides.length) setActiveHeroIndex(0);
  }, [activeHeroIndex, heroSlides.length]);

  useEffect(() => {
    const updateHeaderTone = () => {
      setIsHeaderScrolled(window.scrollY > 32);
      setShowTopButton(window.scrollY > Math.max(360, window.innerHeight * 0.55));
    };

    updateHeaderTone();
    window.addEventListener('scroll', updateHeaderTone, { passive: true });

    return () => window.removeEventListener('scroll', updateHeaderTone);
  }, []);

  useEffect(() => {
    const updateMethodProgress = () => {
      const section = methodSectionRef.current;
      if (!section) return;

      const rect = section.getBoundingClientRect();
      const viewport = window.innerHeight || 1;
      const progress = clamp((viewport * 0.82 - rect.top) / (viewport * 0.72));

      setMethodProgress(progress);
    };

    updateMethodProgress();
    window.addEventListener('scroll', updateMethodProgress, { passive: true });
    window.addEventListener('resize', updateMethodProgress);

    return () => {
      window.removeEventListener('scroll', updateMethodProgress);
      window.removeEventListener('resize', updateMethodProgress);
    };
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/portfolio', { cache: 'no-store' });
        const data = (await response.json()) as {
          projects?: Project[];
          categories?: Category[];
          settings?: SiteSettings | null;
          error?: string;
        };

        if (!response.ok) throw new Error(data.error || 'Portfolio request failed.');
        setProjects(data.projects || []);
        setCategories(data.categories || []);
        setSettings({ ...defaultSettings, ...(data.settings || {}) });
      } catch (error) {
        console.warn('포트폴리오 데이터를 불러오지 못했습니다.', error);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    const todayKey = new Date().toLocaleDateString('sv-SE');
    const hiddenKeys = homepagePopups
      .filter((popup) => window.localStorage.getItem(`weve-popup-hidden-${todayKey}-${popup._key}`) === 'true')
      .map((popup) => popup._key || '')
      .filter(Boolean);

    setHiddenHomepagePopupKeys(hiddenKeys);
  }, [homepagePopups]);

  useEffect(() => {
    if (!naverMapClientId && viewMode === 'main') {
      setMapStatus('네이버 지도 API 키가 설정되지 않았습니다. Vercel 환경변수와 네이버 클라우드 도메인 등록을 확인해주세요.');
    }
  }, [naverMapClientId, viewMode]);

  useEffect(() => {
    if (viewMode === 'portfolio') {
      setActiveSection('portfolio');
      return;
    }

    const sectionIds = ['home', 'about', 'portfolio-preview', 'location', 'contact'];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visible) return;
        const id = visible.target.id;
        setActiveSection(id === 'portfolio-preview' ? 'portfolio' : (id as typeof activeSection));
      },
      { rootMargin: '-35% 0px -45% 0px', threshold: [0.15, 0.35, 0.55] },
    );

    sectionIds.forEach((id) => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });

    return () => observer.disconnect();
  }, [viewMode]);

  const filteredProjects = useMemo(() => {
    if (filter === 'all') return projects;
    return projects.filter((project) => project.category === filter);
  }, [filter, projects]);

  const featuredProjects = useMemo(() => {
    const featured = projects.filter((project) => project.featured);
    return featured.length > 0 ? featured : projects;
  }, [projects]);
  const loopedFeaturedProjects = useMemo(
    () => (featuredProjects.length > 1 ? [...featuredProjects, ...featuredProjects] : featuredProjects),
    [featuredProjects],
  );
  const projectMarqueeDuration = `${Math.max(featuredProjects.length, 1) * 8.5}s`;
  const categoriesWithCounts = useMemo(
    () =>
      categories.map((category) => ({
        ...category,
        count: projects.filter((project) => project.category === category.value).length,
      })),
    [categories, projects],
  );

  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const roadAddress = settings.address || defaultSettings.address;
  const lotAddress = settings.lotAddress || defaultSettings.lotAddress;
  const mapSearchAddress = lotAddress || roadAddress;
  const pickedMapLocation = settings.mapLocation?.lat && settings.mapLocation?.lng ? settings.mapLocation : defaultSettings.mapLocation;
  const selectedConstructionModel =
    constructionModels.find((model) => model.id === activeConstructionModel) || constructionModels[0];
  const methodBackground = mixRgb([255, 250, 240], [48, 43, 36], methodProgress);
  const methodTextColor = mixRgb([23, 21, 18], [255, 255, 255], methodProgress);
  const methodMutedColor = `rgb(${Math.round(98 + (255 - 98) * methodProgress)} ${Math.round(93 + (255 - 93) * methodProgress)} ${Math.round(84 + (255 - 84) * methodProgress)} / ${0.74 - methodProgress * 0.06})`;
  const methodIsDark = methodProgress > 0.45;

  const handleLogoClick = () => {
    setViewMode('main');
    setSelectedProjectId(null);
    setFilter('all');
    setMobileNavOpen(false);
    setActiveSection('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const showPortfolio = () => {
    setViewMode('portfolio');
    setSelectedProjectId(null);
    setMobileNavOpen(false);
    setActiveSection('portfolio');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToSection = (sectionId: 'home' | 'about' | 'location' | 'contact') => {
    setViewMode('main');
    setSelectedProjectId(null);
    setMobileNavOpen(false);
    setActiveSection(sectionId);

    window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, viewMode === 'portfolio' ? 80 : 0);
  };

  const findAddressByOpenSearch = async (address: string) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ko&q=${encodeURIComponent(address)}`,
      );
      const [result] = (await response.json()) as Array<{ lat?: string; lon?: string }>;

      if (!result?.lat || !result?.lon) return null;

      return {
        lat: Number(result.lat),
        lng: Number(result.lon),
      };
    } catch {
      return null;
    }
  };

  const getMapAddressQueries = (address: string) => {
    const normalized = address
      .replace(/\s*,\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^경기\s/, '경기도 ')
      .trim();
    const withoutFloor = normalized
      .replace(/\s*\d+\s*층\s*$/g, '')
      .replace(/\s*[지하]?\d+\s*F\s*$/gi, '')
      .trim();
    const withoutUnit = withoutFloor
      .replace(/\s*\d+\s*호\s*$/g, '')
      .replace(/\s*\([^)]*\)\s*$/g, '')
      .trim();

    return Array.from(new Set([normalized, withoutFloor, withoutUnit].filter(Boolean)));
  };

  const knownAddressLocation = (address: string) => {
    const normalized = address.replace(/\s+/g, '').replace(/,/g, '');

    if (
      normalized.includes('의왕시') &&
      (normalized.includes('오리나무1길12') || normalized.includes('내손동810-3'))
    ) {
      return { lat: 37.38104, lng: 126.97482 };
    }

    return null;
  };

  const getNaverDirectionsUrl = () =>
    'https://map.naver.com/p/search/%EC%9C%84%EB%B8%8C%EB%94%94%EC%9E%90%EC%9D%B8/place/11883947?placePath=/home?bk_query=%EC%9C%84%EB%B8%8C%EB%94%94%EC%9E%90%EC%9D%B8&entry=pll&from=map&fromNxList=true&fromPanelNum=2&timestamp=202606051356&locale=ko&svcName=map_pcv5&searchText=%EC%9C%84%EB%B8%8C%EB%94%94%EC%9E%90%EC%9D%B8&searchType=place';

  const initMap = () => {
    if (typeof window === 'undefined' || !window.naver || viewMode !== 'main') return;
    const mapElement = document.getElementById('map');
    if (!mapElement) return;

    const address = roadAddress;
    const searchAddress = mapSearchAddress;
    setMapStatus('');
    const addressQueries = getMapAddressQueries(searchAddress);
    const pickedLocation =
      pickedMapLocation?.lat && pickedMapLocation?.lng
        ? {
            lat: pickedMapLocation.lat,
            lng: pickedMapLocation.lng,
          }
        : null;
    const verifiedLocation = knownAddressLocation(searchAddress) || knownAddressLocation(roadAddress);
    const fallbackLat = settings.mapLat || defaultSettings.mapLat;
    const fallbackLng = settings.mapLng || defaultSettings.mapLng;

    const drawMap = (lat: number, lng: number) => {
      const location = new window.naver!.maps.LatLng(lat, lng);
      const directionsUrl = getNaverDirectionsUrl();
      const map = new window.naver!.maps.Map(mapElement, {
        center: location,
        zoom: 17,
        zoomControl: true,
      });
      const marker = new window.naver!.maps.Marker({ position: location, map, title: 'WEVE DESIGN', cursor: 'pointer' });
      const infoWindow = new window.naver!.maps.InfoWindow({
        content: `<div style="padding:14px 16px 16px; min-width:250px; line-height:1.5; color:#222; background:#fff;"><div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;"><img src="/weve-mark.png" alt="" style="width:22px; height:22px; object-fit:contain; border-radius:50%;"/><strong style="display:block;">WEVE DESIGN</strong></div><span style="display:block; font-size:13px;">도로명: ${roadAddress}<br/>지번: ${lotAddress}<br/>인테리어 리모델링 상담</span><div style="margin-top:12px;"><a href="${directionsUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-flex; align-items:center; padding:5px 8px; border-radius:6px; background:#171512; color:#fff; font-size:11px; line-height:1.2; font-weight:700; text-decoration:none; white-space:nowrap;">네이버 지도 길찾기</a></div></div>`,
      });

      window.naver!.maps.Event.addListener(marker, 'click', () => {
        window.open(directionsUrl, '_blank', 'noopener,noreferrer');
      });
      infoWindow.open(map, marker);
    };

    if (pickedLocation) {
      drawMap(pickedLocation.lat, pickedLocation.lng);
      return;
    }

    if (verifiedLocation) {
      drawMap(verifiedLocation.lat, verifiedLocation.lng);
      return;
    }

    const drawKnownOrFallback = () => {
      const knownLocation = knownAddressLocation(searchAddress);

      if (knownLocation) {
        drawMap(knownLocation.lat, knownLocation.lng);
        setMapStatus('');
        return;
      }

      setMapStatus('주소를 찾지 못해 기본 위치를 표시하고 있습니다. 주소를 도로명까지 자세히 입력해 주세요.');
      drawMap(fallbackLat, fallbackLng);
    };

    const geocodeByNaver = (queryIndex = 0) => {
      if (!window.naver?.maps.Service?.geocode || !addressQueries[queryIndex]) {
        return false;
      }

      window.naver.maps.Service.geocode({ query: addressQueries[queryIndex] }, async (status, response) => {
        const result = response?.v2?.addresses?.[0];

        if (status === window.naver!.maps.Service?.Status.OK && result) {
          drawMap(Number(result.y), Number(result.x));
          return;
        }

        if (addressQueries[queryIndex + 1]) {
          geocodeByNaver(queryIndex + 1);
          return;
        }

        const searchedLocation = await findAddressByOpenSearch(addressQueries[addressQueries.length - 1] || searchAddress);
        if (searchedLocation) {
          drawMap(searchedLocation.lat, searchedLocation.lng);
          return;
        }

        drawKnownOrFallback();
      });

      return true;
    };

    if (geocodeByNaver()) return;

    findAddressByOpenSearch(addressQueries[addressQueries.length - 1] || searchAddress).then((searchedLocation) => {
      if (searchedLocation) {
        drawMap(searchedLocation.lat, searchedLocation.lng);
        return;
      }

      drawKnownOrFallback();
    });
  };

  useEffect(() => {
    initMap();
  }, [mapSearchAddress, roadAddress, lotAddress, pickedMapLocation?.lat, pickedMapLocation?.lng, settings.mapLat, settings.mapLng, viewMode]);

  const currentConsultationStep = consultationSteps[consultationStep];
  const consultationProgress = ((consultationStep + 1) / consultationTotalSteps) * 100;

  const resetSubmitMessage = () => {
    setSubmitStatus('');
    setSubmitErrorMessage('');
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = event.target;
    const nextValue =
      type === 'checkbox' && event.target instanceof HTMLInputElement
        ? event.target.checked
        : name === 'phone'
          ? formatPhoneNumber(value)
          : value;

    setFormData((current) => ({ ...current, [name]: nextValue }));
    resetSubmitMessage();
  };

  const selectConsultationOption = (key: ConsultationStepKey, value: string) => {
    setFormData((current) => {
      if (key === 'propertyType' && current.propertyType !== value) {
        return {
          ...current,
          propertyType: value,
          areaRange: '',
          homeStatus: '',
          reason: '',
          budget: '',
          timeline: '',
        };
      }

      return { ...current, [key]: value };
    });
    resetSubmitMessage();
  };

  const isCurrentStepComplete = () => {
    if (consultationStep === consultationTotalSteps - 1) {
      return Boolean(
        formData.name.trim() &&
          formData.phone.trim() &&
          formData.address.trim() &&
          formData.detailAddress.trim() &&
          formData.privacyAgreed,
      );
    }

    return Boolean(formData[currentConsultationStep.key]);
  };

  const goToNextConsultationStep = () => {
    if (!isCurrentStepComplete()) {
      setSubmitStatus('missing');
      return;
    }

    setConsultationStep((step) => Math.min(step + 1, consultationTotalSteps - 1));
    resetSubmitMessage();
  };

  const goToPreviousConsultationStep = () => {
    setConsultationStep((step) => Math.max(step - 1, 0));
    resetSubmitMessage();
  };

  const openPostcodeSearch = () => {
    if (!window.daum?.Postcode) {
      setSubmitStatus('server');
      setSubmitErrorMessage('우편번호 검색을 불러오는 중입니다. 잠시 후 다시 눌러주세요.');
      return;
    }

    new window.daum.Postcode({
      oncomplete: (data) => {
        const baseAddress = data.roadAddress || data.jibunAddress || '';
        const buildingName = data.buildingName && data.apartment === 'Y' ? ` (${data.buildingName})` : '';

        setFormData((current) => ({
          ...current,
          postcode: data.zonecode || '',
          address: `${baseAddress}${buildingName}`.trim(),
          detailAddress: '',
        }));
        resetSubmitMessage();
      },
    }).open();
  };

  const handleSubmit = async () => {
    const payload = {
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      siteType: formData.propertyType.trim(),
      propertyType: formData.propertyType.trim(),
      areaRange: formData.areaRange.trim(),
      homeStatus: formData.homeStatus.trim(),
      reason: formData.reason.trim(),
      budget: formData.budget.trim(),
      timeline: formData.timeline.trim(),
      postcode: formData.postcode.trim(),
      detailAddress: formData.detailAddress.trim(),
      privacyAgreed: formData.privacyAgreed,
      address: formData.address.trim(),
      message: formData.message.trim(),
    };

    if (
      !isCurrentStepComplete() ||
      !payload.propertyType ||
      !payload.areaRange ||
      !payload.homeStatus ||
      !payload.reason ||
      !payload.budget ||
      !payload.timeline ||
      !payload.address ||
      !payload.detailAddress ||
      !payload.privacyAgreed
    ) {
      setSubmitStatus('missing');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/send-consultation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setIsSubmitted(true);
        setConsultationStep(0);
        setFormData(initialConsultationData);
        setSubmitStatus('');
        setSubmitErrorMessage('');
      } else {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setSubmitErrorMessage(data?.error || '상담 신청 전송 설정을 확인해야 합니다.');
        setSubmitStatus('server');
      }
    } catch {
      setSubmitErrorMessage('네트워크 문제로 전송하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      setSubmitStatus('server');
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeHomepagePopup = (popupKey: string, hideToday = false) => {
    if (hideToday) {
      const todayKey = new Date().toLocaleDateString('sv-SE');
      window.localStorage.setItem(`weve-popup-hidden-${todayKey}-${popupKey}`, 'true');
    }
    setHiddenHomepagePopupKeys((current) => (current.includes(popupKey) ? current : [...current, popupKey]));
  };

  if (viewMode === 'portfolio') {
    return (
      <div className="min-h-screen bg-[#fffdf8] text-[#171512]">
        <Header
          mobileNavOpen={mobileNavOpen}
          activeSection={activeSection}
          phone={settings.phone || defaultSettings.phone}
          overlay={false}
          scrolled={isHeaderScrolled}
          onLogoClick={handleLogoClick}
          onPortfolioClick={showPortfolio}
          onSectionClick={scrollToSection}
          onMenuClick={() => setMobileNavOpen((value) => !value)}
        />
        <HomepagePopupWindows popups={visibleHomepagePopups} onClose={closeHomepagePopup} />

        <main className="pb-24">
          <section className="relative flex min-h-[420px] items-center justify-center overflow-hidden px-5 pt-28 text-center text-white md:px-8">
            <img
              src={optimizedImage(settings.heroImage || defaultSettings.heroImage, 2200, 82)}
              alt={settings.heroImageAlt || defaultSettings.heroImageAlt}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-[#171512]/60" />
            <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-[#171512]/65 to-transparent" />
            <div className="relative z-10 fade-up">
              <p className="mb-4 text-sm font-bold uppercase tracking-[0.35em] text-[#f1c76a]">WEVE PROJECT</p>
              <h1 data-preview-target="portfolioTitle" className="text-5xl font-semibold leading-tight tracking-normal md:text-7xl">
                {settings.portfolioTitle || defaultSettings.portfolioTitle}
              </h1>
              <button
                onClick={handleLogoClick}
                className="mx-auto mt-8 inline-flex items-center gap-2 text-sm font-semibold text-white/82 transition hover:text-white"
              >
                <ArrowLeft size={18} />
                홈으로 돌아가기
              </button>
            </div>
          </section>

          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <div className="fade-up -mt-8 relative z-10 mx-auto flex max-w-5xl flex-wrap justify-center gap-2 rounded-lg border border-[#eadfcd] bg-[#fffdf8]/96 px-4 py-4 shadow-[0_18px_55px_rgba(57,46,31,0.11)] backdrop-blur">
              <FilterButton active={filter === 'all'} count={projects.length} onClick={() => setFilter('all')}>
                전체
              </FilterButton>
              {categoriesWithCounts.map((category) => (
                <FilterButton
                  key={category.value}
                  active={filter === category.value}
                  count={category.count}
                  onClick={() => setFilter(category.value)}
                >
                  {category.title}
                </FilterButton>
              ))}
            </div>

            <section className="mt-16 grid gap-x-7 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
              {filteredProjects.map((project) => (
                <PortfolioGalleryCard key={project.id} project={project} onClick={() => setSelectedProjectId(project.id)} />
              ))}
              {filteredProjects.length === 0 && (
                <div className="col-span-full border border-dashed border-[#cfc6b8] bg-white p-10 text-center text-[#625d54]">
                  준비 중인 Project가 없습니다.
                </div>
              )}
            </section>
          </div>
        </main>

        {selectedProject && <ProjectModal project={selectedProject} onClose={() => setSelectedProjectId(null)} />}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fffdf8] text-[#171512]">
      {naverMapClientId && (
        <Script
          strategy="afterInteractive"
          src={`https://openapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(naverMapClientId)}&submodules=geocoder`}
          onReady={initMap}
          onError={() => setMapStatus('네이버 지도 API를 불러오지 못했습니다. API 키와 허용 도메인을 확인해주세요.')}
        />
      )}
      <Script strategy="afterInteractive" src="https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js" />

      <div className="fixed bottom-5 right-5 z-40 flex items-center gap-2">
        {showTopButton && (
          <button
            type="button"
            onClick={scrollToTop}
            aria-label="맨 위로 가기"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d8d1c5] bg-white text-[#171512] shadow-lg transition hover:-translate-y-0.5 hover:bg-[#fff7df]"
          >
            <ArrowUp size={20} />
          </button>
        )}
        <a
          href={settings.kakaoUrl || defaultSettings.kakaoUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="카카오톡 상담"
          className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#FEE500] text-[#3c1e1e] shadow-xl transition hover:scale-105"
        >
          <MessageCircle size={24} />
        </a>
      </div>

      <Header
          mobileNavOpen={mobileNavOpen}
          activeSection={activeSection}
          phone={settings.phone || defaultSettings.phone}
          overlay={viewMode === 'main'}
          scrolled={isHeaderScrolled}
          onLogoClick={handleLogoClick}
          onPortfolioClick={showPortfolio}
          onSectionClick={scrollToSection}
        onMenuClick={() => setMobileNavOpen((value) => !value)}
      />
      <HomepagePopupWindows popups={visibleHomepagePopups} onClose={closeHomepagePopup} />

      <main>
        <section id="home" className="relative min-h-screen overflow-hidden">
          <div className="absolute inset-0">
            {heroSlides.map((slide, index) => (
              <img
                key={slide.image}
                src={optimizedImage(slide.image, 2200, 82)}
                alt={slide.alt}
                className={`absolute inset-0 h-full w-full object-cover transition-all duration-1000 ease-out ${
                  index === activeHeroIndex ? 'hero-slide-active opacity-100' : 'scale-105 opacity-0'
                }`}
                loading={index === activeHeroIndex ? 'eager' : 'lazy'}
                fetchPriority={index === activeHeroIndex ? 'high' : 'auto'}
              />
            ))}
            <div className="absolute inset-0 bg-gradient-to-r from-[#18130d]/86 via-[#2a2118]/38 to-[#17120c]/10" />
            <div className="absolute inset-y-0 left-0 w-[64%] bg-gradient-to-r from-[#1d1710]/74 via-[#2b2117]/34 to-transparent" />
            <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#17120d]/74 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-[#17120d]/42 to-transparent" />
          </div>

          <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-[1600px] items-center px-5 pb-16 pt-28 sm:px-8 md:px-10 lg:px-12 xl:px-16">
            <div className="fade-up w-full max-w-[680px]">
              <p data-preview-target="heroLabel" className="mb-4 font-serif text-xs uppercase tracking-normal text-[#eed7a8] sm:text-sm md:text-base">
                {settings.heroLabel || activeHero.label}
              </p>
              <h1 data-preview-target="heroTitle" className="hero-title max-w-[660px] text-[2.65rem] font-semibold leading-[1.08] tracking-normal text-[#f4dfb8] sm:text-[3.25rem] md:text-[4.1rem] lg:text-[4.55rem]">
                {settings.heroTitle || activeHero.title}
              </h1>
              <div className="hero-ornament my-4 flex max-w-[430px] items-center gap-3 sm:max-w-[470px]" aria-hidden="true">
                <span className="hero-ornament-line" />
                <svg className="hero-ornament-mark" viewBox="0 0 92 20" fill="none">
                  <path d="M8 10h24c5.2 0 7.6-6 14-6s8.8 6 14 6h24" />
                  <path d="M33 10c5.4 0 7.4 5.8 13 5.8S53.6 10 59 10" />
                  <path d="M46 3.2 52.8 10 46 16.8 39.2 10 46 3.2Z" />
                </svg>
                <span className="hero-ornament-line" />
              </div>
              <p data-preview-target="heroDescription" className="max-w-[610px] text-sm leading-7 text-white/90 md:text-base">
                {settings.heroDescription || defaultSettings.heroDescription}
              </p>
              <div className="mt-5 flex max-w-[700px] flex-wrap gap-x-3 gap-y-2 text-xs font-semibold text-white/90">
                {serviceLines.map((service, index) => (
                  <span key={service} className="inline-flex items-center gap-3">
                    <span>{service}</span>
                    {index < serviceLines.length - 1 && <span className="text-[#d7b877]">|</span>}
                  </span>
                ))}
              </div>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#contact"
                  data-preview-target="primaryButtonLabel"
                  className="hover-shine inline-flex items-center justify-center gap-2 rounded-md bg-[#e7ba63] px-5 py-3 text-sm font-semibold text-[#171512] shadow-[0_14px_34px_rgba(191,143,51,0.25)] transition hover:bg-[#f4cf85]"
                >
                  {settings.primaryButtonLabel || defaultSettings.primaryButtonLabel}
                  <ChevronRight size={18} />
                </a>
                <button
                  onClick={showPortfolio}
                  data-preview-target="secondaryButtonLabel"
                  className="hover-shine inline-flex items-center justify-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-semibold text-[#171512] shadow-[0_14px_34px_rgba(0,0,0,0.14)] transition hover:bg-[#fff7df]"
                >
                  {settings.secondaryButtonLabel || defaultSettings.secondaryButtonLabel}
                  <ArrowUpRight size={18} />
                </button>
              </div>
              <div className="mt-7 flex items-center gap-3">
                <span className="h-px w-14 bg-[#d7b877]/72" />
                {heroSlides.map((slide, index) => (
                  <button
                    key={slide.image}
                    onClick={() => setActiveHeroIndex(index)}
                    aria-label={`${slide.label} 배너 보기`}
                    className={`h-2 rounded-full transition-all ${
                      index === activeHeroIndex ? 'w-2 bg-[#e7ba63]' : 'w-2 bg-white/58'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="absolute bottom-8 left-1/2 hidden w-full max-w-[1600px] -translate-x-1/2 items-center gap-4 px-10 text-[10px] font-bold uppercase tracking-[0.24em] text-white/78 md:flex lg:px-12 xl:px-16">
              <span className="h-px w-14 bg-white/55" />
              Scroll
            </div>
          </div>
        </section>

        <section id="statement" className="scroll-reveal bg-white px-5 py-24 md:px-8">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div className="image-reveal aspect-[16/11] overflow-hidden rounded-lg bg-[#eadfcd]">
              <img src="/hero-kitchen-bright.webp" alt="WEVE DESIGN 밝은 주방 인테리어" className="h-full w-full object-cover" loading="lazy" />
            </div>
            <div>
              <p data-preview-target="statementLabel" className="mb-4 text-sm font-bold uppercase tracking-[0.26em] text-[#8f6f43]">
                {settings.statementLabel || defaultSettings.statementLabel}
              </p>
              <h2 data-preview-target="statementTitle" className="max-w-5xl text-4xl font-semibold leading-tight text-[#171512] md:text-6xl">
                {settings.statementTitle || defaultSettings.statementTitle}
              </h2>
              <p data-preview-target="statementBody" className="mt-7 text-lg leading-8 text-[#625d54]">
                {settings.statementBody || defaultSettings.statementBody}
              </p>
            </div>
          </div>
        </section>

        <section id="portfolio-preview" className="scroll-reveal bg-[#fffaf0] px-5 py-24 md:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <h2 data-preview-target="projectSectionTitle" className="text-4xl font-semibold tracking-normal md:text-6xl">
                {settings.projectSectionTitle || defaultSettings.projectSectionTitle}
              </h2>
              <button
                onClick={showPortfolio}
                data-preview-target="projectButtonLabel"
                className="hover-shine inline-flex items-center gap-2 self-start rounded-md border border-[#e3bf68] bg-[#fff7df] px-5 py-3 font-semibold text-[#171512] transition hover:bg-[#f1c76a] md:self-auto"
              >
                {settings.projectButtonLabel || defaultSettings.projectButtonLabel}
                <ArrowUpRight size={18} />
              </button>
            </div>

            <div className="project-marquee -mx-5 overflow-hidden px-5 pb-4 md:-mx-8 md:px-8">
              <div
                className={`flex items-stretch gap-5 ${featuredProjects.length > 1 ? 'project-marquee-track' : ''}`}
                style={{ '--project-marquee-duration': projectMarqueeDuration } as React.CSSProperties}
              >
                {loopedFeaturedProjects.map((project, index) => (
                  <div key={`${project.id}-${index}`} className="w-[280px] shrink-0 sm:w-[340px] lg:w-[390px]">
                    <ProjectCard
                      project={project}
                      onClick={() => setSelectedProjectId(project.id)}
                    />
                  </div>
                ))}
              </div>
              {featuredProjects.length === 0 && (
                <div className="border border-dashed border-[#cfc6b8] bg-white p-10 text-[#625d54]">
                  준비 중인 Project가 없습니다.
                </div>
              )}
            </div>
          </div>
        </section>

        <section id="about" className="scroll-reveal bg-white px-5 py-24 md:px-8">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div className="image-reveal aspect-[4/5] overflow-hidden bg-[#d8d1c5]">
              <img src="/main-bg.webp" alt="WEVE DESIGN 시공 공간" className="h-full w-full object-cover" loading="lazy" />
            </div>
            <div>
              <p data-preview-target="aboutLabel" className="mb-4 text-sm font-bold uppercase tracking-[0.24em] text-[#8f6f43]">
                {settings.aboutLabel || defaultSettings.aboutLabel}
              </p>
              <h2 data-preview-target="aboutTitle" className="text-4xl font-semibold leading-tight tracking-normal md:text-6xl">
                {settings.aboutTitle || defaultSettings.aboutTitle}
              </h2>
              <p data-preview-target="aboutBody" className="mt-7 text-lg leading-8 text-[#625d54]">
                {settings.aboutBody || defaultSettings.aboutBody}
              </p>
              <div className="mt-10 grid gap-4">
                {strengths.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.title}
                      className="motion-card grid gap-4 border border-[#eadfcd] bg-[#fffdf8] p-5 sm:grid-cols-[40px_1fr]"
                    >
                      <Icon className="text-[#8f6f43]" size={26} />
                      <div>
                        <h3 className="text-xl font-semibold">{item.title}</h3>
                        <p className="mt-2 leading-7 text-[#625d54]">{item.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section
          ref={methodSectionRef}
          id="work-method"
          className="method-section scroll-reveal px-5 py-32 md:px-8"
          style={{ backgroundColor: methodBackground, color: methodTextColor }}
        >
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
              <div>
                <p className="mb-4 text-sm font-bold uppercase tracking-[0.28em] text-[#f1c76a]">WORK METHOD</p>
                <h2 className="max-w-3xl text-4xl font-semibold leading-tight tracking-normal md:text-5xl xl:text-6xl">
                  우리 집에 맞는 공사 방식을 먼저 선택합니다.
                </h2>
              </div>
              <p className="method-muted max-w-2xl text-lg leading-9" style={{ color: methodMutedColor }}>
                원하는 디자인을 직접 가져오는지, 디자인 제안부터 사후 관리까지 맡기고 싶은지에 따라 진행 방식이 달라집니다.
                두 방식을 비교한 뒤 상담에서 더 맞는 흐름을 정합니다.
              </p>
            </div>

            <div className="mt-12 grid gap-8 lg:grid-cols-[360px_1fr]">
              <div className="grid gap-3 self-start">
                {constructionModels.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => setActiveConstructionModel(model.id)}
                    className={`group rounded-lg border p-6 text-left transition ${
                      selectedConstructionModel.id === model.id
                        ? 'border-[#f1c76a] bg-[#f1c76a] text-[#171512] shadow-[0_24px_70px_rgba(241,199,106,0.22)]'
                        : methodIsDark
                          ? 'border-white/14 bg-white/[0.055] text-white hover:border-white/34 hover:bg-white/[0.085]'
                          : 'border-[#d8cbb8] bg-white/80 text-[#171512] shadow-sm hover:border-[#8f6f43] hover:bg-white'
                    }`}
                  >
                    <span className="text-xs font-bold uppercase tracking-[0.22em] opacity-70">{model.eyebrow}</span>
                    <span className="mt-3 flex items-center justify-between gap-4 text-2xl font-semibold">
                      {model.label}
                      <ArrowRight className="transition group-hover:translate-x-1" size={22} />
                    </span>
                    <span className="mt-4 block text-sm leading-6 opacity-75">{model.bestFor}</span>
                  </button>
                ))}
              </div>

              <div className="overflow-hidden rounded-lg border border-white/12 bg-[#fffdf8] text-[#171512] shadow-[0_28px_80px_rgba(0,0,0,0.28)]">
                <div className="grid gap-8 p-6 md:p-10">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#8f6f43]">
                      {selectedConstructionModel.eyebrow}
                    </p>
                    <div className="grid gap-8 xl:grid-cols-[1fr_0.48fr] xl:items-end">
                      <div>
                        <h3 className="mt-4 max-w-4xl text-3xl font-semibold leading-[1.16] md:text-4xl xl:text-5xl">
                          {selectedConstructionModel.title}
                        </h3>
                        <p className="mt-6 max-w-4xl text-lg leading-9 text-[#625d54]">{selectedConstructionModel.summary}</p>
                      </div>
                      <div className="rounded-lg border border-[#eadfcd] bg-white p-5">
                        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#8f6f43]">Key point</p>
                        <p className="mt-3 text-lg font-semibold leading-7">{selectedConstructionModel.bestFor}</p>
                      </div>
                    </div>

                    <div className="mt-8 rounded-lg bg-[#302b24] p-5 text-white">
                      <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#f1c76a]">Recommended for</p>
                      <p className="mt-3 text-lg leading-7">{selectedConstructionModel.bestFor}</p>
                    </div>
                    {selectedConstructionModel.id === 'cm' && (
                      <div className="mt-4 rounded-lg border border-[#f1c76a] bg-[#fff7df] p-5">
                        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#8f6f43]">Budget note</p>
                        <p className="mt-3 text-lg font-semibold leading-8 text-[#171512]">
                          CM 방식은 디자인 선택과 일부 의사결정을 고객이 직접 가져가기 때문에, 턴키 방식보다 총 공사 금액을 낮게
                          조정할 수 있는 여지가 있습니다.
                        </p>
                      </div>
                    )}
                    <div className="mt-4 rounded-lg border border-[#eadfcd] bg-[#fffaf0] p-5">
                      <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#8f6f43]">Customer role</p>
                      <h4 className="mt-2 text-xl font-semibold">소비자가 준비하거나 결정하는 부분</h4>
                      <ul className="mt-4 grid gap-3 text-sm leading-6 text-[#625d54] md:grid-cols-2">
                        {selectedConstructionModel.customerRole.map((item) => (
                          <li key={item} className="flex gap-2">
                            <Check className="mt-1 shrink-0 text-[#8f6f43]" size={15} />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="grid gap-5">
                    <div className="rounded-lg border border-[#eadfcd] bg-white p-5 md:p-7">
                      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
                        <div>
                          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#8f6f43]">Workflow</p>
                          <h4 className="mt-2 text-2xl font-semibold">진행 워크플로우</h4>
                        </div>
                        <p className="max-w-md text-sm leading-6 text-[#625d54]">
                          단계별로 결정해야 할 내용과 WEVE가 관리하는 지점을 나누어 보여드립니다.
                        </p>
                      </div>
                      <div className="mt-7 grid gap-4 lg:grid-cols-5">
                        {selectedConstructionModel.workflow.map((step, index) => (
                          <div key={step.title} className="relative">
                            <div className="workflow-step h-full rounded-lg border border-[#eadfcd] bg-[#fffdf8] p-4">
                              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f1c76a] text-sm font-bold text-[#171512]">
                                {String(index + 1).padStart(2, '0')}
                              </span>
                              <h5 className="mt-4 text-lg font-semibold">{step.title}</h5>
                              <p className="mt-3 text-sm leading-6 text-[#625d54]">{step.body}</p>
                            </div>
                            {index < selectedConstructionModel.workflow.length - 1 && (
                              <div className="workflow-arrow hidden lg:flex" aria-hidden="true">
                                <ArrowRight size={18} />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                      <div className="rounded-lg border border-[#dcebdd] bg-[#fbfffb] p-5">
                        <h4 className="text-lg font-semibold text-[#2f7d45]">장점</h4>
                        <ul className="mt-4 grid gap-3 text-sm leading-6 text-[#405044]">
                          {selectedConstructionModel.pros.map((item) => (
                            <li key={item} className="flex gap-2">
                              <Check className="mt-1 shrink-0 text-[#2f7d45]" size={16} />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-lg border border-[#eadfcd] bg-[#fffaf0] p-5">
                        <h4 className="text-lg font-semibold text-[#8f6f43]">확인할 점</h4>
                        <ul className="mt-4 grid gap-3 text-sm leading-6 text-[#625d54]">
                          {selectedConstructionModel.cons.map((item) => (
                            <li key={item} className="flex gap-2">
                              <Sparkles className="mt-1 shrink-0 text-[#8f6f43]" size={15} />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="process" className="scroll-reveal bg-[#fffaf0] px-5 py-24 md:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-12 grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-end">
              <p data-preview-target="processLabel" className="text-sm font-bold uppercase tracking-[0.24em] text-[#8f6f43]">
                {settings.processLabel || defaultSettings.processLabel}
              </p>
              <h2 data-preview-target="processTitle" className="text-4xl font-semibold tracking-normal md:text-6xl">
                {settings.processTitle || defaultSettings.processTitle}
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              {processSteps.map((step) => (
                <div key={step.number} className="motion-card border border-[#eadfcd] bg-white p-6">
                  <span className="text-sm font-bold text-[#8f6f43]">{step.number}</span>
                  <h3 className="mt-8 text-2xl font-semibold">{step.title}</h3>
                  <p className="mt-4 leading-7 text-[#625d54]">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="location" className="scroll-reveal bg-white px-5 py-24 md:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p data-preview-target="locationLabel" className="mb-3 text-sm font-bold uppercase tracking-[0.24em] text-[#8f6f43]">
                {settings.locationLabel || defaultSettings.locationLabel}
              </p>
              <h2 data-preview-target="locationTitle" className="text-4xl font-semibold tracking-normal md:text-5xl">
                {locationTitleText(settings.locationTitle || defaultSettings.locationTitle)}
              </h2>
              <div className="mt-8 space-y-5 text-[#625d54]">
                <p className="flex gap-3">
                  <MapPin className="mt-1 shrink-0 text-[#8f6f43]" size={20} />
                  <span>
                    <span data-preview-target="address" className="block">도로명: {roadAddress}</span>
                    <span data-preview-target="lotAddress" className="mt-1 block text-sm text-[#8b8276]">지번: {lotAddress}</span>
                  </span>
                </p>
                <p className="flex gap-3">
                  <Phone className="mt-1 shrink-0 text-[#8f6f43]" size={20} />
                  <span data-preview-target="phone">{settings.phone || defaultSettings.phone}</span>
                </p>
              </div>
              <p className="mt-10 rounded-md border border-[#eadfcd] bg-[#fffaf0] p-5 text-base leading-7 text-[#625d54]">
                방문 상담은 일정 확인이 필요하니 오시기 전에 연락 부탁드립니다.
              </p>
            </div>
            <div className="relative">
              <div id="map" className="motion-card h-[440px] overflow-hidden rounded-lg border border-[#eadfcd] bg-[#f3ecdf]" />
              {mapStatus && (
                <div className="absolute bottom-4 left-4 right-4 rounded-md bg-white/92 px-4 py-3 text-sm font-semibold text-[#625d54] shadow-lg backdrop-blur">
                  {mapStatus}
                </div>
              )}
            </div>
          </div>
        </section>

        <section id="contact" className="scroll-reveal bg-white px-5 py-20 md:px-8 md:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
            <div>
              <p data-preview-target="contactLabel" className="mb-3 text-sm font-bold uppercase tracking-[0.24em] text-[#8f6f43]">
                {settings.contactLabel || defaultSettings.contactLabel}
              </p>
              <h2 data-preview-target="contactTitle" className="text-4xl font-semibold tracking-normal md:text-6xl">
                {settings.contactTitle || defaultSettings.contactTitle}
              </h2>
              <p data-preview-target="contactBody" className="mt-6 text-lg leading-8 text-[#625d54]">
                {settings.contactBody || defaultSettings.contactBody}
              </p>
              <div className="mt-10 border-t border-[#eadfcd] pt-7">
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#b08a4a]">Before Consultation</p>
                <div className="mt-5 grid gap-3">
                  {[
                    ['01', '시공 주소', '우편번호 검색으로 현장 위치를 정확히 남겨주세요.'],
                    ['02', '공간 상태', '현재 거주 여부와 공사 희망 시기를 알려주세요.'],
                    ['03', '예산 방향', '대략적인 예산만 선택해도 상담 중 조정할 수 있습니다.'],
                  ].map(([number, title, body]) => (
                    <div key={number} className="group grid grid-cols-[42px_1fr] gap-4 border-b border-[#eee6da] py-4">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f8efd9] text-sm font-bold text-[#9a7335] transition group-hover:bg-[#171512] group-hover:text-white">
                        {number}
                      </span>
                      <div>
                        <p className="font-semibold text-[#171512]">{title}</p>
                        <p className="mt-1 text-sm leading-6 text-[#625d54]">{body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex min-h-[560px] flex-col justify-between py-2 lg:py-6">
              {isSubmitted ? (
                <div className="motion-card flex min-h-[520px] flex-col items-center justify-center bg-[#fffdf8] p-8 text-center shadow-sm md:p-12">
                  <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#e9f7ed] text-[#2f8f50]">
                    <Check size={34} />
                  </div>
                  <h3 className="text-3xl font-semibold">상담 신청이 접수되었습니다.</h3>
                  <p className="mt-4 max-w-md text-[#625d54]">관리자 페이지의 상담 요청에 저장했고, 담당자가 확인 후 빠르게 연락드리겠습니다.</p>
                  <button
                    onClick={() => {
                      setIsSubmitted(false);
                      setConsultationStep(0);
                    }}
                    className="hover-shine mt-8 rounded-md bg-[#f1c76a] px-6 py-3 font-semibold text-[#171512] transition hover:bg-[#ffd879]"
                  >
                    새 상담 작성
                  </button>
                </div>
              ) : consultationStep < consultationTotalSteps - 1 ? (
                <>
                  <div>
                    <p data-preview-target="contactLabel" className="text-base font-semibold text-[#8f6f43]">
                      인테리어 상담신청
                    </p>
                    <div className="mt-4 flex items-end justify-between gap-4">
                      <h2 className="max-w-3xl text-3xl font-semibold leading-tight tracking-normal md:text-4xl">
                        {currentConsultationStep.title}
                      </h2>
                      <span className="shrink-0 text-sm font-semibold text-[#8b8276]">{consultationStep + 1} / {consultationTotalSteps}</span>
                    </div>
                    {'description' in currentConsultationStep && currentConsultationStep.description && (
                      <p className="mt-3 text-sm leading-6 text-[#625d54]">{currentConsultationStep.description}</p>
                    )}
                    <div className="mt-8 h-px w-full bg-[#ece6dc]">
                      <div className="h-px bg-[#171512] transition-all duration-300" style={{ width: `${consultationProgress}%` }} />
                    </div>

                    <div className="mt-12 grid gap-5 sm:grid-cols-2">
                      {currentConsultationStep.options.map((option) => {
                        const selected = formData[currentConsultationStep.key] === option;

                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => selectConsultationOption(currentConsultationStep.key, option)}
                            className={`min-h-[68px] rounded-full border px-5 text-base font-semibold transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(57,46,31,0.1)] ${
                              selected
                                ? 'border-[#2f64ff] bg-[#eef2ff] text-[#2f64ff]'
                                : 'border-transparent bg-[#f6f6f6] text-[#171512] hover:border-[#d8d1c5] hover:bg-white'
                            }`}
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>

                    {consultationStep === 5 && (
                      <div className="mt-8 border-t border-[#ece6dc] pt-5 text-sm leading-7 text-[#625d54]">
                        <p>주문량이 몰리는 경우 시공 일정이 다소 지연될 수 있습니다.</p>
                        <p>담당자가 상담 후 가능한 일정과 진행 방식을 함께 안내드립니다.</p>
                      </div>
                    )}

                    {submitStatus === 'missing' && <p className="mt-5 text-sm font-semibold text-red-600">필수 항목을 선택해 주세요.</p>}
                  </div>

                  <div className="mt-12 flex justify-center gap-3">
                    {consultationStep > 0 && (
                      <button
                        type="button"
                        onClick={goToPreviousConsultationStep}
                        className="h-14 min-w-[130px] rounded-full border border-[#171512] px-8 font-semibold transition hover:bg-[#171512] hover:text-white"
                      >
                        이전
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={goToNextConsultationStep}
                      className="h-14 min-w-[220px] rounded-full bg-[#171512] px-10 font-semibold text-white transition hover:bg-[#2f2a23]"
                    >
                      다음
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-base font-semibold text-[#8f6f43]">인테리어 상담신청</p>
                    <div className="mt-5 rounded-none bg-[#eee1d5] px-6 py-7 md:px-10">
                      <h2 className="text-2xl font-semibold">고객님의 소중한 정보는</h2>
                      <p className="mt-2 text-[#625d54]">오직 상담 목적으로만 활용됩니다.</p>
                    </div>
                    <div className="mt-8 flex items-center gap-4">
                      <div className="h-px flex-1 bg-[#171512]" />
                      <span className="text-sm font-semibold text-[#8b8276]">{consultationTotalSteps} / {consultationTotalSteps}</span>
                    </div>

                    <div className="mt-8 grid gap-6">
                      <label className="grid gap-2">
                        <span className="font-semibold">이름 <span className="text-red-500">*</span></span>
                        <input
                          type="text"
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          className="w-full border border-[#d8d1c5] bg-white px-5 py-4 font-medium outline-none transition focus:border-[#171512]"
                          placeholder="이름 입력"
                        />
                      </label>
                      <label className="grid gap-2">
                        <span className="font-semibold">휴대폰번호 <span className="text-red-500">*</span></span>
                        <input
                          type="tel"
                          name="phone"
                          value={formData.phone}
                          onChange={handleChange}
                          inputMode="numeric"
                          maxLength={13}
                          className="w-full border border-[#d8d1c5] bg-white px-5 py-4 font-medium outline-none transition focus:border-[#171512]"
                          placeholder="숫자만 입력"
                        />
                      </label>
                      <div className="grid gap-3">
                        <span className="font-semibold">시공 주소 <span className="text-red-500">*</span></span>
                        <p className="text-sm text-[#8b8276]">우편번호 검색으로 주소를 찾은 뒤 상세 주소를 입력해주세요.</p>
                        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                          <input
                            type="text"
                            name="postcode"
                            value={formData.postcode}
                            readOnly
                            className="w-full bg-[#f7f7f7] px-5 py-4 font-medium text-[#625d54] outline-none"
                            placeholder="우편번호"
                          />
                          <button
                            type="button"
                            onClick={openPostcodeSearch}
                            className="inline-flex items-center justify-center gap-2 border border-[#d8d1c5] bg-white px-5 py-4 font-semibold transition hover:border-[#171512]"
                          >
                            <Search size={18} />
                            우편번호 검색
                          </button>
                        </div>
                        <input
                          type="text"
                          name="address"
                          value={formData.address}
                          readOnly
                          className="w-full bg-[#f7f7f7] px-5 py-4 font-medium text-[#625d54] outline-none"
                          placeholder="주소 입력"
                        />
                        <input
                          type="text"
                          name="detailAddress"
                          value={formData.detailAddress}
                          onChange={handleChange}
                          className="w-full bg-[#f7f7f7] px-5 py-4 font-medium outline-none transition focus:bg-white focus:ring-1 focus:ring-[#171512]"
                          placeholder="상세 주소"
                        />
                      </div>
                      <label className="grid gap-2">
                        <span className="font-semibold">요청사항 <span className="text-[#8b8276]">(선택)</span></span>
                        <textarea
                          name="message"
                          value={formData.message}
                          onChange={handleChange}
                          rows={4}
                          maxLength={300}
                          className="w-full resize-none border border-[#d8d1c5] bg-white px-5 py-4 font-medium outline-none transition focus:border-[#171512]"
                          placeholder="예) 5인 가족이라 짐이 많아요. 수납공간을 넉넉하게 배치하고 싶어요."
                        />
                        <span className="text-right text-xs text-[#8b8276]">({formData.message.length} / 300)</span>
                      </label>
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ece6dc] pt-5 text-sm font-semibold">
                        <label className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            name="privacyAgreed"
                            checked={formData.privacyAgreed}
                            onChange={handleChange}
                            className="h-5 w-5 accent-[#171512]"
                          />
                          <span><span className="text-red-500">(필수)</span> 개인정보 제3자 제공 동의</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowPrivacyPolicy(true)}
                          className="rounded-full border border-[#d8d1c5] px-4 py-2 text-xs font-semibold text-[#625d54] transition hover:border-[#171512] hover:text-[#171512]"
                        >
                          내용 보기
                        </button>
                      </div>
                    </div>

                    {submitStatus === 'missing' && <p className="mt-5 text-sm font-semibold text-red-600">필수 정보를 모두 입력해 주세요.</p>}
                    {submitStatus === 'server' && (
                      <p className="mt-5 text-sm font-semibold text-red-600">
                        {submitErrorMessage || '상담 신청 전송 설정을 확인해야 합니다.'}
                      </p>
                    )}
                  </div>

                  <div className="mt-10 flex justify-center gap-3">
                    <button
                      type="button"
                      onClick={goToPreviousConsultationStep}
                      className="h-14 min-w-[130px] rounded-full border border-[#171512] px-8 font-semibold transition hover:bg-[#171512] hover:text-white"
                    >
                      이전
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={isSubmitting}
                      className="h-14 min-w-[220px] rounded-full bg-[#171512] px-10 font-semibold text-white transition hover:bg-[#2f2a23] disabled:cursor-not-allowed disabled:bg-[#ececec] disabled:text-[#b8b0a3]"
                    >
                      {isSubmitting ? '전송 중...' : '상담신청'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      {showPrivacyPolicy && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#171512]/55 px-4 py-6 backdrop-blur-sm" onClick={() => setShowPrivacyPolicy(false)}>
          <div className="max-h-[82vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-6 shadow-2xl md:p-8" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#8f6f43]">Privacy</p>
                <h3 className="mt-2 text-2xl font-semibold">개인정보 제3자 제공 동의</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPrivacyPolicy(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[#f3efe7] text-xl"
                aria-label="개인정보 동의 내용 닫기"
              >
                ×
              </button>
            </div>
            <div className="mt-6 whitespace-pre-wrap rounded-md border border-[#eadfcd] bg-[#fffdf8] p-5 text-sm leading-7 text-[#625d54]">
              {settings.consultationPrivacyText || defaultSettings.consultationPrivacyText}
            </div>
            <button
              type="button"
              onClick={() => setShowPrivacyPolicy(false)}
              className="mt-6 w-full rounded-md bg-[#171512] px-5 py-3 font-semibold text-white transition hover:bg-[#2f2a23]"
            >
              확인
            </button>
          </div>
        </div>
      )}

      <footer id="footer" className="bg-[#171512] px-5 py-16 text-[#b8b0a3] md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 md:flex-row md:items-end">
          <div>
            <button onClick={handleLogoClick} className="inline-flex" aria-label="WEVE DESIGN 홈으로 이동">
              <img src="/weve-mark.png" alt="WEVE DESIGN" className="brand-mark-on-dark h-16 w-auto" />
            </button>
            <p data-preview-target="heroDescription" className="mt-4 max-w-xl leading-7">{settings.heroDescription || defaultSettings.heroDescription}</p>
          </div>
          <div className="space-y-2 text-sm">
            <p>
              <span data-preview-target="representativeName">대표 {settings.representativeName || defaultSettings.representativeName}</span>
              {' | '}
              <span data-preview-target="phone">연락처 {settings.phone || defaultSettings.phone}</span>
            </p>
            {(settings.businessNumber || defaultSettings.businessNumber) && (
              <p data-preview-target="businessNumber">사업자등록번호 {settings.businessNumber || defaultSettings.businessNumber}</p>
            )}
            <p data-preview-target="address">도로명 {roadAddress}</p>
            <p data-preview-target="lotAddress">지번 {lotAddress}</p>
            <p data-preview-target="companyStartYear" className="pt-4 text-xs uppercase tracking-[0.2em] text-[#81796d]">
              © {settings.companyStartYear || defaultSettings.companyStartYear} WEVE DESIGN. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {selectedProject && <ProjectModal project={selectedProject} onClose={() => setSelectedProjectId(null)} />}
    </div>
  );
}

function normalizeHomepagePopups(settings: SiteSettings): Required<HomepagePopupItem>[] {
  const source =
    Array.isArray(settings.popups) && settings.popups.length > 0
      ? settings.popups
      : settings.popupEnabled === 'true' || settings.popupTitle || settings.popupBody || settings.popupImage
        ? [
            {
              _key: 'popup-main',
              enabled: settings.popupEnabled || 'false',
              layout: settings.popupLayout || 'imageTop',
              position: settings.popupPosition || 'center',
              width: settings.popupWidth || '520',
              imageFit: settings.popupImageFit || 'cover',
              startDate: settings.popupStartDate || '',
              endDate: settings.popupEndDate || '',
              title: settings.popupTitle || '',
              body: settings.popupBody || '',
              buttonLabel: settings.popupButtonLabel || '',
              buttonUrl: settings.popupButtonUrl || '',
              image: settings.popupImage || '',
              imageUrl: settings.popupImage || '',
            },
          ]
        : [];

  return source.map((popup, index) => ({
    _key: popup._key || `popup-${index + 1}`,
    enabled: popup.enabled || 'false',
    layout: popup.layout || 'imageTop',
    position: popup.position || 'center',
    width: popup.width || '520',
    imageFit: popup.imageFit || 'cover',
    startDate: popup.startDate || '',
    endDate: popup.endDate || '',
    title: popup.title || '',
    body: popup.body || '',
    buttonLabel: popup.buttonLabel || '',
    buttonUrl: popup.buttonUrl || '',
    image: popup.image || popup.imageUrl || '',
    imageUrl: popup.imageUrl || popup.image || '',
  }));
}

function HomepagePopupWindows({
  popups,
  onClose,
}: {
  popups: Required<HomepagePopupItem>[];
  onClose: (popupKey: string, hideToday?: boolean) => void;
}) {
  if (popups.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[90]">
      {popups.map((popup, index) => (
        <HomepagePopupWindow key={popup._key} popup={popup} index={index} onClose={onClose} />
      ))}
    </div>
  );
}

function HomepagePopupWindow({
  popup,
  index,
  onClose,
}: {
  popup: Required<HomepagePopupItem>;
  index: number;
  onClose: (popupKey: string, hideToday?: boolean) => void;
}) {
  const [hideToday, setHideToday] = useState(false);
  const layout = popup.layout || 'imageTop';
  const image = popup.imageUrl || popup.image || '';
  const hasImage = Boolean(image);
  const title = popup.title || 'WEVE DESIGN';
  const body = popup.body || '';
  const buttonLabel = popup.buttonLabel || '';
  const buttonUrl = popup.buttonUrl || '';
  const width = Math.min(760, Math.max(320, Number(popup.width || 520) || 520));
  const imageFitClass = popup.imageFit === 'contain' ? 'object-contain' : 'object-cover';

  const handleButtonClick = () => {
    if (!buttonUrl) return;
    onClose(popup._key, hideToday);
    if (buttonUrl.startsWith('#')) {
      window.setTimeout(() => document.querySelector(buttonUrl)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
      return;
    }
    window.open(buttonUrl, '_blank', 'noopener,noreferrer');
  };

  const imageNode = hasImage ? <img src={optimizedImage(image, 900, 86)} alt={title} className={`h-full w-full bg-[#ded7cc] ${imageFitClass}`} /> : null;

  return (
    <div className="pointer-events-auto fixed max-w-[calc(100vw-32px)]" style={popupWindowStyle(popup.position, index, width)}>
      <div className="relative max-h-[calc(100vh-36px)] w-full overflow-y-auto rounded-lg bg-[#fffdf8] shadow-[0_18px_60px_rgba(23,21,18,0.28)] ring-1 ring-[#eadfcd]" style={{ maxWidth: `${layout === 'split' ? Math.max(width, 720) : width}px` }}>
        <button
          type="button"
          onClick={() => onClose(popup._key, hideToday)}
          className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-md bg-transparent text-[#171512] drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)] transition hover:text-[#8f6f43]"
          aria-label="팝업 닫기"
        >
          <X size={20} />
        </button>

        {layout === 'imageOnly' ? (
          hasImage ? <div className="bg-[#ded7cc]">{imageNode}</div> : <div className="flex aspect-square items-center justify-center bg-[#ded7cc] text-sm font-bold text-[#625d54]">이미지 없음</div>
        ) : layout === 'split' ? (
          <div className="grid md:grid-cols-[0.92fr_1fr]">
            {hasImage && <div className="min-h-[260px] bg-[#ded7cc]">{imageNode}</div>}
            <PopupContent title={title} body={body} buttonLabel={buttonLabel} buttonUrl={buttonUrl} onButtonClick={handleButtonClick} />
          </div>
        ) : (
          <>
            {layout !== 'textOnly' && hasImage && <div className="aspect-[16/10] bg-[#ded7cc]">{imageNode}</div>}
            <PopupContent title={title} body={body} buttonLabel={buttonLabel} buttonUrl={buttonUrl} onButtonClick={handleButtonClick} centered={layout === 'textOnly'} />
          </>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-[#eadfcd] bg-[#fffaf0] px-5 py-3">
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#625d54]">
            <input type="checkbox" checked={hideToday} onChange={(event) => setHideToday(event.target.checked)} />
            오늘 하루 보지 않기
          </label>
          <button type="button" onClick={() => onClose(popup._key, hideToday)} className="text-sm font-bold text-[#8f6f43] hover:text-[#171512]">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

function popupWindowStyle(position: string, index: number, width: number): React.CSSProperties {
  const offset = index * 22;
  const maxWidth = Math.min(width, 760);
  const base: React.CSSProperties = { width: `min(${maxWidth}px, calc(100vw - 32px))` };

  if (position === 'topLeft') return { ...base, left: 24 + offset, top: 96 + offset };
  if (position === 'topRight') return { ...base, right: 24 + offset, top: 96 + offset };
  if (position === 'bottomLeft') return { ...base, left: 24 + offset, bottom: 24 + offset };
  if (position === 'bottomRight') return { ...base, right: 24 + offset, bottom: 24 + offset };
  return { ...base, left: '50%', top: '50%', transform: `translate(-50%, calc(-50% + ${offset}px))` };
}

function HomepagePopup({
  settings,
  visible,
  onClose,
}: {
  settings: SiteSettings;
  visible: boolean;
  onClose: (hideToday?: boolean) => void;
}) {
  const [hideToday, setHideToday] = useState(false);
  if (!visible) return null;

  const layout = settings.popupLayout || 'imageTop';
  const hasImage = Boolean(settings.popupImage);
  const title = settings.popupTitle || 'WEVE DESIGN';
  const body = settings.popupBody || '';
  const buttonLabel = settings.popupButtonLabel || '';
  const buttonUrl = settings.popupButtonUrl || '';
  const width = Math.min(760, Math.max(320, Number(settings.popupWidth || 520) || 520));
  const positionClass = popupPositionClass(settings.popupPosition || 'center');
  const imageFitClass = settings.popupImageFit === 'contain' ? 'object-contain' : 'object-cover';

  const handleButtonClick = () => {
    if (!buttonUrl) return;
    onClose(hideToday);
    if (buttonUrl.startsWith('#')) {
      window.setTimeout(() => document.querySelector(buttonUrl)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
      return;
    }
    window.open(buttonUrl, '_blank', 'noopener,noreferrer');
  };

  const image = hasImage ? (
    <img src={optimizedImage(settings.popupImage || '', 900, 86)} alt={title} className={`h-full w-full bg-[#ded7cc] ${imageFitClass}`} />
  ) : null;

  return (
    <div className={`fixed inset-0 z-[90] bg-[#171512]/58 px-4 py-6 backdrop-blur-sm ${positionClass}`}>
      <div className="relative max-h-[calc(100vh-48px)] w-full overflow-y-auto rounded-lg bg-[#fffdf8] shadow-2xl" style={{ maxWidth: `${layout === 'split' ? Math.max(width, 720) : width}px` }}>
        <button
          type="button"
          onClick={() => onClose(hideToday)}
          className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-md bg-transparent text-[#171512] drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)] transition hover:text-[#8f6f43]"
          aria-label="팝업 닫기"
        >
          <X size={20} />
        </button>

        {layout === 'split' ? (
          <div className="grid md:grid-cols-[0.92fr_1fr]">
            {hasImage && <div className="min-h-[260px] bg-[#ded7cc]">{image}</div>}
            <PopupContent title={title} body={body} buttonLabel={buttonLabel} buttonUrl={buttonUrl} onButtonClick={handleButtonClick} />
          </div>
        ) : (
          <>
            {layout !== 'textOnly' && hasImage && <div className="aspect-[16/10] bg-[#ded7cc]">{image}</div>}
            <PopupContent title={title} body={body} buttonLabel={buttonLabel} buttonUrl={buttonUrl} onButtonClick={handleButtonClick} centered={layout === 'textOnly'} />
          </>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-[#eadfcd] bg-[#fffaf0] px-5 py-3">
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#625d54]">
            <input type="checkbox" checked={hideToday} onChange={(event) => setHideToday(event.target.checked)} />
            오늘 하루 보지 않기
          </label>
          <button type="button" onClick={() => onClose(hideToday)} className="text-sm font-bold text-[#8f6f43] hover:text-[#171512]">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

function isPopupWithinDateRange(start?: string, end?: string) {
  const today = new Date().toLocaleDateString('sv-SE');
  if (start && today < start) return false;
  if (end && today > end) return false;
  return true;
}

function popupPositionClass(value: string) {
  const positions: Record<string, string> = {
    topLeft: 'flex items-start justify-start',
    topRight: 'flex items-start justify-end',
    bottomLeft: 'flex items-end justify-start',
    bottomRight: 'flex items-end justify-end',
    center: 'flex items-center justify-center',
  };
  return positions[value] || positions.center;
}

function PopupContent({
  title,
  body,
  buttonLabel,
  buttonUrl,
  onButtonClick,
  centered = false,
}: {
  title: string;
  body: string;
  buttonLabel: string;
  buttonUrl: string;
  onButtonClick: () => void;
  centered?: boolean;
}) {
  return (
    <div className={`grid gap-4 px-6 py-7 md:px-8 md:py-8 ${centered ? 'text-center' : ''}`}>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8f6f43]">WEVE DESIGN</p>
      <h2 className="text-2xl font-semibold leading-tight md:text-3xl">{title}</h2>
      {body && <p className="whitespace-pre-line text-base leading-7 text-[#514c43]">{body}</p>}
      {buttonLabel && buttonUrl && (
        <button
          type="button"
          onClick={onButtonClick}
          className={`hover-shine mt-1 inline-flex items-center justify-center gap-2 rounded-md bg-[#f1c76a] px-5 py-3 text-sm font-bold text-[#171512] shadow-[0_12px_26px_rgba(191,143,51,0.2)] transition hover:-translate-y-0.5 ${centered ? 'mx-auto' : 'self-start'}`}
        >
          {buttonLabel}
          <ArrowUpRight size={16} />
        </button>
      )}
    </div>
  );
}

function Header({
  mobileNavOpen,
  activeSection,
  phone,
  overlay,
  scrolled,
  onLogoClick,
  onPortfolioClick,
  onSectionClick,
  onMenuClick,
}: {
  mobileNavOpen: boolean;
  activeSection: 'home' | 'about' | 'portfolio' | 'location' | 'contact';
  phone: string;
  overlay: boolean;
  scrolled: boolean;
  onLogoClick: () => void;
  onPortfolioClick: () => void;
  onSectionClick: (sectionId: 'home' | 'about' | 'location' | 'contact') => void;
  onMenuClick: () => void;
}) {
  const onDarkHeader = overlay;
  const solidOverlay = overlay && scrolled;
  const navClass = (section: 'home' | 'about' | 'portfolio' | 'location') =>
    `nav-link ${onDarkHeader ? 'nav-link-on-dark' : ''} ${activeSection === section ? 'nav-link-active' : ''}`;
  const headerTone = overlay
    ? solidOverlay
      ? 'border-white/12 bg-[#171512]/84 text-white shadow-[0_16px_45px_rgba(23,21,18,0.18)] backdrop-blur-xl'
      : 'border-white/20 bg-transparent text-white'
    : 'border-[#eadfcd] bg-[#fffdf8]/92 text-[#171512] backdrop-blur';
  const mutedTone = onDarkHeader ? 'text-white/84' : 'text-[#514c43]';
  const activeContact = activeSection === 'contact';

  return (
    <header className={`fixed top-0 z-50 w-full border-b px-5 transition-colors duration-300 sm:px-8 md:px-10 lg:px-12 xl:px-16 ${headerTone}`}>
      <div className="mx-auto flex h-[72px] max-w-[1600px] items-center justify-between md:h-20">
        <button onClick={onLogoClick} className="inline-flex items-center" aria-label="WEVE DESIGN 홈으로 이동">
          <img
            src="/weve-mark.png"
            alt="WEVE DESIGN"
            className={`h-11 w-auto transition md:h-12 ${onDarkHeader ? 'brand-mark-on-dark' : ''}`}
          />
        </button>
        <nav className={`hidden items-center gap-5 text-[15px] font-semibold md:flex lg:gap-7 xl:gap-8 ${mutedTone}`}>
          <button onClick={() => onSectionClick('home')} className={navClass('home')}>
            홈
          </button>
          <button onClick={() => onSectionClick('about')} className={navClass('about')}>
            소개
          </button>
          <button onClick={onPortfolioClick} className={navClass('portfolio')}>
            포트폴리오
          </button>
          <button onClick={() => onSectionClick('location')} className={navClass('location')}>
            오시는 길
          </button>
          <button
            onClick={() => onSectionClick('contact')}
            className={`hover-shine rounded-md px-4 py-2.5 shadow-[0_10px_24px_rgba(191,143,51,0.16)] transition lg:px-5 lg:py-3 ${
              activeContact
                ? 'bg-[#ffd879] text-[#171512]'
                : onDarkHeader
                  ? 'bg-white/16 text-white ring-1 ring-white/38 backdrop-blur hover:bg-[#f1c76a] hover:text-[#171512]'
                  : 'bg-[#f1c76a] text-[#171512] hover:bg-[#ffd879]'
            }`}
          >
            상담 문의
          </button>
          <a href={`tel:${phone}`} className={`inline-flex items-center gap-2 ${onDarkHeader ? 'text-white' : 'text-[#171512]'}`}>
            <Phone size={17} />
            {phone}
          </a>
        </nav>
        <button
          onClick={onMenuClick}
          className={`inline-flex h-11 w-11 items-center justify-center rounded-md border md:hidden ${
            overlay ? 'border-white/34 text-white' : 'border-[#d8d1c5] text-[#171512]'
          }`}
          aria-label="메뉴 열기"
        >
          {mobileNavOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {mobileNavOpen && (
        <nav
          className={`mx-auto grid max-w-[1600px] gap-2 border-t py-4 text-base font-semibold md:hidden ${
            onDarkHeader ? 'border-white/20 bg-[#15120d]/72 text-white backdrop-blur' : 'border-[#eadfcd] text-[#171512]'
          }`}
        >
          <button onClick={() => onSectionClick('home')} className="py-2 text-left">
            홈
          </button>
          <button onClick={() => onSectionClick('about')} className="py-2 text-left">
            소개
          </button>
          <button onClick={onPortfolioClick} className="py-2 text-left">
            포트폴리오
          </button>
          <button onClick={() => onSectionClick('location')} className="py-2 text-left">
            오시는 길
          </button>
          <button onClick={() => onSectionClick('contact')} className="py-2 text-left">
            상담 문의
          </button>
        </nav>
      )}
    </header>
  );
}

function FilterButton({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`hover-shine shrink-0 rounded-full px-5 py-3 text-sm font-semibold transition ${
        active
          ? 'bg-[#f1c76a] text-[#171512] shadow-[0_10px_24px_rgba(191,143,51,0.18)]'
          : 'border border-[#d8d1c5] bg-white text-[#625d54] hover:text-[#171512]'
      }`}
    >
      {children}
      {typeof count === 'number' && <span className="ml-2 text-xs opacity-65">{count}</span>}
    </button>
  );
}

function PortfolioGalleryCard({ project, onClick }: { project: Project; onClick: () => void }) {
  return (
    <button onClick={onClick} className="gallery-card fade-up group block w-full text-left">
      <div className="relative aspect-[4/3] overflow-hidden bg-[#ded7cc]">
        {project.mainImage ? (
          <img
            src={optimizedImage(project.mainImage, 1400, 90)}
            alt={project.mainImageAlt || project.title}
            className="h-full w-full object-cover transition duration-700 group-hover:scale-108"
            style={{ objectPosition: imageObjectPosition(project.mainImagePosition, project.mainImagePositionX, project.mainImagePositionY) }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[#8d8578]">
            <Camera size={44} />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-[#171512]/0 opacity-0 transition duration-300 group-hover:bg-[#171512]/42 group-hover:opacity-100">
          <span className="rounded-full border border-white/50 px-5 py-2 text-sm font-semibold text-white backdrop-blur">
            자세히 보기
          </span>
        </div>
      </div>
      <div className="border-b border-[#d8d1c5] bg-[#fffdf8] px-1 py-5 transition group-hover:border-[#8f6f43]">
        <p className="text-sm font-semibold text-[#8f6f43]">{project.categoryTitle || 'Project'}</p>
        <h3 className="mt-2 text-xl font-semibold tracking-normal text-[#171512]">{project.title}</h3>
        <div className="mt-3 flex flex-wrap gap-3 text-sm text-[#625d54]">
          {project.area && (
            <span className="inline-flex items-center gap-1">
              <Ruler size={15} />
              {project.area}평
            </span>
          )}
          {project.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={15} />
              {project.location}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="project-card-3d motion-card fade-up group flex h-full w-full flex-col overflow-hidden rounded-lg bg-white text-left transition"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[#ded7cc]">
        {project.mainImage ? (
          <img
            src={optimizedImage(project.mainImage, 1400, 90)}
            alt={project.mainImageAlt || project.title}
            className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
            style={{ objectPosition: imageObjectPosition(project.mainImagePosition, project.mainImagePositionX, project.mainImagePositionY) }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[#8d8578]">
            <Camera size={44} />
          </div>
        )}
        <div className="absolute left-4 top-4 rounded-full bg-white/88 px-3 py-1 text-xs font-bold text-[#171512] backdrop-blur">
          {project.categoryTitle || 'Portfolio'}
        </div>
      </div>
      <div className="flex min-h-32 flex-1 flex-col justify-between p-5">
        <h3 className="text-xl font-semibold tracking-normal">{project.title}</h3>
        <div className="mt-4 flex flex-wrap gap-3 text-sm text-[#625d54]">
          {project.area && (
            <span className="inline-flex items-center gap-1">
              <Ruler size={15} />
              {project.area}평
            </span>
          )}
          {project.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={15} />
              {project.location}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function ProjectModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const modalScrollRef = useRef<HTMLDivElement | null>(null);
  const legacyImages =
    project.gallery
      ?.filter((image) => image.url)
      .sort((a, b) => (a.displayOrder ?? 9999) - (b.displayOrder ?? 9999)) || [];
  const groupedImages =
    project.galleryGroups
      ?.filter((group) => group.images?.some((image) => image.url))
      .sort((a, b) => (a.displayOrder ?? 9999) - (b.displayOrder ?? 9999))
      .map((group) => ({
        roomType: group.roomType || '상세',
        title: group.title || group.roomType || '상세',
        images: (group.images || [])
          .filter((image) => image.url)
          .sort((a, b) => (a.displayOrder ?? 9999) - (b.displayOrder ?? 9999)),
      })) || [];
  const imageGroups =
    groupedImages.length > 0
      ? groupedImages
      : legacyImages.reduce<Array<{ roomType: string; title: string; images: GalleryImage[] }>>((groups, image) => {
          const roomType = image.roomType || '상세';
          const existing = groups.find((group) => group.roomType === roomType);

          if (existing) {
            existing.images.push(image);
          } else {
            groups.push({ roomType, title: roomType, images: [image] });
          }

          return groups;
        }, []);
  const detailImageCount = imageGroups.reduce((count, group) => count + group.images.length, 0);
  const defaultProjectIntro = '공간의 분위기와 시공 포인트를 사진으로 확인해 보세요.';

  return (
    <div ref={modalScrollRef} className="fixed inset-0 z-[80] overflow-y-auto bg-[#171512]/72 px-4 py-6 backdrop-blur-sm md:px-8">
      <div className="mx-auto w-full max-w-6xl overflow-hidden bg-[#fffdf8] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#d8d1c5] bg-[#fffdf8]/95 p-5 backdrop-blur">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#8f6f43]">
              {project.categoryTitle || 'Portfolio'}
            </p>
            <h2 className="mt-1 text-2xl font-semibold">{project.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="hover-shine inline-flex h-11 w-11 items-center justify-center rounded-md bg-[#f1c76a] text-[#171512]"
            aria-label="상세 보기 닫기"
          >
            <X size={22} />
          </button>
        </div>

        <div className="grid gap-8 p-5 md:p-8">
          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="min-w-0 overflow-hidden rounded-lg bg-[#ded7cc]">
              {project.mainImage ? (
                <img
                  src={optimizedImage(project.mainImage, 1500)}
                  alt={project.mainImageAlt || project.title}
                  className="block aspect-video w-full object-cover"
                  style={{ objectPosition: imageObjectPosition(project.mainImagePosition, project.mainImagePositionX, project.mainImagePositionY) }}
                />
              ) : (
                <div className="flex aspect-video items-center justify-center text-[#8d8578]">
                  <Camera size={48} />
                </div>
              )}
            </div>
            <aside className="min-w-0 space-y-6">
              <p className="text-lg leading-8 text-[#514c43]">
                {defaultProjectIntro}
              </p>
              <div className="grid gap-3 border-y border-[#d8d1c5] py-5 text-sm">
                {project.location && <InfoRow label="지역" value={project.location} />}
                {project.area && <InfoRow label="면적" value={`${project.area}평`} />}
                {project.year && <InfoRow label="연도" value={project.year} />}
                {project.materials && <InfoRow label="주요 자재" value={project.materials} />}
              </div>
              {project.blogUrl && (
                <div className="grid gap-3">
                  <p className="text-base font-semibold leading-7 text-[#514c43]">
                    자세한 시공 현장을 보고 싶으시다면 블로그를 확인해주세요
                  </p>
                  <a
                    href={project.blogUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hover-shine inline-flex items-center gap-2.5 self-start rounded-md border border-[#d8b461]/70 bg-[#f1c76a] px-3.5 py-2.5 text-sm font-bold text-[#171512] shadow-[0_14px_30px_rgba(191,143,51,0.22)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#ffd879]"
                  >
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/75 text-[#8f6f43] shadow-sm">
                      <ArrowUpRight size={14} />
                    </span>
                    블로그에서 자세히 보기
                    <ArrowUpRight size={15} className="shrink-0" />
                  </a>
                </div>
              )}
              {project.description && (
                <p className="whitespace-pre-line text-lg leading-8 text-[#514c43]">
                  {project.description}
                </p>
              )}
            </aside>
          </div>

          {project.beforeImage && (
            <section>
              <h3 className="mb-4 text-xl font-semibold">시공 전 사진</h3>
              <div className="overflow-hidden rounded-lg bg-[#ded7cc]">
                <img src={optimizedImage(project.beforeImage, 1500)} alt={`${project.title} 시공 전`} className="max-h-[72vh] w-full object-contain" loading="lazy" />
              </div>
            </section>
          )}

          {detailImageCount > 0 && (
            <section>
              <h3 className="mb-4 text-xl font-semibold">상세 사진</h3>
              <div className="grid gap-8">
                {imageGroups.map((group) => (
                  <div key={group.roomType} className="min-w-0">
                    <div className="mb-4 flex items-center gap-3">
                      <span className="h-px flex-1 bg-[#d8d1c5]" />
                      <h4 className="rounded-full bg-[#fff7df] px-4 py-2 text-sm font-bold text-[#8f6f43]">
                        {group.title}
                        <span className="ml-2 text-xs text-[#b09356]">{group.images.length}</span>
                      </h4>
                      <span className="h-px flex-1 bg-[#d8d1c5]" />
                    </div>
                    <ProjectImageSlider group={group} projectTitle={project.title} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectImageSlider({
  group,
  projectTitle,
}: {
  group: { roomType: string; title: string; images: GalleryImage[] };
  projectTitle: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeImage = group.images[Math.min(activeIndex, group.images.length - 1)];
  const canSlide = group.images.length > 1;

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, group.images.length - 1)));
  }, [group.images.length]);

  if (!activeImage?.url) return null;

  const goPrevious = () => {
    setActiveIndex((current) => (current === 0 ? group.images.length - 1 : current - 1));
  };

  const goNext = () => {
    setActiveIndex((current) => (current + 1) % group.images.length);
  };

  return (
    <figure className="overflow-hidden rounded-lg bg-white shadow-sm">
      <div className="relative flex aspect-[4/3] items-center justify-center bg-[#f6f1e8]">
        <img
          src={optimizedImage(activeImage.url, 1400, 90)}
          alt={activeImage.alt || projectTitle}
          className="block h-full w-full object-contain"
          loading="lazy"
        />
        <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-[#171512] backdrop-blur">
          {activeImage.roomType || group.roomType}
        </span>
        {canSlide && (
          <>
            <button
              type="button"
              onClick={goPrevious}
              className="absolute left-4 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#171512] shadow-lg transition hover:bg-white"
              aria-label="이전 사진"
            >
              <ArrowLeft size={18} />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="absolute right-4 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#171512] shadow-lg transition hover:bg-white"
              aria-label="다음 사진"
            >
              <ArrowRight size={18} />
            </button>
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/88 px-3 py-2 shadow-sm backdrop-blur">
              {group.images.map((image, index) => (
                <button
                  key={`${image.url}-${index}`}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`h-2.5 rounded-full transition-all ${activeIndex === index ? 'w-6 bg-[#171512]' : 'w-2.5 bg-[#b8ad9b] hover:bg-[#8f6f43]'}`}
                  aria-label={`${index + 1}번째 사진 보기`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </figure>
  );
}
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[76px_1fr] gap-4">
      <span className="font-semibold text-[#8f6f43]">{label}</span>
      <span className="text-[#514c43]">{value}</span>
    </div>
  );
}
