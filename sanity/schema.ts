import { defineField, defineType, type SchemaTypeDefinition } from 'sanity';
import { HomepagePreview } from './HomepagePreview';
import { MapLocationInput } from './MapLocationInput';

const siteSettings = defineType({
  name: 'siteSettings',
  title: '홈페이지 전체 수정',
  type: 'document',
  initialValue: {
    title: 'WEVE DESIGN 홈페이지 설정',
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
    representativeName: '김동호',
    companyStartYear: '2026',
    phone: '010-6346-3882',
    address: '경기도 의왕시 오리나무1길 12, 1층',
    lotAddress: '경기도 의왕시 내손동 810-3',
    mapLocation: {
      lat: 37.38104,
      lng: 126.97482,
    },
    mapLat: 37.38104,
    mapLng: 126.97482,
  },
  groups: [
    { name: 'hero', title: '메인 첫 화면', default: true },
    { name: 'sections', title: '중간 섹션 문구' },
    { name: 'location', title: '오시는 길 / 상담' },
    { name: 'popup', title: '홈페이지 팝업' },
  ],
  fields: [
    defineField({
      name: 'heroScreenPreview',
      title: '메인 첫 화면 위치 확인',
      type: 'string',
      readOnly: true,
      group: 'hero',
      components: { input: HomepagePreview },
      options: {
        sectionId: 'home',
        previewTitle: '메인 첫 화면 미리보기',
        previewBody: '배너 사진, 큰 제목, 설명, 버튼 문구가 이 영역에 보입니다.',
      } as Record<string, string>,
    }),
    defineField({
      name: 'title',
      title: '관리용 이름',
      type: 'string',
      initialValue: 'WEVE DESIGN 홈페이지 설정',
      readOnly: true,
      group: 'hero',
    }),
    defineField({
      name: 'heroImage',
      title: '배너 사진 1',
      type: 'image',
      group: 'hero',
      options: { hotspot: true },
      description: '첫 화면에서 가장 먼저 보이는 큰 배너 사진입니다.',
      fields: [
        defineField({
          name: 'alt',
          title: '사진 설명',
          type: 'string',
          description: '검색과 접근성을 위한 짧은 설명입니다. 예: 밝은 거실 리모델링',
        }),
      ],
    }),
    defineField({
      name: 'heroImage2',
      title: '배너 사진 2',
      type: 'image',
      group: 'hero',
      options: { hotspot: true },
      description: '자동으로 넘어가는 두 번째 배너 사진입니다.',
      fields: [
        defineField({
          name: 'alt',
          title: '사진 설명',
          type: 'string',
        }),
      ],
    }),
    defineField({
      name: 'heroImage3',
      title: '배너 사진 3',
      type: 'image',
      group: 'hero',
      options: { hotspot: true },
      description: '자동으로 넘어가는 세 번째 배너 사진입니다.',
      fields: [
        defineField({
          name: 'alt',
          title: '사진 설명',
          type: 'string',
        }),
      ],
    }),
    defineField({
      name: 'heroLabel',
      title: '첫 화면 작은 영문 문구',
      type: 'string',
      group: 'hero',
      description: '예: RESIDENTIAL REMODELING',
    }),
    defineField({
      name: 'heroTitle',
      title: '첫 화면 큰 제목',
      type: 'string',
      group: 'hero',
      description: '홈페이지 첫 화면에서 가장 크게 보이는 문구입니다.',
    }),
    defineField({
      name: 'heroDescription',
      title: '첫 화면 설명',
      type: 'text',
      rows: 3,
      group: 'hero',
    }),
    defineField({
      name: 'popupEnabled',
      title: '팝업 사용',
      type: 'string',
      initialValue: 'false',
      group: 'popup',
      options: {
        list: [
          { title: '사용 안 함', value: 'false' },
          { title: '사용', value: 'true' },
        ],
      },
    }),
    defineField({
      name: 'popupLayout',
      title: '팝업 레이아웃',
      type: 'string',
      initialValue: 'imageTop',
      group: 'popup',
      options: {
        list: [
          { title: '이미지 상단형', value: 'imageTop' },
          { title: '좌우 분할형', value: 'split' },
          { title: '글 중심형', value: 'textOnly' },
        ],
      },
    }),
    defineField({
      name: 'popupPosition',
      title: '팝업 위치',
      type: 'string',
      initialValue: 'center',
      group: 'popup',
      options: {
        list: [
          { title: '중앙', value: 'center' },
          { title: '좌측 상단', value: 'topLeft' },
          { title: '우측 상단', value: 'topRight' },
          { title: '좌측 하단', value: 'bottomLeft' },
          { title: '우측 하단', value: 'bottomRight' },
        ],
      },
    }),
    defineField({
      name: 'popupWidth',
      title: '팝업 너비(px)',
      type: 'string',
      initialValue: '520',
      group: 'popup',
    }),
    defineField({
      name: 'popupImageFit',
      title: '이미지 표시 방식',
      type: 'string',
      initialValue: 'cover',
      group: 'popup',
      options: {
        list: [
          { title: '영역 채우기', value: 'cover' },
          { title: '전체 보이기', value: 'contain' },
        ],
      },
    }),
    defineField({ name: 'popupStartDate', title: '노출 시작일', type: 'date', group: 'popup' }),
    defineField({ name: 'popupEndDate', title: '노출 종료일', type: 'date', group: 'popup' }),
    defineField({
      name: 'popupImage',
      title: '팝업 이미지',
      type: 'image',
      group: 'popup',
      options: { hotspot: true },
    }),
    defineField({ name: 'popupTitle', title: '팝업 제목', type: 'string', group: 'popup' }),
    defineField({ name: 'popupBody', title: '팝업 내용', type: 'text', rows: 5, group: 'popup' }),
    defineField({ name: 'popupButtonLabel', title: '팝업 버튼 문구', type: 'string', group: 'popup' }),
    defineField({ name: 'popupButtonUrl', title: '팝업 버튼 링크', type: 'url', group: 'popup' }),
    defineField({
      name: 'popups',
      title: '팝업 목록',
      type: 'array',
      group: 'popup',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'enabled', title: '노출 여부', type: 'string', initialValue: 'false' }),
            defineField({ name: 'layout', title: '레이아웃', type: 'string', initialValue: 'imageTop' }),
            defineField({ name: 'position', title: '위치', type: 'string', initialValue: 'center' }),
            defineField({ name: 'width', title: '너비(px)', type: 'string', initialValue: '520' }),
            defineField({ name: 'imageFit', title: '이미지 표시', type: 'string', initialValue: 'cover' }),
            defineField({ name: 'startDate', title: '노출 시작일', type: 'date' }),
            defineField({ name: 'endDate', title: '노출 종료일', type: 'date' }),
            defineField({ name: 'imageUrl', title: '이미지 URL', type: 'url' }),
            defineField({ name: 'title', title: '제목', type: 'string' }),
            defineField({ name: 'body', title: '내용', type: 'text', rows: 5 }),
            defineField({ name: 'buttonLabel', title: '버튼 문구', type: 'string' }),
            defineField({ name: 'buttonUrl', title: '버튼 링크', type: 'url' }),
            defineField({
              name: 'elements',
              title: '배치 요소',
              type: 'array',
              of: [
                {
                  type: 'object',
                  fields: [
                    defineField({ name: 'type', title: '타입', type: 'string' }),
                    defineField({ name: 'label', title: '문구', type: 'string' }),
                    defineField({ name: 'url', title: '링크', type: 'string' }),
                    defineField({ name: 'src', title: '이미지 URL', type: 'url' }),
                    defineField({ name: 'x', title: 'X 위치(%)', type: 'string' }),
                    defineField({ name: 'y', title: 'Y 위치(%)', type: 'string' }),
                    defineField({ name: 'width', title: '너비(%)', type: 'string' }),
                    defineField({ name: 'height', title: '높이(%)', type: 'string' }),
                    defineField({ name: 'background', title: '배경색', type: 'string' }),
                    defineField({ name: 'color', title: '글자색', type: 'string' }),
                    defineField({ name: 'borderRadius', title: '둥근 정도', type: 'string' }),
                    defineField({ name: 'fontSize', title: '글자 크기', type: 'string' }),
                    defineField({ name: 'opacity', title: '투명도', type: 'string' }),
                  ],
                },
              ],
            }),
          ],
          preview: {
            select: {
              title: 'title',
              enabled: 'enabled',
              layout: 'layout',
            },
            prepare({ title, enabled, layout }) {
              return {
                title: title || '팝업',
                subtitle: `${enabled === 'true' ? '노출' : '숨김'} · ${layout || 'imageTop'}`,
              };
            },
          },
        },
      ],
    }),
    defineField({
      name: 'primaryButtonLabel',
      title: '첫 번째 버튼 문구',
      type: 'string',
      group: 'hero',
      description: '예: 상담 신청',
    }),
    defineField({
      name: 'secondaryButtonLabel',
      title: '두 번째 버튼 문구',
      type: 'string',
      group: 'hero',
      description: '예: Project 보기',
    }),
    defineField({
      name: 'sectionsScreenPreview',
      title: '중간 섹션 위치 확인',
      type: 'string',
      readOnly: true,
      group: 'sections',
      components: { input: HomepagePreview },
      options: {
        sectionId: 'portfolio-preview',
        previewTitle: '중간 섹션 미리보기',
        previewBody: 'Project 영역을 기준으로 열립니다. 위아래로 스크롤하면 브랜드 문구, 소개, 진행 과정도 확인할 수 있습니다.',
      } as Record<string, string>,
    }),
    defineField({
      name: 'statementLabel',
      title: '브랜드 문구 작은 제목',
      type: 'string',
      group: 'sections',
    }),
    defineField({
      name: 'statementTitle',
      title: '브랜드 문구 큰 제목',
      type: 'string',
      group: 'sections',
    }),
    defineField({
      name: 'statementBody',
      title: '브랜드 문구 설명',
      type: 'text',
      rows: 3,
      group: 'sections',
    }),
    defineField({
      name: 'projectSectionTitle',
      title: 'Project 섹션 제목',
      type: 'string',
      group: 'sections',
      description: '예: PROJECT',
    }),
    defineField({
      name: 'projectButtonLabel',
      title: 'Project 전체 보기 버튼',
      type: 'string',
      group: 'sections',
      description: '예: 전체 Project',
    }),
    defineField({
      name: 'portfolioTitle',
      title: 'Project 목록 페이지 제목',
      type: 'string',
      group: 'sections',
      description: '포트폴리오 탭을 눌렀을 때 보이는 큰 제목입니다.',
    }),
    defineField({
      name: 'aboutLabel',
      title: '소개 작은 제목',
      type: 'string',
      group: 'sections',
    }),
    defineField({
      name: 'aboutTitle',
      title: '소개 큰 제목',
      type: 'string',
      group: 'sections',
    }),
    defineField({
      name: 'aboutBody',
      title: '소개 설명',
      type: 'text',
      rows: 4,
      group: 'sections',
    }),
    defineField({
      name: 'processLabel',
      title: '진행 과정 작은 제목',
      type: 'string',
      group: 'sections',
    }),
    defineField({
      name: 'processTitle',
      title: '진행 과정 큰 제목',
      type: 'string',
      group: 'sections',
    }),
    defineField({
      name: 'locationScreenPreview',
      title: '오시는 길 / 상담 위치 확인',
      type: 'string',
      readOnly: true,
      group: 'location',
      components: { input: HomepagePreview },
      options: {
        sectionId: 'location',
        previewTitle: '오시는 길 / 상담 미리보기',
        previewBody: '주소, 전화번호, 지도 위치, 상담 문구가 이 아래 영역에 보입니다.',
      } as Record<string, string>,
    }),
    defineField({
      name: 'locationLabel',
      title: 'LOCATION 작은 영문 문구',
      type: 'string',
      group: 'location',
      description: '지도 영역 위쪽에 작게 보이는 영문 문구입니다. 예: LOCATION',
    }),
    defineField({
      name: 'locationTitle',
      title: '지도 영역 큰 문구',
      type: 'string',
      group: 'location',
      description: '홈페이지 오시는 길 영역의 큰 문구입니다. 예: 전문 인테리어 상담을 시작합니다.',
    }),
    defineField({
      name: 'address',
      title: '도로명 주소',
      type: 'string',
      group: 'location',
      description: '홈페이지에 표시되는 도로명 주소입니다. 예: 경기도 의왕시 오리나무1길 12, 1층',
    }),
    defineField({
      name: 'lotAddress',
      title: '지번 주소',
      type: 'string',
      group: 'location',
      description: '지도 마커는 이 지번 주소를 우선 검색합니다. 예: 경기도 의왕시 내손동 810-3',
    }),
    defineField({
      name: 'mapLocation',
      title: '지도에서 마커 위치 선택',
      type: 'object',
      group: 'location',
      description: '지도에서 정확한 건물 위치를 클릭하세요. 홈페이지 마커는 이 위치를 가장 먼저 사용합니다.',
      components: { input: MapLocationInput },
      fields: [
        defineField({ name: 'lat', title: '위도', type: 'number' }),
        defineField({ name: 'lng', title: '경도', type: 'number' }),
      ],
    }),
    defineField({
      name: 'phone',
      title: '전화번호',
      type: 'string',
      group: 'location',
      description: '상단 전화번호, 오시는 길, 푸터에 보입니다.',
    }),
    defineField({
      name: 'representativeName',
      title: '대표자명',
      type: 'string',
      group: 'location',
      description: '홈페이지 맨 아래 회사 정보에 표시됩니다. 예: 김동호',
    }),
    defineField({
      name: 'businessNumber',
      title: '사업자등록번호',
      type: 'string',
      group: 'location',
      description: '홈페이지 맨 아래 회사 정보에 표시됩니다.',
    }),
    defineField({
      name: 'companyStartYear',
      title: '회사 시작 연도',
      type: 'string',
      group: 'location',
      description: '홈페이지 맨 아래 저작권 연도에 표시됩니다. 예: 2020',
    }),
    defineField({
      name: 'mapLat',
      title: '지도 위도',
      type: 'number',
      group: 'location',
      hidden: true,
      description: '마커가 정확하지 않을 때만 직접 조정하세요. 두리푸드 기준 예: 37.38104',
    }),
    defineField({
      name: 'mapLng',
      title: '지도 경도',
      type: 'number',
      group: 'location',
      hidden: true,
      description: '마커가 정확하지 않을 때만 직접 조정하세요. 두리푸드 기준 예: 126.97482',
    }),
    defineField({
      name: 'contactLabel',
      title: '상담 작은 제목',
      type: 'string',
      group: 'location',
    }),
    defineField({
      name: 'contactTitle',
      title: '상담 큰 제목',
      type: 'string',
      group: 'location',
    }),
    defineField({
      name: 'contactBody',
      title: '상담 설명',
      type: 'text',
      rows: 3,
      group: 'location',
    }),
    defineField({ name: 'consultationPropertyQuestion', title: '상담 질문 1 문구', type: 'string', group: 'location' }),
    defineField({ name: 'consultationPropertyOptions', title: '상담 질문 1 선택지', type: 'text', rows: 4, group: 'location', description: '한 줄에 하나씩 입력하세요. 예: 아파트' }),
    defineField({ name: 'consultationAreaQuestion', title: '상담 질문 2 문구', type: 'string', group: 'location' }),
    defineField({ name: 'consultationAreaOptions', title: '상담 질문 2 선택지', type: 'text', rows: 4, group: 'location' }),
    defineField({ name: 'consultationStatusQuestion', title: '상담 질문 3 문구', type: 'string', group: 'location' }),
    defineField({ name: 'consultationStatusOptions', title: '상담 질문 3 선택지', type: 'text', rows: 5, group: 'location' }),
    defineField({ name: 'consultationReasonQuestion', title: '상담 질문 4 문구', type: 'string', group: 'location' }),
    defineField({ name: 'consultationReasonOptions', title: '상담 질문 4 선택지', type: 'text', rows: 4, group: 'location' }),
    defineField({ name: 'consultationBudgetQuestion', title: '상담 질문 5 문구', type: 'string', group: 'location' }),
    defineField({ name: 'consultationBudgetOptions', title: '상담 질문 5 선택지', type: 'text', rows: 8, group: 'location' }),
    defineField({ name: 'consultationTimelineQuestion', title: '상담 질문 6 문구', type: 'string', group: 'location' }),
    defineField({ name: 'consultationTimelineOptions', title: '상담 질문 6 선택지', type: 'text', rows: 5, group: 'location' }),
    defineField({ name: 'consultationPrivacyText', title: '개인정보 제3자 제공 동의 내용', type: 'text', rows: 8, group: 'location' }),
    defineField({
      name: 'consultationSurveyConfig',
      title: '상담 설문 고급 설정',
      type: 'text',
      rows: 12,
      group: 'location',
      description: '관리자 페이지의 상담 설문 편집기에서 자동 저장되는 설정입니다.',
    }),
    defineField({
      name: 'consultationEmail',
      title: '상담문의 받을 이메일',
      type: 'string',
      group: 'location',
      description: '홈페이지 상담문의가 도착할 이메일 주소입니다. 예: hello@wevedesign.co.kr',
    }),
    defineField({
      name: 'kakaoUrl',
      title: '카카오톡 상담 링크',
      type: 'url',
      group: 'location',
    }),
    defineField({
      name: 'kakaoChannelManagerUrl',
      title: '카카오 채널 관리 링크',
      type: 'url',
      group: 'location',
      description: '관리자 페이지에서 카카오 비즈니스 채널 관리자 화면으로 이동할 때 사용합니다.',
    }),
    defineField({
      name: 'naverPlaceUrl',
      title: '네이버 플레이스 예약 링크',
      type: 'url',
      group: 'location',
      description: '관리자 페이지에서 네이버 예약/문의 확인 버튼에 연결할 주소입니다.',
    }),
    defineField({
      name: 'kakaoUnreadCount',
      title: '카카오 새 알림 수',
      type: 'string',
      group: 'location',
      description: '관리자 페이지 외부 예약/채팅 알림 카드에 표시됩니다.',
    }),
    defineField({
      name: 'naverUnreadCount',
      title: '네이버 새 알림 수',
      type: 'string',
      group: 'location',
      description: '관리자 페이지 외부 예약/채팅 알림 카드에 표시됩니다.',
    }),
  ],
  preview: {
    prepare() {
      return {
        title: 'WEVE DESIGN 홈페이지 설정',
        subtitle: '메인 문구, 주소, 연락처, 지도 정보를 수정합니다.',
      };
    },
  },
});

