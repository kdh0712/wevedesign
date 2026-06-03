'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Script from 'next/script';
import {
  ArrowLeft,
  ArrowRight,
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
  featured?: boolean;
  mainImage?: string;
  mainImageAlt?: string;
  beforeImage?: string;
  galleryGroups?: GalleryGroup[];
  gallery?: GalleryImage[];
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
  kakaoUrl?: string;
};

const defaultSettings: Required<SiteSettings> = {
  heroImage: '/hero-living-bright.png',
  heroImage2: '/hero-kitchen-bright.png',
  heroImage3: '/main-bg.png',
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
  locationTitle: '안양에서 상담합니다.',
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
  kakaoUrl: 'https://pf.kakao.com/_xxxx',
};

const fallbackHeroSlides = [
  {
    image: '/hero-living-bright.png',
    label: 'RESIDENTIAL REMODELING',
    title: '오래 보아도 편안한 공간을 만듭니다.',
  },
  {
    image: '/hero-kitchen-bright.png',
    label: 'KITCHEN & DINING',
    title: '생활의 중심을 더 밝고 실용적으로 설계합니다.',
  },
  {
    image: '/main-bg.png',
    label: 'WEVE DESIGN STUDIO',
    title: '현장의 조건에 맞는 균형을 제안합니다.',
  },
];

const serviceLines = ['아파트 전체 리모델링', '주거 공간 부분 시공', '상업 공간 인테리어', '자재 제안 및 현장 관리'];

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

