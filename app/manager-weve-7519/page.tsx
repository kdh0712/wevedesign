'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Boxes,
  Building2,
  Check,
  ExternalLink,
  FolderUp,
  Home,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  LogOut,
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

type OfficeType = 'consultation' | 'customer' | 'sale' | 'inventory' | 'vendor' | 'project';
type TabKey = 'dashboard' | 'consultations' | 'customers' | 'sales' | 'inventory' | 'vendors' | 'portfolio' | 'accounts';

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

type ManagedProject = {
  _id: string;
  title?: string;
  description?: string;
  location?: string;
  siteType?: string;
  area?: number;
  year?: string;
  materials?: string;
  displayOrder?: number;
  mainImage?: string;
  mainImageAlt?: string;
  mainImagePosition?: string;
  mainImagePositionX?: number;
  mainImagePositionY?: number;
  featured?: boolean;
  isVisible?: boolean;
  categoryId?: string;
  categoryTitle?: string;
};

type OfficeData = {
  consultations: Consultation[];
  customers: Customer[];
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
  record?: Consultation | Customer | Sale | InventoryItem | Vendor | ManagedProject;
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
  sales: [],
  inventory: [],
  vendors: [],
  categories: [],
  projects: [],
};

const MANAGER_PASSWORD_STORAGE_KEY = 'weve-manager-password';
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

