'use client';

import { useMemo, useState } from 'react';
import {
  BarChart3,
  Boxes,
  Building2,
  Check,
  ClipboardList,
  FolderUp,
  Loader2,
  Mail,
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

type OfficeType = 'consultation' | 'customer' | 'sale' | 'inventory' | 'vendor';
type TabKey = 'dashboard' | 'consultations' | 'customers' | 'sales' | 'inventory' | 'vendors' | 'portfolio';

type Consultation = {
  _id: string;
  name?: string;
  phone?: string;
  siteType?: string;
  address?: string;
  message?: string;
  status?: string;
  source?: string;
  createdAt?: string;
  memo?: string;
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

type OfficeData = {
  consultations: Consultation[];
  customers: Customer[];
  sales: Sale[];
  inventory: InventoryItem[];
  vendors: Vendor[];
};

type OfficeApiResponse = Partial<OfficeData> & {
  error?: string;
  record?: Consultation | Customer | Sale | InventoryItem | Vendor;
};

const emptyOfficeData: OfficeData = {
  consultations: [],
  customers: [],
  sales: [],
  inventory: [],
  vendors: [],
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
];

export default function ManagerPage() {
  const [password, setPassword] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [category, setCategory] = useState('주택');
  const [featured, setFeatured] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [consultationEmail, setConsultationEmail] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [loadingOffice, setLoadingOffice] = useState(false);
  const [savingOffice, setSavingOffice] = useState(false);
  const [officeData, setOfficeData] = useState<OfficeData>(emptyOfficeData);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '', siteType: '아파트', address: '', status: '상담중', memo: '' });
  const [saleForm, setSaleForm] = useState({ customerName: '', projectTitle: '', amount: '', cost: '', status: '견적', paymentDate: '', memo: '' });
  const [inventoryForm, setInventoryForm] = useState({ itemName: '', category: '', quantity: '', unit: '개', minQuantity: '', vendor: '', memo: '' });
  const [vendorForm, setVendorForm] = useState({ name: '', manager: '', phone: '', service: '', status: '거래중', memo: '' });

  const previews = useMemo(() => buildPreview(files), [files]);
  const salesTotal = useMemo(() => officeData.sales.reduce((sum, sale) => sum + Number(sale.amount || 0), 0), [officeData.sales]);
  const profitTotal = useMemo(
    () => officeData.sales.reduce((sum, sale) => sum + Number(sale.amount || 0) - Number(sale.cost || 0), 0),
    [officeData.sales],
  );
  const lowStockCount = useMemo(
    () => officeData.inventory.filter((item) => Number(item.quantity || 0) <= Number(item.minQuantity || 0)).length,
    [officeData.inventory],
  );

  const authHeaders = () => ({
    'x-manager-password': password,
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

  const requirePassword = () => {
    if (password) return true;
    setError('관리 비밀번호를 먼저 입력해 주세요.');
    return false;
  };

  const loadOfficeData = async () => {
    setError('');
    setStatus('');
    if (!requirePassword()) return;

    setLoadingOffice(true);
    try {
      const response = await fetch('/api/manager/office', { headers: authHeaders() });
      const data = await readJsonResponse<OfficeApiResponse>(response);
      if (!response.ok) throw new Error(data.error || '업무 데이터를 불러오지 못했습니다.');

      setOfficeData({
        consultations: data.consultations || [],
        customers: data.customers || [],
        sales: data.sales || [],
        inventory: data.inventory || [],
        vendors: data.vendors || [],
      });
      setStatus('업무 데이터를 불러왔습니다.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '업무 데이터 조회 중 오류가 발생했습니다.');
    } finally {
      setLoadingOffice(false);
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

  const handleFolderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    setStatus('');
    setResults([]);
    setFiles(Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/')));
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

  const uploadProjects = async () => {
    setError('');
    setStatus('');
    setResults([]);

    if (!requirePassword()) return;

    if (files.length === 0) {
      setError('업로드할 현장 폴더를 선택해 주세요.');
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
      formData.append('category', category);
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

  return (
    <main className="min-h-screen bg-[#f7f3ea] px-4 py-6 text-[#171512] md:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col justify-between gap-4 border-b border-[#d9cdbb] pb-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#8f6f43]">WEVE OFFICE</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal md:text-4xl">통합 사무 관리</h1>
            <p className="mt-2 text-sm text-[#625d54]">상담, 고객, 매출, 재고, 협력업체, 포트폴리오 업로드를 한 곳에서 관리합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={loadOfficeData}
              disabled={loadingOffice}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[#171512] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loadingOffice ? <Loader2 className="animate-spin" size={16} /> : <ClipboardList size={16} />}
              업무 데이터 불러오기
            </button>
            <a href="/studio-weve-3891" className="rounded-md border border-[#cbb992] bg-white px-4 py-2.5 text-sm font-semibold">
              Sanity Studio
            </a>
          </div>
        </header>

        <section className="mb-4 rounded-lg border border-[#d9cdbb] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-[#8f6f43]" size={20} />
            <h2 className="text-lg font-semibold">관리 비밀번호</h2>
          </div>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Vercel 환경변수 MANAGER_PASSWORD에 설정한 비밀번호"
            className="mt-3 w-full rounded-md border border-[#d8d1c5] bg-[#fffdf8] px-4 py-3 outline-none focus:border-[#8f6f43]"
          />
        </section>

        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard title="신규 상담" value={`${officeData.consultations.filter((item) => item.status !== '완료').length}건`} sub="미완료 상담" />
          <MetricCard title="고객" value={`${officeData.customers.length}명`} sub="등록 고객" />
          <MetricCard title="매출" value={formatMoney(salesTotal)} sub={`예상 이익 ${formatMoney(profitTotal)}`} />
          <MetricCard title="재고" value={`${officeData.inventory.length}개`} sub={`부족 ${lowStockCount}개`} />
          <MetricCard title="협력업체" value={`${officeData.vendors.length}곳`} sub="거래처" />
        </div>

        <nav className="mb-5 flex gap-2 overflow-x-auto border-b border-[#d9cdbb] pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold ${
                activeTab === tab.key ? 'bg-[#171512] text-white' : 'bg-white text-[#4d473f] hover:bg-[#fff7df]'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === 'dashboard' && (
          <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <Panel title="최근 상담 요청">
              <RecordList
                empty="상담 기록이 없습니다."
                items={officeData.consultations.slice(0, 6).map((item) => ({
                  key: item._id,
                  title: `${item.name || '이름 없음'} · ${item.phone || '연락처 없음'}`,
                  meta: `${item.siteType || '현장 종류 없음'} · ${item.address || '주소 없음'} · ${item.status || '신규'}`,
                  body: item.message,
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
                meta: `${item.siteType || '현장 종류 없음'} · ${item.address || '주소 없음'} · ${item.status || '신규'} · ${formatDate(item.createdAt)}`,
                body: item.message,
                action: (
                  <div className="flex flex-wrap gap-2">
                    {['신규', '상담중', '견적', '계약', '완료'].map((nextStatus) => (
                      <button key={nextStatus} onClick={() => saveOfficeRecord('consultation', { status: nextStatus }, item._id)} className="rounded-md border border-[#d8d1c5] px-3 py-1 text-xs">
                        {nextStatus}
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        setCustomerForm({
                          name: item.name || '',
                          phone: item.phone || '',
                          siteType: item.siteType || '아파트',
                          address: item.address || '',
                          status: '상담중',
                          memo: item.message || '',
                        });
                        setActiveTab('customers');
                      }}
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
            <Panel title="고객 등록">
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
                buttonLabel="고객 저장"
                disabled={savingOffice}
                onSubmit={async () => {
                  await saveOfficeRecord('customer', customerForm);
                  setCustomerForm({ name: '', phone: '', siteType: '아파트', address: '', status: '상담중', memo: '' });
                }}
              />
            </Panel>
            <Panel title="고객 목록">
              <RecordList
                empty="등록된 고객이 없습니다."
                items={officeData.customers.map((item) => ({
                  key: item._id,
                  title: `${item.name || '이름 없음'} · ${item.phone || '연락처 없음'}`,
                  meta: `${item.siteType || '현장 종류 없음'} · ${item.address || '주소 없음'} · ${item.status || '상태 없음'}`,
                  body: item.memo,
                }))}
              />
            </Panel>
          </div>
        )}

        {activeTab === 'sales' && (
          <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <Panel title="매출 등록">
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
                buttonLabel="매출 저장"
                disabled={savingOffice}
                onSubmit={async () => {
                  await saveOfficeRecord('sale', {
                    ...saleForm,
                    amount: Number(saleForm.amount || 0),
                    cost: Number(saleForm.cost || 0),
                  });
                  setSaleForm({ customerName: '', projectTitle: '', amount: '', cost: '', status: '견적', paymentDate: '', memo: '' });
                }}
              />
            </Panel>
            <Panel title="매출 목록">
              <RecordList
                empty="등록된 매출이 없습니다."
                items={officeData.sales.map((item) => ({
                  key: item._id,
                  title: `${item.projectTitle || item.customerName || '매출 항목'} · ${formatMoney(Number(item.amount || 0))}`,
                  meta: `${item.status || '상태 없음'} · 원가 ${formatMoney(Number(item.cost || 0))} · 이익 ${formatMoney(Number(item.amount || 0) - Number(item.cost || 0))}`,
                  body: item.memo,
                }))}
              />
            </Panel>
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <Panel title="재고 등록">
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
                buttonLabel="재고 저장"
                disabled={savingOffice}
                onSubmit={async () => {
                  await saveOfficeRecord('inventory', {
                    ...inventoryForm,
                    quantity: Number(inventoryForm.quantity || 0),
                    minQuantity: Number(inventoryForm.minQuantity || 0),
                  });
                  setInventoryForm({ itemName: '', category: '', quantity: '', unit: '개', minQuantity: '', vendor: '', memo: '' });
                }}
              />
            </Panel>
            <Panel title="재고 목록">
              <RecordList
                empty="등록된 재고가 없습니다."
                items={officeData.inventory.map((item) => ({
                  key: item._id,
                  title: `${item.itemName || '품목'} · ${Number(item.quantity || 0)}${item.unit || ''}`,
                  meta: `${item.category || '분류 없음'} · 최소 ${Number(item.minQuantity || 0)}${item.unit || ''} · ${item.vendor || '거래처 없음'}`,
                  body: item.memo,
                }))}
              />
            </Panel>
          </div>
        )}

        {activeTab === 'vendors' && (
          <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <Panel title="협력업체 등록">
              <OfficeForm
                fields={[
                  { label: '업체명', value: vendorForm.name, onChange: (value) => setVendorForm({ ...vendorForm, name: value }) },
                  { label: '담당자', value: vendorForm.manager, onChange: (value) => setVendorForm({ ...vendorForm, manager: value }) },
                  { label: '연락처', value: vendorForm.phone, onChange: (value) => setVendorForm({ ...vendorForm, phone: formatPhoneNumber(value) }) },
                  { label: '업무 분야', value: vendorForm.service, onChange: (value) => setVendorForm({ ...vendorForm, service: value }) },
                  { label: '상태', value: vendorForm.status, onChange: (value) => setVendorForm({ ...vendorForm, status: value }) },
                  { label: '메모', value: vendorForm.memo, onChange: (value) => setVendorForm({ ...vendorForm, memo: value }), textarea: true },
                ]}
                buttonLabel="협력업체 저장"
                disabled={savingOffice}
                onSubmit={async () => {
                  await saveOfficeRecord('vendor', vendorForm);
                  setVendorForm({ name: '', manager: '', phone: '', service: '', status: '거래중', memo: '' });
                }}
              />
            </Panel>
            <Panel title="협력업체 목록">
              <RecordList
                empty="등록된 협력업체가 없습니다."
                items={officeData.vendors.map((item) => ({
                  key: item._id,
                  title: `${item.name || '업체명 없음'} · ${item.service || '업무 분야 없음'}`,
                  meta: `${item.manager || '담당자 없음'} · ${item.phone || '연락처 없음'} · ${item.status || '상태 없음'}`,
                  body: item.memo,
                }))}
              />
            </Panel>
          </div>
        )}

        {activeTab === 'portfolio' && (
          <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
            <Panel title="상담문의 이메일">
              <p className="mb-4 leading-7 text-[#625d54]">홈페이지 상담문의가 도착할 이메일을 직접 바꿀 수 있습니다.</p>
              <input
                type="email"
                value={consultationEmail}
                onChange={(event) => setConsultationEmail(event.target.value)}
                placeholder="예: hello@wevedesign.co.kr"
                className="w-full rounded-md border border-[#d8d1c5] bg-[#fffdf8] px-4 py-3 outline-none focus:border-[#8f6f43]"
              />
              <button
                onClick={saveEmail}
                disabled={savingEmail}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#f1c76a] px-5 py-3 font-semibold disabled:opacity-60"
              >
                {savingEmail ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                이메일 저장
              </button>
            </Panel>

            <Panel title="현장 폴더 한번에 업로드">
              <p className="mb-4 leading-7 text-[#625d54]">
                현장명 폴더 안에 `대표.jpg`, `거실1.jpg`, `거실2.jpg`, `주방1.jpg`처럼 정리한 뒤 폴더를 선택하면 Project와 공간별 사진 묶음으로 자동 등록됩니다.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="카테고리 예: 주택, 아파트"
                  className="rounded-md border border-[#d8d1c5] bg-[#fffdf8] px-4 py-3 outline-none focus:border-[#8f6f43]"
                />
                <label className="flex items-center gap-2 rounded-md border border-[#d8d1c5] bg-[#fffdf8] px-4 py-3">
                  <input type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} />
                  메인 Project에도 표시
                </label>
              </div>

              <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#cbb992] bg-[#fffdf8] px-5 py-10 text-center transition hover:bg-[#fff7df]">
                <UploadCloud className="mb-3 text-[#8f6f43]" size={34} />
                <span className="font-semibold">현장 폴더 선택</span>
                <span className="mt-2 text-sm text-[#625d54]">여러 현장 폴더가 들어있는 상위 폴더도 선택할 수 있습니다.</span>
                <input type="file" multiple accept="image/*" className="hidden" onChange={handleFolderChange} {...{ webkitdirectory: '', directory: '' }} />
              </label>

              {previews.length > 0 && (
                <div className="mt-5 rounded-lg bg-[#f7f3ea] p-4">
                  <p className="font-semibold">업로드 미리보기</p>
                  <div className="mt-3 grid gap-3">
                    {previews.map((project) => (
                      <div key={project.title} className="rounded-md bg-white p-3 text-sm">
                        <p className="font-semibold">
                          {project.title} · 사진 {project.count}장
                        </p>
                        <p className="mt-1 text-[#625d54]">{project.rooms.join(', ') || '상세 사진 없음'}</p>
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
                Sanity에 업로드
              </button>
            </Panel>
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
      </div>
    </main>
  );
}

function MetricCard({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <section className="rounded-lg border border-[#d9cdbb] bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-[#625d54]">{title}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-[#8f6f43]">{sub}</p>
    </section>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[#d9cdbb] bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function RecordList({
  empty,
  items,
}: {
  empty: string;
  items: Array<{ key: string; title: string; meta?: string; body?: string; action?: React.ReactNode }>;
}) {
  if (items.length === 0) {
    return <p className="rounded-md bg-[#fffdf8] px-4 py-5 text-sm text-[#625d54]">{empty}</p>;
  }

  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <article key={item.key} className="rounded-md border border-[#eadfcd] bg-[#fffdf8] p-4">
          <div className="flex flex-col justify-between gap-3 md:flex-row">
            <div>
              <h3 className="font-semibold">{item.title}</h3>
              {item.meta && <p className="mt-1 text-sm text-[#625d54]">{item.meta}</p>}
            </div>
            {item.action}
          </div>
          {item.body && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#4d473f]">{item.body}</p>}
        </article>
      ))}
    </div>
  );
}

function OfficeForm({
  fields,
  buttonLabel,
  disabled,
  onSubmit,
}: {
  fields: Array<{ label: string; value: string; textarea?: boolean; options?: string[]; onChange: (value: string) => void }>;
  buttonLabel: string;
  disabled: boolean;
  onSubmit: () => void;
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
      <button onClick={onSubmit} disabled={disabled} className="mt-2 inline-flex items-center justify-center gap-2 rounded-md bg-[#171512] px-5 py-3 font-semibold text-white disabled:opacity-60">
        {disabled ? <Loader2 className="animate-spin" size={18} /> : <PackagePlus size={18} />}
        {buttonLabel}
      </button>
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

function onlyNumber(value: string) {
  return value.replace(/[^\d]/g, '');
}

function formatPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);

  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