const mixRgb = (from: [number, number, number], to: [number, number, number], progress: number) => {
  const ratio = clamp(progress);
  const [r, g, b] = from.map((channel, index) => Math.round(channel + (to[index] - channel) * ratio));

  return `rgb(${r} ${g} ${b})`;
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
  const [formData, setFormData] = useState({ name: '', phone: '', address: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('');
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  const [isHeaderScrolled, setIsHeaderScrolled] = useState(false);
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
    const updateHeaderTone = () => setIsHeaderScrolled(window.scrollY > 32);

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

  const scrollToSection = (sectionId: 'about' | 'location' | 'contact') => {
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
    const fallbackLocation = new window.naver.maps.LatLng(
      settings.mapLat || defaultSettings.mapLat,
      settings.mapLng || defaultSettings.mapLng,
    );

    const drawMap = (location: unknown) => {
      const map = new window.naver!.maps.Map(mapElement, {
        center: location,
        zoom: 17,
        zoomControl: true,
      });
      const marker = new window.naver!.maps.Marker({ position: location, map, title: 'WEVE DESIGN' });
      const infoWindow = new window.naver!.maps.InfoWindow({
        content: `<div style="padding:14px 16px; min-width:220px; line-height:1.5; color:#222; background:#fff;"><strong style="display:block; margin-bottom:4px;">WEVE DESIGN</strong><span style="font-size:13px;">도로명: ${roadAddress}<br/>지번: ${lotAddress}<br/>인테리어 리모델링 상담</span></div>`,
      });

      window.naver!.maps.Event.addListener(marker, 'click', () => {
        if (infoWindow.getMap()) infoWindow.close();
        else infoWindow.open(map, marker);
      });
      infoWindow.open(map, marker);
    };

    if (pickedLocation) {
      drawMap(new window.naver.maps.LatLng(pickedLocation.lat, pickedLocation.lng));
      return;
    }

    if (verifiedLocation) {
      drawMap(new window.naver.maps.LatLng(verifiedLocation.lat, verifiedLocation.lng));
      return;
    }

    const drawKnownOrFallback = () => {
      const knownLocation = knownAddressLocation(searchAddress);

      if (knownLocation) {
        drawMap(new window.naver!.maps.LatLng(knownLocation.lat, knownLocation.lng));
        setMapStatus('');
        return;
      }

      setMapStatus('주소를 찾지 못해 기본 위치를 표시하고 있습니다. 주소를 도로명까지 자세히 입력해 주세요.');
      drawMap(fallbackLocation);
    };

    const geocodeByNaver = (queryIndex = 0) => {
      if (!window.naver?.maps.Service?.geocode || !addressQueries[queryIndex]) {
        return false;
      }

      window.naver.maps.Service.geocode({ query: addressQueries[queryIndex] }, async (status, response) => {
        const result = response?.v2?.addresses?.[0];

        if (status === window.naver!.maps.Service?.Status.OK && result) {
          drawMap(new window.naver!.maps.LatLng(Number(result.y), Number(result.x)));
          return;
        }

        if (addressQueries[queryIndex + 1]) {
          geocodeByNaver(queryIndex + 1);
          return;
        }

        const searchedLocation = await findAddressByOpenSearch(addressQueries[addressQueries.length - 1] || searchAddress);
        if (searchedLocation) {
          drawMap(new window.naver!.maps.LatLng(searchedLocation.lat, searchedLocation.lng));
          return;
        }

        drawKnownOrFallback();
      });

      return true;
    };

    if (geocodeByNaver()) return;

    findAddressByOpenSearch(addressQueries[addressQueries.length - 1] || searchAddress).then((searchedLocation) => {
      if (searchedLocation) {
        drawMap(new window.naver!.maps.LatLng(searchedLocation.lat, searchedLocation.lng));
        return;
      }

      drawKnownOrFallback();
    });
  };

  useEffect(() => {
    initMap();
  }, [mapSearchAddress, roadAddress, lotAddress, pickedMapLocation?.lat, pickedMapLocation?.lng, settings.mapLat, settings.mapLng, viewMode]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [event.target.name]: event.target.value });
    setSubmitStatus('');
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.phone || !formData.address || !formData.message) {
      setSubmitStatus('error');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/send-consultation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setIsSubmitted(true);
        setFormData({ name: '', phone: '', address: '', message: '' });
      } else {
        setSubmitStatus('error');
      }
    } catch {
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
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

        <main className="pb-24">
          <section className="relative flex min-h-[420px] items-center justify-center overflow-hidden px-5 pt-28 text-center text-white md:px-8">
            <img
              src={settings.heroImage || defaultSettings.heroImage}
              alt={settings.heroImageAlt || defaultSettings.heroImageAlt}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-[#171512]/60" />
            <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-[#171512]/65 to-transparent" />
            <div className="relative z-10 fade-up">
              <p className="mb-4 text-sm font-bold uppercase tracking-[0.35em] text-[#f1c76a]">WEVE PROJECT</p>
              <h1 className="text-5xl font-semibold leading-tight tracking-normal md:text-7xl">
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
      <Script
        strategy="afterInteractive"
        src="https://openapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=nbfvy94d90&submodules=geocoder"
        onReady={initMap}
      />

      <a
        href={settings.kakaoUrl || defaultSettings.kakaoUrl}
        target="_blank"
        rel="noreferrer"
        aria-label="카카오톡 상담"
        className="fixed bottom-5 right-5 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#FEE500] text-[#3c1e1e] shadow-xl transition hover:scale-105"
      >
        <MessageCircle size={28} />
      </a>

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

      <main>
        <section id="home" className="relative min-h-screen overflow-hidden">
          <div className="absolute inset-0">
            {heroSlides.map((slide, index) => (
              <img
                key={slide.image}
                src={slide.image}
                alt={slide.alt}
                className={`absolute inset-0 h-full w-full object-cover transition-all duration-1000 ease-out ${
                  index === activeHeroIndex ? 'hero-slide-active opacity-100' : 'scale-105 opacity-0'
                }`}
              />
            ))}
            <div className="absolute inset-0 bg-gradient-to-r from-[#15120d]/82 via-[#15120d]/34 to-[#15120d]/8" />
            <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-[#15120d]/70 to-transparent" />
          </div>

          <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl items-center px-5 pb-16 pt-28 md:px-8">
            <div className="fade-up max-w-5xl">
              <p className="mb-5 text-sm font-bold uppercase tracking-[0.28em] text-[#f1c76a]">
                {settings.heroLabel || activeHero.label}
              </p>
              <h1 className="max-w-4xl text-5xl font-semibold leading-tight tracking-normal text-white md:text-7xl lg:text-8xl">
                {settings.heroTitle || activeHero.title}
              </h1>
              <p className="mt-8 max-w-2xl text-lg leading-8 text-white/86 md:text-xl">
                {settings.heroDescription || defaultSettings.heroDescription}
              </p>
              <div className="mt-6 flex max-w-4xl flex-wrap gap-x-3 gap-y-2 text-sm font-semibold text-white/88 md:text-base">
                {serviceLines.map((service, index) => (
                  <span key={service} className="inline-flex items-center gap-3">
                    <span>{service}</span>
                    {index < serviceLines.length - 1 && <span className="text-[#f1c76a]">|</span>}
                  </span>
                ))}
              </div>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#contact"
                  className="hover-shine inline-flex items-center justify-center gap-2 rounded-md bg-[#f1c76a] px-7 py-4 font-semibold text-[#171512] shadow-[0_12px_30px_rgba(191,143,51,0.22)] transition hover:bg-[#ffd879]"
                >
                  {settings.primaryButtonLabel || defaultSettings.primaryButtonLabel}
                  <ChevronRight size={18} />
                </a>
                <button
                  onClick={showPortfolio}
                  className="hover-shine inline-flex items-center justify-center gap-2 rounded-md border border-[#171512] bg-white/80 px-7 py-4 font-semibold text-[#171512] backdrop-blur transition hover:bg-white"
                >
                  {settings.secondaryButtonLabel || defaultSettings.secondaryButtonLabel}
                  <ArrowUpRight size={18} />
                </button>
              </div>
              <div className="mt-9 flex gap-2">
                {heroSlides.map((slide, index) => (
                  <button
                    key={slide.image}
                    onClick={() => setActiveHeroIndex(index)}
                    aria-label={`${slide.label} 배너 보기`}
                    className={`h-1.5 rounded-full transition-all ${
                      index === activeHeroIndex ? 'w-12 bg-[#f1c76a]' : 'w-5 bg-white/50'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="absolute bottom-8 left-5 hidden items-center gap-4 text-xs font-bold uppercase tracking-[0.24em] text-white/78 md:flex">
              <span className="h-px w-14 bg-white/55" />
              Scroll
            </div>
          </div>
        </section>

        <section className="scroll-reveal bg-white px-5 py-24 md:px-8">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div className="image-reveal aspect-[16/11] overflow-hidden rounded-lg bg-[#eadfcd]">
              <img src="/hero-kitchen-bright.png" alt="WEVE DESIGN 밝은 주방 인테리어" className="h-full w-full object-cover" />
            </div>
            <div>
              <p className="mb-4 text-sm font-bold uppercase tracking-[0.26em] text-[#8f6f43]">
                {settings.statementLabel || defaultSettings.statementLabel}
              </p>
              <h2 className="max-w-5xl text-4xl font-semibold leading-tight text-[#171512] md:text-6xl">
                {settings.statementTitle || defaultSettings.statementTitle}
              </h2>
              <p className="mt-7 text-lg leading-8 text-[#625d54]">
                {settings.statementBody || defaultSettings.statementBody}
              </p>
            </div>
          </div>
        </section>

        <section id="portfolio-preview" className="scroll-reveal bg-[#fffaf0] px-5 py-24 md:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <h2 className="text-4xl font-semibold tracking-normal md:text-6xl">
                {settings.projectSectionTitle || defaultSettings.projectSectionTitle}
              </h2>
              <button
                onClick={showPortfolio}
                className="hover-shine inline-flex items-center gap-2 self-start rounded-md border border-[#e3bf68] bg-[#fff7df] px-5 py-3 font-semibold text-[#171512] transition hover:bg-[#f1c76a] md:self-auto"
              >
                {settings.projectButtonLabel || defaultSettings.projectButtonLabel}
                <ArrowUpRight size={18} />
              </button>
            </div>

            <div className="portfolio-scroll -mx-5 overflow-x-auto px-5 pb-4 md:-mx-8 md:px-8">
              <div className="flex items-stretch gap-5">
                {featuredProjects.map((project) => (
                  <div key={project.id} className="w-[280px] shrink-0 sm:w-[340px] lg:w-[390px]">
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
              <img src="/main-bg.png" alt="WEVE DESIGN 시공 공간" className="h-full w-full object-cover" />
            </div>
            <div>
              <p className="mb-4 text-sm font-bold uppercase tracking-[0.24em] text-[#8f6f43]">
                {settings.aboutLabel || defaultSettings.aboutLabel}
              </p>
              <h2 className="text-4xl font-semibold leading-tight tracking-normal md:text-6xl">
                {settings.aboutTitle || defaultSettings.aboutTitle}
              </h2>
              <p className="mt-7 text-lg leading-8 text-[#625d54]">
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

        <section className="scroll-reveal bg-[#fffaf0] px-5 py-24 md:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-12 grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-end">
              <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#8f6f43]">
                {settings.processLabel || defaultSettings.processLabel}
              </p>
              <h2 className="text-4xl font-semibold tracking-normal md:text-6xl">
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
              <p className="mb-3 text-sm font-bold uppercase tracking-[0.24em] text-[#8f6f43]">
                {settings.locationLabel || defaultSettings.locationLabel}
              </p>
              <h2 className="text-4xl font-semibold tracking-normal md:text-5xl">
                {settings.locationTitle || defaultSettings.locationTitle}
              </h2>
              <div className="mt-8 space-y-5 text-[#625d54]">
                <p className="flex gap-3">
                  <MapPin className="mt-1 shrink-0 text-[#8f6f43]" size={20} />
                  <span>
                    <span className="block">도로명: {roadAddress}</span>
                    <span className="mt-1 block text-sm text-[#8b8276]">지번: {lotAddress}</span>
                  </span>
                </p>
                <p className="flex gap-3">
                  <Phone className="mt-1 shrink-0 text-[#8f6f43]" size={20} />
                  {settings.phone || defaultSettings.phone}
                </p>
              </div>
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

        <section id="contact" className="scroll-reveal px-5 py-24 md:px-8">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="mb-3 text-sm font-bold uppercase tracking-[0.24em] text-[#8f6f43]">
                {settings.contactLabel || defaultSettings.contactLabel}
              </p>
              <h2 className="text-4xl font-semibold tracking-normal md:text-6xl">
                {settings.contactTitle || defaultSettings.contactTitle}
              </h2>
              <p className="mt-6 text-lg leading-8 text-[#625d54]">
                {settings.contactBody || defaultSettings.contactBody}
              </p>
            </div>

            <div className="motion-card bg-white p-6 shadow-sm md:p-10">
              {isSubmitted ? (
                <div className="py-16 text-center">
                  <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#e9f7ed] text-[#2f8f50]">
                    <Check size={34} />
                  </div>
                  <h3 className="text-3xl font-semibold">상담 신청이 접수되었습니다.</h3>
                  <p className="mt-4 text-[#625d54]">확인 후 빠르게 연락드리겠습니다.</p>
                  <button
                    onClick={() => setIsSubmitted(false)}
                    className="hover-shine mt-8 rounded-md bg-[#f1c76a] px-6 py-3 font-semibold text-[#171512] transition hover:bg-[#ffd879]"
                  >
                    새 상담 작성
                  </button>
                </div>
              ) : (
                <div className="grid gap-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      className="w-full rounded-md border border-[#d8d1c5] bg-[#fbfaf7] px-5 py-4 font-medium outline-none transition focus:border-[#8f6f43]"
                      placeholder="이름 *"
                    />
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      className="w-full rounded-md border border-[#d8d1c5] bg-[#fbfaf7] px-5 py-4 font-medium outline-none transition focus:border-[#8f6f43]"
                      placeholder="연락처 *"
                    />
                  </div>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    className="w-full rounded-md border border-[#d8d1c5] bg-[#fbfaf7] px-5 py-4 font-medium outline-none transition focus:border-[#8f6f43]"
                    placeholder="현장 위치 또는 주소 *"
                  />
                  <textarea
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    rows={5}
                    className="w-full resize-none rounded-md border border-[#d8d1c5] bg-[#fbfaf7] px-5 py-4 font-medium outline-none transition focus:border-[#8f6f43]"
                    placeholder="문의 내용 *"
                  />
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="hover-shine rounded-md bg-[#f1c76a] px-6 py-5 text-lg font-semibold text-[#171512] shadow-[0_12px_30px_rgba(191,143,51,0.18)] transition hover:bg-[#ffd879] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? '전송 중...' : '상담 신청하기'}
                  </button>
                  {submitStatus === 'error' && <p className="text-sm font-semibold text-red-600">필수 정보를 모두 입력해 주세요.</p>}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#171512] px-5 py-16 text-[#b8b0a3] md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 md:flex-row md:items-end">
          <div>
            <button onClick={handleLogoClick} className="inline-flex" aria-label="WEVE DESIGN 홈으로 이동">
              <img src="/weve-mark.png" alt="WEVE DESIGN" className="brand-mark-on-dark h-16 w-auto" />
            </button>
            <p className="mt-4 max-w-xl leading-7">{settings.heroDescription || defaultSettings.heroDescription}</p>
          </div>
          <div className="space-y-2 text-sm">
            <p>대표: 김현종 | 연락처: {settings.phone || defaultSettings.phone}</p>
            <p>도로명: {roadAddress}</p>
            <p>지번: {lotAddress}</p>
            <p className="pt-4 text-xs uppercase tracking-[0.2em] text-[#81796d]">© 2026 WEVE DESIGN. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {selectedProject && <ProjectModal project={selectedProject} onClose={() => setSelectedProjectId(null)} />}
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
  onSectionClick: (sectionId: 'about' | 'location' | 'contact') => void;
  onMenuClick: () => void;
}) {
  const onDarkHeader = overlay;
  const solidOverlay = overlay && scrolled;
  const navClass = (section: 'about' | 'portfolio' | 'location') =>
    `nav-link ${onDarkHeader ? 'nav-link-on-dark' : ''} ${activeSection === section ? 'nav-link-active' : ''}`;
  const headerTone = overlay
    ? solidOverlay
      ? 'border-white/12 bg-[#171512]/84 text-white shadow-[0_16px_45px_rgba(23,21,18,0.18)] backdrop-blur-xl'
      : 'border-white/20 bg-transparent text-white'
    : 'border-[#eadfcd] bg-[#fffdf8]/92 text-[#171512] backdrop-blur';
  const mutedTone = onDarkHeader ? 'text-white/84' : 'text-[#514c43]';
  const activeContact = activeSection === 'contact';

  return (
    <header className={`fixed top-0 z-50 w-full border-b px-5 transition-colors duration-300 md:px-8 ${headerTone}`}>
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between">
        <button onClick={onLogoClick} className="inline-flex items-center" aria-label="WEVE DESIGN 홈으로 이동">
          <img
            src="/weve-mark.png"
            alt="WEVE DESIGN"
            className={`h-12 w-auto transition ${onDarkHeader ? 'brand-mark-on-dark' : ''}`}
          />
        </button>
        <nav className={`hidden items-center gap-8 text-sm font-semibold md:flex ${mutedTone}`}>
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
            className={`hover-shine rounded-md px-5 py-3 shadow-[0_10px_24px_rgba(191,143,51,0.16)] transition ${
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
          className={`mx-auto grid max-w-7xl gap-2 border-t py-4 text-base font-semibold md:hidden ${
            onDarkHeader ? 'border-white/20 bg-[#15120d]/72 text-white backdrop-blur' : 'border-[#eadfcd] text-[#171512]'
          }`}
        >
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
            src={project.mainImage}
            alt={project.mainImageAlt || project.title}
            className="h-full w-full object-cover transition duration-700 group-hover:scale-108"
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
      <div className="relative aspect-[4/5] overflow-hidden bg-[#ded7cc]">
        {project.mainImage ? (
          <img
            src={project.mainImage}
            alt={project.mainImageAlt || project.title}
            className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
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

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#171512]/72 px-4 py-6 backdrop-blur-sm md:px-8">
      <div className="mx-auto max-w-6xl bg-[#fffdf8] shadow-2xl">
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
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="overflow-hidden rounded-lg bg-[#ded7cc]">
              {project.mainImage ? (
                <img
                  src={project.mainImage}
                  alt={project.mainImageAlt || project.title}
                  className="h-full max-h-[720px] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-video items-center justify-center text-[#8d8578]">
                  <Camera size={48} />
                </div>
              )}
            </div>
            <aside className="space-y-6">
              <p className="text-lg leading-8 text-[#514c43]">
                {project.description || '공간의 분위기와 시공 포인트를 사진으로 확인해 보세요.'}
              </p>
              <div className="grid gap-3 border-y border-[#d8d1c5] py-5 text-sm">
                {project.location && <InfoRow label="지역" value={project.location} />}
                {project.area && <InfoRow label="면적" value={`${project.area}평`} />}
                {project.year && <InfoRow label="연도" value={project.year} />}
                {project.materials && <InfoRow label="주요 자재" value={project.materials} />}
              </div>
            </aside>
          </div>

          {project.beforeImage && (
            <section>
              <h3 className="mb-4 text-xl font-semibold">시공 전 사진</h3>
              <div className="overflow-hidden rounded-lg bg-[#ded7cc]">
                <img src={project.beforeImage} alt={`${project.title} 시공 전`} className="w-full object-cover" />
              </div>
            </section>
          )}

          {detailImageCount > 0 && (
            <section>
              <h3 className="mb-4 text-xl font-semibold">상세 사진</h3>
              <div className="grid gap-8">
                {imageGroups.map((group) => (
                  <div key={group.roomType}>
                    <div className="mb-4 flex items-center gap-3">
                      <span className="h-px flex-1 bg-[#d8d1c5]" />
                      <h4 className="rounded-full bg-[#fff7df] px-4 py-2 text-sm font-bold text-[#8f6f43]">
                        {group.title}
                        <span className="ml-2 text-xs text-[#b09356]">{group.images.length}</span>
                      </h4>
                      <span className="h-px flex-1 bg-[#d8d1c5]" />
                    </div>
                    <div className="portfolio-scroll -mx-2 overflow-x-auto px-2 pb-4">
                      <div className="flex gap-4">
                      {group.images.map((image, index) => (
                        <figure key={`${image.url}-${index}`} className="w-[280px] shrink-0 overflow-hidden rounded-lg bg-white shadow-sm sm:w-[360px] lg:w-[520px]">
                          <div className="relative">
                            <img
                              src={image.url}
                              alt={image.alt || image.caption || project.title}
                              className="aspect-[4/3] w-full object-cover"
                            />
                            <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-[#171512] backdrop-blur">
                              {image.roomType || group.roomType}
                            </span>
                          </div>
                          {image.caption && (
                            <figcaption className="px-4 py-3 text-sm font-medium text-[#625d54]">{image.caption}</figcaption>
                          )}
                        </figure>
                      ))}
                      </div>
                    </div>
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[76px_1fr] gap-4">
      <span className="font-semibold text-[#8f6f43]">{label}</span>
      <span className="text-[#514c43]">{value}</span>
    </div>
  );
}
