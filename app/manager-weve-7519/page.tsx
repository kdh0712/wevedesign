'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Boxes,
  Building2,
  Check,
  ClipboardList,
  ExternalLink,
  FolderUp,
  Home,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  MessageCircle,
  PackagePlus,
  Phone,
  ShieldCheck,
  UploadCloud,
  Users,
  WalletCards,
} from 'lucide-react';

type UploadResult = {
  projectTitle: string;
  status: 'created' | 'updated' | 'skipped';
  imageCount?: number;
  groupCount?: number;
  reason?: string;
};

type PreviewProject = {
  title: string;
  count: number;
  rooms: string[];
};

type ManagerApiResponse = {
  error?: string;
  results?: UploadResult[];
};

type OfficeType = 'consultation' | 'customer' | 'site' | 'sale' | 'inventory' | 'vendor' | 'project';
type TabKey =
  | 'dashboard'
  | 'consultations'
  | 'customers'
  | 'sites'
  | 'estimates'
  | 'sales'
  | 'inventory'
  | 'vendors'
  | 'portfolio'
  | 'accounts';

type HomepageTabKey = 'basic' | 'hero' | 'sections' | 'contact' | 'popup' | 'projects' | 'survey';

type ManagerUser = {
  id: string;
  name: string;
  loginId: string;
  role: 'admin' | 'staff';
  permissions: TabKey[];
};