const category = defineType({
  name: 'category',
  title: '공간 분류',
  type: 'document',
  fields: [
    defineField({
      name: 'isVisible',
      title: '홈페이지 필터에 보이기',
      type: 'boolean',
      initialValue: true,
      description: '끄면 저장은 되지만 홈페이지 카테고리 필터에는 보이지 않습니다.',
    }),
    defineField({
      name: 'title',
      title: '분류 이름',
      type: 'string',
      description: '홈페이지 필터 버튼에 보이는 이름입니다. 예: 아파트, 주방, 욕실, 상업공간',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: '분류 코드',
      type: 'slug',
      description: '오른쪽 Generate 버튼을 누르면 자동으로 만들어집니다.',
      options: { source: 'title' },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'displayOrder',
      title: '보이는 순서',
      type: 'number',
      description: '숫자가 작을수록 앞에 보입니다. 비워두어도 됩니다.',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      isVisible: 'isVisible',
    },
    prepare({ title, isVisible }) {
      return {
        title: title || '이름 없는 공간 분류',
        subtitle: isVisible === false ? '홈페이지 필터 숨김' : '홈페이지 필터 표시',
      };
    },
  },
});

const project = defineType({
  name: 'project',
  title: 'Project',
  type: 'document',
  groups: [
    { name: 'publish', title: '홈페이지 표시', default: true },
    { name: 'content', title: '기본 정보' },
    { name: 'images', title: '사진 등록' },
  ],
  fields: [
    defineField({
      name: 'isVisible',
      title: '홈페이지에 보이기',
      type: 'boolean',
      group: 'publish',
      initialValue: true,
      description: '켜두면 Project 목록에 보입니다.',
    }),
    defineField({
      name: 'featured',
      title: '메인 화면에도 보이기',
      type: 'boolean',
      group: 'publish',
      initialValue: false,
      description: '켜두면 홈페이지의 Project 영역에도 보입니다.',
    }),
    defineField({
      name: 'displayOrder',
      title: '보이는 순서',
      type: 'number',
      group: 'publish',
      description: '숫자가 작을수록 먼저 보입니다. 예: 1, 2, 3',
    }),
    defineField({
      name: 'updatedAt',
      title: '마지막 수정일',
      type: 'datetime',
      group: 'publish',
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: 'title',
      title: 'Project 이름',
      type: 'string',
      group: 'content',
      description: '예: 평촌 32평 아파트 리모델링',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'category',
      title: '공간 분류 선택',
      type: 'reference',
      group: 'content',
      to: [{ type: 'category' }],
      description: '아파트, 주방, 욕실 같은 분류를 선택하세요.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({ name: 'location', title: '지역', type: 'string', group: 'content' }),
    defineField({
      name: 'siteType',
      title: '주거 형태',
      type: 'string',
      group: 'content',
      options: { list: ['아파트', '주택', '상가', '오피스', '기타'] },
    }),
    defineField({ name: 'area', title: '평수', type: 'number', group: 'content' }),
    defineField({ name: 'year', title: '시공 연도', type: 'string', group: 'content' }),
    defineField({ name: 'materials', title: '사용 자재', type: 'string', group: 'content' }),
    defineField({
      name: 'blogUrl',
      title: '블로그 링크',
      type: 'url',
      group: 'content',
      description: '프로젝트 상세 화면의 기본 정보 아래에 표시할 블로그 글 주소입니다.',
    }),
    defineField({
      name: 'description',
      title: '짧은 설명',
      type: 'text',
      group: 'content',
      rows: 4,
      description: 'Project 상세 화면에 보이는 설명입니다.',
    }),
    defineField({
      name: 'mainImage',
      title: '대표 사진',
      type: 'image',
      group: 'images',
      options: { hotspot: true },
      description: '목록에서 가장 먼저 보이는 사진입니다. 꼭 등록하세요.',
      fields: [defineField({ name: 'alt', title: '사진 설명', type: 'string' })],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'mainImagePosition',
      title: '대표 사진 표시 위치',
      type: 'string',
      group: 'images',
      initialValue: 'center',
      options: {
        list: [
          { title: '가운데', value: 'center' },
          { title: '직접 조정', value: 'custom' },
          { title: '위쪽', value: 'top' },
          { title: '아래쪽', value: 'bottom' },
          { title: '왼쪽', value: 'left' },
          { title: '오른쪽', value: 'right' },
        ],
        layout: 'dropdown',
      },
      description: '홈페이지 Project 카드에서 대표 사진이 잘릴 때 어느 부분을 중심으로 보여줄지 정합니다.',
    }),
    defineField({
      name: 'mainImagePositionX',
      title: '대표 사진 가로 중심',
      type: 'number',
      group: 'images',
      initialValue: 50,
      hidden: true,
    }),
    defineField({
      name: 'mainImagePositionY',
      title: '대표 사진 세로 중심',
      type: 'number',
      group: 'images',
      initialValue: 50,
      hidden: true,
    }),
    defineField({
      name: 'beforeImage',
      title: '시공 전 사진',
      type: 'image',
      group: 'images',
      options: { hotspot: true },
      fields: [defineField({ name: 'alt', title: '사진 설명', type: 'string' })],
    }),
    defineField({
      name: 'galleryGroups',
      title: '공간별 상세 사진 묶음',
      type: 'array',
      group: 'images',
      description: '침실, 거실, 현관 같은 세부공간을 하나 만들고 그 안에 사진 여러 장을 한꺼번에 드래그해서 넣으세요.',
      of: [
        {
          type: 'object',
          title: '세부공간 사진 묶음',
          fields: [
            defineField({
              name: 'roomType',
              title: '세부공간 선택',
              type: 'string',
              description: '이 묶음이 어느 공간 사진인지 선택하세요.',
              options: {
                list: [
                  { title: '거실', value: '거실' },
                  { title: '주방', value: '주방' },
                  { title: '욕실', value: '욕실' },
                  { title: '침실', value: '침실' },
                  { title: '현관', value: '현관' },
                  { title: '드레스룸', value: '드레스룸' },
                  { title: '수납', value: '수납' },
                  { title: '상업공간', value: '상업공간' },
                  { title: '디테일', value: '디테일' },
                  { title: '시공 전', value: '시공 전' },
                  { title: '기타', value: '기타' },
                ],
                layout: 'dropdown',
              },
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'title',
              title: '묶음 제목',
              type: 'string',
              description: '비워두면 세부공간 이름이 제목으로 보입니다. 예: 안방 침실, 현관 수납',
            }),
            defineField({
              name: 'displayOrder',
              title: '묶음 순서',
              type: 'number',
              description: '숫자가 작을수록 먼저 보입니다. 비워두어도 됩니다.',
            }),
            defineField({
              name: 'images',
              title: '이 공간의 사진 여러 장',
              type: 'array',
              description: '이곳에 사진을 여러 장 드래그해서 한 번에 넣으세요. 홈페이지에서는 좌우 스크롤로 표시됩니다.',
              of: [
                {
                  type: 'image',
                  options: { hotspot: true },
                  fields: [
                    defineField({
                      name: 'caption',
                      title: '사진 이름',
                      type: 'string',
                      description: '예: 침실 전경, 붙박이장, 조명 디테일',
                    }),
                    defineField({
                      name: 'displayOrder',
                      title: '사진 순서',
                      type: 'number',
                      description: '숫자가 작을수록 먼저 보입니다. 비워두어도 됩니다.',
                    }),
                    defineField({ name: 'alt', title: '사진 설명', type: 'string' }),
                  ],
                },
              ],
            }),
          ],
          preview: {
            select: {
              media: 'images.0.asset',
              title: 'title',
              roomType: 'roomType',
            },
            prepare({ media, title, roomType }) {
              return {
                title: title || roomType || '세부공간 사진 묶음',
                subtitle: roomType ? `공간: ${roomType}` : '세부공간을 선택해 주세요',
                media,
              };
            },
          },
        },
      ],
    }),
    defineField({
      name: 'gallery',
      title: '상세 사진 개별 등록',
      type: 'array',
      group: 'images',
      description: '기존 방식입니다. 앞으로는 위의 공간별 상세 사진 묶음을 사용하는 것을 추천합니다.',
      of: [
        {
          type: 'image',
          options: { hotspot: true },
          fields: [
            defineField({
              name: 'roomType',
              title: '사진 위치 선택',
              type: 'string',
              description: '이 사진이 어느 공간 사진인지 선택하세요.',
              options: {
                list: [
                  { title: '거실', value: '거실' },
                  { title: '주방', value: '주방' },
                  { title: '욕실', value: '욕실' },
                  { title: '침실', value: '침실' },
                  { title: '현관', value: '현관' },
                  { title: '드레스룸', value: '드레스룸' },
                  { title: '수납', value: '수납' },
                  { title: '상업공간', value: '상업공간' },
                  { title: '디테일', value: '디테일' },
                  { title: '시공 전', value: '시공 전' },
                  { title: '기타', value: '기타' },
                ],
                layout: 'dropdown',
              },
            }),
            defineField({
              name: 'caption',
              title: '사진 이름',
              type: 'string',
              description: '예: 거실 아트월, 주방 상판, 욕실 타일',
            }),
            defineField({
              name: 'displayOrder',
              title: '사진 순서',
              type: 'number',
              description: '숫자가 작을수록 먼저 보입니다. 비워두어도 됩니다.',
            }),
            defineField({ name: 'alt', title: '사진 설명', type: 'string' }),
          ],
        },
      ],
    }),
  ],
  preview: {
    select: { title: 'title', subtitle: 'category.title', media: 'mainImage' },
    prepare({ title, subtitle, media }) {
      return {
        title: title || '이름 없는 Project',
        subtitle: subtitle ? `분류: ${subtitle}` : '분류를 선택해 주세요',
        media,
      };
    },
  },
});

const officeConsultation = defineType({
  name: 'officeConsultation',
  title: '상담 요청',
  type: 'document',
  fields: [
    defineField({ name: 'name', title: '고객명', type: 'string' }),
    defineField({ name: 'phone', title: '연락처', type: 'string' }),
    defineField({
      name: 'siteType',
      title: '현장 종류',
      type: 'string',
      options: { list: ['아파트', '주택', '상가', '오피스', '기타'] },
    }),
    defineField({ name: 'address', title: '현장 주소', type: 'string' }),
    defineField({ name: 'postcode', title: '우편번호', type: 'string' }),
    defineField({ name: 'detailAddress', title: '상세 주소', type: 'string' }),
    defineField({ name: 'fullAddress', title: '전체 주소', type: 'string', readOnly: true }),
    defineField({ name: 'propertyType', title: '공간 종류', type: 'string' }),
    defineField({ name: 'areaRange', title: '평수', type: 'string' }),
    defineField({ name: 'homeStatus', title: '현재 상태', type: 'string' }),
    defineField({ name: 'reason', title: '인테리어 이유', type: 'string' }),
    defineField({ name: 'budget', title: '예산', type: 'string' }),
    defineField({ name: 'timeline', title: '희망 시작일', type: 'string' }),
    defineField({ name: 'privacyAgreed', title: '개인정보 제공 동의', type: 'boolean' }),
    defineField({ name: 'message', title: '문의 내용', type: 'text', rows: 5 }),
    defineField({
      name: 'status',
      title: '상태',
      type: 'string',
      options: { list: ['신규', '상담중', '견적', '계약', '완료'] },
      initialValue: '신규',
    }),
    defineField({ name: 'source', title: '유입 경로', type: 'string' }),
    defineField({ name: 'memo', title: '관리 메모', type: 'text', rows: 4 }),
    defineField({ name: 'createdAt', title: '접수일', type: 'datetime' }),
  ],
  preview: {
    select: { title: 'name', phone: 'phone', siteType: 'siteType', status: 'status' },
    prepare({ title, phone, siteType, status }) {
      return { title: title || '상담 요청', subtitle: [phone, siteType, status].filter(Boolean).join(' · ') };
    },
  },
});

const officeCustomer = defineType({
  name: 'officeCustomer',
  title: '고객',
  type: 'document',
  fields: [
    defineField({ name: 'name', title: '고객명', type: 'string' }),
    defineField({ name: 'phone', title: '연락처', type: 'string' }),
    defineField({
      name: 'siteType',
      title: '현장 종류',
      type: 'string',
      options: { list: ['아파트', '주택', '상가', '오피스', '기타'] },
    }),
    defineField({ name: 'address', title: '주소', type: 'string' }),
    defineField({ name: 'status', title: '상태', type: 'string', initialValue: '상담중' }),
    defineField({ name: 'memo', title: '메모', type: 'text', rows: 5 }),
    defineField({ name: 'createdAt', title: '등록일', type: 'datetime' }),
  ],
  preview: {
    select: { title: 'name', phone: 'phone', status: 'status' },
    prepare({ title, phone, status }) {
      return { title: title || '고객', subtitle: [phone, status].filter(Boolean).join(' · ') };
    },
  },
});

const officeSite = defineType({
  name: 'officeSite',
  title: '현장',
  type: 'document',
  fields: [
    defineField({ name: 'title', title: '현장명', type: 'string' }),
    defineField({ name: 'customerName', title: '고객명', type: 'string' }),
    defineField({ name: 'customerPhone', title: '연락처', type: 'string' }),
    defineField({ name: 'customerId', title: '고객 ID', type: 'string' }),
    defineField({ name: 'consultationId', title: '상담 ID', type: 'string' }),
    defineField({
      name: 'siteType',
      title: '현장 종류',
      type: 'string',
      options: { list: ['아파트', '주택', '상가', '오피스', '기타'] },
    }),
    defineField({ name: 'address', title: '현장 주소', type: 'string' }),
    defineField({
      name: 'status',
      title: '상태',
      type: 'string',
      initialValue: '상담중',
      options: { list: ['상담중', '상담완료', '실측 예정', '견적', '계약', '시공중', '완료', '보류'] },
    }),
    defineField({ name: 'memo', title: '메모', type: 'text', rows: 5 }),
    defineField({ name: 'createdAt', title: '등록일', type: 'datetime' }),
  ],
  preview: {
    select: { title: 'title', customerName: 'customerName', status: 'status' },
    prepare({ title, customerName, status }) {
      return { title: title || '현장', subtitle: [customerName, status].filter(Boolean).join(' · ') };
    },
  },
});

const officeSale = defineType({
  name: 'officeSale',
  title: '매출',
  type: 'document',
  fields: [
    defineField({ name: 'customerName', title: '고객명', type: 'string' }),
    defineField({ name: 'projectTitle', title: '현장명', type: 'string' }),
    defineField({ name: 'amount', title: '매출액', type: 'number' }),
    defineField({ name: 'cost', title: '원가', type: 'number' }),
    defineField({ name: 'status', title: '상태', type: 'string', initialValue: '견적' }),
    defineField({ name: 'paymentDate', title: '입금일', type: 'date' }),
    defineField({ name: 'memo', title: '메모', type: 'text', rows: 5 }),
    defineField({ name: 'createdAt', title: '등록일', type: 'datetime' }),
  ],
  preview: {
    select: { title: 'projectTitle', customerName: 'customerName', amount: 'amount' },
    prepare({ title, customerName, amount }) {
      return { title: title || customerName || '매출', subtitle: amount ? `${Number(amount).toLocaleString('ko-KR')}원` : customerName };
    },
  },
});

const officeInventoryItem = defineType({
  name: 'officeInventoryItem',
  title: '재고',
  type: 'document',
  fields: [
    defineField({ name: 'itemName', title: '품목명', type: 'string' }),
    defineField({ name: 'category', title: '분류', type: 'string' }),
    defineField({ name: 'quantity', title: '수량', type: 'number' }),
    defineField({ name: 'unit', title: '단위', type: 'string', initialValue: '개' }),
    defineField({ name: 'minQuantity', title: '최소 수량', type: 'number' }),
    defineField({ name: 'vendor', title: '거래처', type: 'string' }),
    defineField({ name: 'memo', title: '메모', type: 'text', rows: 4 }),
    defineField({ name: 'createdAt', title: '등록일', type: 'datetime' }),
  ],
  preview: {
    select: { title: 'itemName', quantity: 'quantity', unit: 'unit' },
    prepare({ title, quantity, unit }) {
      return { title: title || '재고', subtitle: quantity !== undefined ? `${quantity}${unit || ''}` : undefined };
    },
  },
});

const officeVendor = defineType({
  name: 'officeVendor',
  title: '협력업체',
  type: 'document',
  fields: [
    defineField({ name: 'name', title: '업체명', type: 'string' }),
    defineField({ name: 'manager', title: '담당자', type: 'string' }),
    defineField({ name: 'phone', title: '연락처', type: 'string' }),
    defineField({ name: 'service', title: '업무 분야', type: 'string' }),
    defineField({ name: 'status', title: '상태', type: 'string', initialValue: '거래중' }),
    defineField({ name: 'memo', title: '메모', type: 'text', rows: 5 }),
    defineField({ name: 'createdAt', title: '등록일', type: 'datetime' }),
  ],
  preview: {
    select: { title: 'name', service: 'service', phone: 'phone' },
    prepare({ title, service, phone }) {
      return { title: title || '협력업체', subtitle: [service, phone].filter(Boolean).join(' · ') };
    },
  },
});

const estimateMaterial = defineType({
  name: 'estimateMaterial',
  title: '견적 자재 단가',
  type: 'document',
  fields: [
    defineField({ name: 'category', title: '카테고리', type: 'string' }),
    defineField({ name: 'process', title: '공종', type: 'string' }),
    defineField({ name: 'name', title: '품명', type: 'string' }),
    defineField({ name: 'spec', title: '규격', type: 'string' }),
    defineField({ name: 'unit', title: '단위', type: 'string' }),
    defineField({ name: 'unitPrice', title: '단가', type: 'number' }),
    defineField({ name: 'note', title: '비고', type: 'text', rows: 3 }),
    defineField({ name: 'sourceSheet', title: '업로드 시트명', type: 'string' }),
    defineField({ name: 'updatedAt', title: '수정일', type: 'datetime' }),
  ],
  preview: {
    select: { title: 'name', category: 'category', unitPrice: 'unitPrice' },
    prepare({ title, category, unitPrice }) {
      return {
        title: title || '자재 단가',
        subtitle: [category, unitPrice ? `${Number(unitPrice).toLocaleString('ko-KR')}원` : undefined].filter(Boolean).join(' · '),
      };
    },
  },
});

const siteEstimate = defineType({
  name: 'siteEstimate',
  title: '현장별 견적 작업',
  type: 'document',
  fields: [
    defineField({ name: 'siteId', title: '현장 ID', type: 'string' }),
    defineField({ name: 'siteTitle', title: '현장명', type: 'string' }),
    defineField({ name: 'customerName', title: '고객명', type: 'string' }),
    defineField({ name: 'versionLabel', title: '견적 버전', type: 'string', initialValue: '기본 견적' }),
    defineField({ name: 'linesJson', title: '견적 내역 JSON', type: 'text', rows: 10 }),
    defineField({ name: 'scheduleJson', title: '공정 일정 JSON', type: 'text', rows: 8 }),
    defineField({ name: 'customerEstimateTotal', title: '견적 금액', type: 'number' }),
    defineField({ name: 'executionCostTotal', title: '실행 원가', type: 'number' }),
    defineField({ name: 'marginAmount', title: '마진 금액', type: 'number' }),
    defineField({ name: 'marginRate', title: '마진율', type: 'number' }),
    defineField({ name: 'memo', title: '메모', type: 'text', rows: 5 }),
    defineField({ name: 'createdAt', title: '생성일', type: 'datetime' }),
    defineField({ name: 'updatedAt', title: '수정일', type: 'datetime' }),
  ],
  preview: {
    select: { title: 'siteTitle', customerName: 'customerName', total: 'customerEstimateTotal' },
    prepare({ title, customerName, total }) {
      return {
        title: title || '현장 견적',
        subtitle: [customerName, total ? `${Number(total).toLocaleString('ko-KR')}원` : undefined].filter(Boolean).join(' · '),
      };
    },
  },
});

const managerAccount = defineType({
  name: 'managerAccount',
  title: '관리자 계정',
  type: 'document',
  fields: [
    defineField({ name: 'name', title: '이름', type: 'string' }),
    defineField({ name: 'loginId', title: '로그인 ID', type: 'string' }),
    defineField({ name: 'password', title: '비밀번호', type: 'string' }),
    defineField({
      name: 'role',
      title: '역할',
      type: 'string',
      initialValue: 'staff',
      options: {
        list: [
          { title: '총괄 관리자', value: 'admin' },
          { title: '실무 계정', value: 'staff' },
        ],
      },
    }),
    defineField({
      name: 'permissions',
      title: '접속 권한',
      type: 'array',
      of: [{ type: 'string' }],
      options: {
        list: [
          { title: '업무 현황', value: 'dashboard' },
          { title: '상담 요청', value: 'consultations' },
          { title: '고객 관리', value: 'customers' },
          { title: '현장 관리', value: 'sites' },
          { title: '견적 작업', value: 'estimates' },
          { title: '매출 관리', value: 'sales' },
          { title: '재고 관리', value: 'inventory' },
          { title: '협력업체', value: 'vendors' },
          { title: '홈페이지', value: 'portfolio' },
          { title: '계정 권한', value: 'accounts' },
        ],
      },
    }),
    defineField({ name: 'isActive', title: '사용 여부', type: 'boolean', initialValue: true }),
    defineField({ name: 'createdAt', title: '생성일', type: 'datetime' }),
    defineField({ name: 'updatedAt', title: '수정일', type: 'datetime' }),
  ],
  preview: {
    select: { title: 'name', loginId: 'loginId', role: 'role' },
    prepare({ title, loginId, role }) {
      return { title: title || loginId || '관리자 계정', subtitle: role === 'admin' ? '총괄 관리자' : '실무 계정' };
    },
  },
});

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [
    siteSettings,
    category,
    project,
    officeConsultation,
    officeCustomer,
    officeSite,
    officeSale,
    officeInventoryItem,
    officeVendor,
    estimateMaterial,
    siteEstimate,
    managerAccount,
  ],
};