const tabs: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'dashboard', label: '업무 현황', icon: <BarChart3 size={16} /> },
  { key: 'consultations', label: '상담 요청', icon: <Phone size={16} /> },
  { key: 'customers', label: '고객 관리', icon: <Users size={16} /> },
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
  const [homepageMode, setHomepageMode] = useState<'quick' | 'detail'>('quick');
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [uploadSiteType, setUploadSiteType] = useState('아파트');
  const [uploadLocation, setUploadLocation] = useState('');
  const [uploadArea, setUploadArea] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [featured, setFeatured] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
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
    heroImage: '',
    heroImage2: '',
    heroImage3: '',
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
  const [projectDisplayOrder, setProjectDisplayOrder] = useState('');
  const [projectMainImagePosition, setProjectMainImagePosition] = useState('center');
  const [projectMainImagePositionX, setProjectMainImagePositionX] = useState('50');
  const [projectMainImagePositionY, setProjectMainImagePositionY] = useState('50');
  const [projectFeatured, setProjectFeatured] = useState(false);
  const [projectVisible, setProjectVisible] = useState(true);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [loadingOffice, setLoadingOffice] = useState(false);
  const [savingOffice, setSavingOffice] = useState(false);
  const [officeData, setOfficeData] = useState<OfficeData>(emptyOfficeData);
  const [visitStats, setVisitStats] = useState<VisitStats | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState('');
  const [results, setResults] = useState<UploadResult[]>([]);
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);
  const [completionConsultation, setCompletionConsultation] = useState<Consultation | null>(null);
  const [activePreviewTarget, setActivePreviewTarget] = useState<PreviewTarget | null>(null);
  const [isSurveyEditorOpen, setIsSurveyEditorOpen] = useState(false);
  const [surveyEditorTab, setSurveyEditorTab] = useState(0);
  const [surveyDraft, setSurveyDraft] = useState<SurveyConfig>(defaultSurveyConfig);
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '', siteType: '아파트', address: '', status: '상담중', memo: '' });
  const [saleForm, setSaleForm] = useState({ customerName: '', projectTitle: '', amount: '', cost: '', status: '견적', paymentDate: '', memo: '' });
  const [inventoryForm, setInventoryForm] = useState({ itemName: '', category: '', quantity: '', unit: '개', minQuantity: '', vendor: '', memo: '' });
  const [vendorForm, setVendorForm] = useState({ name: '', manager: '', phone: '', service: '', status: '거래중', memo: '' });
  const [editingCustomerId, setEditingCustomerId] = useState('');
  const [editingSaleId, setEditingSaleId] = useState('');
  const [editingInventoryId, setEditingInventoryId] = useState('');
  const [editingVendorId, setEditingVendorId] = useState('');
  const customerFormRef = useRef<HTMLDivElement | null>(null);
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

    const savedPassword = window.localStorage.getItem(MANAGER_PASSWORD_STORAGE_KEY);
    if (savedPassword) {
      const fallbackUser: ManagerUser = {
        id: 'admin',
        name: '총괄 관리자',
        loginId: 'admin',
        role: 'admin',
        permissions: tabs.map((tab) => tab.key),
      };
      setPassword(savedPassword);
      setCurrentUser(fallbackUser);
      void loadOfficeData(savedPassword, { silent: true });
      void loadAccounts(savedPassword);
    }
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
    setError('관리 비밀번호를 먼저 입력해 주세요.');
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
      window.localStorage.setItem(MANAGER_PASSWORD_STORAGE_KEY, result.token);
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
    window.localStorage.removeItem(MANAGER_PASSWORD_STORAGE_KEY);
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
        heroImage: settings.heroImage || '',
        heroImage2: settings.heroImage2 || '',
        heroImage3: settings.heroImage3 || '',
      });
      setSurveyDraft(parsedSurveyConfig);
      setConsultationEmail(settings.consultationEmail || '');
      if (!category && data.categories?.[0]?._id) setCategory(data.categories[0]._id);
      setPassword(managerPassword);
      setIsUnlocked(true);
      setLastRefreshedAt(formatTime(new Date()));
      window.localStorage.setItem(MANAGER_PASSWORD_STORAGE_KEY, managerPassword);
      if (!options.silent) setStatus('업무 데이터를 불러왔습니다.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '업무 데이터 조회 중 오류가 발생했습니다.');
      if (caught instanceof Error && caught.message.includes('비밀번호')) {
        window.localStorage.removeItem(MANAGER_PASSWORD_STORAGE_KEY);
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

    setSavingOffice(true);
    try {
      if (registerCustomer) {
        await saveOfficeRecord('customer', {
          name: consultation.name || '',
          phone: consultation.phone || '',
          siteType: consultation.propertyType || consultation.siteType || '아파트',
          address: consultation.fullAddress || consultation.address || '',
          status: '상담완료',
          memo: consultation.message || '',
        });
        await saveOfficeRecord('project', {
          title: `${consultation.name || '고객'} 현장`,
          description: consultation.message || '',
          siteType: consultation.propertyType || consultation.siteType || '',
          location: consultation.fullAddress || consultation.address || '',
          isVisible: false,
          featured: false,
        });
      }

      await saveOfficeRecord('consultation', { status: '완료' }, consultation._id);
      setCompletionConsultation(null);
      setSelectedConsultation(null);
      setStatus(registerCustomer ? '고객과 현장을 등록하고 상담을 완료했습니다.' : '상담을 완료했습니다.');
    } finally {
      setSavingOffice(false);
    }
  };

  const scrollToForm = (ref: React.RefObject<HTMLDivElement | null>) => {
    window.setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const resetCustomerForm = () => {
    setEditingCustomerId('');
    setCustomerForm({ name: '', phone: '', siteType: '아파트', address: '', status: '상담중', memo: '' });
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

  const prepareCustomerFromConsultation = (consultation: Consultation) => {
    setEditingCustomerId('');
    setCustomerForm({
      name: consultation.name || '',
      phone: consultation.phone || '',
      siteType: consultation.propertyType || consultation.siteType || '아파트',
      address: consultation.fullAddress || consultation.address || '',
      status: '상담중',
      memo: consultation.message || '',
    });
    setSelectedConsultation(null);
    setCompletionConsultation(null);
    setActiveTab('customers');
    scrollToForm(customerFormRef);
  };

  const editCustomer = (customer: Customer) => {
    setEditingCustomerId(customer._id);
    setCustomerForm({
      name: customer.name || '',
      phone: customer.phone || '',
      siteType: customer.siteType || '아파트',
      address: customer.address || '',
      status: customer.status || '상담중',
      memo: customer.memo || '',
    });
    scrollToForm(customerFormRef);
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

  const uploadHomepageImage = async (field: 'heroImage' | 'heroImage2' | 'heroImage3', file?: File) => {
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
      <div className={`flex min-h-screen ${!isUnlocked ? 'pointer-events-none select-none blur-[2px]' : ''}`}>
        <aside className="hidden w-64 shrink-0 flex-col bg-[#273541] text-[#dfe8ed] lg:flex">
          <div className="border-b border-white/10 px-6 py-6">
            <div className="flex items-center gap-3">
              <img src="/weve-mark.png" alt="WEVE DESIGN" className="brand-mark-on-dark h-11 w-11 rounded-md bg-white/8 object-contain p-1.5" />
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
            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
              <label className="flex min-w-0 flex-1 items-center gap-3 rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-3">
                <ShieldCheck className="shrink-0 text-[#38a9bd]" size={20} />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="관리 비밀번호"
                  className="min-w-0 flex-1 bg-transparent outline-none"
                />
              </label>
              <div className="flex gap-2 overflow-x-auto lg:hidden">
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

        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard title="신규 상담" value={`${officeData.consultations.filter((item) => item.status !== '완료').length}건`} sub="미완료 상담" />
          <MetricCard title="고객" value={`${officeData.customers.length}명`} sub="등록 고객" />
          <MetricCard title="매출" value={formatMoney(salesTotal)} sub={`예상 이익 ${formatMoney(profitTotal)}`} />
          <MetricCard title="재고" value={`${officeData.inventory.length}개`} sub={`부족 ${lowStockCount}개`} />
          <MetricCard title="협력업체" value={`${officeData.vendors.length}곳`} sub="거래처" />
        </div>

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
                  <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                    {['신규', '상담중', '견적', '계약', '완료'].map((nextStatus) => (
                      <button key={nextStatus} onClick={() => saveOfficeRecord('consultation', { status: nextStatus }, item._id)} className="rounded-md border border-[#d8d1c5] px-3 py-1 text-xs">
                        {nextStatus}
                      </button>
                    ))}
                    <button onClick={() => setCompletionConsultation(item)} className="rounded-md bg-[#38bcd4] px-3 py-1 text-xs font-semibold text-white">
                      상담 완료
                    </button>
                    <button onClick={() => deleteOfficeRecord(item._id)} className="rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-600">
                      삭제
                    </button>
                    <button
                      onClick={() => prepareCustomerFromConsultation(item)}
                      className="rounded-md bg-[#f1c76a] px-3 py-1 text-xs font-semibold"
                    >
                      고객으로 등록
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
                ]}
                buttonLabel={editingCustomerId ? '고객 수정 저장' : '고객 저장'}
                disabled={savingOffice}
                onSubmit={async () => {
                  await saveOfficeRecord('customer', customerForm, editingCustomerId || undefined);
                  resetCustomerForm();
                }}
                secondaryLabel={editingCustomerId ? '수정 취소' : undefined}
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
                { key: 'quick', label: '간편 홈페이지 관리' },
                { key: 'detail', label: '상세 홈페이지 수정' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setHomepageMode(item.key as 'quick' | 'detail')}
                  className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                    homepageMode === item.key ? 'bg-[#171512] text-white' : 'bg-[#f7fafb] text-[#4d5d66] hover:bg-[#edf2f5]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {homepageMode === 'quick' && (
            <Panel title="간편 홈페이지 관리">
              <div className="grid gap-3 md:grid-cols-2">
                <SettingInput label="상담문의 이메일" value={homepageSettings.consultationEmail} onChange={(value) => setHomepageSettings({ ...homepageSettings, consultationEmail: value })} {...previewFocus('consultationEmail')} />
                <SettingInput label="대표자명" value={homepageSettings.representativeName} onChange={(value) => setHomepageSettings({ ...homepageSettings, representativeName: value })} placeholder="예: 김동호" {...previewFocus('representativeName')} />
                <SettingInput label="사업자등록번호" value={homepageSettings.businessNumber} onChange={(value) => setHomepageSettings({ ...homepageSettings, businessNumber: value })} placeholder="예: 123-45-67890" {...previewFocus('businessNumber')} />
                <SettingInput label="회사 시작 연도" value={homepageSettings.companyStartYear} onChange={(value) => setHomepageSettings({ ...homepageSettings, companyStartYear: onlyNumber(value).slice(0, 4) })} placeholder="예: 2020" {...previewFocus('companyStartYear')} />
                <SettingInput label="대표 연락처" value={homepageSettings.phone} onChange={(value) => setHomepageSettings({ ...homepageSettings, phone: formatPhoneNumber(value) })} {...previewFocus('phone')} />
                <SettingInput label="도로명 주소" value={homepageSettings.address} onChange={(value) => setHomepageSettings({ ...homepageSettings, address: value })} {...previewFocus('address')} />
                <SettingInput label="지번 주소" value={homepageSettings.lotAddress} onChange={(value) => setHomepageSettings({ ...homepageSettings, lotAddress: value })} {...previewFocus('lotAddress')} />
                <SettingInput label="오시는 길 큰 문구" value={homepageSettings.locationTitle} onChange={(value) => setHomepageSettings({ ...homepageSettings, locationTitle: value })} placeholder="예: 전문 인테리어 상담을 시작합니다." {...previewFocus('locationTitle')} />
                <SettingInput label="메인 버튼 문구" value={homepageSettings.primaryButtonLabel} onChange={(value) => setHomepageSettings({ ...homepageSettings, primaryButtonLabel: value })} {...previewFocus('primaryButtonLabel')} />
                <SettingInput label="보조 버튼 문구" value={homepageSettings.secondaryButtonLabel} onChange={(value) => setHomepageSettings({ ...homepageSettings, secondaryButtonLabel: value })} {...previewFocus('secondaryButtonLabel')} />
                <SettingInput label="카카오톡 상담 링크" value={homepageSettings.kakaoUrl} onChange={(value) => setHomepageSettings({ ...homepageSettings, kakaoUrl: value })} {...previewFocus('kakaoUrl')} />
                <SettingInput label="카카오 채널 관리 링크" value={homepageSettings.kakaoChannelManagerUrl} onChange={(value) => setHomepageSettings({ ...homepageSettings, kakaoChannelManagerUrl: value })} placeholder="예: https://center-pf.kakao.com/..." {...previewFocus('kakaoChannelManagerUrl')} />
                <SettingInput label="상담 영역 제목" value={homepageSettings.contactTitle} onChange={(value) => setHomepageSettings({ ...homepageSettings, contactTitle: value })} {...previewFocus('contactTitle')} />
                <SettingInput label="첫 화면 큰 문구" value={homepageSettings.heroTitle} onChange={(value) => setHomepageSettings({ ...homepageSettings, heroTitle: value })} textarea {...previewFocus('heroTitle')} />
                <SettingInput label="첫 화면 설명" value={homepageSettings.heroDescription} onChange={(value) => setHomepageSettings({ ...homepageSettings, heroDescription: value })} textarea {...previewFocus('heroDescription')} />
                <SettingInput label="상담 영역 설명" value={homepageSettings.contactBody} onChange={(value) => setHomepageSettings({ ...homepageSettings, contactBody: value })} textarea {...previewFocus('contactBody')} />
              </div>
              <div className="mt-5 rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">상담 설문 질문 수정</h3>
                    <p className="mt-1 text-sm leading-6 text-[#60717d]">질문별 탭에서 문구와 선택지를 수정하고, 첫 질문 선택지별 다음 질문 묶음을 관리합니다.</p>
                  </div>
                  <button
                    type="button"
                    onClick={openSurveyEditor}
                    className="rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2d2822]"
                  >
                    상담 설문 편집
                  </button>
                </div>
              </div>
              <button
                onClick={saveHomepageSettings}
                disabled={savingEmail}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-md bg-[#38bcd4] px-5 py-3 font-semibold text-white disabled:opacity-60"
              >
                {savingEmail ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                홈페이지 설정 저장
              </button>
            </Panel>
            )}

            {homepageMode === 'detail' && (
              <Panel title="상세 홈페이지 수정">
                <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_460px]">
                  <div className="grid gap-5">
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
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) => void uploadHomepageImage(field as 'heroImage' | 'heroImage2' | 'heroImage3', event.target.files?.[0])}
                            className="text-sm"
                          />
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

                    <section className="rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-4">
                    <h3 className="mb-3 font-semibold">중간 문구와 Project 영역</h3>
                    <div className="grid gap-3 md:grid-cols-2">
                      <SettingInput label="브랜드 작은 문구" value={homepageSettings.statementLabel} onChange={(value) => setHomepageSettings({ ...homepageSettings, statementLabel: value })} {...previewFocus('statementLabel')} />
                      <SettingInput label="브랜드 큰 문구" value={homepageSettings.statementTitle} onChange={(value) => setHomepageSettings({ ...homepageSettings, statementTitle: value })} textarea {...previewFocus('statementTitle')} />
                      <SettingInput label="브랜드 설명" value={homepageSettings.statementBody} onChange={(value) => setHomepageSettings({ ...homepageSettings, statementBody: value })} textarea {...previewFocus('statementBody')} />
                      <SettingInput label="Project 섹션 제목" value={homepageSettings.projectSectionTitle} onChange={(value) => setHomepageSettings({ ...homepageSettings, projectSectionTitle: value })} {...previewFocus('projectSectionTitle')} />
                      <SettingInput label="Project 버튼 문구" value={homepageSettings.projectButtonLabel} onChange={(value) => setHomepageSettings({ ...homepageSettings, projectButtonLabel: value })} {...previewFocus('projectButtonLabel')} />
                      <SettingInput label="Project 목록 페이지 제목" value={homepageSettings.portfolioTitle} onChange={(value) => setHomepageSettings({ ...homepageSettings, portfolioTitle: value })} {...previewFocus('portfolioTitle')} />
                    </div>
                    </section>

                    <section className="rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-4">
                    <h3 className="mb-3 font-semibold">소개, 위치, 상담, 회사 정보</h3>
                    <div className="grid gap-3 md:grid-cols-2">
                      <SettingInput label="소개 작은 문구" value={homepageSettings.aboutLabel} onChange={(value) => setHomepageSettings({ ...homepageSettings, aboutLabel: value })} {...previewFocus('aboutLabel')} />
                      <SettingInput label="소개 큰 문구" value={homepageSettings.aboutTitle} onChange={(value) => setHomepageSettings({ ...homepageSettings, aboutTitle: value })} textarea {...previewFocus('aboutTitle')} />
                      <SettingInput label="소개 설명" value={homepageSettings.aboutBody} onChange={(value) => setHomepageSettings({ ...homepageSettings, aboutBody: value })} textarea {...previewFocus('aboutBody')} />
                      <SettingInput label="진행 과정 작은 문구" value={homepageSettings.processLabel} onChange={(value) => setHomepageSettings({ ...homepageSettings, processLabel: value })} {...previewFocus('processLabel')} />
                      <SettingInput label="진행 과정 큰 문구" value={homepageSettings.processTitle} onChange={(value) => setHomepageSettings({ ...homepageSettings, processTitle: value })} textarea {...previewFocus('processTitle')} />
                      <SettingInput label="위치 작은 문구" value={homepageSettings.locationLabel} onChange={(value) => setHomepageSettings({ ...homepageSettings, locationLabel: value })} {...previewFocus('locationLabel')} />
                      <SettingInput label="오시는 길 큰 문구" value={homepageSettings.locationTitle} onChange={(value) => setHomepageSettings({ ...homepageSettings, locationTitle: value })} {...previewFocus('locationTitle')} />
                      <SettingInput label="도로명 주소" value={homepageSettings.address} onChange={(value) => setHomepageSettings({ ...homepageSettings, address: value })} {...previewFocus('address')} />
                      <SettingInput label="지번 주소" value={homepageSettings.lotAddress} onChange={(value) => setHomepageSettings({ ...homepageSettings, lotAddress: value })} {...previewFocus('lotAddress')} />
                      <SettingInput label="대표 연락처" value={homepageSettings.phone} onChange={(value) => setHomepageSettings({ ...homepageSettings, phone: formatPhoneNumber(value) })} {...previewFocus('phone')} />
                      <SettingInput label="상담 작은 문구" value={homepageSettings.contactLabel} onChange={(value) => setHomepageSettings({ ...homepageSettings, contactLabel: value })} {...previewFocus('contactLabel')} />
                      <SettingInput label="상담 큰 문구" value={homepageSettings.contactTitle} onChange={(value) => setHomepageSettings({ ...homepageSettings, contactTitle: value })} {...previewFocus('contactTitle')} />
                      <SettingInput label="상담 설명" value={homepageSettings.contactBody} onChange={(value) => setHomepageSettings({ ...homepageSettings, contactBody: value })} textarea {...previewFocus('contactBody')} />
                      <SettingInput label="상담문의 이메일" value={homepageSettings.consultationEmail} onChange={(value) => setHomepageSettings({ ...homepageSettings, consultationEmail: value })} {...previewFocus('consultationEmail')} />
                      <SettingInput label="카카오톡 상담 링크" value={homepageSettings.kakaoUrl} onChange={(value) => setHomepageSettings({ ...homepageSettings, kakaoUrl: value })} {...previewFocus('kakaoUrl')} />
                      <SettingInput label="카카오 채널 관리 링크" value={homepageSettings.kakaoChannelManagerUrl} onChange={(value) => setHomepageSettings({ ...homepageSettings, kakaoChannelManagerUrl: value })} placeholder="예: https://center-pf.kakao.com/..." {...previewFocus('kakaoChannelManagerUrl')} />
                      <SettingInput label="대표자명" value={homepageSettings.representativeName} onChange={(value) => setHomepageSettings({ ...homepageSettings, representativeName: value })} placeholder="예: 김동호" {...previewFocus('representativeName')} />
                      <SettingInput label="사업자등록번호" value={homepageSettings.businessNumber} onChange={(value) => setHomepageSettings({ ...homepageSettings, businessNumber: value })} placeholder="예: 123-45-67890" {...previewFocus('businessNumber')} />
                      <SettingInput label="회사 시작 연도" value={homepageSettings.companyStartYear} onChange={(value) => setHomepageSettings({ ...homepageSettings, companyStartYear: onlyNumber(value).slice(0, 4) })} placeholder="예: 2020" {...previewFocus('companyStartYear')} />
                    </div>
                    </section>
                  </div>
                  <HomepageLivePreview activeTarget={activePreviewTarget} />
                </div>
                <button
                  onClick={saveHomepageSettings}
                  disabled={savingEmail}
                  className="mt-5 inline-flex items-center justify-center gap-2 rounded-md bg-[#38bcd4] px-5 py-3 font-semibold text-white disabled:opacity-60"
                >
                  {savingEmail ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                  상세 홈페이지 설정 저장
                </button>
              </Panel>
            )}

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
                  <input type="file" multiple accept="image/*" className="hidden" onChange={handleFolderChange} {...{ webkitdirectory: '', directory: '' }} />
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
                  {selectedProjectForEdit?.mainImage && (
                    <div className="rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[#4d5d66]">대표 사진 카드 미리보기</p>
                          <p className="mt-1 text-xs text-[#60717d]">사진 위를 클릭하거나 드래그해서 카드에 보일 중심을 정합니다.</p>
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
                          className="relative w-full max-w-[220px] cursor-crosshair overflow-hidden rounded-md bg-[#d8d1c5]"
                        >
                          <img
                            src={selectedProjectForEdit.mainImage}
                            alt={selectedProjectForEdit.mainImageAlt || selectedProjectForEdit.title || 'Project preview'}
                            className="aspect-[4/5] w-full object-cover"
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

function formatPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);

  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