type ManagerAccount = {
  _id: string;
  name?: string;
  loginId?: string;
  role?: 'admin' | 'staff';
  permissions?: TabKey[];
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type Consultation = {
  _id: string;
  name?: string;
  phone?: string;
  siteType?: string;
  propertyType?: string;
  areaRange?: string;
  homeStatus?: string;
  reason?: string;
  budget?: string;
  timeline?: string;
  postcode?: string;
  address?: string;
  detailAddress?: string;
  fullAddress?: string;
  message?: string;
  privacyAgreed?: boolean;
  status?: string;
  source?: string;
  createdAt?: string;
  memo?: string;
};

type SurveyStepKey = 'propertyType' | 'areaRange' | 'homeStatus' | 'reason' | 'budget' | 'timeline';

type SurveyStep = {
  key: SurveyStepKey;
  title: string;
  description?: string;
  options: string[];
};

type SurveyAreaGroup = {
  id: string;
  label: string;
  propertyOptions: string[];
  step?: SurveyStep;
  steps: SurveyStep[];
};

type SurveyConfig = {
  propertyStep: SurveyStep;
  areaGroups: SurveyAreaGroup[];
  commonSteps: SurveyStep[];
};

type Customer = {
  _id: string;
  name?: string;
  phone?: string;
  siteType?: string;
  address?: string;
  status?: string;
  memo?: string;
  createdAt?: string;
};

type Site = {
  _id: string;
  title?: string;
  customerName?: string;
  customerPhone?: string;
  customerId?: string;
  consultationId?: string;
  siteType?: string;
  address?: string;
  status?: string;
  memo?: string;
  createdAt?: string;
};

type EstimateSummary = {
  _id: string;
  siteId?: string;
  siteTitle?: string;
  customerName?: string;
  versionLabel?: string;
  customerEstimateTotal?: number;
  executionCostTotal?: number;
  marginAmount?: number;
  marginRate?: number;
  updatedAt?: string;
  createdAt?: string;
};

type Sale = {
  _id: string;
  customerName?: string;
  projectTitle?: string;
  amount?: number;
  cost?: number;
  status?: string;
  paymentDate?: string;
  memo?: string;
  createdAt?: string;
};

type InventoryItem = {
  _id: string;
  itemName?: string;
  category?: string;
  quantity?: number;
  unit?: string;
  minQuantity?: number;
  vendor?: string;
  memo?: string;
  createdAt?: string;
};

type Vendor = {
  _id: string;
  name?: string;
  manager?: string;
  phone?: string;
  service?: string;
  status?: string;
  memo?: string;
  createdAt?: string;
};

type CategoryOption = {
  _id: string;
  title: string;
  slug?: string;
};

type ManagedProjectImage = {
  assetId?: string;
  url?: string;
  alt?: string;
  caption?: string;
  roomType?: string;
};

type ManagedProjectGalleryGroup = {
  roomType?: string;
  title?: string;
  images?: ManagedProjectImage[];
};

type ManagedProject = {
  _id: string;
  title?: string;
  description?: string;
  location?: string;
  siteType?: string;
  area?: number;
  year?: string;
  materials?: string;
  blogUrl?: string;
  displayOrder?: number;
  mainImage?: string;
  mainImageAssetId?: string;
  mainImageAlt?: string;
  mainImagePosition?: string;
  mainImagePositionX?: number;
  mainImagePositionY?: number;
  featured?: boolean;
  isVisible?: boolean;
  categoryId?: string;
  categoryTitle?: string;
  galleryGroups?: ManagedProjectGalleryGroup[];
  gallery?: ManagedProjectImage[];
};

type ProjectImageOption = ManagedProjectImage & {
  label: string;
};

type OfficeData = {
  consultations: Consultation[];
  customers: Customer[];
  sites: Site[];
  estimates: EstimateSummary[];
  sales: Sale[];
  inventory: InventoryItem[];
  vendors: Vendor[];
  categories: CategoryOption[];
  projects: ManagedProject[];
  visitStats?: VisitStats;
};

type VisitStats = {
  today: string;
  todayCount: number;
  weekCount: number;
  refreshSeconds: number;
};

type PreviewTarget = {
  key: string;
  label: string;
  src: string;
};

type OfficeApiResponse = Partial<OfficeData> & {
  error?: string;
  record?: Consultation | Customer | Site | Sale | InventoryItem | Vendor | ManagedProject;
};

type AuthApiResponse = {
  error?: string;
  token?: string;
  firebaseToken?: string;
  user?: ManagerUser;
};

type AccountApiResponse = {
  error?: string;
  accounts?: ManagerAccount[];
  account?: ManagerAccount;
};

const emptyOfficeData: OfficeData = {
  consultations: [],
  customers: [],
  sites: [],
  estimates: [],
  sales: [],
  inventory: [],
  vendors: [],
  categories: [],
  projects: [],
};

const MANAGER_SESSION_STORAGE_KEY = 'weve-manager-session';
const OFFICE_REFRESH_SECONDS = 30;

const homepagePreviewTargets = {
  heroLabel: { key: 'heroLabel', label: '배너 작은 문구', src: '/#home' },
  heroTitle: { key: 'heroTitle', label: '첫 화면 큰 문구', src: '/#home' },
  heroDescription: { key: 'heroDescription', label: '첫 화면 설명', src: '/#home' },
  primaryButtonLabel: { key: 'primaryButtonLabel', label: '메인 버튼 문구', src: '/#home' },
  secondaryButtonLabel: { key: 'secondaryButtonLabel', label: '보조 버튼 문구', src: '/#home' },
  statementLabel: { key: 'statementLabel', label: '브랜드 작은 문구', src: '/#statement' },
  statementTitle: { key: 'statementTitle', label: '브랜드 큰 문구', src: '/#statement' },
  statementBody: { key: 'statementBody', label: '브랜드 설명', src: '/#statement' },
  projectSectionTitle: { key: 'projectSectionTitle', label: 'Project 섹션 제목', src: '/#portfolio-preview' },
  projectButtonLabel: { key: 'projectButtonLabel', label: 'Project 버튼 문구', src: '/#portfolio-preview' },
  portfolioTitle: { key: 'portfolioTitle', label: 'Project 목록 페이지 제목', src: '/#portfolio-preview' },
  aboutLabel: { key: 'aboutLabel', label: '소개 작은 문구', src: '/#about' },
  aboutTitle: { key: 'aboutTitle', label: '소개 큰 문구', src: '/#about' },
  aboutBody: { key: 'aboutBody', label: '소개 설명', src: '/#about' },
  processLabel: { key: 'processLabel', label: '진행 과정 작은 문구', src: '/#process' },
  processTitle: { key: 'processTitle', label: '진행 과정 큰 문구', src: '/#process' },
  locationLabel: { key: 'locationLabel', label: '위치 작은 문구', src: '/#location' },
  locationTitle: { key: 'locationTitle', label: '오시는 길 큰 문구', src: '/#location' },
  address: { key: 'address', label: '도로명 주소', src: '/#location' },
  lotAddress: { key: 'lotAddress', label: '지번 주소', src: '/#location' },
  phone: { key: 'phone', label: '대표 연락처', src: '/#location' },
  contactLabel: { key: 'contactLabel', label: '상담 작은 문구', src: '/#contact' },
  contactTitle: { key: 'contactTitle', label: '상담 큰 문구', src: '/#contact' },
  contactBody: { key: 'contactBody', label: '상담 설명', src: '/#contact' },
  consultationEmail: { key: 'consultationEmail', label: '상담문의 이메일', src: '/#footer' },
  kakaoUrl: { key: 'kakaoUrl', label: '카카오톡 상담 링크', src: '/#contact' },
  kakaoChannelManagerUrl: { key: 'kakaoChannelManagerUrl', label: '카카오 채널 관리 링크', src: '/#contact' },
  naverPlaceUrl: { key: 'naverPlaceUrl', label: '네이버 플레이스 링크', src: '/#contact' },
  representativeName: { key: 'representativeName', label: '대표자명', src: '/#footer' },
  businessNumber: { key: 'businessNumber', label: '사업자등록번호', src: '/#footer' },
  companyStartYear: { key: 'companyStartYear', label: '회사 시작 연도', src: '/#footer' },
} satisfies Record<string, PreviewTarget>;

const defaultSurveyConfig: SurveyConfig = {
  propertyStep: {
    key: 'propertyType',
    title: '반갑습니다. 고객님! 인테리어가 필요한 공간은 어디인가요?',
    options: ['아파트', '빌라', '단독주택', '오피스텔', '상가', '오피스'],
  },
  areaGroups: [
    {
      id: 'residential',
      label: '주거 공간',
      propertyOptions: ['아파트', '빌라', '단독주택', '오피스텔'],
      steps: [
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
      ],
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
  commonSteps: [
    {
      key: 'budget',
      title: '인테리어 예산은 총 얼마를 생각하시나요?',
      description: '예산 선택 시 더 정확한 상담이 가능해요. 상담 시 변경 가능합니다.',
      options: ['5백만원 이하', '1천만원 이하', '2천만원 이하', '3천만원 이하', '4천만원 이하', '5천만원 이하', '6천만원 이하', '7천만원 이하', '1억원 이하', '1억원 이상', '아직 미정이에요'],
    },
    {
      key: 'timeline',
      title: '인테리어가 언제 시작되길 희망하시나요?',
      description: '신청일 기준으로 가장 가까운 일정을 골라주세요.',
      options: ['1개월 이내', '2개월 이내', '3개월 이내', '3개월 이후', '6개월 이후'],
    },
  ],
};

const defaultPrivacyText =
  '수집 항목: 이름, 연락처, 시공 주소, 상담 설문 답변, 요청사항\n수집 목적: 인테리어 상담, 실측 및 견적 안내, 고객 문의 응대\n보유 기간: 상담 완료 후 1년 또는 고객 삭제 요청 시까지\n제공받는 자: WEVE DESIGN 상담 및 시공 담당자\n동의를 거부할 권리가 있으나, 동의하지 않을 경우 상담 신청이 제한될 수 있습니다.';

const parseSurveyConfig = (value?: string): SurveyConfig => {
  if (!value) return defaultSurveyConfig;

  try {
    const parsed = JSON.parse(value) as Partial<SurveyConfig>;
    if (!parsed.propertyStep?.options?.length || !parsed.areaGroups?.length || !parsed.commonSteps?.length) {
      return defaultSurveyConfig;
    }

    return {
      propertyStep: { ...defaultSurveyConfig.propertyStep, ...parsed.propertyStep, key: 'propertyType' },
      areaGroups: parsed.areaGroups.map((group, index) => {
        const legacySteps = [group.step, parsed.commonSteps?.[0], parsed.commonSteps?.[1]].filter(Boolean) as SurveyStep[];
        const steps = (group.steps?.length ? group.steps : legacySteps).slice(0, 3);

        return {
          id: group.id || `group-${index + 1}`,
          label: group.label || `묶음 ${index + 1}`,
          propertyOptions: group.propertyOptions?.filter(Boolean) || [],
          steps: [0, 1, 2].map((stepIndex) => ({
            ...defaultSurveyConfig.areaGroups[0].steps[stepIndex],
            ...steps[stepIndex],
          })),
        };
      }),
      commonSteps: (parsed.commonSteps.length > 2 ? parsed.commonSteps.slice(2) : parsed.commonSteps).map((step, index) => ({
        ...defaultSurveyConfig.commonSteps[index],
        ...step,
      })) as SurveyStep[],
    };
  } catch {
    return defaultSurveyConfig;
  }
};

const UPLOAD_PRESETS = [
  { maxWidth: 1920, quality: 0.82 },
  { maxWidth: 1680, quality: 0.78 },
  { maxWidth: 1440, quality: 0.74 },
  { maxWidth: 1280, quality: 0.7 },
];
const MAX_UPLOAD_BYTES = 3.8 * 1024 * 1024;
const CONSULTATION_STATUSES = ['신규', '상담중', '견적', '계약', '완료'];
const SITE_STATUSES = ['상담중', '상담완료', '실측 예정', '견적', '계약', '시공중', '완료', '보류'];

const tabs: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'dashboard', label: '업무 현황', icon: <BarChart3 size={16} /> },
  { key: 'consultations', label: '상담 요청', icon: <Phone size={16} /> },
  { key: 'customers', label: '고객 관리', icon: <Users size={16} /> },
  { key: 'sites', label: '현장 관리', icon: <Home size={16} /> },
  { key: 'estimates', label: '견적 작업', icon: <ClipboardList size={16} /> },
  { key: 'sales', label: '매출 관리', icon: <WalletCards size={16} /> },
  { key: 'inventory', label: '재고 관리', icon: <Boxes size={16} /> },
  { key: 'vendors', label: '협력업체', icon: <Building2 size={16} /> },
  { key: 'portfolio', label: '홈페이지', icon: <FolderUp size={16} /> },
  { key: 'accounts', label: '계정 권한', icon: <KeyRound size={16} /> },
];

export default function ManagerPage() {
  const [password, setPassword] = useState('');
  const [firebaseToken, setFirebaseToken] = useState('');
  const [loginId, setLoginId] = useState('admin');
  const [loginPassword, setLoginPassword] = useState('');
  const [currentUser, setCurrentUser] = useState<ManagerUser | null>(null);
  const [accounts, setAccounts] = useState<ManagerAccount[]>([]);
  const [accountForm, setAccountForm] = useState({
    id: '',
    name: '',
    loginId: '',
    password: '',
    role: 'staff' as 'admin' | 'staff',
    permissions: ['dashboard', 'consultations'] as TabKey[],
    isActive: true,
  });
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [homepageTab, setHomepageTab] = useState<HomepageTabKey>('basic');
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [uploadSiteType, setUploadSiteType] = useState('아파트');
  const [uploadLocation, setUploadLocation] = useState('');
  const [uploadArea, setUploadArea] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [featured, setFeatured] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadInputKey, setUploadInputKey] = useState(0);
  const [consultationEmail, setConsultationEmail] = useState('');
  const [homepageSettings, setHomepageSettings] = useState({
    consultationEmail: '',
    representativeName: '',
    businessNumber: '',
    companyStartYear: '',
    phone: '',
    address: '',
    lotAddress: '',
    locationLabel: '',
    locationTitle: '',
    heroLabel: '',
    heroTitle: '',
    heroDescription: '',
    primaryButtonLabel: '',
    secondaryButtonLabel: '',
    statementLabel: '',
    statementTitle: '',
    statementBody: '',
    projectSectionTitle: '',
    projectButtonLabel: '',
    portfolioTitle: '',
    aboutLabel: '',
    aboutTitle: '',
    aboutBody: '',
    processLabel: '',
    processTitle: '',
    contactLabel: '',
    contactTitle: '',
    contactBody: '',
    consultationPropertyQuestion: '',
    consultationPropertyOptions: '',
    consultationAreaQuestion: '',
    consultationAreaOptions: '',
    consultationStatusQuestion: '',
    consultationStatusOptions: '',
    consultationReasonQuestion: '',
    consultationReasonOptions: '',
    consultationBudgetQuestion: '',
    consultationBudgetOptions: '',
    consultationTimelineQuestion: '',
    consultationTimelineOptions: '',
    consultationPrivacyText: '',
    consultationSurveyConfig: '',
    kakaoUrl: '',
    kakaoChannelManagerUrl: '',
    naverPlaceUrl: '',
    kakaoUnreadCount: '',
    naverUnreadCount: '',
    heroImage: '',
    heroImage2: '',
    heroImage3: '',
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
    popups: [] as PopupItemDraft[],
  });
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectFilterCategoryId, setProjectFilterCategoryId] = useState('');
  const [projectTitle, setProjectTitle] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectCategoryId, setProjectCategoryId] = useState('');
  const [projectNewCategory, setProjectNewCategory] = useState('');
  const [projectSiteType, setProjectSiteType] = useState('아파트');
  const [projectLocation, setProjectLocation] = useState('');
  const [projectArea, setProjectArea] = useState('');
  const [projectYear, setProjectYear] = useState('');
  const [projectMaterials, setProjectMaterials] = useState('');
  const [projectBlogUrl, setProjectBlogUrl] = useState('');
  const [projectDisplayOrder, setProjectDisplayOrder] = useState('');
  const [projectMainImagePosition, setProjectMainImagePosition] = useState('center');
  const [projectMainImagePositionX, setProjectMainImagePositionX] = useState('50');
  const [projectMainImagePositionY, setProjectMainImagePositionY] = useState('50');
  const [projectFeatured, setProjectFeatured] = useState(false);
  const [projectVisible, setProjectVisible] = useState(true);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadingMainImage, setUploadingMainImage] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [loadingOffice, setLoadingOffice] = useState(false);
  const [savingOffice, setSavingOffice] = useState(false);
  const [officeData, setOfficeData] = useState<OfficeData>(emptyOfficeData);
  const [visitStats, setVisitStats] = useState<VisitStats | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState('');
  const [results, setResults] = useState<UploadResult[]>([]);
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);
  const [completionConsultation, setCompletionConsultation] = useState<Consultation | null>(null);
  const [pendingConsultationForCustomer, setPendingConsultationForCustomer] = useState<Consultation | null>(null);
  const [activePreviewTarget, setActivePreviewTarget] = useState<PreviewTarget | null>(null);
  const [isSurveyEditorOpen, setIsSurveyEditorOpen] = useState(false);
  const [surveyEditorTab, setSurveyEditorTab] = useState(0);
  const [surveyDraft, setSurveyDraft] = useState<SurveyConfig>(defaultSurveyConfig);
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '', siteType: '아파트', address: '', status: '상담중', memo: '', siteTitle: '', siteStatus: '상담중', siteMemo: '' });
  const [siteForm, setSiteForm] = useState({ title: '', customerName: '', customerPhone: '', siteType: '아파트', address: '', status: '상담중', memo: '' });
  const [saleForm, setSaleForm] = useState({ customerName: '', projectTitle: '', amount: '', cost: '', status: '견적', paymentDate: '', memo: '' });
  const [inventoryForm, setInventoryForm] = useState({ itemName: '', category: '', quantity: '', unit: '개', minQuantity: '', vendor: '', memo: '' });
  const [vendorForm, setVendorForm] = useState({ name: '', manager: '', phone: '', service: '', status: '거래중', memo: '' });
  const [editingCustomerId, setEditingCustomerId] = useState('');
  const [editingSiteId, setEditingSiteId] = useState('');
  const [editingSaleId, setEditingSaleId] = useState('');
  const [editingInventoryId, setEditingInventoryId] = useState('');
  const [editingVendorId, setEditingVendorId] = useState('');
  const customerFormRef = useRef<HTMLDivElement | null>(null);
  const siteFormRef = useRef<HTMLDivElement | null>(null);
  const saleFormRef = useRef<HTMLDivElement | null>(null);
  const inventoryFormRef = useRef<HTMLDivElement | null>(null);
  const vendorFormRef = useRef<HTMLDivElement | null>(null);

  const visibleTabs = useMemo(() => {
    if (!currentUser) return tabs.filter((tab) => tab.key !== 'accounts');
    if (currentUser.role === 'admin') return tabs;
    return tabs.filter((tab) => currentUser.permissions.includes(tab.key));
  }, [currentUser]);

  const visibleAccounts = useMemo(() => {
    if (!currentUser) return accounts;

    const currentAccount: ManagerAccount = {
      _id: currentUser.id,
      name: currentUser.name,
      loginId: currentUser.loginId,
      role: currentUser.role,
      permissions: currentUser.permissions,
      isActive: true,
    };

    const hasCurrentAccount = accounts.some((account) => account._id === currentUser.id || account.loginId === currentUser.loginId);
    return hasCurrentAccount ? accounts : [currentAccount, ...accounts];
  }, [accounts, currentUser]);

  const previews = useMemo(() => buildPreview(files), [files]);
  const filteredProjectsForEdit = useMemo(() => {
    if (!projectFilterCategoryId) return officeData.projects;
    return officeData.projects.filter((project) => project.categoryId === projectFilterCategoryId);
  }, [officeData.projects, projectFilterCategoryId]);
  const selectedProjectForEdit = useMemo(
    () => officeData.projects.find((project) => project._id === selectedProjectId),
    [officeData.projects, selectedProjectId],
  );
  const selectedProjectImageOptions = useMemo(() => getProjectImageOptions(selectedProjectForEdit), [selectedProjectForEdit]);
  const salesTotal = useMemo(() => officeData.sales.reduce((sum, sale) => sum + Number(sale.amount || 0), 0), [officeData.sales]);
  const profitTotal = useMemo(
    () => officeData.sales.reduce((sum, sale) => sum + Number(sale.amount || 0) - Number(sale.cost || 0), 0),
    [officeData.sales],
  );
  const lowStockCount = useMemo(
    () => officeData.inventory.filter((item) => Number(item.quantity || 0) <= Number(item.minQuantity || 0)).length,
    [officeData.inventory],
  );

  useEffect(() => {
    const savedSession = window.localStorage.getItem(MANAGER_SESSION_STORAGE_KEY);
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession) as { token?: string; firebaseToken?: string; user?: ManagerUser };
        if (parsed.token && parsed.user) {
          setPassword(parsed.token);
          setFirebaseToken(parsed.firebaseToken || '');
          setCurrentUser(parsed.user);
          void loadOfficeData(parsed.token, { silent: true });
          if (parsed.user.role === 'admin') void loadAccounts(parsed.token, parsed.firebaseToken || '');
          return;
        }
      } catch {
        window.localStorage.removeItem(MANAGER_SESSION_STORAGE_KEY);
      }
    }

    window.localStorage.removeItem('weve-manager-password');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isUnlocked || !password) return;

    const timer = window.setInterval(() => {
      void refreshOfficeData(password);
    }, OFFICE_REFRESH_SECONDS * 1000);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnlocked, password]);

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.key === activeTab)) {
      setActiveTab(visibleTabs[0]?.key || 'dashboard');
    }
  }, [activeTab, visibleTabs]);

  useEffect(() => {
    if (activeTab === 'accounts' && currentUser?.role === 'admin') {
      void loadAccounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentUser?.role]);

  const authHeaders = (managerPassword = password) => ({
    'x-manager-password': managerPassword,
    'x-manager-user': currentUser?.loginId || 'admin',
    ...(firebaseToken ? { 'x-firebase-token': firebaseToken } : {}),
  });

  const readJsonResponse = async <T,>(response: Response): Promise<T> => {
    const text = await response.text();
    if (!text) return {} as T;

    try {
      return JSON.parse(text) as T;
    } catch {
      return { error: text.slice(0, 300) || `Server returned HTTP ${response.status}` } as T;
    }
  };

  const requirePassword = (managerPassword = password) => {
    if (managerPassword) return true;
    setError('관리자 로그인을 먼저 진행해 주세요.');
    return false;
  };

  const handleLogin = async () => {
    setError('');
    setStatus('');
    setLoadingOffice(true);
    try {
      const response = await fetch('/api/manager/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, password: loginPassword }),
      });
      const result = await readJsonResponse<AuthApiResponse>(response);
      if (!response.ok || !result.token || !result.user) {
        throw new Error(result.error || '로그인에 실패했습니다.');
      }

      setPassword(result.token);
      setFirebaseToken(result.firebaseToken || '');
      setCurrentUser(result.user);
      window.localStorage.setItem(MANAGER_SESSION_STORAGE_KEY, JSON.stringify({ token: result.token, firebaseToken: result.firebaseToken || '', user: result.user }));
      await loadOfficeData(result.token, { silent: true });
      if (result.user.role === 'admin') await loadAccounts(result.token, result.firebaseToken || '');
      setStatus('로그인했습니다.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '로그인 처리 중 오류가 발생했습니다.');
    } finally {
      setLoadingOffice(false);
    }
  };

  const handleLogout = () => {
    window.localStorage.removeItem(MANAGER_SESSION_STORAGE_KEY);
    window.localStorage.removeItem('weve-manager-password');
    setPassword('');
    setFirebaseToken('');
    setLoginPassword('');
    setCurrentUser(null);
    setIsUnlocked(false);
    setActiveTab('dashboard');
  };

  const loadAccounts = async (managerPassword = password, firebaseAuthToken = firebaseToken) => {
    if (!managerPassword) return;
    try {
      const response = await fetch('/api/manager/accounts', {
        headers: {
          'x-manager-password': managerPassword,
          ...(firebaseAuthToken ? { 'x-firebase-token': firebaseAuthToken } : {}),
        },
      });
      const data = await readJsonResponse<AccountApiResponse>(response);
      if (!response.ok) throw new Error(data.error || '계정 목록을 불러오지 못했습니다.');
      setAccounts(data.accounts || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '계정 목록 조회 중 오류가 발생했습니다.');
    }
  };

  const saveAccount = async () => {
    setError('');
    setStatus('');
    if (!requirePassword()) return;
    setSavingOffice(true);
    try {
      const response = await fetch('/api/manager/accounts', {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(accountForm),
      });
      const data = await readJsonResponse<AccountApiResponse>(response);
      if (!response.ok) throw new Error(data.error || '계정을 저장하지 못했습니다.');
      setStatus('계정 권한을 저장했습니다.');
      resetAccountForm();
      await loadAccounts();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '계정 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingOffice(false);
    }
  };

  const deleteAccount = async (id: string) => {
    setError('');
    setStatus('');
    if (!requirePassword()) return;
    setSavingOffice(true);
    try {
      const response = await fetch('/api/manager/accounts', {
        method: 'DELETE',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id }),
      });
      const data = await readJsonResponse<AccountApiResponse>(response);
      if (!response.ok) throw new Error(data.error || '계정을 삭제하지 못했습니다.');
      setStatus('계정을 삭제했습니다.');
      await loadAccounts();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '계정 삭제 중 오류가 발생했습니다.');
    } finally {
      setSavingOffice(false);
    }
  };

  const loadOfficeData = async (managerPassword = password, options: { silent?: boolean } = {}) => {
    if (!options.silent) {
      setError('');
      setStatus('');
    }
    if (!requirePassword(managerPassword)) return;

    if (!options.silent) setLoadingOffice(true);
    try {
      const [response, settingsResponse] = await Promise.all([
        fetch('/api/manager/office', { headers: authHeaders(managerPassword) }),
        fetch('/api/manager/settings', { headers: authHeaders(managerPassword) }),
      ]);
      const data = await readJsonResponse<OfficeApiResponse>(response);
      if (!response.ok) throw new Error(data.error || '업무 데이터를 불러오지 못했습니다.');
      const settingsData = await readJsonResponse<{ settings?: Partial<typeof homepageSettings>; error?: string }>(settingsResponse);
      if (!settingsResponse.ok) throw new Error(settingsData.error || '홈페이지 설정을 불러오지 못했습니다.');

      setOfficeData({
        consultations: data.consultations || [],
        customers: data.customers || [],
        sites: data.sites || [],
        estimates: data.estimates || [],
        sales: data.sales || [],
        inventory: data.inventory || [],
        vendors: data.vendors || [],
        categories: data.categories || [],
        projects: data.projects || [],
        visitStats: data.visitStats,
      });
      setVisitStats(data.visitStats || null);
      const settings = settingsData.settings || {};
      const savedSurveyConfig = settings.consultationSurveyConfig || JSON.stringify(defaultSurveyConfig);
      const parsedSurveyConfig = parseSurveyConfig(savedSurveyConfig);
      setHomepageSettings({
        consultationEmail: settings.consultationEmail || '',
        representativeName: settings.representativeName || '',
        businessNumber: settings.businessNumber || '',
        companyStartYear: settings.companyStartYear || '',
        phone: settings.phone || '',
        address: settings.address || '',
        lotAddress: settings.lotAddress || '',
        locationLabel: settings.locationLabel || '',
        locationTitle: settings.locationTitle || '',
        heroLabel: settings.heroLabel || '',
        heroTitle: settings.heroTitle || '',
        heroDescription: settings.heroDescription || '',
        primaryButtonLabel: settings.primaryButtonLabel || '',
        secondaryButtonLabel: settings.secondaryButtonLabel || '',
        statementLabel: settings.statementLabel || '',
        statementTitle: settings.statementTitle || '',
        statementBody: settings.statementBody || '',
        projectSectionTitle: settings.projectSectionTitle || '',
        projectButtonLabel: settings.projectButtonLabel || '',
        portfolioTitle: settings.portfolioTitle || '',
        aboutLabel: settings.aboutLabel || '',
        aboutTitle: settings.aboutTitle || '',
        aboutBody: settings.aboutBody || '',
        processLabel: settings.processLabel || '',
        processTitle: settings.processTitle || '',
        contactLabel: settings.contactLabel || '',
        contactTitle: settings.contactTitle || '',
        contactBody: settings.contactBody || '',
        consultationPropertyQuestion: settings.consultationPropertyQuestion || parsedSurveyConfig.propertyStep.title,
        consultationPropertyOptions: settings.consultationPropertyOptions || parsedSurveyConfig.propertyStep.options.join('\n'),
        consultationAreaQuestion: settings.consultationAreaQuestion || parsedSurveyConfig.areaGroups[0]?.steps[0]?.title || '',
        consultationAreaOptions: settings.consultationAreaOptions || parsedSurveyConfig.areaGroups[0]?.steps[0]?.options.join('\n') || '',
        consultationStatusQuestion: settings.consultationStatusQuestion || parsedSurveyConfig.areaGroups[0]?.steps[1]?.title || '',
        consultationStatusOptions: settings.consultationStatusOptions || parsedSurveyConfig.areaGroups[0]?.steps[1]?.options.join('\n') || '',
        consultationReasonQuestion: settings.consultationReasonQuestion || parsedSurveyConfig.areaGroups[0]?.steps[2]?.title || '',
        consultationReasonOptions: settings.consultationReasonOptions || parsedSurveyConfig.areaGroups[0]?.steps[2]?.options.join('\n') || '',
        consultationBudgetQuestion: settings.consultationBudgetQuestion || parsedSurveyConfig.commonSteps[0]?.title || '',
        consultationBudgetOptions: settings.consultationBudgetOptions || parsedSurveyConfig.commonSteps[0]?.options.join('\n') || '',
        consultationTimelineQuestion: settings.consultationTimelineQuestion || parsedSurveyConfig.commonSteps[1]?.title || '',
        consultationTimelineOptions: settings.consultationTimelineOptions || parsedSurveyConfig.commonSteps[1]?.options.join('\n') || '',
        consultationPrivacyText: settings.consultationPrivacyText || defaultPrivacyText,
        consultationSurveyConfig: savedSurveyConfig,
        kakaoUrl: settings.kakaoUrl || '',
        kakaoChannelManagerUrl: settings.kakaoChannelManagerUrl || '',
        naverPlaceUrl: settings.naverPlaceUrl || '',
        kakaoUnreadCount: settings.kakaoUnreadCount || '',
        naverUnreadCount: settings.naverUnreadCount || '',
        heroImage: settings.heroImage || '',
        heroImage2: settings.heroImage2 || '',
        heroImage3: settings.heroImage3 || '',
        popupEnabled: settings.popupEnabled || 'false',
        popupLayout: settings.popupLayout || 'imageTop',
        popupPosition: settings.popupPosition || 'center',
        popupWidth: settings.popupWidth || '520',
        popupImageFit: settings.popupImageFit || 'cover',
        popupStartDate: settings.popupStartDate || '',
        popupEndDate: settings.popupEndDate || '',
        popupTitle: settings.popupTitle || '',
        popupBody: settings.popupBody || '',
        popupButtonLabel: settings.popupButtonLabel || '',
        popupButtonUrl: settings.popupButtonUrl || '',
        popupImage: settings.popupImage || '',
        popups: normalizePopupItems(settings),
      });
      setSurveyDraft(parsedSurveyConfig);
      setConsultationEmail(settings.consultationEmail || '');
      if (!category && data.categories?.[0]?._id) setCategory(data.categories[0]._id);
      setPassword(managerPassword);
      setIsUnlocked(true);
      setLastRefreshedAt(formatTime(new Date()));
      if (!options.silent) setStatus('업무 데이터를 불러왔습니다.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '업무 데이터 조회 중 오류가 발생했습니다.');
      if (caught instanceof Error && caught.message.includes('비밀번호')) {
        window.localStorage.removeItem('weve-manager-password');
      }
    } finally {
      if (!options.silent) setLoadingOffice(false);
    }
  };

  const refreshOfficeData = async (managerPassword = password) => {
    if (!managerPassword) return;

    try {
      const response = await fetch('/api/manager/office', { headers: authHeaders(managerPassword) });
      const data = await readJsonResponse<OfficeApiResponse>(response);
      if (!response.ok) throw new Error(data.error || '업무 데이터를 갱신하지 못했습니다.');

      setOfficeData((current) => ({
        ...current,
        consultations: data.consultations || [],
        customers: data.customers || [],
        sites: data.sites || [],
        estimates: data.estimates || [],
        sales: data.sales || [],
        inventory: data.inventory || [],
        vendors: data.vendors || [],
        categories: data.categories || [],
        projects: data.projects || [],
        visitStats: data.visitStats,
      }));
      setVisitStats(data.visitStats || null);
      setLastRefreshedAt(formatTime(new Date()));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '업무 데이터 자동 갱신 중 오류가 발생했습니다.');
    }
  };

  const saveOfficeRecord = async (type: OfficeType, data: Record<string, unknown>, id?: string) => {
    setError('');
    setStatus('');
    if (!requirePassword()) return null;

    setSavingOffice(true);
    try {
      const response = await fetch('/api/manager/office', {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type, id, data }),
      });
      const result = await readJsonResponse<OfficeApiResponse>(response);
      if (!response.ok) throw new Error(result.error || '저장에 실패했습니다.');

      await loadOfficeData();
      setStatus('저장했습니다.');
      return result.record || null;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '저장 중 오류가 발생했습니다.');
      return null;
    } finally {
      setSavingOffice(false);
    }
  };

  const deleteOfficeRecord = async (id: string) => {
    setError('');
    setStatus('');
    if (!requirePassword()) return;

    setSavingOffice(true);
    try {
      const response = await fetch('/api/manager/office', {
        method: 'DELETE',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id }),
      });
      const result = await readJsonResponse<{ error?: string }>(response);

      if (!response.ok) throw new Error(result.error || '삭제에 실패했습니다.');
      setSelectedConsultation(null);
      await loadOfficeData();
      setStatus('삭제했습니다.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '삭제 중 오류가 발생했습니다.');
    } finally {
      setSavingOffice(false);
    }
  };

  const completeConsultation = async (consultation: Consultation, registerCustomer: boolean) => {
    setError('');
    setStatus('');
    if (!requirePassword()) return;

    if (registerCustomer) {
      prepareCustomerFromConsultation(consultation, true);
      setStatus('고객 정보를 확인한 뒤 저장하면 상담 완료와 현장 등록까지 함께 처리됩니다.');
      return;
    }

    setSavingOffice(true);
    try {
      await saveOfficeRecord('consultation', { status: '완료' }, consultation._id);
      setCompletionConsultation(null);
      setSelectedConsultation(null);
      setStatus('상담을 완료했습니다.');
    } finally {
      setSavingOffice(false);
    }
  };

  const scrollToForm = (ref: React.RefObject<HTMLDivElement | null>) => {
    window.setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const resetCustomerForm = () => {
    setEditingCustomerId('');
    setPendingConsultationForCustomer(null);
    setCustomerForm({ name: '', phone: '', siteType: '아파트', address: '', status: '상담중', memo: '', siteTitle: '', siteStatus: '상담중', siteMemo: '' });
  };

  const resetSiteForm = () => {
    setEditingSiteId('');
    setSiteForm({ title: '', customerName: '', customerPhone: '', siteType: '아파트', address: '', status: '상담중', memo: '' });
  };

  const resetSaleForm = () => {
    setEditingSaleId('');
    setSaleForm({ customerName: '', projectTitle: '', amount: '', cost: '', status: '견적', paymentDate: '', memo: '' });
  };

  const resetInventoryForm = () => {
    setEditingInventoryId('');
    setInventoryForm({ itemName: '', category: '', quantity: '', unit: '개', minQuantity: '', vendor: '', memo: '' });
  };

  const resetVendorForm = () => {
    setEditingVendorId('');
    setVendorForm({ name: '', manager: '', phone: '', service: '', status: '거래중', memo: '' });
  };

  const resetAccountForm = () => {
    setAccountForm({
      id: '',
      name: '',
      loginId: '',
      password: '',
      role: 'staff',
      permissions: ['dashboard', 'consultations'],
      isActive: true,
    });
  };

  const editAccount = (account: ManagerAccount) => {
    setAccountForm({
      id: account._id,
      name: account.name || '',
      loginId: account.loginId || '',
      password: '',
      role: account.role || 'staff',
      permissions: account.permissions?.length ? account.permissions : ['dashboard', 'consultations'],
      isActive: account.isActive !== false,
    });
  };

  const prepareCustomerFromConsultation = (consultation: Consultation, completeAfterSave = false) => {
    setEditingCustomerId('');
    setPendingConsultationForCustomer(completeAfterSave ? consultation : null);
    setCustomerForm({
      name: consultation.name || '',
      phone: consultation.phone || '',
      siteType: consultation.propertyType || consultation.siteType || '아파트',
      address: consultation.fullAddress || consultation.address || '',
      status: completeAfterSave ? '상담완료' : '상담중',
      memo: consultation.message || '',
      siteTitle: `${consultation.name || '고객'} 현장`,
      siteStatus: completeAfterSave ? '상담완료' : '상담중',
      siteMemo: consultation.message || '',
    });
    setSelectedConsultation(null);
    setCompletionConsultation(null);
    setActiveTab('customers');
    scrollToForm(customerFormRef);
  };

  const editCustomer = (customer: Customer) => {
    setEditingCustomerId(customer._id);
    setPendingConsultationForCustomer(null);
    setCustomerForm({
      name: customer.name || '',
      phone: customer.phone || '',
      siteType: customer.siteType || '아파트',
      address: customer.address || '',
      status: customer.status || '상담중',
      memo: customer.memo || '',
      siteTitle: '',
      siteStatus: '상담중',
      siteMemo: '',
    });
    scrollToForm(customerFormRef);
  };

  const editSite = (site: Site) => {
    setEditingSiteId(site._id);
    setSiteForm({
      title: site.title || '',
      customerName: site.customerName || '',
      customerPhone: site.customerPhone || '',
      siteType: site.siteType || '아파트',
      address: site.address || '',
      status: site.status || '상담중',
      memo: site.memo || '',
    });
    setActiveTab('sites');
    scrollToForm(siteFormRef);
  };

  const editSale = (sale: Sale) => {
    setEditingSaleId(sale._id);
    setSaleForm({
      customerName: sale.customerName || '',
      projectTitle: sale.projectTitle || '',
      amount: sale.amount ? String(sale.amount) : '',
      cost: sale.cost ? String(sale.cost) : '',
      status: sale.status || '견적',
      paymentDate: sale.paymentDate || '',
      memo: sale.memo || '',
    });
    scrollToForm(saleFormRef);
  };

  const editInventory = (item: InventoryItem) => {
    setEditingInventoryId(item._id);
    setInventoryForm({
      itemName: item.itemName || '',
      category: item.category || '',
      quantity: item.quantity ? String(item.quantity) : '',
      unit: item.unit || '개',
      minQuantity: item.minQuantity ? String(item.minQuantity) : '',
      vendor: item.vendor || '',
      memo: item.memo || '',
    });
    scrollToForm(inventoryFormRef);
  };

  const editVendor = (vendor: Vendor) => {
    setEditingVendorId(vendor._id);
    setVendorForm({
      name: vendor.name || '',
      manager: vendor.manager || '',
      phone: vendor.phone || '',
      service: vendor.service || '',
      status: vendor.status || '거래중',
      memo: vendor.memo || '',
    });
    scrollToForm(vendorFormRef);
  };

  const handleFolderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    setStatus('');
    setResults([]);
    setFiles(Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/')));
  };

  const handleFolderDrop = async (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setError('');
    setStatus('');
    setResults([]);

    try {
      const droppedFiles = await filesFromDrop(event.dataTransfer);
      setFiles(droppedFiles.filter((file) => file.type.startsWith('image/')));
      setStatus('업로드할 현장 폴더를 불러왔습니다.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '드래그한 폴더를 읽지 못했습니다.');
    }
  };

  const saveEmail = async () => {
    setError('');
    setStatus('');

    if (!requirePassword()) return;
    setSavingEmail(true);

    try {
      const response = await fetch('/api/manager/settings', {
        method: 'PATCH',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ consultationEmail }),
      });
      const data = await readJsonResponse<ManagerApiResponse>(response);

      if (!response.ok) throw new Error(data.error || '이메일 저장에 실패했습니다.');
      setStatus('상담문의 수신 이메일을 저장했습니다.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '이메일 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingEmail(false);
    }
  };

  const syncSurveySettings = (config: SurveyConfig) => {
    setSurveyDraft(config);
    setHomepageSettings((current) => ({
      ...current,
      consultationSurveyConfig: JSON.stringify(config),
      consultationPropertyQuestion: config.propertyStep.title,
      consultationPropertyOptions: config.propertyStep.options.join('\n'),
      consultationAreaQuestion: config.areaGroups[0]?.steps[0]?.title || '',
      consultationAreaOptions: config.areaGroups[0]?.steps[0]?.options.join('\n') || '',
      consultationStatusQuestion: config.areaGroups[0]?.steps[1]?.title || '',
      consultationStatusOptions: config.areaGroups[0]?.steps[1]?.options.join('\n') || '',
      consultationReasonQuestion: config.areaGroups[0]?.steps[2]?.title || '',
      consultationReasonOptions: config.areaGroups[0]?.steps[2]?.options.join('\n') || '',
      consultationBudgetQuestion: config.commonSteps[0]?.title || '',
      consultationBudgetOptions: config.commonSteps[0]?.options.join('\n') || '',
      consultationTimelineQuestion: config.commonSteps[1]?.title || '',
      consultationTimelineOptions: config.commonSteps[1]?.options.join('\n') || '',
    }));
  };

  const openSurveyEditor = () => {
    setSurveyDraft(parseSurveyConfig(homepageSettings.consultationSurveyConfig));
    setSurveyEditorTab(0);
    setIsSurveyEditorOpen(true);
  };

  const updateSurveyDraft = (updater: (current: SurveyConfig) => SurveyConfig) => {
    setSurveyDraft((current) => updater(current));
  };

  const updateSurveyStep = (stepIndex: number, updates: Partial<SurveyStep>) => {
    updateSurveyDraft((current) => {
      if (stepIndex === 0) {
        return { ...current, propertyStep: { ...current.propertyStep, ...updates } };
      }

      const commonIndex = stepIndex - 2;
      return {
        ...current,
        commonSteps: current.commonSteps.map((step, index) => (index === commonIndex ? { ...step, ...updates } : step)),
      };
    });
  };

  const updateSurveyOption = (stepIndex: number, optionIndex: number, value: string) => {
    const applyOptions = (options: string[]) => options.map((option, index) => (index === optionIndex ? value : option));
    updateSurveyStep(stepIndex, {
      options: stepIndex === 0 ? applyOptions(surveyDraft.propertyStep.options) : applyOptions(surveyDraft.commonSteps[stepIndex - 2]?.options || []),
    });
  };

  const addSurveyOption = (stepIndex: number) => {
    updateSurveyStep(stepIndex, {
      options: stepIndex === 0 ? [...surveyDraft.propertyStep.options, '새 선택지'] : [...(surveyDraft.commonSteps[stepIndex - 2]?.options || []), '새 선택지'],
    });
  };

  const removeSurveyOption = (stepIndex: number, optionIndex: number) => {
    updateSurveyStep(stepIndex, {
      options: stepIndex === 0 ? surveyDraft.propertyStep.options.filter((_, index) => index !== optionIndex) : (surveyDraft.commonSteps[stepIndex - 2]?.options || []).filter((_, index) => index !== optionIndex),
    });
  };

  const saveSurveyEditor = () => {
    const cleaned: SurveyConfig = {
      propertyStep: {
        ...surveyDraft.propertyStep,
        options: surveyDraft.propertyStep.options.map((option) => option.trim()).filter(Boolean),
      },
      areaGroups: surveyDraft.areaGroups
        .map((group, index) => ({
          ...group,
          id: group.id || `group-${index + 1}`,
          label: group.label.trim() || `묶음 ${index + 1}`,
          propertyOptions: group.propertyOptions.filter((option) => surveyDraft.propertyStep.options.includes(option)),
          steps: group.steps.slice(0, 3).map((step, stepIndex) => ({
            ...defaultSurveyConfig.areaGroups[0].steps[stepIndex],
            ...step,
            options: step.options.map((option) => option.trim()).filter(Boolean),
          })),
        }))
        .filter((group) => group.propertyOptions.length > 0),
      commonSteps: surveyDraft.commonSteps.map((step) => ({
        ...step,
        options: step.options.map((option) => option.trim()).filter(Boolean),
      })),
    };

    syncSurveySettings(cleaned);
    setIsSurveyEditorOpen(false);
  };

  const saveHomepageSettings = async () => {
    setError('');
    setStatus('');

    if (!requirePassword()) return;
    setSavingEmail(true);

    try {
      const response = await fetch('/api/manager/settings', {
        method: 'PATCH',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(homepageSettings),
      });
      const data = await readJsonResponse<ManagerApiResponse>(response);

      if (!response.ok) throw new Error(data.error || '홈페이지 설정 저장에 실패했습니다.');
      setConsultationEmail(homepageSettings.consultationEmail);
      setStatus('홈페이지 설정을 저장했습니다.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '홈페이지 설정 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingEmail(false);
    }
  };

  const uploadHomepageImage = async (field: 'heroImage' | 'heroImage2' | 'heroImage3' | 'popupImage', file?: File) => {
    setError('');
    setStatus('');
    if (!file) return;
    if (!requirePassword()) return;

    setSavingEmail(true);
    try {
      const formData = new FormData();
      formData.append('field', field);
      formData.append('file', file);

      const response = await fetch('/api/manager/settings-image', {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      const data = await readJsonResponse<{ assetUrl?: string; error?: string }>(response);

      if (!response.ok || !data.assetUrl) throw new Error(data.error || '이미지를 저장하지 못했습니다.');
      setHomepageSettings((current) => ({ ...current, [field]: data.assetUrl || '' }));
      setStatus('홈페이지 이미지를 저장했습니다.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '이미지 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingEmail(false);
    }
  };

  const uploadPopupItemImage = async (popupKey: string, file?: File, elementKey?: string) => {
    setError('');
    setStatus('');
    if (!file) return;
    if (!requirePassword()) return;

    setSavingEmail(true);
    try {
      const formData = new FormData();
      formData.append('field', 'popupUpload');
      formData.append('file', file);

      const response = await fetch('/api/manager/settings-image', {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      const data = await readJsonResponse<{ assetUrl?: string; error?: string }>(response);

      if (!response.ok || !data.assetUrl) throw new Error(data.error || '이미지를 저장하지 못했습니다.');
      setHomepageSettings((current) => ({
        ...current,
        popups: normalizePopupItems(current).map((popup) =>
          popup._key === popupKey
            ? elementKey
              ? {
                  ...popup,
                  elements: normalizePopupCanvasElements(popup.elements).map((element) => (element._key === elementKey ? { ...element, src: data.assetUrl || '' } : element)),
                }
              : { ...popup, imageUrl: data.assetUrl || '', image: data.assetUrl || '' }
            : popup,
        ),
      }));
      setStatus('팝업 이미지를 저장했습니다.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '이미지 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingEmail(false);
    }
  };

  const uploadProjects = async () => {
    setError('');
    setStatus('');
    setResults([]);

    if (!requirePassword()) return;

    if (files.length === 0) {
      setError('업로드할 현장 폴더를 선택해 주세요.');
      return;
    }

    const selectedCategory = officeData.categories.find((item) => item._id === category);
    const categoryTitle = newCategory.trim() || selectedCategory?.title || '';

    if (!categoryTitle) {
      setError('Project 분류를 선택하거나 새 카테고리를 입력해 주세요.');
      return;
    }

    setUploading(true);

    try {
      setStatus('사진을 웹용으로 압축하고 있습니다...');
      const preparedFiles = await prepareUploadFiles(files);
      const totalBytes = preparedFiles.reduce((total, item) => total + item.file.size, 0);

      if (totalBytes > MAX_UPLOAD_BYTES) {
        throw new Error('사진 용량이 아직 큽니다. 한 번에 올릴 사진 수를 줄이거나 원본 사진을 조금 더 작게 저장한 뒤 다시 시도해 주세요.');
      }

      const formData = new FormData();

      preparedFiles.forEach((item) => {
        formData.append('files', item.file);
      });

      formData.append('paths', JSON.stringify(preparedFiles.map((item) => item.path)));
      if (!newCategory.trim() && selectedCategory?._id) {
        formData.append('categoryId', selectedCategory._id);
      }
      formData.append('category', categoryTitle);
      formData.append('siteType', uploadSiteType);
      formData.append('location', uploadLocation);
      formData.append('description', uploadDescription);
      formData.append('area', uploadArea);
      formData.append('featured', String(featured));
      setStatus('Sanity로 업로드하고 있습니다...');

      const response = await fetch('/api/manager/bulk-upload', {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      const data = await readJsonResponse<ManagerApiResponse>(response);

      if (!response.ok) throw new Error(data.error || '업로드에 실패했습니다.');
      setResults(data.results || []);
      setFiles([]);
      setUploadInputKey((key) => key + 1);
      setCategory(officeData.categories[0]?._id || '');
      setNewCategory('');
      setUploadSiteType('아파트');
      setUploadLocation('');
      setUploadArea('');
      setUploadDescription('');
      setFeatured(false);
      setStatus('현장 사진 업로드가 완료되었습니다.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '업로드 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const selectProjectForEdit = (projectId: string) => {
    const project = officeData.projects.find((item) => item._id === projectId);
    setSelectedProjectId(projectId);
    setProjectTitle(project?.title || '');
    setProjectDescription(project?.description || '');
    setProjectCategoryId(project?.categoryId || '');
    setProjectNewCategory('');
    setProjectSiteType(project?.siteType || '아파트');
    setProjectLocation(project?.location || '');
    setProjectArea(project?.area ? String(project.area) : '');
    setProjectYear(project?.year || '');
    setProjectMaterials(project?.materials || '');
    setProjectBlogUrl(project?.blogUrl || '');
    setProjectDisplayOrder(project?.displayOrder ? String(project.displayOrder) : '');
    setProjectMainImagePosition(project?.mainImagePosition || 'center');
    setProjectMainImagePositionX(String(project?.mainImagePositionX ?? 50));
    setProjectMainImagePositionY(String(project?.mainImagePositionY ?? 50));
    setProjectFeatured(Boolean(project?.featured));
    setProjectVisible(project?.isVisible !== false);
  };

  const updateProjectImageFocus = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100));

    setProjectMainImagePosition('custom');
    setProjectMainImagePositionX(String(Math.round(x)));
    setProjectMainImagePositionY(String(Math.round(y)));
  };

  const saveProjectMainImage = async ({ file, option }: { file?: File; option?: ProjectImageOption }) => {
    setError('');
    setStatus('');
    if (!requirePassword()) return;

    const project = officeData.projects.find((item) => item._id === selectedProjectId);
    if (!project) {
      setError('대표사진을 등록할 Project를 먼저 선택해 주세요.');
      return;
    }

    if (!file && !option?.assetId) {
      setError('대표사진으로 사용할 이미지를 선택해 주세요.');
      return;
    }

    setUploadingMainImage(true);
    try {
      const formData = new FormData();
      formData.append('projectId', project._id);
      formData.append('alt', `${projectTitle || project.title || 'Project'} 대표 사진`);
      if (file) formData.append('file', file);
      if (option?.assetId) formData.append('assetId', option.assetId);
      if (option?.url) formData.append('assetUrl', option.url);

      const response = await fetch('/api/manager/project-main-image', {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      const data = await readJsonResponse<{ assetId?: string; assetUrl?: string; error?: string }>(response);
      if (!response.ok) throw new Error(data.error || '대표사진을 저장하지 못했습니다.');

      const nextImage = data.assetUrl || option?.url || project.mainImage;
      setOfficeData((previous) => ({
        ...previous,
        projects: previous.projects.map((item) =>
          item._id === project._id
            ? {
                ...item,
                mainImage: nextImage,
                mainImageAssetId: data.assetId || option?.assetId || item.mainImageAssetId,
                mainImageAlt: `${projectTitle || project.title || 'Project'} 대표 사진`,
              }
            : item,
        ),
      }));
      setProjectMainImagePosition('custom');
      setStatus('대표사진을 저장했습니다. 16:9 미리보기에서 보이는 위치를 맞춘 뒤 Project 정보를 저장해 주세요.');
      await loadOfficeData(password, { silent: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '대표사진 저장 중 오류가 발생했습니다.');
    } finally {
      setUploadingMainImage(false);
    }
  };

  const saveProjectClassification = async () => {
    setError('');
    setStatus('');
    if (!requirePassword()) return;

    const project = officeData.projects.find((item) => item._id === selectedProjectId);
    if (!project) {
      setError('분류를 변경할 Project를 선택해 주세요.');
      return;
    }

    const selectedCategory = officeData.categories.find((item) => item._id === projectCategoryId);
    const categoryTitle = projectNewCategory.trim() || selectedCategory?.title || '';
    if (!categoryTitle) {
      setError('카테고리를 선택하거나 새 카테고리를 입력해 주세요.');
      return;
    }

    setSavingOffice(true);
    try {
      let categoryRef = projectCategoryId;

      if (projectNewCategory.trim()) {
        const response = await fetch('/api/manager/office', {
          method: 'POST',
          headers: {
            ...authHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'category',
            data: { title: projectNewCategory.trim() },
          }),
        });
        const data = await readJsonResponse<{ record?: { _id?: string }; error?: string }>(response);
        if (!response.ok || !data.record?._id) throw new Error(data.error || '새 카테고리를 만들지 못했습니다.');
        categoryRef = data.record._id;
      }

      await saveOfficeRecord(
        'project',
        {
          category: { _type: 'reference', _ref: categoryRef },
          title: projectTitle,
          description: projectDescription,
          siteType: projectSiteType,
          location: projectLocation,
          area: Number(projectArea || 0),
          year: projectYear,
          materials: projectMaterials,
          blogUrl: projectBlogUrl,
          displayOrder: Number(projectDisplayOrder || 0),
          mainImagePosition: projectMainImagePosition,
          mainImagePositionX: Number(projectMainImagePositionX || 50),
          mainImagePositionY: Number(projectMainImagePositionY || 50),
          featured: projectFeatured,
          isVisible: projectVisible,
        },
        project._id,
      );
      setProjectNewCategory('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Project 분류 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingOffice(false);
    }
  };

  const previewFocus = (key: keyof typeof homepagePreviewTargets) => ({
    onFocus: () => setActivePreviewTarget(homepagePreviewTargets[key]),
  });

  return (
    <main className="min-h-screen bg-[#edf2f5] text-[#171512]">
      {!isUnlocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17212b]/72 px-4 backdrop-blur-sm">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleLogin();
            }}
            className="w-full max-w-md rounded-lg border border-[#d5dde2] bg-white p-6 shadow-2xl"
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-[#edf8fb] text-[#38a9bd]">
                <ShieldCheck size={22} />
              </span>
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#38a9bd]">WEVE MANAGER</p>
                <h1 className="text-2xl font-semibold tracking-normal">관리자 로그인</h1>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-[#60717d]">
              계정별 권한에 따라 사무업무와 홈페이지 관리 메뉴를 표시합니다.
            </p>
            <label className="mt-5 grid gap-2 text-sm font-semibold text-[#4d5d66]">
              계정 ID 또는 이메일
              <input
                type="text"
                value={loginId}
                onChange={(event) => setLoginId(event.target.value)}
                autoFocus
                className="rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-3 font-normal outline-none focus:border-[#38a9bd]"
              />
            </label>
            <label className="mt-4 grid gap-2 text-sm font-semibold text-[#4d5d66]">
              비밀번호
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                className="rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-3 font-normal outline-none focus:border-[#38a9bd]"
              />
            </label>
            <button
              type="submit"
              disabled={loadingOffice}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#171512] px-5 py-3 font-semibold text-white disabled:opacity-60"
            >
              {loadingOffice ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
              로그인
            </button>
            {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
          </form>
        </div>
      )}
      <div className={`min-h-screen ${!isUnlocked ? 'hidden' : 'flex'}`}>
        <aside className="hidden w-64 shrink-0 flex-col bg-[#273541] text-[#dfe8ed] lg:flex">
          <div className="border-b border-white/10 px-6 py-6">
            <div className="flex items-center gap-3">
              <img src="/weve-mark.png" alt="WEVE DESIGN" className="brand-mark-on-dark h-12 w-28 object-contain" />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#9fd4e8]">WEVE OFFICE</p>
                <h1 className="mt-1 text-xl font-semibold text-white">통합 관리</h1>
              </div>
            </div>
            <p className="mt-4 text-xs text-[#9fb1bd]">{currentUser?.name || '관리자'} · {currentUser?.role === 'admin' ? '총괄 관리자' : '실무 계정'}</p>
          </div>
          <nav className="grid gap-1 px-3 py-4">
            {visibleTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-3 rounded-md px-4 py-3 text-left text-sm font-semibold transition ${
                  activeTab === tab.key ? 'bg-[#38bcd4] text-white' : 'text-[#dfe8ed] hover:bg-white/8 hover:text-white'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
          <div className="mt-auto grid gap-2 border-t border-white/10 p-3">
            <button
              type="button"
              onClick={() => window.open('/', '_blank', 'noopener,noreferrer')}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/16"
            >
              <Home size={16} />
              홈페이지 가기
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 px-4 py-3 text-sm font-semibold text-[#dfe8ed] transition hover:bg-white/8"
            >
              <LogOut size={16} />
              로그아웃
            </button>
          </div>
        </aside>

        <section className="min-w-0 flex-1 px-4 py-5 md:px-6">
          <header className="mb-5 rounded-lg border border-[#d5dde2] bg-white p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#38a9bd]">WEVE MANAGER</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-normal md:text-4xl">사무업무 통합 콘솔</h1>
                <p className="mt-2 text-sm text-[#60717d]">상담, 고객, 매출, 재고, 협력업체, 홈페이지 관리를 한 곳에서 처리합니다.</p>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <span className="rounded-full border border-[#d5dde2] bg-[#f7fafb] px-3 py-1 text-xs font-semibold text-[#60717d]">
                  접속자 오늘 {visitStats?.todayCount ?? 0} · 이번 주 {visitStats?.weekCount ?? 0}
                </span>
                <button type="button" onClick={handleLogout} className="inline-flex items-center gap-2 text-sm font-semibold text-[#60717d] hover:text-[#171512]">
                  <LogOut size={15} />
                  로그아웃
                </button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#60717d]">
              <span className="rounded-full bg-[#edf8fb] px-3 py-1 text-[#267d8c]">자동 갱신 {OFFICE_REFRESH_SECONDS}초</span>
              {lastRefreshedAt && <span className="rounded-full bg-[#f7fafb] px-3 py-1">마지막 갱신 {lastRefreshedAt}</span>}
            </div>
            <div className="mt-5 lg:hidden">
              <div className="flex gap-2 overflow-x-auto">
                {visibleTabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${
                      activeTab === tab.key ? 'bg-[#171512] text-white' : 'bg-white text-[#4d5d66]'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </header>

        {activeTab === 'dashboard' && (
          <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard title="신규 상담" value={`${officeData.consultations.filter((item) => item.status !== '완료').length}건`} sub="미완료 상담" />
            <MetricCard title="고객" value={`${officeData.customers.length}명`} sub="등록 고객" />
            <MetricCard title="현장" value={`${officeData.sites.length}곳`} sub="관리 현장" />
            <MetricCard title="매출" value={formatMoney(salesTotal)} sub={`예상 이익 ${formatMoney(profitTotal)}`} />
            <MetricCard title="재고" value={`${officeData.inventory.length}개`} sub={`부족 ${lowStockCount}개`} />
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <Panel title="최근 상담 요청">
              <RecordList
                empty="상담 기록이 없습니다."
                items={officeData.consultations.slice(0, 6).map((item) => ({
                  key: item._id,
                  title: `${item.name || '이름 없음'} · ${item.phone || '연락처 없음'}`,
                  meta: `${item.siteType || '현장 종류 없음'} · ${item.address || '주소 없음'} · ${item.status || '신규'}`,
                  body: item.message,
                  onClick: () => setSelectedConsultation(item),
                  action: (
                    <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                      <button onClick={() => setCompletionConsultation(item)} className="rounded-md bg-[#38bcd4] px-3 py-1 text-xs font-semibold text-white">
                        상담 완료
                      </button>
                      <button onClick={() => deleteOfficeRecord(item._id)} className="rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-600">
                        삭제
                      </button>
                    </div>
                  ),
                }))}
              />
            </Panel>
            <Panel title="이번 매출 메모">
              <RecordList
                empty="매출 기록이 없습니다."
                items={officeData.sales.slice(0, 6).map((item) => ({
                  key: item._id,
                  title: `${item.projectTitle || item.customerName || '매출 항목'} · ${formatMoney(Number(item.amount || 0))}`,
                  meta: `${item.status || '상태 없음'} · 원가 ${formatMoney(Number(item.cost || 0))}`,
                  body: item.memo,
                }))}
              />
            </Panel>
          </div>
        )}

        {activeTab === 'consultations' && (
          <Panel title="상담 요청 관리">
            <RecordList
              empty="상담 기록이 없습니다. 홈페이지 상담폼으로 들어온 요청이 이곳에 쌓입니다."
              items={officeData.consultations.map((item) => ({
                key: item._id,
                title: `${item.name || '이름 없음'} · ${item.phone || '연락처 없음'}`,
                meta: `${item.propertyType || item.siteType || '공간 종류 없음'} · ${item.areaRange || '평수 미선택'} · ${item.budget || '예산 미선택'} · ${item.timeline || '일정 미선택'} · ${item.status || '신규'} · ${formatDate(item.createdAt)}`,
                body: item.message,
                onClick: () => setSelectedConsultation(item),
                action: (
                  <div className="flex flex-wrap items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                    <span className={`inline-flex min-w-20 justify-center rounded-full px-3 py-1 text-xs font-bold ${statusBadgeClass(item.status || '신규')}`}>
                      {item.status || '신규'}
                    </span>
                    <select
                      value={item.status || '신규'}
                      onChange={(event) => saveOfficeRecord('consultation', { status: event.target.value }, item._id)}
                      className="rounded-md border border-[#d8d1c5] bg-white px-3 py-1.5 text-xs font-semibold outline-none focus:border-[#38a9bd]"
                      aria-label="상담 상태 변경"
                    >
                      {CONSULTATION_STATUSES.map((nextStatus) => (
                        <option key={nextStatus} value={nextStatus}>
                          {nextStatus}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => prepareCustomerFromConsultation(item)}
                      className="rounded-md bg-[#f1c76a] px-3 py-1.5 text-xs font-semibold"
                    >
                      고객으로 등록
                    </button>
                    <button onClick={() => setCompletionConsultation(item)} className="rounded-md bg-[#38bcd4] px-3 py-1.5 text-xs font-semibold text-white">
                      상담 완료
                    </button>
                    <button onClick={() => deleteOfficeRecord(item._id)} className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600">
                      삭제
                    </button>
                  </div>
                ),
              }))}
            />
          </Panel>
        )}

        {activeTab === 'customers' && (
          <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <Panel title={editingCustomerId ? '고객 수정' : '고객 등록'}>
              <div ref={customerFormRef}>
              {pendingConsultationForCustomer && (
                <div className="mb-4 rounded-lg border border-[#f1c76a] bg-[#fff9e8] p-4 text-sm leading-6 text-[#6e5420]">
                  상담 요청에서 가져온 고객입니다. 내용을 확인한 뒤 저장하면 상담은 완료 처리되고 비공개 현장이 함께 등록됩니다.
                </div>
              )}
              <OfficeForm
                fields={[
                  { label: '고객명', value: customerForm.name, onChange: (value) => setCustomerForm({ ...customerForm, name: value }) },
                  { label: '연락처', value: customerForm.phone, onChange: (value) => setCustomerForm({ ...customerForm, phone: formatPhoneNumber(value) }) },
                  {
                    label: '현장 종류',
                    value: customerForm.siteType,
                    onChange: (value) => setCustomerForm({ ...customerForm, siteType: value }),
                    options: ['아파트', '주택', '상가', '오피스', '기타'],
                  },
                  { label: '주소', value: customerForm.address, onChange: (value) => setCustomerForm({ ...customerForm, address: value }) },
                  { label: '상태', value: customerForm.status, onChange: (value) => setCustomerForm({ ...customerForm, status: value }) },
                  { label: '메모', value: customerForm.memo, onChange: (value) => setCustomerForm({ ...customerForm, memo: value }), textarea: true },
                  { label: '현장명', value: customerForm.siteTitle, onChange: (value) => setCustomerForm({ ...customerForm, siteTitle: value }) },
                  {
                    label: '현장 상태',
                    value: customerForm.siteStatus,
                    onChange: (value) => setCustomerForm({ ...customerForm, siteStatus: value }),
                    options: SITE_STATUSES,
                  },
                  { label: '현장 메모', value: customerForm.siteMemo, onChange: (value) => setCustomerForm({ ...customerForm, siteMemo: value }), textarea: true },
                ]}
                buttonLabel={pendingConsultationForCustomer ? '고객 저장 + 현장 등록' : editingCustomerId ? '고객 수정 저장' : '고객 저장 + 현장 등록'}
                disabled={savingOffice}
                onSubmit={async () => {
                  const { siteTitle, siteStatus, siteMemo, ...customerData } = customerForm;
                  const savedCustomer = await saveOfficeRecord('customer', customerData, editingCustomerId || undefined);
                  if (!savedCustomer) return;

                  const shouldCreateSite = Boolean(pendingConsultationForCustomer || siteTitle.trim() || (!editingCustomerId && (customerForm.address || customerForm.name)));
                  if (shouldCreateSite) {
                    await saveOfficeRecord('site', {
                      title: siteTitle.trim() || `${customerForm.name || pendingConsultationForCustomer?.name || '고객'} 현장`,
                      customerName: customerForm.name || pendingConsultationForCustomer?.name || '',
                      customerPhone: customerForm.phone || pendingConsultationForCustomer?.phone || '',
                      customerId: savedCustomer._id,
                      consultationId: pendingConsultationForCustomer?._id || '',
                      siteType: customerForm.siteType || pendingConsultationForCustomer?.propertyType || pendingConsultationForCustomer?.siteType || '',
                      address: customerForm.address || pendingConsultationForCustomer?.fullAddress || pendingConsultationForCustomer?.address || '',
                      status: siteStatus || customerForm.status || '상담중',
                      memo: siteMemo || customerForm.memo || pendingConsultationForCustomer?.message || '',
                    });
                  }

                  if (pendingConsultationForCustomer) {
                    await saveOfficeRecord('consultation', { status: '완료' }, pendingConsultationForCustomer._id);
                    setStatus('고객과 현장을 등록하고 상담을 완료했습니다.');
                  } else if (shouldCreateSite) {
                    setStatus('고객과 현장을 함께 등록했습니다.');
                  }
                  resetCustomerForm();
                }}
                secondaryLabel={editingCustomerId || pendingConsultationForCustomer ? '취소' : undefined}
                onSecondary={resetCustomerForm}
              />
              </div>
            </Panel>
            <Panel title="고객 목록">
              <RecordList
                empty="등록된 고객이 없습니다."
                items={officeData.customers.map((item) => ({
                  key: item._id,
                  title: `${item.name || '이름 없음'} · ${item.phone || '연락처 없음'}`,
                  meta: `${item.siteType || '현장 종류 없음'} · ${item.address || '주소 없음'} · ${item.status || '상태 없음'}`,
                  body: item.memo,
                  action: (
                    <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                      <button onClick={() => editCustomer(item)} className="rounded-md border border-[#d8d1c5] px-3 py-1 text-xs font-semibold">
                        수정
                      </button>
                      <button onClick={() => deleteOfficeRecord(item._id)} className="rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-600">
                        삭제
                      </button>
                    </div>
                  ),
                }))}
              />
            </Panel>
          </div>
        )}

        {activeTab === 'sites' && (
          <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <Panel title={editingSiteId ? '현장 수정' : '현장 등록'}>
              <div ref={siteFormRef}>
                <OfficeForm
                  fields={[
                    { label: '현장명', value: siteForm.title, onChange: (value) => setSiteForm({ ...siteForm, title: value }) },
                    { label: '고객명', value: siteForm.customerName, onChange: (value) => setSiteForm({ ...siteForm, customerName: value }) },
                    { label: '연락처', value: siteForm.customerPhone, onChange: (value) => setSiteForm({ ...siteForm, customerPhone: formatPhoneNumber(value) }) },
                    {
                      label: '현장 종류',
                      value: siteForm.siteType,
                      onChange: (value) => setSiteForm({ ...siteForm, siteType: value }),
                      options: ['아파트', '주택', '상가', '오피스', '기타'],
                    },
                    { label: '주소', value: siteForm.address, onChange: (value) => setSiteForm({ ...siteForm, address: value }) },
                    {
                      label: '상태',
                      value: siteForm.status,
                      onChange: (value) => setSiteForm({ ...siteForm, status: value }),
                      options: SITE_STATUSES,
                    },
                    { label: '메모', value: siteForm.memo, onChange: (value) => setSiteForm({ ...siteForm, memo: value }), textarea: true },
                  ]}
                  buttonLabel={editingSiteId ? '현장 수정 저장' : '현장 저장'}
                  disabled={savingOffice}
                  onSubmit={async () => {
                    const savedSite = await saveOfficeRecord('site', siteForm, editingSiteId || undefined);
                    resetSiteForm();
                    if (!editingSiteId && savedSite?._id) {
                      window.location.href = `/manager-weve-7519/estimate?siteId=${encodeURIComponent(savedSite._id)}`;
                    }
                  }}
                  secondaryLabel={editingSiteId ? '수정 취소' : undefined}
                  onSecondary={resetSiteForm}
                />
              </div>
            </Panel>
            <Panel title="현장 목록">
              <RecordList
                empty="등록된 현장이 없습니다."
                items={officeData.sites.map((item) => ({
                  key: item._id,
                  title: `${item.title || '현장명 없음'} · ${item.customerName || '고객명 없음'}`,
                  meta: `${item.siteType || '현장 종류 없음'} · ${item.address || '주소 없음'} · ${item.status || '상태 없음'}`,
                  body: item.memo,
                  action: (
                    <div className="flex flex-wrap items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                      <span className={`inline-flex min-w-20 justify-center rounded-full px-3 py-1 text-xs font-bold ${statusBadgeClass(item.status || '상담중')}`}>
                        {item.status || '상담중'}
                      </span>
                      <button onClick={() => editSite(item)} className="rounded-md border border-[#d8d1c5] px-3 py-1 text-xs font-semibold">
                        수정
                      </button>
                      <button onClick={() => deleteOfficeRecord(item._id)} className="rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-600">
                        삭제
                      </button>
                    </div>
                  ),
                }))}
              />
            </Panel>
          </div>
        )}

        {activeTab === 'estimates' && (
          <EstimateSitesPanel
            sites={officeData.sites}
            estimates={officeData.estimates}
            onCreateSite={() => setActiveTab('sites')}
          />
        )}

        {activeTab === 'sales' && (
          <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <Panel title={editingSaleId ? '매출 수정' : '매출 등록'}>
              <div ref={saleFormRef}>
              <OfficeForm
                fields={[
                  { label: '고객명', value: saleForm.customerName, onChange: (value) => setSaleForm({ ...saleForm, customerName: value }) },
                  { label: '현장명', value: saleForm.projectTitle, onChange: (value) => setSaleForm({ ...saleForm, projectTitle: value }) },
                  { label: '매출액', value: saleForm.amount, onChange: (value) => setSaleForm({ ...saleForm, amount: onlyNumber(value) }) },
                  { label: '원가', value: saleForm.cost, onChange: (value) => setSaleForm({ ...saleForm, cost: onlyNumber(value) }) },
                  { label: '상태', value: saleForm.status, onChange: (value) => setSaleForm({ ...saleForm, status: value }) },
                  { label: '입금일', value: saleForm.paymentDate, onChange: (value) => setSaleForm({ ...saleForm, paymentDate: value }) },
                  { label: '메모', value: saleForm.memo, onChange: (value) => setSaleForm({ ...saleForm, memo: value }), textarea: true },
                ]}
                buttonLabel={editingSaleId ? '매출 수정 저장' : '매출 저장'}
                disabled={savingOffice}
                onSubmit={async () => {
                  await saveOfficeRecord('sale', {
                    ...saleForm,
                    amount: Number(saleForm.amount || 0),
                    cost: Number(saleForm.cost || 0),
                  }, editingSaleId || undefined);
                  resetSaleForm();
                }}
                secondaryLabel={editingSaleId ? '수정 취소' : undefined}
                onSecondary={resetSaleForm}
              />
              </div>
            </Panel>
            <Panel title="매출 목록">
              <RecordList
                empty="등록된 매출이 없습니다."
                items={officeData.sales.map((item) => ({
                  key: item._id,
                  title: `${item.projectTitle || item.customerName || '매출 항목'} · ${formatMoney(Number(item.amount || 0))}`,
                  meta: `${item.status || '상태 없음'} · 원가 ${formatMoney(Number(item.cost || 0))} · 이익 ${formatMoney(Number(item.amount || 0) - Number(item.cost || 0))}`,
                  body: item.memo,
                  action: (
                    <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                      <button onClick={() => editSale(item)} className="rounded-md border border-[#d8d1c5] px-3 py-1 text-xs font-semibold">
                        수정
                      </button>
                      <button onClick={() => deleteOfficeRecord(item._id)} className="rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-600">
                        삭제
                      </button>
                    </div>
                  ),
                }))}
              />
            </Panel>
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <Panel title={editingInventoryId ? '재고 수정' : '재고 등록'}>
              <div ref={inventoryFormRef}>
              <OfficeForm
                fields={[
                  { label: '품목명', value: inventoryForm.itemName, onChange: (value) => setInventoryForm({ ...inventoryForm, itemName: value }) },
                  { label: '분류', value: inventoryForm.category, onChange: (value) => setInventoryForm({ ...inventoryForm, category: value }) },
                  { label: '수량', value: inventoryForm.quantity, onChange: (value) => setInventoryForm({ ...inventoryForm, quantity: onlyNumber(value) }) },
                  { label: '단위', value: inventoryForm.unit, onChange: (value) => setInventoryForm({ ...inventoryForm, unit: value }) },
                  { label: '최소 수량', value: inventoryForm.minQuantity, onChange: (value) => setInventoryForm({ ...inventoryForm, minQuantity: onlyNumber(value) }) },
                  { label: '거래처', value: inventoryForm.vendor, onChange: (value) => setInventoryForm({ ...inventoryForm, vendor: value }) },
                  { label: '메모', value: inventoryForm.memo, onChange: (value) => setInventoryForm({ ...inventoryForm, memo: value }), textarea: true },
                ]}
                buttonLabel={editingInventoryId ? '재고 수정 저장' : '재고 저장'}
                disabled={savingOffice}
                onSubmit={async () => {
                  await saveOfficeRecord('inventory', {
                    ...inventoryForm,
                    quantity: Number(inventoryForm.quantity || 0),
                    minQuantity: Number(inventoryForm.minQuantity || 0),
                  }, editingInventoryId || undefined);
                  resetInventoryForm();
                }}
                secondaryLabel={editingInventoryId ? '수정 취소' : undefined}
                onSecondary={resetInventoryForm}
              />
              </div>
            </Panel>
            <Panel title="재고 목록">
              <RecordList
                empty="등록된 재고가 없습니다."
                items={officeData.inventory.map((item) => ({
                  key: item._id,
                  title: `${item.itemName || '품목'} · ${Number(item.quantity || 0)}${item.unit || ''}`,
                  meta: `${item.category || '분류 없음'} · 최소 ${Number(item.minQuantity || 0)}${item.unit || ''} · ${item.vendor || '거래처 없음'}`,
                  body: item.memo,
                  action: (
                    <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                      <button onClick={() => editInventory(item)} className="rounded-md border border-[#d8d1c5] px-3 py-1 text-xs font-semibold">
                        수정
                      </button>
                      <button onClick={() => deleteOfficeRecord(item._id)} className="rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-600">
                        삭제
                      </button>
                    </div>
                  ),
                }))}
              />
            </Panel>
          </div>
        )}

        {activeTab === 'vendors' && (
          <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <Panel title={editingVendorId ? '협력업체 수정' : '협력업체 등록'}>
              <div ref={vendorFormRef}>
              <OfficeForm
                fields={[
                  { label: '업체명', value: vendorForm.name, onChange: (value) => setVendorForm({ ...vendorForm, name: value }) },
                  { label: '담당자', value: vendorForm.manager, onChange: (value) => setVendorForm({ ...vendorForm, manager: value }) },
                  { label: '연락처', value: vendorForm.phone, onChange: (value) => setVendorForm({ ...vendorForm, phone: formatPhoneNumber(value) }) },
                  { label: '업무 분야', value: vendorForm.service, onChange: (value) => setVendorForm({ ...vendorForm, service: value }) },
                  { label: '상태', value: vendorForm.status, onChange: (value) => setVendorForm({ ...vendorForm, status: value }) },
                  { label: '메모', value: vendorForm.memo, onChange: (value) => setVendorForm({ ...vendorForm, memo: value }), textarea: true },
                ]}
                buttonLabel={editingVendorId ? '협력업체 수정 저장' : '협력업체 저장'}
                disabled={savingOffice}
                onSubmit={async () => {
                  await saveOfficeRecord('vendor', vendorForm, editingVendorId || undefined);
                  resetVendorForm();
                }}
                secondaryLabel={editingVendorId ? '수정 취소' : undefined}
                onSecondary={resetVendorForm}
              />
              </div>
            </Panel>
            <Panel title="협력업체 목록">
              <RecordList
                empty="등록된 협력업체가 없습니다."
                items={officeData.vendors.map((item) => ({
                  key: item._id,
                  title: `${item.name || '업체명 없음'} · ${item.service || '업무 분야 없음'}`,
                  meta: `${item.manager || '담당자 없음'} · ${item.phone || '연락처 없음'} · ${item.status || '상태 없음'}`,
                  body: item.memo,
                  action: (
                    <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                      <button onClick={() => editVendor(item)} className="rounded-md border border-[#d8d1c5] px-3 py-1 text-xs font-semibold">
                        수정
                      </button>
                      <button onClick={() => deleteOfficeRecord(item._id)} className="rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-600">
                        삭제
                      </button>
                    </div>
                  ),
                }))}
              />
            </Panel>
          </div>
        )}

        {activeTab === 'accounts' && currentUser?.role === 'admin' && (
          <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
            <Panel title={accountForm.id ? '계정 권한 수정' : '계정 생성'}>
              <div className="grid gap-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <SettingInput label="이름" value={accountForm.name} onChange={(value) => setAccountForm({ ...accountForm, name: value })} placeholder="예: 현장 관리자" />
                <SettingInput label="로그인 이메일" value={accountForm.loginId} onChange={(value) => setAccountForm({ ...accountForm, loginId: value.trim() })} placeholder="예: staff@wevedesign.co.kr" />
                  <SettingInput
                    label={accountForm.id ? '새 비밀번호(변경 시 입력)' : '비밀번호'}
                    value={accountForm.password}
                    onChange={(value) => setAccountForm({ ...accountForm, password: value })}
                    placeholder="계정 비밀번호"
                  />
                  <label className="grid gap-1 text-sm font-semibold text-[#4d5d66]">
                    역할
                    <select
                      value={accountForm.role}
                      onChange={(event) => setAccountForm({ ...accountForm, role: event.target.value as 'admin' | 'staff' })}
                      className="rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-3 font-normal outline-none focus:border-[#38a9bd]"
                    >
                      <option value="staff">실무 계정</option>
                      <option value="admin">총괄 관리자</option>
                    </select>
                  </label>
                </div>
                <div className="rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">접속 권한</h3>
                      <p className="mt-1 text-sm text-[#60717d]">계정별로 접근 가능한 관리자 카테고리를 선택합니다.</p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#4d5d66]">
                      <input
                        type="checkbox"
                        checked={accountForm.isActive}
                        onChange={(event) => setAccountForm({ ...accountForm, isActive: event.target.checked })}
                      />
                      사용
                    </label>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {tabs.map((tab) => {
                      const checked = accountForm.role === 'admin' || accountForm.permissions.includes(tab.key);
                      return (
                        <label key={tab.key} className="flex items-center gap-3 rounded-md border border-[#d5dde2] bg-white px-4 py-3 text-sm font-semibold">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={accountForm.role === 'admin'}
                            onChange={(event) => {
                              const next = event.target.checked
                                ? Array.from(new Set([...accountForm.permissions, tab.key]))
                                : accountForm.permissions.filter((permission) => permission !== tab.key);
                              setAccountForm({ ...accountForm, permissions: next });
                            }}
                          />
                          {tab.icon}
                          {tab.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={saveAccount}
                    disabled={savingOffice}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-[#171512] px-5 py-3 font-semibold text-white disabled:opacity-60"
                  >
                    {savingOffice ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                    계정 저장
                  </button>
                  {accountForm.id && (
                    <button type="button" onClick={resetAccountForm} className="rounded-md border border-[#d5dde2] bg-white px-5 py-3 font-semibold">
                      수정 취소
                    </button>
                  )}
                </div>
              </div>
            </Panel>
            <Panel title="계정 목록">
              {!firebaseToken && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                  현재 기존 관리자 비밀번호 세션입니다. Firebase 사용자 목록을 보려면 로그아웃 후 Firebase 이메일 계정으로 다시 로그인하세요.
                  Firebase 계정의 UID는 Realtime Database의 launcher_admins에도 true로 등록되어 있어야 합니다.
                </div>
              )}
              <RecordList
                empty="등록된 실무 계정이 없습니다."
                items={visibleAccounts.map((account) => ({
                  key: account._id,
                  title: `${account.name || '이름 없음'} · ${account.loginId || 'ID 없음'}`,
                  meta: `${account.role === 'admin' ? '총괄 관리자' : '실무 계정'} · ${account.isActive === false ? '비활성' : '사용 중'}`,
                  body: (Array.isArray(account.permissions) ? account.permissions : [])
                    .map((permission) => tabs.find((tab) => tab.key === permission)?.label || permission)
                    .join(', '),
                  action: (
                    <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                      <button onClick={() => editAccount(account)} className="rounded-md border border-[#d8d1c5] px-3 py-1 text-xs font-semibold">
                        수정
                      </button>
                      <button onClick={() => deleteAccount(account._id)} className="rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-600">
                        삭제
                      </button>
                    </div>
                  ),
                }))}
              />
            </Panel>
            <Panel title="카카오 채널">
              <div className="grid gap-3">
                <div className="rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-4">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[#ffe812] text-[#171512]">
                      <MessageCircle size={20} />
                    </span>
                    <div>
                      <p className="font-semibold">채팅 요청 확인</p>
                      <p className="mt-1 text-sm leading-6 text-[#60717d]">
                        카카오 비즈니스 채널에서 들어온 채팅은 채널 관리자 페이지에서 확인합니다. 링크를 저장하면 이곳에서 바로 열 수 있습니다.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {homepageSettings.kakaoChannelManagerUrl && (
                      <a
                        href={homepageSettings.kakaoChannelManagerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white"
                      >
                        채널 관리 열기
                        <ExternalLink size={15} />
                      </a>
                    )}
                    {homepageSettings.kakaoUrl && (
                      <a
                        href={homepageSettings.kakaoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-md border border-[#d5dde2] bg-white px-4 py-2 text-sm font-semibold"
                      >
                        고객 상담 링크
                        <ExternalLink size={15} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </Panel>
          </div>
        )}

        {activeTab === 'portfolio' && (
          <div className="grid gap-5">
            <div className="flex flex-wrap gap-2 rounded-lg border border-[#d5dde2] bg-white p-2 shadow-sm">
              {[
                { key: 'basic', label: '기본 정보' },
                { key: 'hero', label: '첫 화면' },
                { key: 'sections', label: '섹션 문구' },
                { key: 'contact', label: '상담/위치' },
                { key: 'popup', label: '팝업 관리' },
                { key: 'projects', label: 'Project 관리' },
                { key: 'survey', label: '상담 설문' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setHomepageTab(item.key as HomepageTabKey)}
                  className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                    homepageTab === item.key ? 'bg-[#171512] text-white' : 'bg-[#f7fafb] text-[#4d5d66] hover:bg-[#edf2f5]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <Panel title="홈페이지 관리">
                <div className={`grid gap-5 ${homepageTab === 'popup' || homepageTab === 'projects' ? '' : '2xl:grid-cols-[minmax(0,1fr)_460px]'}`}>
                  <div className="grid gap-5">
                    {homepageTab === 'basic' && (
                      <section className="rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-4">
                        <h3 className="mb-3 font-semibold">기본 회사 정보</h3>
                        <div className="grid gap-3 md:grid-cols-2">
                          <SettingInput label="상담문의 이메일" value={homepageSettings.consultationEmail} onChange={(value) => setHomepageSettings({ ...homepageSettings, consultationEmail: value })} {...previewFocus('consultationEmail')} />
                          <SettingInput label="대표자명" value={homepageSettings.representativeName} onChange={(value) => setHomepageSettings({ ...homepageSettings, representativeName: value })} placeholder="예: 김동호" {...previewFocus('representativeName')} />
                          <SettingInput label="사업자등록번호" value={homepageSettings.businessNumber} onChange={(value) => setHomepageSettings({ ...homepageSettings, businessNumber: value })} placeholder="예: 123-45-67890" {...previewFocus('businessNumber')} />
                          <SettingInput label="회사 시작 연도" value={homepageSettings.companyStartYear} onChange={(value) => setHomepageSettings({ ...homepageSettings, companyStartYear: onlyNumber(value).slice(0, 4) })} placeholder="예: 2020" {...previewFocus('companyStartYear')} />
                          <SettingInput label="대표 연락처" value={homepageSettings.phone} onChange={(value) => setHomepageSettings({ ...homepageSettings, phone: formatPhoneNumber(value) })} {...previewFocus('phone')} />
                          <SettingInput label="도로명 주소" value={homepageSettings.address} onChange={(value) => setHomepageSettings({ ...homepageSettings, address: value })} {...previewFocus('address')} />
                          <SettingInput label="지번 주소" value={homepageSettings.lotAddress} onChange={(value) => setHomepageSettings({ ...homepageSettings, lotAddress: value })} {...previewFocus('lotAddress')} />
                        </div>
                      </section>
                    )}

                    {homepageTab === 'hero' && (
                      <section className="rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-4">
                        <h3 className="mb-3 font-semibold">첫 화면 배너</h3>
                        <div className="grid gap-4 xl:grid-cols-3">
                          {[
                            ['heroImage', '배너 이미지 1'],
                            ['heroImage2', '배너 이미지 2'],
                            ['heroImage3', '배너 이미지 3'],
                          ].map(([field, label]) => (
                            <label key={field} className="grid gap-2 text-sm font-semibold text-[#4d5d66]">
                              {label}
                              <div className="overflow-hidden rounded-md border border-[#d5dde2] bg-white">
                                {homepageSettings[field as 'heroImage'] ? (
                                  <img src={homepageSettings[field as 'heroImage']} alt={label} className="aspect-video w-full object-cover" />
                                ) : (
                                  <div className="flex aspect-video items-center justify-center text-[#8aa0aa]">
                                    <ImageIcon size={28} />
                                  </div>
                                )}
                              </div>
                              <input type="file" accept="image/*" onChange={(event) => void uploadHomepageImage(field as 'heroImage' | 'heroImage2' | 'heroImage3', event.target.files?.[0])} className="text-sm" />
                            </label>
                          ))}
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <SettingInput label="배너 작은 문구" value={homepageSettings.heroLabel} onChange={(value) => setHomepageSettings({ ...homepageSettings, heroLabel: value })} {...previewFocus('heroLabel')} />
                          <SettingInput label="첫 화면 큰 문구" value={homepageSettings.heroTitle} onChange={(value) => setHomepageSettings({ ...homepageSettings, heroTitle: value })} textarea {...previewFocus('heroTitle')} />
                          <SettingInput label="첫 화면 설명" value={homepageSettings.heroDescription} onChange={(value) => setHomepageSettings({ ...homepageSettings, heroDescription: value })} textarea {...previewFocus('heroDescription')} />
                          <SettingInput label="메인 버튼 문구" value={homepageSettings.primaryButtonLabel} onChange={(value) => setHomepageSettings({ ...homepageSettings, primaryButtonLabel: value })} {...previewFocus('primaryButtonLabel')} />
                          <SettingInput label="보조 버튼 문구" value={homepageSettings.secondaryButtonLabel} onChange={(value) => setHomepageSettings({ ...homepageSettings, secondaryButtonLabel: value })} {...previewFocus('secondaryButtonLabel')} />
                        </div>
                      </section>
                    )}

                    {homepageTab === 'sections' && (
                      <section className="rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-4">
                        <h3 className="mb-3 font-semibold">섹션 문구</h3>
                        <div className="grid gap-3 md:grid-cols-2">
                          <SettingInput label="브랜드 작은 문구" value={homepageSettings.statementLabel} onChange={(value) => setHomepageSettings({ ...homepageSettings, statementLabel: value })} {...previewFocus('statementLabel')} />
                          <SettingInput label="브랜드 큰 문구" value={homepageSettings.statementTitle} onChange={(value) => setHomepageSettings({ ...homepageSettings, statementTitle: value })} textarea {...previewFocus('statementTitle')} />
                          <SettingInput label="브랜드 설명" value={homepageSettings.statementBody} onChange={(value) => setHomepageSettings({ ...homepageSettings, statementBody: value })} textarea {...previewFocus('statementBody')} />
                          <SettingInput label="Project 섹션 제목" value={homepageSettings.projectSectionTitle} onChange={(value) => setHomepageSettings({ ...homepageSettings, projectSectionTitle: value })} {...previewFocus('projectSectionTitle')} />
                          <SettingInput label="Project 버튼 문구" value={homepageSettings.projectButtonLabel} onChange={(value) => setHomepageSettings({ ...homepageSettings, projectButtonLabel: value })} {...previewFocus('projectButtonLabel')} />
                          <SettingInput label="Project 목록 페이지 제목" value={homepageSettings.portfolioTitle} onChange={(value) => setHomepageSettings({ ...homepageSettings, portfolioTitle: value })} {...previewFocus('portfolioTitle')} />
                          <SettingInput label="소개 작은 문구" value={homepageSettings.aboutLabel} onChange={(value) => setHomepageSettings({ ...homepageSettings, aboutLabel: value })} {...previewFocus('aboutLabel')} />
                          <SettingInput label="소개 큰 문구" value={homepageSettings.aboutTitle} onChange={(value) => setHomepageSettings({ ...homepageSettings, aboutTitle: value })} textarea {...previewFocus('aboutTitle')} />
                          <SettingInput label="소개 설명" value={homepageSettings.aboutBody} onChange={(value) => setHomepageSettings({ ...homepageSettings, aboutBody: value })} textarea {...previewFocus('aboutBody')} />
                          <SettingInput label="진행 과정 작은 문구" value={homepageSettings.processLabel} onChange={(value) => setHomepageSettings({ ...homepageSettings, processLabel: value })} {...previewFocus('processLabel')} />
                          <SettingInput label="진행 과정 큰 문구" value={homepageSettings.processTitle} onChange={(value) => setHomepageSettings({ ...homepageSettings, processTitle: value })} textarea {...previewFocus('processTitle')} />
                        </div>
                      </section>
                    )}

                    {homepageTab === 'contact' && (
                      <section className="rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-4">
                        <h3 className="mb-3 font-semibold">상담/위치</h3>
                        <div className="grid gap-3 md:grid-cols-2">
                          <SettingInput label="위치 작은 문구" value={homepageSettings.locationLabel} onChange={(value) => setHomepageSettings({ ...homepageSettings, locationLabel: value })} {...previewFocus('locationLabel')} />
                          <SettingInput label="오시는 길 큰 문구" value={homepageSettings.locationTitle} onChange={(value) => setHomepageSettings({ ...homepageSettings, locationTitle: value })} {...previewFocus('locationTitle')} />
                          <SettingInput label="상담 작은 문구" value={homepageSettings.contactLabel} onChange={(value) => setHomepageSettings({ ...homepageSettings, contactLabel: value })} {...previewFocus('contactLabel')} />
                          <SettingInput label="상담 큰 문구" value={homepageSettings.contactTitle} onChange={(value) => setHomepageSettings({ ...homepageSettings, contactTitle: value })} {...previewFocus('contactTitle')} />
                          <SettingInput label="상담 설명" value={homepageSettings.contactBody} onChange={(value) => setHomepageSettings({ ...homepageSettings, contactBody: value })} textarea {...previewFocus('contactBody')} />
                          <SettingInput label="카카오톡 상담 링크" value={homepageSettings.kakaoUrl} onChange={(value) => setHomepageSettings({ ...homepageSettings, kakaoUrl: value })} {...previewFocus('kakaoUrl')} />
                          <SettingInput label="카카오 채널 관리 링크" value={homepageSettings.kakaoChannelManagerUrl} onChange={(value) => setHomepageSettings({ ...homepageSettings, kakaoChannelManagerUrl: value })} placeholder="예: https://center-pf.kakao.com/..." {...previewFocus('kakaoChannelManagerUrl')} />
                          <SettingInput label="네이버 플레이스 링크" value={homepageSettings.naverPlaceUrl} onChange={(value) => setHomepageSettings({ ...homepageSettings, naverPlaceUrl: value })} {...previewFocus('naverPlaceUrl')} />
                        </div>
                      </section>
                    )}

                    {homepageTab === 'popup' && (
                      <MultiPopupSettingsBoard
                        settings={homepageSettings}
                        saving={savingEmail}
                        onChange={(patch) => setHomepageSettings((current) => ({ ...current, ...patch }))}
                        onImageUpload={(popupKey, file, elementKey) => void uploadPopupItemImage(popupKey, file, elementKey)}
                      />
                    )}

                    {homepageTab === 'survey' && (
                      <section className="rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="font-semibold">상담 설문 질문 수정</h3>
                            <p className="mt-1 text-sm leading-6 text-[#60717d]">질문별 탭에서 문구와 선택지를 수정하고, 첫 질문 선택지별 다음 질문 묶음을 관리합니다.</p>
                          </div>
                          <button type="button" onClick={openSurveyEditor} className="rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2d2822]">
                            상담 설문 편집
                          </button>
                        </div>
                      </section>
                    )}
                  </div>
                  {homepageTab !== 'popup' && homepageTab !== 'projects' && <HomepageLivePreview activeTarget={activePreviewTarget} />}
                </div>
                <button
                  onClick={saveHomepageSettings}
                  disabled={savingEmail}
                  className="mt-5 inline-flex items-center justify-center gap-2 rounded-md bg-[#38bcd4] px-5 py-3 font-semibold text-white disabled:opacity-60"
                >
                  {savingEmail ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                  홈페이지 설정 저장
                </button>
              </Panel>

            {homepageTab === 'projects' && (
            <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
              <Panel title="현장 폴더 한번에 업로드">
                <p className="mb-4 leading-7 text-[#60717d]">
                  현장명 폴더 안에 `대표.jpg`, `거실1.jpg`, `거실2.jpg`, `주방1.jpg`처럼 정리한 뒤 폴더를 선택하면 Project와 공간별 사진 묶음으로 자동 등록됩니다.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-sm font-semibold text-[#4d5d66]">
                    Project 분류
                    <select
                      value={category}
                      onChange={(event) => {
                        setCategory(event.target.value);
                        setNewCategory('');
                      }}
                      className="rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-3 font-normal outline-none focus:border-[#38a9bd]"
                    >
                      <option value="">카테고리 선택</option>
                      {officeData.categories.map((item) => (
                        <option key={item._id} value={item._id}>
                          {item.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SettingInput label="새 카테고리 추가" value={newCategory} onChange={setNewCategory} placeholder="카테고리에 없으면 입력" />
                  <label className="grid gap-1 text-sm font-semibold text-[#4d5d66]">
                    주거 형태
                    <select
                      value={uploadSiteType}
                      onChange={(event) => setUploadSiteType(event.target.value)}
                      className="rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-3 font-normal outline-none focus:border-[#38a9bd]"
                    >
                      {['아파트', '주택', '상가', '오피스', '기타'].map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SettingInput label="지역" value={uploadLocation} onChange={setUploadLocation} placeholder="예: 수도권, 분당, 강남" />
                  <SettingInput label="평수" value={uploadArea} onChange={(value) => setUploadArea(onlyNumber(value))} placeholder="예: 32" />
                  <SettingInput label="Project 설명" value={uploadDescription} onChange={setUploadDescription} placeholder="홈페이지 Project 상세 화면에 표시될 설명을 입력하세요." textarea />
                  <label className="flex items-center gap-2 rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-3 text-sm font-semibold text-[#4d5d66]">
                    <input type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} />
                    메인 Project에도 표시
                  </label>
                </div>

                <label
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleFolderDrop}
                  className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#9db6c1] bg-[#f7fafb] px-5 py-10 text-center transition hover:bg-[#eef9fb]"
                >
                  <UploadCloud className="mb-3 text-[#38a9bd]" size={34} />
                  <span className="font-semibold">현장 폴더 선택 또는 드래그</span>
                  <span className="mt-2 text-sm text-[#60717d]">폴더를 이 영역에 끌어오거나 클릭해서 선택할 수 있습니다.</span>
                  <input key={uploadInputKey} type="file" multiple accept="image/*" className="hidden" onChange={handleFolderChange} {...{ webkitdirectory: '', directory: '' }} />
                </label>

                {previews.length > 0 && (
                  <div className="mt-5 rounded-lg bg-[#edf2f5] p-4">
                    <p className="font-semibold">업로드 미리보기</p>
                    <div className="mt-3 grid gap-3">
                      {previews.map((project) => (
                        <div key={project.title} className="rounded-md bg-white p-3 text-sm">
                          <p className="font-semibold">
                            {project.title} · 사진 {project.count}장
                          </p>
                          <p className="mt-1 text-[#60717d]">{project.rooms.join(', ') || '상세 사진 없음'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={uploadProjects}
                  disabled={uploading}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#171512] px-5 py-4 font-semibold text-white disabled:opacity-60"
                >
                  {uploading ? <Loader2 className="animate-spin" size={18} /> : <UploadCloud size={18} />}
                  Project 업로드
                </button>
              </Panel>

              <Panel title="Project 분류 관리">
                <div className="grid gap-3">
                  <label className="grid gap-1 text-sm font-semibold text-[#4d5d66]">
                    분류로 Project 찾기
                    <select
                      value={projectFilterCategoryId}
                      onChange={(event) => {
                        setProjectFilterCategoryId(event.target.value);
                        selectProjectForEdit('');
                      }}
                      className="rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-3 font-normal outline-none focus:border-[#38a9bd]"
                    >
                      <option value="">전체 Project</option>
                      {officeData.categories.map((item) => (
                        <option key={item._id} value={item._id}>
                          {item.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-semibold text-[#4d5d66]">
                    Project 선택
                    <select
                      value={selectedProjectId}
                      onChange={(event) => selectProjectForEdit(event.target.value)}
                      className="rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-3 font-normal outline-none focus:border-[#38a9bd]"
                    >
                      <option value="">Project 선택</option>
                      {filteredProjectsForEdit.map((project) => (
                        <option key={project._id} value={project._id}>
                          {project.title || '이름 없는 Project'} · {project.categoryTitle || '분류 없음'}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedProjectForEdit && (
                    <div className="rounded-lg border border-[#d5dde2] bg-white p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-[#26343b]">대표사진 등록/지정</p>
                          <p className="mt-1 text-xs text-[#60717d]">홈페이지 Project 카드와 상세 상단에 사용할 대표사진을 선택합니다.</p>
                        </div>
                        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-[#24323a] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#11181d]">
                          {uploadingMainImage ? <Loader2 className="animate-spin" size={16} /> : <UploadCloud size={16} />}
                          대표사진 업로드
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            disabled={uploadingMainImage}
                            onChange={(event) => {
                              const file = event.currentTarget.files?.[0];
                              event.currentTarget.value = '';
                              if (file) void saveProjectMainImage({ file });
                            }}
                          />
                        </label>
                      </div>
                      {selectedProjectImageOptions.length > 0 ? (
                        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {selectedProjectImageOptions.map((image, index) => {
                            const isCurrent = Boolean(image.assetId && image.assetId === selectedProjectForEdit.mainImageAssetId);

                            return (
                              <button
                                key={`${image.assetId || image.url}-${index}`}
                                type="button"
                                disabled={uploadingMainImage || !image.assetId}
                                onClick={() => void saveProjectMainImage({ option: image })}
                                className={`group overflow-hidden rounded-md border bg-[#f7fafb] text-left transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 ${
                                  isCurrent ? 'border-[#38bcd4] ring-2 ring-[#38bcd4]/25' : 'border-[#d5dde2]'
                                }`}
                              >
                                {image.url ? (
                                  <img src={image.url} alt={image.alt || image.label} className="aspect-video w-full object-cover" loading="lazy" />
                                ) : (
                                  <div className="flex aspect-video items-center justify-center text-[#8a98a1]">
                                    <ImageIcon size={24} />
                                  </div>
                                )}
                                <span className="flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-[#4d5d66]">
                                  <span className="min-w-0 truncate">{image.label}</span>
                                  {isCurrent ? <Check size={14} className="shrink-0 text-[#1492a8]" /> : <ImageIcon size={14} className="shrink-0 text-[#8a98a1]" />}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mt-4 rounded-md bg-[#f7fafb] px-3 py-2 text-xs font-semibold text-[#60717d]">
                          아직 상세사진이 없습니다. 새 대표사진을 직접 업로드할 수 있습니다.
                        </p>
                      )}
                    </div>
                  )}
                  {selectedProjectForEdit?.mainImage && (
                    <div className="rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[#4d5d66]">대표사진 16:9 미리보기</p>
                          <p className="mt-1 text-xs text-[#60717d]">사진 위를 클릭하거나 드래그해서 16:9 영역에 보일 중심을 정합니다.</p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                        <div
                          role="button"
                          tabIndex={0}
                          onPointerDown={updateProjectImageFocus}
                          onPointerMove={(event) => {
                            if (event.buttons === 1) updateProjectImageFocus(event);
                          }}
                          className="relative w-full max-w-[360px] cursor-crosshair overflow-hidden rounded-md bg-[#d8d1c5]"
                        >
                          <img
                            src={selectedProjectForEdit.mainImage}
                            alt={selectedProjectForEdit.mainImageAlt || selectedProjectForEdit.title || 'Project preview'}
                            className="aspect-video w-full object-cover"
                            style={{ objectPosition: imageObjectPosition(projectMainImagePosition, Number(projectMainImagePositionX), Number(projectMainImagePositionY)) }}
                            draggable={false}
                          />
                          <span
                            className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#38bcd4] shadow"
                            style={{ left: `${Number(projectMainImagePositionX || 50)}%`, top: `${Number(projectMainImagePositionY || 50)}%` }}
                          />
                        </div>
                        <div className="grid flex-1 gap-3">
                          <SettingInput label="가로 중심" value={projectMainImagePositionX} onChange={(value) => setProjectMainImagePositionX(onlyNumber(value).slice(0, 3))} placeholder="0-100" />
                          <SettingInput label="세로 중심" value={projectMainImagePositionY} onChange={(value) => setProjectMainImagePositionY(onlyNumber(value).slice(0, 3))} placeholder="0-100" />
                        </div>
                      </div>
                    </div>
                  )}
                  <SettingInput label="Project 이름" value={projectTitle} onChange={setProjectTitle} />
                  <label className="grid gap-1 text-sm font-semibold text-[#4d5d66]">
                    카테고리 선택
                    <select
                      value={projectCategoryId}
                      onChange={(event) => {
                        setProjectCategoryId(event.target.value);
                        setProjectNewCategory('');
                      }}
                      className="rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-3 font-normal outline-none focus:border-[#38a9bd]"
                    >
                      <option value="">카테고리 선택</option>
                      {officeData.categories.map((item) => (
                        <option key={item._id} value={item._id}>
                          {item.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SettingInput label="새 카테고리 추가" value={projectNewCategory} onChange={setProjectNewCategory} placeholder="카테고리에 없으면 입력" />
                  <SettingInput label="Project 설명" value={projectDescription} onChange={setProjectDescription} textarea />
                  <label className="grid gap-1 text-sm font-semibold text-[#4d5d66]">
                    주거 형태
                    <select
                      value={projectSiteType}
                      onChange={(event) => setProjectSiteType(event.target.value)}
                      className="rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-3 font-normal outline-none focus:border-[#38a9bd]"
                    >
                      {['아파트', '주택', '상가', '오피스', '기타'].map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SettingInput label="지역" value={projectLocation} onChange={setProjectLocation} />
                  <SettingInput label="평수" value={projectArea} onChange={(value) => setProjectArea(onlyNumber(value))} />
                  <SettingInput label="시공 연도" value={projectYear} onChange={setProjectYear} placeholder="예: 2026" />
                  <SettingInput label="사용 자재" value={projectMaterials} onChange={setProjectMaterials} placeholder="예: 포세린 타일, 무몰딩, 제작가구" />
                  <SettingInput label="블로그 링크" value={projectBlogUrl} onChange={setProjectBlogUrl} placeholder="예: https://blog.naver.com/..." />
                  <SettingInput label="노출 순서" value={projectDisplayOrder} onChange={(value) => setProjectDisplayOrder(onlyNumber(value))} placeholder="숫자가 작을수록 먼저 표시" />
                  <label className="grid gap-1 text-sm font-semibold text-[#4d5d66]">
                    대표 사진 표시 위치
                    <select
                      value={projectMainImagePosition}
                      onChange={(event) => setProjectMainImagePosition(event.target.value)}
                      className="rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-3 font-normal outline-none focus:border-[#38a9bd]"
                    >
                      <option value="center">가운데</option>
                      <option value="custom">직접 조정</option>
                      <option value="top">위쪽</option>
                      <option value="bottom">아래쪽</option>
                      <option value="left">왼쪽</option>
                      <option value="right">오른쪽</option>
                    </select>
                  </label>
                  <div className="grid gap-2 rounded-md border border-[#d5dde2] bg-[#f7fafb] p-3 text-sm font-semibold text-[#4d5d66]">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={projectFeatured} onChange={(event) => setProjectFeatured(event.target.checked)} />
                      메인 Project에도 표시
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={projectVisible} onChange={(event) => setProjectVisible(event.target.checked)} />
                      홈페이지 Project 목록에 표시
                    </label>
                  </div>
                  <button
                    onClick={saveProjectClassification}
                    disabled={savingOffice}
                    className="mt-2 inline-flex items-center justify-center gap-2 rounded-md bg-[#38bcd4] px-5 py-3 font-semibold text-white disabled:opacity-60"
                  >
                    {savingOffice ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                    Project 정보 저장
                  </button>
                </div>
              </Panel>
            </div>
            )}
          </div>
        )}

        {(status || error || results.length > 0) && (
          <section className="mt-5 rounded-lg border border-[#d9cdbb] bg-white p-5 shadow-sm">
            {status && <p className="font-semibold text-[#2f7d45]">{status}</p>}
            {error && <p className="font-semibold text-red-600">{error}</p>}
            {results.length > 0 && (
              <div className="mt-4 grid gap-2">
                {results.map((result) => (
                  <div key={result.projectTitle} className="rounded-md bg-[#fffdf8] px-4 py-3 text-sm">
                    <strong>{result.projectTitle}</strong> · {result.status}
                    {result.imageCount ? ` · 사진 ${result.imageCount}장 · 공간 ${result.groupCount}개` : ''}
                    {result.reason ? ` · ${result.reason}` : ''}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
        {isSurveyEditorOpen && (
          <SurveyEditorModal
            config={surveyDraft}
            privacyText={homepageSettings.consultationPrivacyText || defaultPrivacyText}
            activeTab={surveyEditorTab}
            onTabChange={setSurveyEditorTab}
            onChange={setSurveyDraft}
            onPrivacyTextChange={(value) => setHomepageSettings({ ...homepageSettings, consultationPrivacyText: value })}
            onClose={() => setIsSurveyEditorOpen(false)}
            onSave={saveSurveyEditor}
          />
        )}
        {selectedConsultation && (
          <ConsultationDetailModal
            consultation={selectedConsultation}
            onClose={() => setSelectedConsultation(null)}
            onComplete={() => setCompletionConsultation(selectedConsultation)}
            onRegisterCustomer={() => prepareCustomerFromConsultation(selectedConsultation)}
            onDelete={() => deleteOfficeRecord(selectedConsultation._id)}
          />
        )}
        {completionConsultation && (
          <ConsultationCompleteModal
            consultation={completionConsultation}
            disabled={savingOffice}
            onClose={() => setCompletionConsultation(null)}
            onCompleteOnly={() => completeConsultation(completionConsultation, false)}
            onRegisterCustomer={() => completeConsultation(completionConsultation, true)}
          />
        )}
        </section>
      </div>
    </main>
  );
}

function EstimateSitesPanel({
  sites,
  estimates,
  onCreateSite,
}: {
  sites: Site[];
  estimates: EstimateSummary[];
  onCreateSite: () => void;
}) {
  const [selectedSiteId, setSelectedSiteId] = useState(sites[0]?._id || '');
  const selectedSite = sites.find((site) => site._id === selectedSiteId) || sites[0];
  const selectedEstimate = selectedSite ? estimates.find((estimate) => estimate.siteId === selectedSite._id) : undefined;
  const estimatedSiteCount = estimates.filter((estimate) => estimate.siteId).length;

  useEffect(() => {
    if (!selectedSiteId && sites[0]?._id) setSelectedSiteId(sites[0]._id);
    if (selectedSiteId && !sites.some((site) => site._id === selectedSiteId)) setSelectedSiteId(sites[0]?._id || '');
  }, [selectedSiteId, sites]);

  const openEstimatePage = (site?: Site) => {
    if (!site?._id) return;
    window.location.href = `/manager-weve-7519/estimate?siteId=${encodeURIComponent(site._id)}`;
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[0.78fr_1.22fr]">
      <Panel title="현장별 견적 작업">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm leading-6 text-[#60717d]">
            현장을 먼저 선택한 뒤 요약을 확인하고, <b className="text-[#171512]">견적 수정하기</b>에서 상세 내역과 자재 단가, 공정 일정을 작업합니다.
          </div>
          <button
            type="button"
            onClick={onCreateSite}
            className="rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2b2721]"
          >
            새 현장 등록
          </button>
        </div>

        {sites.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#cfd9df] bg-[#f7fafb] p-8 text-center">
            <p className="text-lg font-semibold">아직 등록된 현장이 없습니다.</p>
            <p className="mt-2 text-sm text-[#60717d]">현장을 먼저 등록하면 바로 견적 작업 화면으로 이어집니다.</p>
            <button type="button" onClick={onCreateSite} className="mt-5 rounded-md bg-[#f1c76a] px-5 py-3 text-sm font-semibold">
              현장 등록하기
            </button>
          </div>
        ) : (
          <div className="grid max-h-[680px] gap-3 overflow-y-auto pr-1">
            {sites.map((site) => {
              const estimate = estimates.find((item) => item.siteId === site._id);
              const isActive = selectedSite?._id === site._id;

              return (
                <button
                  key={site._id}
                  type="button"
                  onClick={() => setSelectedSiteId(site._id)}
                  className={`rounded-lg border p-4 text-left transition ${
                    isActive ? 'border-[#38bcd4] bg-[#edf8fb] shadow-sm' : 'border-[#d5dde2] bg-white hover:border-[#9fcbd4]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold">{site.title || '현장명 없음'}</p>
                      <p className="mt-1 text-sm text-[#60717d]">{[site.customerName, site.siteType, site.status].filter(Boolean).join(' · ') || '현장 정보 없음'}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${estimate ? 'bg-[#e8f7ee] text-[#217346]' : 'bg-[#fff5d9] text-[#8b6420]'}`}>
                      {estimate ? '견적 있음' : '미작성'}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-[#60717d] sm:grid-cols-3">
                    <span>견적 {formatMoney(Number(estimate?.customerEstimateTotal || 0))}</span>
                    <span>원가 {formatMoney(Number(estimate?.executionCostTotal || 0))}</span>
                    <span>마진 {Number(estimate?.marginRate || 0).toFixed(1)}%</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="견적 요약">
        {selectedSite ? (
          <div className="grid gap-5">
            <div className="rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-5">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#38a9bd]">SITE ESTIMATE</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-normal">{selectedSite.title || '현장명 없음'}</h2>
                  <p className="mt-2 text-sm leading-6 text-[#60717d]">
                    {[selectedSite.customerName, selectedSite.customerPhone, selectedSite.address].filter(Boolean).join(' · ') || '현장 상세 정보가 아직 부족합니다.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openEstimatePage(selectedSite)}
                  className="rounded-md bg-[#f1c76a] px-5 py-3 text-sm font-semibold text-[#171512] transition hover:bg-[#e5b94f]"
                >
                  견적 수정하기
                </button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <MetricCard title="견적 금액" value={formatMoney(Number(selectedEstimate?.customerEstimateTotal || 0))} sub="고객에게 제안할 금액" />
              <MetricCard title="실행 원가" value={formatMoney(Number(selectedEstimate?.executionCostTotal || 0))} sub="자재·공정 예상 비용" />
              <MetricCard title="예상 마진" value={formatMoney(Number(selectedEstimate?.marginAmount || 0))} sub={`${Number(selectedEstimate?.marginRate || 0).toFixed(1)}%`} />
              <MetricCard title="작성 현장" value={`${estimatedSiteCount}곳`} sub={`전체 현장 ${sites.length}곳`} />
            </div>

            <div className="rounded-lg border border-[#d5dde2] bg-white p-5">
              <h3 className="text-lg font-semibold">작업 상태</h3>
              <div className="mt-4 grid gap-3 text-sm text-[#4d5d66] md:grid-cols-2">
                <p className="rounded-md bg-[#f7fafb] p-3">견적 버전: {selectedEstimate?.versionLabel || '아직 작성 전'}</p>
                <p className="rounded-md bg-[#f7fafb] p-3">마지막 수정: {selectedEstimate?.updatedAt ? formatDate(selectedEstimate.updatedAt) : '기록 없음'}</p>
                <p className="rounded-md bg-[#f7fafb] p-3">현장 상태: {selectedSite.status || '미정'}</p>
                <p className="rounded-md bg-[#f7fafb] p-3">현장 메모: {selectedSite.memo || '메모 없음'}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-[#cfd9df] bg-[#f7fafb] p-8 text-center text-[#60717d]">현장을 선택하면 견적 요약이 표시됩니다.</div>
        )}
      </Panel>
    </div>
  );
}

function MetricCard({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <section className="relative overflow-hidden rounded-lg border border-[#d5dde2] bg-white p-5 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#38bcd4] via-[#f1c76a] to-[#273541]" />
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#60717d]">{title}</p>
      <p className="mt-3 text-3xl font-semibold tracking-normal text-[#171512]">{value}</p>
      <p className="mt-2 text-sm font-medium text-[#60717d]">{sub}</p>
    </section>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[#d5dde2] bg-white p-5 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
        <span className="h-2 w-2 rounded-full bg-[#38bcd4]" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function SurveyEditorModal({
  config,
  privacyText,
  activeTab,
  onTabChange,
  onChange,
  onPrivacyTextChange,
  onClose,
  onSave,
}: {
  config: SurveyConfig;
  privacyText: string;
  activeTab: number;
  onTabChange: (tab: number) => void;
  onChange: React.Dispatch<React.SetStateAction<SurveyConfig>>;
  onPrivacyTextChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const tabs = ['1 공간유형', '2~4 묶음별 질문', '5 예산', '6 일정', '동의문'];
  const commonStep = config.commonSteps[activeTab - 2];

  const updatePropertyStep = (updates: Partial<SurveyStep>) => {
    onChange((current) => ({ ...current, propertyStep: { ...current.propertyStep, ...updates } }));
  };

  const updateCommonStep = (index: number, updates: Partial<SurveyStep>) => {
    onChange((current) => ({
      ...current,
      commonSteps: current.commonSteps.map((step, stepIndex) => (stepIndex === index ? { ...step, ...updates } : step)),
    }));
  };

  const updateAreaGroup = (groupIndex: number, updater: (group: SurveyAreaGroup) => SurveyAreaGroup) => {
    onChange((current) => ({
      ...current,
      areaGroups: current.areaGroups.map((group, index) => (index === groupIndex ? updater(group) : group)),
    }));
  };

  const movePropertyToGroup = (propertyOption: string, targetGroupIndex: number) => {
    onChange((current) => ({
      ...current,
      areaGroups: current.areaGroups.map((group, index) => {
        const withoutOption = group.propertyOptions.filter((option) => option !== propertyOption);
        if (index !== targetGroupIndex) return { ...group, propertyOptions: withoutOption };

        return {
          ...group,
          propertyOptions: [...withoutOption, propertyOption],
        };
      }),
    }));
  };

  const addAreaGroup = () => {
    onChange((current) => ({
      ...current,
      areaGroups: [
        ...current.areaGroups,
        {
          id: `group-${Date.now()}`,
          label: '새 묶음',
          propertyOptions: [],
          steps: [
            {
              key: 'areaRange',
              title: '2번 질문을 입력해주세요.',
              options: ['선택지 1'],
            },
            {
              key: 'homeStatus',
              title: '3번 질문을 입력해주세요.',
              options: ['선택지 1'],
            },
            {
              key: 'reason',
              title: '4번 질문을 입력해주세요.',
              options: ['선택지 1'],
            },
          ],
        },
      ],
    }));
  };

  const removeAreaGroup = (groupIndex: number) => {
    if (config.areaGroups.length <= 1) return;
    onChange((current) => ({
      ...current,
      areaGroups: current.areaGroups.filter((_, index) => index !== groupIndex),
    }));
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#17212b]/60 px-4 py-6 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-[#d5dde2] px-6 py-5">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#38a9bd]">Consultation Survey</p>
            <h2 className="mt-1 text-2xl font-semibold">상담 설문 편집</h2>
            <p className="mt-2 text-sm text-[#60717d]">질문과 선택지를 수정한 뒤 저장하면 홈페이지 상담 신청 화면에 반영됩니다.</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[#edf2f5] text-lg font-semibold">
            ×
          </button>
        </div>

        <div className="grid max-h-[calc(90vh-92px)] overflow-hidden lg:grid-cols-[210px_1fr]">
          <div className="max-h-[220px] overflow-y-auto border-b border-[#d5dde2] bg-[#f7fafb] p-3 lg:max-h-none lg:border-b-0 lg:border-r">
            <div className="grid gap-2">
              {tabs.map((tab, index) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => onTabChange(index)}
                  className={`rounded-md px-4 py-3 text-left text-sm font-semibold transition ${
                    activeTab === index ? 'bg-[#171512] text-white' : 'bg-white text-[#4d5d66] hover:bg-[#eef3f5]'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[calc(90vh-92px)] overflow-y-auto p-6 pb-28">
            {activeTab === 0 && (
              <StepEditor
                title="첫 질문"
                step={config.propertyStep}
                onTitleChange={(title) => updatePropertyStep({ title })}
                onOptionChange={(index, value) => updatePropertyStep({ options: config.propertyStep.options.map((option, optionIndex) => (optionIndex === index ? value : option)) })}
                onAddOption={() => updatePropertyStep({ options: [...config.propertyStep.options, '새 선택지'] })}
                onRemoveOption={(index) => {
                  const removed = config.propertyStep.options[index];
                  updatePropertyStep({ options: config.propertyStep.options.filter((_, optionIndex) => optionIndex !== index) });
                  onChange((current) => ({
                    ...current,
                    areaGroups: current.areaGroups.map((group) => ({
                      ...group,
                      propertyOptions: group.propertyOptions.filter((option) => option !== removed),
                    })),
                  }));
                }}
              />
            )}

            {activeTab === 1 && (
              <div className="grid gap-5">
                <div>
                  <h3 className="text-xl font-semibold">첫 질문 선택지별 2~4번 질문 묶음</h3>
                  <p className="mt-2 text-sm leading-6 text-[#60717d]">아파트와 빌라처럼 같은 질문 흐름을 쓰는 선택지는 같은 묶음에 넣으면 됩니다. 각 묶음마다 2번, 3번, 4번 질문을 다르게 만들 수 있습니다.</p>
                </div>
                <div className="grid gap-5 xl:grid-cols-2">
                {config.areaGroups.map((group, groupIndex) => (
                  <div key={group.id} className="max-h-[62vh] overflow-y-auto rounded-lg border border-[#d5dde2] bg-[#fbfcfd] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <input
                        value={group.label}
                        onChange={(event) => updateAreaGroup(groupIndex, (current) => ({ ...current, label: event.target.value }))}
                        className="min-w-[180px] rounded-md border border-[#d5dde2] bg-white px-4 py-3 font-semibold outline-none focus:border-[#38a9bd]"
                      />
                      <button type="button" onClick={() => removeAreaGroup(groupIndex)} className="rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-600">
                        묶음 삭제
                      </button>
                    </div>
                    <div className="mt-4">
                      <p className="mb-2 text-sm font-semibold text-[#4d5d66]">이 묶음에 포함할 1번 선택지</p>
                      <div className="flex flex-wrap gap-2">
                        {config.propertyStep.options.map((option) => {
                          const selected = group.propertyOptions.includes(option);
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => movePropertyToGroup(option, groupIndex)}
                              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                                selected ? 'border-[#38a9bd] bg-[#e8f8fb] text-[#14798a]' : 'border-[#d5dde2] bg-white text-[#60717d]'
                              }`}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="mt-5 grid gap-5">
                      {group.steps.map((step, stepIndex) => (
                        <div key={`${group.id}-${step.key}`} className="rounded-lg border border-[#e3e9ed] bg-white p-4">
                          <StepEditor
                            title={`${stepIndex + 2}번 질문`}
                            step={step}
                            onTitleChange={(title) =>
                              updateAreaGroup(groupIndex, (current) => ({
                                ...current,
                                steps: current.steps.map((currentStep, currentStepIndex) => (currentStepIndex === stepIndex ? { ...currentStep, title } : currentStep)),
                              }))
                            }
                            onOptionChange={(index, value) =>
                              updateAreaGroup(groupIndex, (current) => ({
                                ...current,
                                steps: current.steps.map((currentStep, currentStepIndex) =>
                                  currentStepIndex === stepIndex
                                    ? { ...currentStep, options: currentStep.options.map((option, optionIndex) => (optionIndex === index ? value : option)) }
                                    : currentStep,
                                ),
                              }))
                            }
                            onAddOption={() =>
                              updateAreaGroup(groupIndex, (current) => ({
                                ...current,
                                steps: current.steps.map((currentStep, currentStepIndex) =>
                                  currentStepIndex === stepIndex ? { ...currentStep, options: [...currentStep.options, '새 선택지'] } : currentStep,
                                ),
                              }))
                            }
                            onRemoveOption={(index) =>
                              updateAreaGroup(groupIndex, (current) => ({
                                ...current,
                                steps: current.steps.map((currentStep, currentStepIndex) =>
                                  currentStepIndex === stepIndex ? { ...currentStep, options: currentStep.options.filter((_, optionIndex) => optionIndex !== index) } : currentStep,
                                ),
                              }))
                            }
                            compact
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                </div>
                <button type="button" onClick={addAreaGroup} className="rounded-md border border-[#38a9bd] px-4 py-3 text-sm font-semibold text-[#14798a] transition hover:bg-[#e8f8fb]">
                  다음 질문 묶음 추가
                </button>
              </div>
            )}

            {activeTab >= 2 && activeTab <= 3 && commonStep && (
              <StepEditor
                title={`질문 ${activeTab + 3}`}
                step={commonStep}
                onTitleChange={(title) => updateCommonStep(activeTab - 2, { title })}
                onDescriptionChange={(description) => updateCommonStep(activeTab - 2, { description })}
                onOptionChange={(index, value) => updateCommonStep(activeTab - 2, { options: commonStep.options.map((option, optionIndex) => (optionIndex === index ? value : option)) })}
                onAddOption={() => updateCommonStep(activeTab - 2, { options: [...commonStep.options, '새 선택지'] })}
                onRemoveOption={(index) => updateCommonStep(activeTab - 2, { options: commonStep.options.filter((_, optionIndex) => optionIndex !== index) })}
                showDescription
              />
            )}

            {activeTab === 4 && (
              <div>
                <h3 className="text-xl font-semibold">개인정보 제3자 제공 동의 내용</h3>
                <p className="mt-2 text-sm text-[#60717d]">상담 신청 마지막 단계에서 고객이 버튼을 눌러 확인하는 내용입니다.</p>
                <textarea
                  value={privacyText}
                  onChange={(event) => onPrivacyTextChange(event.target.value)}
                  className="mt-5 min-h-[260px] w-full rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-3 leading-7 outline-none focus:border-[#38a9bd] focus:bg-white"
                />
              </div>
            )}

            <div className="sticky bottom-0 mt-8 flex justify-end gap-2 border-t border-[#d5dde2] bg-white/95 pt-4 backdrop-blur">
              <button type="button" onClick={onClose} className="rounded-md border border-[#d5dde2] px-5 py-3 font-semibold">
                닫기
              </button>
              <button type="button" onClick={onSave} className="rounded-md bg-[#171512] px-5 py-3 font-semibold text-white">
                설문 설정 반영
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepEditor({
  title,
  step,
  onTitleChange,
  onDescriptionChange,
  onOptionChange,
  onAddOption,
  onRemoveOption,
  compact = false,
  showDescription = false,
}: {
  title: string;
  step: SurveyStep;
  onTitleChange: (value: string) => void;
  onDescriptionChange?: (value: string) => void;
  onOptionChange: (index: number, value: string) => void;
  onAddOption: () => void;
  onRemoveOption: (index: number) => void;
  compact?: boolean;
  showDescription?: boolean;
}) {
  return (
    <div className={compact ? '' : 'grid gap-5'}>
      <div>
        <h3 className="text-xl font-semibold">{title}</h3>
        <label className="mt-4 grid gap-2 text-sm font-semibold text-[#4d5d66]">
          질문 문구
          <input
            value={step.title}
            onChange={(event) => onTitleChange(event.target.value)}
            className="rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-3 font-normal text-[#171512] outline-none focus:border-[#38a9bd] focus:bg-white"
          />
        </label>
        {showDescription && onDescriptionChange && (
          <label className="mt-3 grid gap-2 text-sm font-semibold text-[#4d5d66]">
            보조 설명
            <input
              value={step.description || ''}
              onChange={(event) => onDescriptionChange(event.target.value)}
              className="rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-3 font-normal text-[#171512] outline-none focus:border-[#38a9bd] focus:bg-white"
              placeholder="필요 없으면 비워두세요"
            />
          </label>
        )}
      </div>
      <div className="mt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-[#4d5d66]">선택지</p>
          <button type="button" onClick={onAddOption} className="rounded-md border border-[#38a9bd] px-3 py-2 text-sm font-semibold text-[#14798a]">
            선택지 추가
          </button>
        </div>
        <div className="grid gap-2">
          {step.options.map((option, index) => (
            <div key={`${option}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                value={option}
                onChange={(event) => onOptionChange(index, event.target.value)}
                className="rounded-md border border-[#d5dde2] bg-white px-4 py-3 outline-none focus:border-[#38a9bd]"
              />
              <button type="button" onClick={() => onRemoveOption(index)} className="rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-600">
                삭제
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConsultationDetailModal({
  consultation,
  onClose,
  onComplete,
  onRegisterCustomer,
  onDelete,
}: {
  consultation: Consultation;
  onClose: () => void;
  onComplete: () => void;
  onRegisterCustomer: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#17212b]/55 px-4 py-6 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#38a9bd]">Consultation</p>
            <h2 className="mt-2 text-2xl font-semibold">{consultation.name || '이름 없음'}</h2>
            <p className="mt-1 text-sm text-[#60717d]">{formatDate(consultation.createdAt)}</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[#edf2f5]">
            ×
          </button>
        </div>
        <div className="mt-5 grid gap-3 rounded-md border border-[#d5dde2] bg-[#f7fafb] p-4 text-sm">
          <InfoLine label="연락처" value={consultation.phone || '-'} />
          <InfoLine label="공간 종류" value={consultation.propertyType || consultation.siteType || '-'} />
          <InfoLine label="주소" value={consultation.fullAddress || consultation.address || '-'} />
          <InfoLine label="상태" value={consultation.status || '신규'} />
        </div>
        <div className="mt-5 grid gap-3 rounded-md border border-[#eadfcd] bg-[#fffdf8] p-4 text-sm">
          <InfoLine label="평수" value={consultation.areaRange || '-'} />
          <InfoLine label="현재 상태" value={consultation.homeStatus || '-'} />
          <InfoLine label="인테리어 이유" value={consultation.reason || '-'} />
          <InfoLine label="예산" value={consultation.budget || '-'} />
          <InfoLine label="희망 시작일" value={consultation.timeline || '-'} />
          <InfoLine label="개인정보 동의" value={consultation.privacyAgreed ? '동의' : '확인 필요'} />
        </div>
        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold text-[#4d5d66]">문의 내용</p>
          <div className="max-h-[320px] overflow-y-auto whitespace-pre-wrap rounded-md border border-[#d5dde2] bg-[#fffdf8] p-4 text-sm leading-7 text-[#4d473f]">
            {consultation.message || '문의 내용 없음'}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onDelete} className="rounded-md border border-red-200 px-4 py-2 text-sm font-semibold text-red-600">
            삭제
          </button>
          <button type="button" onClick={onRegisterCustomer} className="rounded-md bg-[#f1c76a] px-4 py-2 text-sm font-semibold text-[#171512]">
            고객으로 등록
          </button>
          <button type="button" onClick={onComplete} className="rounded-md bg-[#38bcd4] px-4 py-2 text-sm font-semibold text-white">
            상담 완료
          </button>
        </div>
      </div>
    </div>
  );
}

function ConsultationCompleteModal({
  consultation,
  disabled,
  onClose,
  onCompleteOnly,
  onRegisterCustomer,
}: {
  consultation: Consultation;
  disabled: boolean;
  onClose: () => void;
  onCompleteOnly: () => void;
  onRegisterCustomer: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#17212b]/60 px-4 py-6 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#38a9bd]">Complete</p>
        <h2 className="mt-2 text-2xl font-semibold">상담 완료 처리</h2>
        <p className="mt-3 text-sm leading-6 text-[#60717d]">
          {consultation.name || '고객'}님의 상담을 완료합니다. 고객 등록과 함께 비공개 현장도 만들까요?
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={disabled} className="rounded-md border border-[#d5dde2] px-4 py-2 text-sm font-semibold">
            취소
          </button>
          <button type="button" onClick={onCompleteOnly} disabled={disabled} className="rounded-md border border-[#d5dde2] px-4 py-2 text-sm font-semibold">
            상담만 완료
          </button>
          <button type="button" onClick={onRegisterCustomer} disabled={disabled} className="rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white">
            고객 + 현장 등록
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-3">
      <span className="font-semibold text-[#4d5d66]">{label}</span>
      <span className="text-[#171512]">{value}</span>
    </div>
  );
}

function HomepageLivePreview({ activeTarget }: { activeTarget: PreviewTarget | null }) {
  const [previewSrc, setPreviewSrc] = useState('/');
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const sections = [
    { label: '첫 화면', src: '/' },
    { label: 'Project', src: '/#portfolio-preview' },
    { label: '소개', src: '/#about' },
    { label: '위치', src: '/#location' },
    { label: '상담', src: '/#contact' },
  ];

  const highlightActiveTarget = () => {
    const frameDocument = iframeRef.current?.contentDocument;
    if (!frameDocument) return;

    frameDocument.querySelectorAll('[data-manager-preview-active="true"]').forEach((element) => {
      element.removeAttribute('data-manager-preview-active');
    });

    if (!activeTarget) return;

    let style = frameDocument.getElementById('manager-preview-highlight-style');
    if (!style) {
      style = frameDocument.createElement('style');
      style.id = 'manager-preview-highlight-style';
      style.textContent = `
        [data-manager-preview-active="true"] {
          outline: 3px solid #38bcd4 !important;
          outline-offset: 6px !important;
          border-radius: 10px !important;
          box-shadow: 0 0 0 10px rgba(56, 188, 212, 0.18), 0 14px 36px rgba(23, 21, 18, 0.18) !important;
          position: relative !important;
          z-index: 25 !important;
          transition: outline 160ms ease, box-shadow 160ms ease !important;
        }
      `;
      frameDocument.head.appendChild(style);
    }

    const target = frameDocument.querySelector(`[data-preview-target="${activeTarget.key}"]`) || frameDocument.getElementById(activeTarget.src.replace('/#', ''));
    if (target instanceof HTMLElement) {
      target.setAttribute('data-manager-preview-active', 'true');
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
  };

  useEffect(() => {
    if (!activeTarget) return;
    setPreviewSrc(activeTarget.src);
  }, [activeTarget]);

  useEffect(() => {
    const timer = window.setTimeout(highlightActiveTarget, 180);
    return () => window.clearTimeout(timer);
  }, [activeTarget, previewSrc]);

  return (
    <aside className="rounded-lg border border-[#d5dde2] bg-white p-4 shadow-sm 2xl:sticky 2xl:top-5 2xl:self-start">
      <div className="mb-3">
        <h3 className="font-semibold">홈페이지 미리보기</h3>
        <p className="mt-1 text-xs leading-5 text-[#60717d]">저장 후 실제 홈페이지에 반영된 화면을 보면서 위치를 확인하세요.</p>
        {activeTarget && (
          <p className="mt-2 rounded-md bg-[#edf8fb] px-3 py-2 text-xs font-semibold text-[#19798c]">
            선택 위치: {activeTarget.label}
          </p>
        )}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {sections.map((section) => (
          <button
            key={section.src}
            type="button"
            onClick={() => setPreviewSrc(section.src)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${previewSrc === section.src ? 'bg-[#171512] text-white' : 'bg-[#edf2f5] text-[#4d5d66]'}`}
          >
            {section.label}
          </button>
        ))}
      </div>
      <iframe ref={iframeRef} title="WEVE DESIGN 홈페이지 미리보기" src={previewSrc} onLoad={highlightActiveTarget} className="h-[640px] w-full rounded-md border border-[#d5dde2] bg-white" />
    </aside>
  );
}

type PopupItemDraft = {
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
  elements?: PopupCanvasElementDraft[];
};

type PopupCanvasElementDraft = {
  _key?: string;
  type?: 'button' | 'box' | 'image';
  label?: string;
  url?: string;
  src?: string;
  x?: string;
  y?: string;
  width?: string;
  height?: string;
  background?: string;
  color?: string;
  borderColor?: string;
  borderRadius?: string;
  fontSize?: string;
  opacity?: string;
};

type PopupCollectionDraft = {
  popups?: PopupItemDraft[];
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
};

function createPopupItem(index = 1): PopupItemDraft {
  return {
    _key: `popup-${Date.now()}-${index}`,
    enabled: 'false',
    layout: 'imageTop',
    position: 'center',
    width: '520',
    imageFit: 'cover',
    startDate: '',
    endDate: '',
    title: `팝업 ${index}`,
    body: '',
    buttonLabel: '',
    buttonUrl: '',
    imageUrl: '',
    elements: [],
  };
}

function createPopupCanvasElement(type: 'button' | 'box' | 'image', index = 1): PopupCanvasElementDraft {
  return {
    _key: `popup-element-${Date.now()}-${index}`,
    type,
    label: type === 'image' ? '' : type === 'button' ? '상담 신청' : '링크 상자',
    url: type === 'button' ? '#contact' : '',
    src: '',
    x: '50',
    y: '50',
    width: type === 'button' ? '34' : '28',
    height: type === 'button' ? '12' : '16',
    background: type === 'button' ? '#f1c76a' : 'rgba(255,255,255,0.82)',
    color: '#171512',
    borderColor: type === 'box' ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.45)',
    borderRadius: type === 'button' ? '10' : '6',
    fontSize: type === 'button' ? '14' : '13',
    opacity: '100',
  };
}

function normalizePopupCanvasElements(elements?: PopupCanvasElementDraft[]): PopupCanvasElementDraft[] {
  if (!Array.isArray(elements)) return [];
  return elements.map((element, index) => ({
    _key: element._key || `popup-element-${index + 1}`,
    type: element.type || 'button',
    label: element.label || '',
    url: element.url || '',
    src: element.src || '',
    x: String(element.x || '50'),
    y: String(element.y || '50'),
    width: String(element.width || '28'),
    height: String(element.height || '12'),
    background: element.background || '#f1c76a',
    color: element.color || '#171512',
    borderColor: element.borderColor || 'rgba(255,255,255,0.45)',
    borderRadius: String(element.borderRadius || '8'),
    fontSize: String(element.fontSize || '14'),
    opacity: String(element.opacity || '100'),
  }));
}

const popupElementLinkPresets = [
  { value: '', label: '직접 입력', text: '', url: '' },
  { value: 'portfolio', label: '포트폴리오 페이지 이동', text: '포트폴리오 보기', url: 'portfolio' },
  { value: 'browse', label: '홈페이지 둘러보기(닫기)', text: '홈페이지 둘러보기', url: '__close' },
  { value: 'contact', label: '상담신청하기', text: '상담 신청하기', url: '#contact' },
];

function popupElementPresetValue(element?: PopupCanvasElementDraft) {
  if (!element?.url) return '';
  if (element.url === '#portfolio-preview') return 'portfolio';
  return popupElementLinkPresets.find((preset) => preset.url === element.url)?.value || '';
}

function normalizePopupItems(settings: PopupCollectionDraft): PopupItemDraft[] {
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
        : [{ ...createPopupItem(1), _key: 'popup-default', title: '팝업 1' }];

  return source.map((item, index) => ({
    _key: item._key || `popup-${index + 1}`,
    enabled: item.enabled || 'false',
    layout: item.layout || 'imageTop',
    position: item.position || 'center',
    width: item.width || '520',
    imageFit: item.imageFit || 'cover',
    startDate: item.startDate || '',
    endDate: item.endDate || '',
    title: item.title || '',
    body: item.body || '',
    buttonLabel: item.buttonLabel || '',
    buttonUrl: item.buttonUrl || '',
    image: item.image || item.imageUrl || '',
    imageUrl: item.imageUrl || item.image || '',
    elements: normalizePopupCanvasElements(item.elements),
  }));
}

function MultiPopupSettingsBoard({
  settings,
  saving,
  onChange,
  onImageUpload,
}: {
  settings: PopupCollectionDraft;
  saving: boolean;
  onChange: (patch: Partial<PopupCollectionDraft>) => void;
  onImageUpload: (popupKey: string, file?: File, elementKey?: string) => void;
}) {
  const popups = normalizePopupItems(settings);
  const [selectedKey, setSelectedKey] = useState(popups[0]?._key || 'popup-default');
  const [selectedElementKey, setSelectedElementKey] = useState('');
  const selected = popups.find((popup) => popup._key === selectedKey) || popups[0] || { ...createPopupItem(1), _key: 'popup-default' };
  const selectedImage = selected?.imageUrl || selected?.image || '';
  const selectedLayout = selected?.layout || 'imageTop';
  const globalPosition = settings.popupPosition || selected.position || 'center';
  const selectedElements = normalizePopupCanvasElements(selected.elements);
  const selectedElement = selectedElements.find((element) => element._key === selectedElementKey) || selectedElements[0];
  const width = Math.min(760, Math.max(320, Number(selected?.width || 520) || 520));
  const hasContent = Boolean(selected?.title || selected?.body || selectedImage || selectedElements.length > 0);

  useEffect(() => {
    if (!popups.some((popup) => popup._key === selectedKey)) {
      setSelectedKey(popups[0]?._key || 'popup-default');
    }
  }, [popups, selectedKey]);

  useEffect(() => {
    if (selectedElements.length > 0 && !selectedElements.some((element) => element._key === selectedElementKey)) {
      setSelectedElementKey(selectedElements[0]._key || '');
    }
    if (selectedElements.length === 0 && selectedElementKey) setSelectedElementKey('');
  }, [selectedElements, selectedElementKey]);

  const replacePopups = (nextPopups: PopupItemDraft[]) => onChange({ popups: nextPopups });
  const updateSelected = (patch: Partial<PopupItemDraft>) => {
    replacePopups(popups.map((popup) => (popup._key === selected._key ? { ...popup, ...patch } : popup)));
  };
  const updateGlobalPosition = (position: string) => {
    onChange({ popupPosition: position, popups: popups.map((popup) => ({ ...popup, position })) });
  };
  const replaceSelectedElements = (nextElements: PopupCanvasElementDraft[]) => {
    updateSelected({ elements: nextElements });
  };
  const updateSelectedElement = (patch: Partial<PopupCanvasElementDraft>) => {
    if (!selectedElement) return;
    replaceSelectedElements(selectedElements.map((element) => (element._key === selectedElement._key ? { ...element, ...patch } : element)));
  };
  const addElement = (type: 'button' | 'box' | 'image') => {
    const nextElement = createPopupCanvasElement(type, selectedElements.length + 1);
    replaceSelectedElements([...selectedElements, nextElement]);
    setSelectedElementKey(nextElement._key || '');
  };
  const deleteSelectedElement = () => {
    if (!selectedElement) return;
    const nextElements = selectedElements.filter((element) => element._key !== selectedElement._key);
    replaceSelectedElements(nextElements);
    setSelectedElementKey(nextElements[0]?._key || '');
  };
  const moveElementFromPointer = (event: React.PointerEvent<HTMLDivElement>, elementKey: string) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.round(Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)));
    const y = Math.round(Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100)));

    setSelectedElementKey(elementKey);
    replaceSelectedElements(selectedElements.map((element) => (element._key === elementKey ? { ...element, x: String(x), y: String(y) } : element)));
  };
  const resizeElementFromPointer = (event: React.PointerEvent<HTMLDivElement>, elementKey: string) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
    const pointerY = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100));

    setSelectedElementKey(elementKey);
    replaceSelectedElements(
      selectedElements.map((element) => {
        if (element._key !== elementKey) return element;
        const centerX = Number(element.x || 50);
        const centerY = Number(element.y || 50);
        const nextWidth = Math.round(Math.min(100, Math.max(4, (pointerX - centerX) * 2)));
        const nextHeight = Math.round(Math.min(100, Math.max(4, (pointerY - centerY) * 2)));
        return { ...element, width: String(nextWidth), height: String(nextHeight) };
      }),
    );
  };
  const addPopup = () => {
    const nextPopup = createPopupItem(popups.length + 1);
    replacePopups([...popups, nextPopup]);
    setSelectedKey(nextPopup._key || '');
  };
  const deleteSelected = () => {
    if (popups.length <= 1) {
      replacePopups([{ ...createPopupItem(1), _key: selected._key || 'popup-default', title: '팝업 1' }]);
      return;
    }
    const nextPopups = popups.filter((popup) => popup._key !== selected._key);
    replacePopups(nextPopups);
    setSelectedKey(nextPopups[0]?._key || '');
  };

  return (
    <section className="overflow-hidden rounded-lg border border-[#d5dde2] bg-white">
      <div className="border-b border-[#d5dde2] bg-[#f7fafb] px-5 py-4">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#38a9bd]">POPUP MANAGER</p>
            <h3 className="mt-1 text-xl font-semibold">홈페이지 팝업 설정</h3>
            <p className="mt-1 text-sm leading-6 text-[#60717d]">여러 팝업을 동시에 운영하고, 이미지형/텍스트형/분할형 레이아웃을 항목별로 지정합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={addPopup} className="rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white">
              팝업 추가
            </button>
            <button type="button" onClick={deleteSelected} className="rounded-md border border-[#d5dde2] bg-white px-4 py-2 text-sm font-semibold text-[#4d5d66]">
              선택 삭제
            </button>
          </div>
        </div>
      </div>

      <div className="grid xl:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="grid content-start gap-2 border-b border-[#d5dde2] bg-[#fbfcfd] p-4 xl:border-b-0 xl:border-r">
          {popups.map((popup, index) => (
            <button
              key={popup._key}
              type="button"
              onClick={() => setSelectedKey(popup._key || '')}
              className={`rounded-md border px-3 py-3 text-left transition ${popup._key === selected._key ? 'border-[#38a9bd] bg-white shadow-sm' : 'border-[#d5dde2] bg-[#f7fafb] hover:bg-white'}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-bold">{popup.title || `팝업 ${index + 1}`}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${popup.enabled === 'true' ? 'bg-[#e8f5ed] text-[#277a46]' : 'bg-[#edf2f5] text-[#60717d]'}`}>
                  {popup.enabled === 'true' ? '노출' : '숨김'}
                </span>
              </span>
              <span className="mt-1 block text-xs text-[#60717d]">{popup.layout === 'imageOnly' ? '이미지형' : popup.layout === 'split' ? '분할형' : popup.layout === 'textOnly' ? '텍스트형' : '이미지 상단형'}</span>
            </button>
          ))}
        </aside>

        <div className="grid min-w-0 content-start gap-5 p-5">
          <label className="inline-flex w-fit items-center gap-3 rounded-full border border-[#d5dde2] bg-white px-4 py-2 text-sm font-bold text-[#26343b]">
            <input type="checkbox" checked={selected.enabled === 'true'} onChange={(event) => updateSelected({ enabled: event.target.checked ? 'true' : 'false' })} />
            {selected.enabled === 'true' ? '선택 팝업 노출 중' : '선택 팝업 숨김'}
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold text-[#4d5d66]">
              레이아웃
              <select value={selectedLayout} onChange={(event) => updateSelected({ layout: event.target.value })} className="rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-3 font-normal outline-none focus:border-[#38a9bd]">
                <option value="imageTop">이미지 상단형</option>
                <option value="imageOnly">이미지로만 채우기</option>
                <option value="split">좌우 분할형</option>
                <option value="textOnly">글 중심형</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold text-[#4d5d66]">
              전체 팝업 위치
              <select value={globalPosition} onChange={(event) => updateGlobalPosition(event.target.value)} className="rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-3 font-normal outline-none focus:border-[#38a9bd]">
                <option value="center">중앙</option>
                <option value="topLeft">좌측 상단</option>
                <option value="topRight">우측 상단</option>
                <option value="bottomLeft">좌측 하단</option>
                <option value="bottomRight">우측 하단</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold text-[#4d5d66]">
              이미지 표시
              <select value={selected.imageFit || 'cover'} onChange={(event) => updateSelected({ imageFit: event.target.value })} className="rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-3 font-normal outline-none focus:border-[#38a9bd]">
                <option value="cover">영역 채우기</option>
                <option value="contain">전체 보이기</option>
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <SettingInput label="팝업 너비(px)" value={selected.width || '520'} onChange={(value) => updateSelected({ width: onlyNumber(value).slice(0, 3) })} placeholder="예: 520" />
            <SettingInput label="노출 시작일" value={selected.startDate || ''} onChange={(value) => updateSelected({ startDate: value })} placeholder="예: 2026-06-15" />
            <SettingInput label="노출 종료일" value={selected.endDate || ''} onChange={(value) => updateSelected({ endDate: value })} placeholder="예: 2026-06-30" />
          </div>

          <div className="grid gap-4 2xl:grid-cols-[260px_minmax(0,1fr)]">
            <div className="rounded-md border border-[#d5dde2] bg-[#f7fafb] p-3">
              {selectedImage ? (
                <img src={selectedImage} alt="팝업 이미지" className={`aspect-[4/3] w-full rounded-md bg-white ${selected.imageFit === 'contain' ? 'object-contain' : 'object-cover'}`} />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center rounded-md bg-white text-sm font-semibold text-[#60717d]">이미지 없음</div>
              )}
              <label className="mt-3 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-[#171512] px-4 py-2.5 text-sm font-semibold text-white">
                <UploadCloud size={16} />
                이미지 업로드
                <input type="file" accept="image/*" className="sr-only" disabled={saving} onChange={(event) => onImageUpload(selected._key || '', event.target.files?.[0])} />
              </label>
            </div>
            <div className="grid min-w-0 gap-3">
              <SettingInput label="팝업 제목" value={selected.title || ''} onChange={(value) => updateSelected({ title: value })} placeholder="예: WEVE DESIGN 상담 안내" />
              <SettingInput label="팝업 내용" value={selected.body || ''} onChange={(value) => updateSelected({ body: value })} textarea placeholder="방문자에게 알릴 내용을 입력하세요." />
              <div className="grid gap-3 md:grid-cols-2">
                <SettingInput label="버튼 문구" value={selected.buttonLabel || ''} onChange={(value) => updateSelected({ buttonLabel: value })} placeholder="예: 상담 신청하기" />
                <SettingInput label="버튼 링크" value={selected.buttonUrl || ''} onChange={(value) => updateSelected({ buttonUrl: value })} placeholder="예: #contact 또는 https://..." />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold">링크/이미지 요소 배치</h4>
                <p className="mt-1 text-xs leading-5 text-[#60717d]">상담신청 버튼, 링크 상자, 이미지를 추가한 뒤 아래 캔버스에서 마우스로 위치를 조정합니다.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => addElement('button')} className="rounded-md bg-[#f1c76a] px-3 py-2 text-xs font-bold text-[#171512]">
                  상담 버튼 추가
                </button>
                <button type="button" onClick={() => addElement('box')} className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-xs font-bold text-[#4d5d66]">
                  링크 상자 추가
                </button>
                <button type="button" onClick={() => addElement('image')} className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-xs font-bold text-[#4d5d66]">
                  이미지 추가
                </button>
                <button type="button" onClick={deleteSelectedElement} disabled={!selectedElement} className="rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 disabled:opacity-40">
                  요소 삭제
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <PopupCanvasPreview
                popup={selected}
                selectedElementKey={selectedElementKey}
                onSelectElement={setSelectedElementKey}
                onMoveElement={moveElementFromPointer}
                onResizeElement={resizeElementFromPointer}
              />

              <div className="grid content-start gap-3">
                {selectedElement ? (
                  <>
                    <label className="grid gap-1 text-sm font-semibold text-[#4d5d66]">
                      요소 타입
                      <select value={selectedElement.type || 'button'} onChange={(event) => updateSelectedElement({ type: event.target.value as 'button' | 'box' | 'image' })} className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 font-normal outline-none focus:border-[#38a9bd]">
                        <option value="button">버튼</option>
                        <option value="box">링크 상자</option>
                        <option value="image">이미지</option>
                      </select>
                    </label>
                    {selectedElement.type !== 'image' && (
                      <label className="grid gap-1 text-sm font-semibold text-[#4d5d66]">
                        기본 동작
                        <select
                          value={popupElementPresetValue(selectedElement)}
                          onChange={(event) => {
                            const preset = popupElementLinkPresets.find((item) => item.value === event.target.value);
                            if (!preset || !preset.value) return;
                            updateSelectedElement({ label: preset.text, url: preset.url });
                          }}
                          className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 font-normal outline-none focus:border-[#38a9bd]"
                        >
                          {popupElementLinkPresets.map((preset) => (
                            <option key={preset.value || 'custom'} value={preset.value}>
                              {preset.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <SettingInput label="문구" value={selectedElement.label || ''} onChange={(value) => updateSelectedElement({ label: value })} placeholder="예: 상담 신청" />
                    <button type="button" onClick={() => updateSelectedElement({ label: '' })} className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-xs font-bold text-[#4d5d66]">
                      문구 비우기
                    </button>
                    <SettingInput label="링크" value={selectedElement.url || ''} onChange={(value) => updateSelectedElement({ url: value })} placeholder="예: #contact, __close 또는 https://..." />
                    {selectedElement.type === 'image' && (
                      <label className="grid gap-1 text-sm font-semibold text-[#4d5d66]">
                        요소 이미지
                        <div className="overflow-hidden rounded-md border border-[#d5dde2] bg-white">
                          {selectedElement.src ? <img src={selectedElement.src} alt="" className="aspect-video w-full object-contain" /> : <div className="flex aspect-video items-center justify-center text-xs text-[#60717d]">이미지 없음</div>}
                        </div>
                        <span className="inline-flex cursor-pointer justify-center rounded-md bg-[#171512] px-3 py-2 text-xs font-bold text-white">
                          이미지 업로드
                          <input type="file" accept="image/*" className="sr-only" disabled={saving} onChange={(event) => onImageUpload(selected._key || '', event.target.files?.[0], selectedElement._key)} />
                        </span>
                      </label>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <SettingInput label="X 위치" value={selectedElement.x || '50'} onChange={(value) => updateSelectedElement({ x: onlyNumber(value).slice(0, 3) })} />
                      <SettingInput label="Y 위치" value={selectedElement.y || '50'} onChange={(value) => updateSelectedElement({ y: onlyNumber(value).slice(0, 3) })} />
                      <SettingInput label="너비(%)" value={selectedElement.width || '28'} onChange={(value) => updateSelectedElement({ width: onlyNumber(value).slice(0, 3) })} />
                      <SettingInput label="높이(%)" value={selectedElement.height || '12'} onChange={(value) => updateSelectedElement({ height: onlyNumber(value).slice(0, 3) })} />
                      <SettingInput label="둥근 정도" value={selectedElement.borderRadius || '8'} onChange={(value) => updateSelectedElement({ borderRadius: onlyNumber(value).slice(0, 2) })} />
                      <SettingInput label="글자 크기" value={selectedElement.fontSize || '14'} onChange={(value) => updateSelectedElement({ fontSize: onlyNumber(value).slice(0, 2) })} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="grid gap-1 text-sm font-semibold text-[#4d5d66]">
                        배경
                        <input type="color" value={colorInputValue(selectedElement.background || '#f1c76a')} onChange={(event) => updateSelectedElement({ background: event.target.value })} className="h-11 rounded-md border border-[#d5dde2] bg-white p-1" />
                      </label>
                      <label className="grid gap-1 text-sm font-semibold text-[#4d5d66]">
                        글자색
                        <input type="color" value={colorInputValue(selectedElement.color || '#171512')} onChange={(event) => updateSelectedElement({ color: event.target.value })} className="h-11 rounded-md border border-[#d5dde2] bg-white p-1" />
                      </label>
                      <label className="grid gap-1 text-sm font-semibold text-[#4d5d66]">
                        테두리
                        <input type="color" value={colorInputValue(selectedElement.borderColor || '#ffffff')} onChange={(event) => updateSelectedElement({ borderColor: event.target.value })} className="h-11 rounded-md border border-[#d5dde2] bg-white p-1" />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => updateSelectedElement({ background: 'transparent' })} className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-xs font-bold text-[#4d5d66]">
                        채우기 투명
                      </button>
                      <button type="button" onClick={() => updateSelectedElement({ borderColor: 'transparent' })} className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-xs font-bold text-[#4d5d66]">
                        테두리 투명
                      </button>
                      <button type="button" onClick={() => updateSelectedElement({ background: 'rgba(255,255,255,0.82)', borderColor: 'rgba(255,255,255,0.72)' })} className="col-span-2 rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-xs font-bold text-[#4d5d66]">
                        링크 상자 반투명 기본값
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="rounded-md bg-white px-3 py-4 text-sm font-semibold text-[#60717d]">요소를 추가하면 위치와 디자인을 편집할 수 있습니다.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PopupItemPreviewText({ popup, centered = false, compact = false }: { popup: PopupItemDraft; centered?: boolean; compact?: boolean }) {
  return (
    <div className={`grid gap-2 ${compact ? 'p-4' : 'p-5'} ${centered ? 'text-center' : ''}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8f6f43]">WEVE DESIGN</p>
      <p className={`${compact ? 'text-lg' : 'text-xl'} font-semibold leading-tight`}>{popup.title || '팝업 제목'}</p>
      <p className="line-clamp-4 whitespace-pre-line text-sm leading-6 text-[#514c43]">{popup.body || '팝업 내용을 입력하면 이 영역에 표시됩니다.'}</p>
      {popup.buttonLabel && <span className={`mt-1 inline-flex rounded-md bg-[#f1c76a] px-3 py-2 text-xs font-bold ${centered ? 'mx-auto' : 'self-start'}`}>{popup.buttonLabel}</span>}
    </div>
  );
}

function PopupCanvasPreview({
  popup,
  selectedElementKey,
  onSelectElement,
  onMoveElement,
  onResizeElement,
}: {
  popup: PopupItemDraft;
  selectedElementKey: string;
  onSelectElement: (key: string) => void;
  onMoveElement: (event: React.PointerEvent<HTMLDivElement>, elementKey: string) => void;
  onResizeElement: (event: React.PointerEvent<HTMLDivElement>, elementKey: string) => void;
}) {
  const [resizingElementKey, setResizingElementKey] = useState('');
  const selectedImage = popup.imageUrl || popup.image || '';
  const elements = normalizePopupCanvasElements(popup.elements);
  const layout = popup.layout || 'imageTop';
  const previewWidth = Math.min(760, Math.max(320, Number(popup.width || 520) || 520));
  const renderedWidth = layout === 'split' ? Math.max(previewWidth, 720) : previewWidth;

  return (
    <div className="rounded-lg border border-[#d5dde2] bg-[#edf2f5] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-semibold">팝업 미리보기</h4>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${popup.enabled === 'true' ? 'bg-[#e8f5ed] text-[#277a46]' : 'bg-[#f1f3f5] text-[#5f6b73]'}`}>
          {popup.enabled === 'true' ? '노출' : '숨김'}
        </span>
      </div>
      <div className="mx-auto overflow-x-auto rounded-lg bg-[#171512]/15 p-4">
        <div className="relative mx-auto overflow-hidden rounded-lg bg-[#fffdf8] shadow-2xl" style={{ width: `${renderedWidth}px`, maxWidth: '100%' }}>
          <div className="relative">
            {layout === 'imageOnly' ? (
              selectedImage ? (
                <div className="aspect-video bg-[#ded7cc]">
                  <img src={selectedImage} alt="" className={`h-full w-full ${popup.imageFit === 'contain' ? 'object-contain' : 'object-cover'}`} draggable={false} />
                </div>
              ) : (
                <div className="flex aspect-video items-center justify-center bg-[#ded7cc] text-sm font-bold text-[#625d54]">이미지 없음</div>
              )
            ) : layout === 'split' ? (
              <div className="grid grid-cols-2">
                {selectedImage && <img src={selectedImage} alt="" className={`h-full min-h-[220px] w-full bg-[#ded7cc] ${popup.imageFit === 'contain' ? 'object-contain' : 'object-cover'}`} draggable={false} />}
                <PopupItemPreviewText popup={popup} compact />
              </div>
            ) : (
              <>
                {layout !== 'textOnly' && selectedImage && <img src={selectedImage} alt="" className={`aspect-video w-full bg-[#ded7cc] ${popup.imageFit === 'contain' ? 'object-contain' : 'object-cover'}`} draggable={false} />}
                <PopupItemPreviewText popup={popup} centered={layout === 'textOnly'} />
              </>
            )}

            <div
              className="absolute inset-0 z-[8]"
              onPointerDown={(event) => {
                const resizeTarget = event.target instanceof HTMLElement ? event.target.closest('[data-popup-resize-key]') : null;
                if (resizeTarget instanceof HTMLElement) {
                  const elementKey = resizeTarget.dataset.popupResizeKey || '';
                  if (!elementKey) return;
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setResizingElementKey(elementKey);
                  onSelectElement(elementKey);
                  onResizeElement(event, elementKey);
                  return;
                }

                const target = event.target instanceof HTMLElement ? event.target.closest('[data-popup-element-key]') : null;
                const elementKey = target instanceof HTMLElement ? target.dataset.popupElementKey || '' : selectedElementKey;
                if (!elementKey) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                onMoveElement(event, elementKey);
              }}
              onPointerMove={(event) => {
                if (event.buttons !== 1) return;
                if (resizingElementKey) {
                  onResizeElement(event, resizingElementKey);
                  return;
                }
                if (!selectedElementKey) return;
                onMoveElement(event, selectedElementKey);
              }}
              onPointerUp={() => setResizingElementKey('')}
              onPointerCancel={() => setResizingElementKey('')}
            >
              {elements.map((element, index) => {
                const isActive = element._key === selectedElementKey;
                const style: React.CSSProperties = {
                  left: `${Number(element.x || 50)}%`,
                  top: `${Number(element.y || 50)}%`,
                  width: `${Number(element.width || 28)}%`,
                  height: `${Number(element.height || 12)}%`,
                  transform: 'translate(-50%, -50%)',
                  background: element.type === 'image' ? 'transparent' : element.background || '#f1c76a',
                  color: element.color || '#171512',
                  borderColor: element.borderColor || 'rgba(255,255,255,0.45)',
                  borderRadius: `${Number(element.borderRadius || 8)}px`,
                  fontSize: `${Number(element.fontSize || 14)}px`,
                  opacity: Math.max(0, Math.min(100, Number(element.opacity || 100))) / 100,
                };

                return (
                  <button
                    key={element._key || index}
                    type="button"
                    onClick={() => onSelectElement(element._key || '')}
                    data-popup-element-key={element._key || ''}
                    className={`absolute flex items-center justify-center overflow-hidden border px-3 text-center font-bold shadow-[0_10px_24px_rgba(23,21,18,0.16)] ${isActive ? 'border-[#38bcd4] ring-2 ring-[#38bcd4]/35' : 'border-white/50'}`}
                    style={style}
                  >
                    {element.type === 'image' && element.src ? (
                      <img src={element.src} alt={element.label || ''} className="h-full w-full object-contain" draggable={false} />
                    ) : (
                      <span className="line-clamp-2">{element.label || (element.type === 'button' ? '상담 신청' : '')}</span>
                    )}
                    {isActive && (
                      <span
                        data-popup-resize-key={element._key || ''}
                        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize rounded-tl-md border-l border-t border-white/80 bg-[#38bcd4] shadow-[0_2px_8px_rgba(23,21,18,0.25)]"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="relative z-10 flex items-center justify-between border-t border-[#eadfcd]/80 bg-[linear-gradient(135deg,#fffaf0_0%,#f8ead0_46%,#f3d89d_100%)] px-4 py-1.5 text-xs font-semibold text-[#625d54] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
            <span>오늘 하루 보지 않기</span>
            <span>닫기</span>
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-xs leading-5 text-[#60717d]">
        <p className="rounded-md bg-white px-3 py-2">1. 요소를 마우스로 드래그해 위치를 지정합니다.</p>
        <p className="rounded-md bg-white px-3 py-2">2. 선택한 요소의 우하단 파란 핸들을 드래그하면 크기를 조정합니다.</p>
        <p className="rounded-md bg-white px-3 py-2">3. 링크에 #contact를 넣으면 팝업 클릭 시 상담 영역으로 이동합니다.</p>
      </div>
    </div>
  );
}

function colorInputValue(value: string) {
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : '#f1c76a';
}

type PopupSettingsDraft = {
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
};

function PopupSettingsBoard({
  settings,
  saving,
  onChange,
  onImageUpload,
}: {
  settings: PopupSettingsDraft;
  saving: boolean;
  onChange: (patch: Partial<PopupSettingsDraft>) => void;
  onImageUpload: (file?: File) => void;
}) {
  const width = Math.min(760, Math.max(320, Number(settings.popupWidth || 520) || 520));
  const layout = settings.popupLayout || 'imageTop';
  const enabled = settings.popupEnabled === 'true';
  const hasContent = Boolean(settings.popupTitle || settings.popupBody || settings.popupImage);

  return (
    <section className="mt-5 overflow-hidden rounded-lg border border-[#d5dde2] bg-white">
      <div className="border-b border-[#d5dde2] bg-[#f7fafb] px-5 py-4">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#38a9bd]">POPUP MANAGER</p>
            <h3 className="mt-1 text-xl font-semibold">홈페이지 팝업 설정</h3>
            <p className="mt-1 text-sm leading-6 text-[#60717d]">노출 여부, 기간, 위치, 크기, 레이아웃과 콘텐츠를 한 화면에서 관리합니다.</p>
          </div>
          <label className="inline-flex items-center gap-3 rounded-full border border-[#d5dde2] bg-white px-4 py-2 text-sm font-bold text-[#26343b]">
            <input type="checkbox" checked={enabled} onChange={(event) => onChange({ popupEnabled: event.target.checked ? 'true' : 'false' })} />
            {enabled ? '팝업 노출 중' : '팝업 숨김'}
          </label>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="grid gap-5 p-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <label className="grid gap-1 text-sm font-semibold text-[#4d5d66]">
              레이아웃
              <select value={layout} onChange={(event) => onChange({ popupLayout: event.target.value })} className="rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-3 font-normal outline-none focus:border-[#38a9bd]">
                <option value="imageTop">이미지 상단형</option>
                <option value="split">좌우 분할형</option>
                <option value="textOnly">글 중심형</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold text-[#4d5d66]">
              위치
              <select value={settings.popupPosition || 'center'} onChange={(event) => onChange({ popupPosition: event.target.value })} className="rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-3 font-normal outline-none focus:border-[#38a9bd]">
                <option value="center">중앙</option>
                <option value="topLeft">좌측 상단</option>
                <option value="topRight">우측 상단</option>
                <option value="bottomLeft">좌측 하단</option>
                <option value="bottomRight">우측 하단</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold text-[#4d5d66]">
              이미지 표시
              <select value={settings.popupImageFit || 'cover'} onChange={(event) => onChange({ popupImageFit: event.target.value })} className="rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-3 font-normal outline-none focus:border-[#38a9bd]">
                <option value="cover">영역 채우기</option>
                <option value="contain">전체 보이기</option>
              </select>
            </label>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <SettingInput label="팝업 너비(px)" value={settings.popupWidth || '520'} onChange={(value) => onChange({ popupWidth: onlyNumber(value).slice(0, 3) })} placeholder="예: 520" />
            <SettingInput label="노출 시작일" value={settings.popupStartDate || ''} onChange={(value) => onChange({ popupStartDate: value })} placeholder="예: 2026-06-15" />
            <SettingInput label="노출 종료일" value={settings.popupEndDate || ''} onChange={(value) => onChange({ popupEndDate: value })} placeholder="예: 2026-06-30" />
          </div>

          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <div className="rounded-md border border-[#d5dde2] bg-[#f7fafb] p-3">
              {settings.popupImage ? (
                <img src={settings.popupImage} alt="팝업 이미지" className={`aspect-[4/3] w-full rounded-md bg-white ${settings.popupImageFit === 'contain' ? 'object-contain' : 'object-cover'}`} />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center rounded-md bg-white text-sm font-semibold text-[#60717d]">이미지 없음</div>
              )}
              <label className="mt-3 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-[#171512] px-4 py-2.5 text-sm font-semibold text-white">
                <UploadCloud size={16} />
                이미지 업로드
                <input type="file" accept="image/*" className="sr-only" disabled={saving} onChange={(event) => onImageUpload(event.target.files?.[0])} />
              </label>
            </div>
            <div className="grid gap-3">
              <SettingInput label="팝업 제목" value={settings.popupTitle || ''} onChange={(value) => onChange({ popupTitle: value })} placeholder="예: WEVE DESIGN 상담 안내" />
              <SettingInput label="팝업 내용" value={settings.popupBody || ''} onChange={(value) => onChange({ popupBody: value })} textarea placeholder="방문자에게 알릴 내용을 입력하세요." />
              <div className="grid gap-3 md:grid-cols-2">
                <SettingInput label="버튼 문구" value={settings.popupButtonLabel || ''} onChange={(value) => onChange({ popupButtonLabel: value })} placeholder="예: 상담 신청하기" />
                <SettingInput label="버튼 링크" value={settings.popupButtonUrl || ''} onChange={(value) => onChange({ popupButtonUrl: value })} placeholder="예: #contact 또는 https://..." />
              </div>
            </div>
          </div>
        </div>

        <aside className="border-t border-[#d5dde2] bg-[#edf2f5] p-5 xl:border-l xl:border-t-0">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-semibold">팝업 미리보기</h4>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${enabled ? 'bg-[#e8f5ed] text-[#277a46]' : 'bg-[#f1f3f5] text-[#5f6b73]'}`}>
              {enabled ? '노출' : '숨김'}
            </span>
          </div>
          <div className="relative min-h-[430px] overflow-hidden rounded-lg bg-[#171512]/55 p-5">
            <div className={`absolute max-h-[390px] overflow-hidden rounded-lg bg-[#fffdf8] shadow-2xl ${popupPreviewPositionClass(settings.popupPosition || 'center')}`} style={{ width: `${Math.min(width, 360)}px` }}>
              {layout === 'split' ? (
                <div className="grid grid-cols-2">
                  {settings.popupImage && <img src={settings.popupImage} alt="" className={`h-full min-h-[180px] w-full bg-[#ded7cc] ${settings.popupImageFit === 'contain' ? 'object-contain' : 'object-cover'}`} />}
                  <PopupPreviewText settings={settings} compact />
                </div>
              ) : (
                <>
                  {layout !== 'textOnly' && settings.popupImage && <img src={settings.popupImage} alt="" className={`aspect-[16/10] w-full bg-[#ded7cc] ${settings.popupImageFit === 'contain' ? 'object-contain' : 'object-cover'}`} />}
                  <PopupPreviewText settings={settings} centered={layout === 'textOnly'} />
                </>
              )}
              <div className="flex items-center justify-between border-t border-[#eadfcd]/80 bg-[linear-gradient(135deg,#fffaf0_0%,#f8ead0_46%,#f3d89d_100%)] px-4 py-2 text-xs font-semibold text-[#625d54] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                <span>□ 오늘 하루 보지 않기</span>
                <span>닫기</span>
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-2 text-xs leading-5 text-[#60717d]">
            <p className="rounded-md bg-white px-3 py-2">1. 팝업 사용을 켜야 홈페이지에 노출됩니다.</p>
            <p className="rounded-md bg-white px-3 py-2">2. 시작일/종료일을 비워두면 기간 제한 없이 노출됩니다.</p>
            <p className={`rounded-md px-3 py-2 ${hasContent ? 'bg-white' : 'bg-[#fff0f0] text-[#b24a4a]'}`}>3. 제목, 내용 또는 이미지를 입력해야 방문자가 내용을 확인할 수 있습니다.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}

function PopupPreviewText({ settings, centered = false, compact = false }: { settings: PopupSettingsDraft; centered?: boolean; compact?: boolean }) {
  return (
    <div className={`grid gap-2 ${compact ? 'p-4' : 'p-5'} ${centered ? 'text-center' : ''}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8f6f43]">WEVE DESIGN</p>
      <p className={`${compact ? 'text-lg' : 'text-xl'} font-semibold leading-tight`}>{settings.popupTitle || '팝업 제목'}</p>
      <p className="line-clamp-4 whitespace-pre-line text-sm leading-6 text-[#514c43]">{settings.popupBody || '팝업 내용을 입력하면 이 영역에 표시됩니다.'}</p>
      {settings.popupButtonLabel && <span className={`mt-1 inline-flex rounded-md bg-[#f1c76a] px-3 py-2 text-xs font-bold ${centered ? 'mx-auto' : 'self-start'}`}>{settings.popupButtonLabel}</span>}
    </div>
  );
}

function popupPreviewPositionClass(value: string) {
  const positions: Record<string, string> = {
    topLeft: 'left-5 top-5',
    topRight: 'right-5 top-5',
    bottomLeft: 'bottom-5 left-5',
    bottomRight: 'bottom-5 right-5',
    center: 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
  };
  return positions[value] || positions.center;
}

function SettingInput({
  label,
  value,
  placeholder,
  textarea,
  onChange,
  onFocus,
}: {
  label: string;
  value: string;
  placeholder?: string;
  textarea?: boolean;
  onChange: (value: string) => void;
  onFocus?: () => void;
}) {
  return (
    <label className="grid gap-1 text-sm font-semibold text-[#4d5d66]">
      {label}
      {textarea ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          placeholder={placeholder}
          rows={3}
          className="rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-3 font-normal outline-none focus:border-[#38a9bd]"
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          placeholder={placeholder}
          className="rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-3 font-normal outline-none focus:border-[#38a9bd]"
        />
      )}
    </label>
  );
}

function RecordList({
  empty,
  items,
}: {
  empty: string;
  items: Array<{ key: string; title: string; meta?: string; body?: string; action?: React.ReactNode; onClick?: () => void }>;
}) {
  if (items.length === 0) {
    return <p className="rounded-md bg-[#fffdf8] px-4 py-5 text-sm text-[#625d54]">{empty}</p>;
  }

  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <article
          key={item.key}
          onClick={item.onClick}
          className={`rounded-md border border-[#eadfcd] bg-[#fffdf8] p-4 ${item.onClick ? 'cursor-pointer transition hover:border-[#38a9bd] hover:bg-white' : ''}`}
        >
          <div className="flex flex-col justify-between gap-3 md:flex-row">
            <div>
              <h3 className="font-semibold">{item.title}</h3>
              {item.meta && <p className="mt-1 text-sm text-[#625d54]">{item.meta}</p>}
            </div>
            {item.action}
          </div>
          {item.body && <p className="mt-3 max-h-12 overflow-hidden whitespace-pre-wrap text-sm leading-6 text-[#4d473f]">{item.body}</p>}
        </article>
      ))}
    </div>
  );
}

function OfficeForm({
  fields,
  buttonLabel,
  secondaryLabel,
  disabled,
  onSubmit,
  onSecondary,
}: {
  fields: Array<{ label: string; value: string; textarea?: boolean; options?: string[]; onChange: (value: string) => void }>;
  buttonLabel: string;
  secondaryLabel?: string;
  disabled: boolean;
  onSubmit: () => void;
  onSecondary?: () => void;
}) {
  return (
    <div className="grid gap-3">
      {fields.map((field) => (
        <label key={field.label} className="grid gap-1 text-sm font-semibold text-[#4d473f]">
          {field.label}
          {field.options ? (
            <select
              value={field.value}
              onChange={(event) => field.onChange(event.target.value)}
              className="rounded-md border border-[#d8d1c5] bg-[#fffdf8] px-3 py-2 font-normal outline-none focus:border-[#8f6f43]"
            >
              {field.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : field.textarea ? (
            <textarea
              value={field.value}
              onChange={(event) => field.onChange(event.target.value)}
              rows={4}
              className="rounded-md border border-[#d8d1c5] bg-[#fffdf8] px-3 py-2 font-normal outline-none focus:border-[#8f6f43]"
            />
          ) : (
            <input
              value={field.value}
              onChange={(event) => field.onChange(event.target.value)}
              className="rounded-md border border-[#d8d1c5] bg-[#fffdf8] px-3 py-2 font-normal outline-none focus:border-[#8f6f43]"
            />
          )}
        </label>
      ))}
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <button onClick={onSubmit} disabled={disabled} className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-[#171512] px-5 py-3 font-semibold text-white disabled:opacity-60">
          {disabled ? <Loader2 className="animate-spin" size={18} /> : <PackagePlus size={18} />}
          {buttonLabel}
        </button>
        {secondaryLabel && onSecondary && (
          <button type="button" onClick={onSecondary} disabled={disabled} className="inline-flex items-center justify-center rounded-md border border-[#d8d1c5] px-5 py-3 font-semibold text-[#4d473f] disabled:opacity-60">
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function buildPreview(files: File[]): PreviewProject[] {
  const map = new Map<string, { count: number; rooms: Set<string> }>();

  files.forEach((file) => {
    const path = file.webkitRelativePath || file.name;
    const parts = path.split(/[\\/]+/).filter(Boolean);
    const fileName = parts[parts.length - 1] || file.name;
    const projectTitle = parts.length > 1 ? parts[parts.length - 2] : fileName.replace(/\.[^.]+$/, '');
    const room = roomNameFromFile(fileName);
    const current = map.get(projectTitle) || { count: 0, rooms: new Set<string>() };
    current.count += 1;
    if (room) current.rooms.add(room);
    map.set(projectTitle, current);
  });

  return Array.from(map.entries()).map(([title, value]) => ({
    title,
    count: value.count,
    rooms: Array.from(value.rooms),
  }));
}

type DropFileEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (success: (file: File) => void, error?: (error: Error) => void) => void;
  createReader?: () => { readEntries: (success: (entries: DropFileEntry[]) => void, error?: (error: Error) => void) => void };
};

type DropItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => DropFileEntry | null;
};

async function filesFromDrop(dataTransfer: DataTransfer) {
  const entries = Array.from(dataTransfer.items || [])
    .map((item): DropFileEntry | null => ((item as DropItemWithEntry).webkitGetAsEntry?.() as unknown as DropFileEntry | null) || null)
    .filter((entry): entry is DropFileEntry => Boolean(entry));

  if (entries.length === 0) return Array.from(dataTransfer.files || []);

  const nested = await Promise.all(entries.map((entry) => readDropEntry(entry)));
  return nested.flat();
}

async function readDropEntry(entry: DropFileEntry, parentPath = ''): Promise<File[]> {
  const relativePath = parentPath ? `${parentPath}/${entry.name}` : entry.name;

  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => entry.file?.(resolve, reject));
    return [fileWithRelativePath(file, relativePath)];
  }

  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const children: DropFileEntry[] = [];

    while (true) {
      const batch = await new Promise<DropFileEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (batch.length === 0) break;
      children.push(...batch);
    }

    const nested = await Promise.all(children.map((child) => readDropEntry(child, relativePath)));
    return nested.flat();
  }

  return [];
}

function fileWithRelativePath(file: File, relativePath: string) {
  try {
    Object.defineProperty(file, 'webkitRelativePath', {
      configurable: true,
      value: relativePath,
    });
  } catch {
    return new File([file], relativePath, { type: file.type, lastModified: file.lastModified });
  }

  return file;
}

function roomNameFromFile(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, '').trim();
  const normalized = baseName.toLowerCase().replace(/\s+/g, '');

  if (/^(대표|메인|썸네일|커버|cover|main|thumbnail|thumb)$/i.test(normalized)) return '';
  if (/^(시공전|공사전|before|비포)$/i.test(normalized)) return '시공 전';

  const match = baseName.match(/^(.*?)[\s_-]*(\d+)$/);
  return (match ? match[1] : baseName).trim();
}

async function prepareUploadFiles(files: File[]) {
  let prepared = await compressFiles(files, UPLOAD_PRESETS[0]);

  for (const preset of UPLOAD_PRESETS.slice(1)) {
    const totalBytes = prepared.reduce((total, item) => total + item.file.size, 0);
    if (totalBytes <= MAX_UPLOAD_BYTES) break;
    prepared = await compressFiles(files, preset);
  }

  return prepared;
}

async function compressFiles(files: File[], preset: { maxWidth: number; quality: number }) {
  return Promise.all(
    files.map(async (file) => ({
      file: await compressImage(file, preset),
      path: file.webkitRelativePath || file.name,
    })),
  );
}

async function compressImage(file: File, preset: { maxWidth: number; quality: number }) {
  if (!file.type.startsWith('image/')) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, preset.maxWidth / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error('이미지 압축에 실패했습니다.'));
      },
      'image/jpeg',
      preset.quality,
    );
  });

  if (blob.size >= file.size) return file;

  return new File([blob], toJpegFileName(file.name), {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  });
}

function toJpegFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '') + '.jpg';
}

function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

function formatDate(value?: string) {
  if (!value) return '날짜 없음';
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(value);
}

function onlyNumber(value: string) {
  return value.replace(/[^\d]/g, '');
}

function imageObjectPosition(value?: string, x?: number, y?: number) {
  if (typeof x === 'number' || typeof y === 'number') {
    return `${Math.min(100, Math.max(0, Math.round(x ?? 50)))}% ${Math.min(100, Math.max(0, Math.round(y ?? 50)))}%`;
  }

  const positions: Record<string, string> = {
    top: 'center top',
    bottom: 'center bottom',
    left: 'left center',
    right: 'right center',
    center: 'center center',
  };

  return positions[value || 'center'] || positions.center;
}

function statusBadgeClass(status: string) {
  if (status.includes('완료')) return 'bg-[#e8f5ed] text-[#277a46]';
  if (status.includes('계약')) return 'bg-[#edf8fb] text-[#14798a]';
  if (status.includes('견적')) return 'bg-[#fff3d6] text-[#8a6215]';
  if (status.includes('시공')) return 'bg-[#efeafa] text-[#6341a3]';
  if (status.includes('보류')) return 'bg-[#f1f3f5] text-[#5f6b73]';
  if (status.includes('신규')) return 'bg-[#fcecec] text-[#b24a4a]';
  return 'bg-[#eef6ff] text-[#286da8]';
}

function getProjectImageOptions(project?: ManagedProject): ProjectImageOption[] {
  if (!project) return [];

  const options: ProjectImageOption[] = [];

  project.galleryGroups?.forEach((group, groupIndex) => {
    const groupLabel = group.title || group.roomType || `상세사진 ${groupIndex + 1}`;
    group.images?.forEach((image, imageIndex) => {
      if (!image.assetId || !image.url) return;
      options.push({
        ...image,
        roomType: image.roomType || group.roomType,
        label: image.caption || `${groupLabel} ${imageIndex + 1}`,
      });
    });
  });

  project.gallery?.forEach((image, imageIndex) => {
    if (!image.assetId || !image.url) return;
    options.push({
      ...image,
      label: image.caption || image.roomType || `상세사진 ${imageIndex + 1}`,
    });
  });

  const seen = new Set<string>();
  return options.filter((option) => {
    const key = option.assetId || option.url || '';
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);

  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
