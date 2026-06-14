'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, FileSpreadsheet, Plus, Printer, Save, Search, Trash2, UploadCloud } from 'lucide-react';

type Site = {
  _id: string;
  title?: string;
  customerName?: string;
  customerPhone?: string;
  siteType?: string;
  address?: string;
  status?: string;
  memo?: string;
};

type Material = {
  _id?: string;
  category?: string;
  process?: string;
  name?: string;
  spec?: string;
  unit?: string;
  unitPrice?: number;
  note?: string;
  sourceSheet?: string;
  updatedAt?: string;
};

type EstimateLine = {
  id: string;
  space: string;
  category: string;
  process: string;
  name: string;
  spec: string;
  unit: string;
  quantity: number;
  customerUnitPrice: number;
  executionUnitPrice: number;
  note: string;
};

type ScheduleTask = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  progress: number;
  memo: string;
};

type SiteEstimate = {
  _id?: string;
  siteId?: string;
  siteTitle?: string;
  customerName?: string;
  versionLabel?: string;
  linesJson?: string;
  scheduleJson?: string;
  customerEstimateTotal?: number;
  executionCostTotal?: number;
  marginAmount?: number;
  marginRate?: number;
  memo?: string;
  createdAt?: string;
  updatedAt?: string;
};

type EstimateApiData = {
  error?: string;
  sites?: Site[];
  estimates?: SiteEstimate[];
  materials?: Material[];
  record?: SiteEstimate | Material;
  importedCount?: number;
};

const MANAGER_PASSWORD_STORAGE_KEY = 'weve-manager-password';

const emptyLine = (): EstimateLine => ({
  id: `line-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  space: '',
  category: '',
  process: '',
  name: '',
  spec: '',
  unit: '',
  quantity: 1,
  customerUnitPrice: 0,
  executionUnitPrice: 0,
  note: '',
});

const emptyTask = (): ScheduleTask => ({
  id: `task-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  name: '',
  startDate: '',
  endDate: '',
  progress: 0,
  memo: '',
});

const defaultSpaces = ['거실', '주방', '침실', '욕실', '현관', '공용', '기타'];

export default function EstimateWorkspacePage() {
  const [password, setPassword] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [estimates, setEstimates] = useState<SiteEstimate[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [estimateId, setEstimateId] = useState('');
  const [versionLabel, setVersionLabel] = useState('기본 견적');
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState<EstimateLine[]>([emptyLine()]);
  const [schedule, setSchedule] = useState<ScheduleTask[]>([emptyTask()]);
  const [activeTab, setActiveTab] = useState<'lines' | 'materials' | 'schedule' | 'documents'>('lines');
  const [materialSearch, setMaterialSearch] = useState('');
  const [materialCategory, setMaterialCategory] = useState('');
  const [lineDbSearch, setLineDbSearch] = useState('');
  const [lineDbCategory, setLineDbCategory] = useState('');
  const [selectedLineId, setSelectedLineId] = useState('');
  const [documentView, setDocumentView] = useState<'cover' | 'summary' | 'detail'>('detail');
  const [editingMaterial, setEditingMaterial] = useState<Material>({});
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const selectedSite = sites.find((site) => site._id === selectedSiteId);
  const totals = useMemo(() => calculateTotals(lines), [lines]);
  const materialCategories = useMemo(() => Array.from(new Set(materials.map((item) => item.category || '미분류'))).sort(), [materials]);
  const materialProcesses = useMemo(() => Array.from(new Set(materials.map((item) => item.process || item.category || '').filter(Boolean))).sort(), [materials]);
  const materialNames = useMemo(() => Array.from(new Set(materials.map((item) => item.name || '').filter(Boolean))).sort(), [materials]);
  const filteredMaterials = useMemo(() => {
    const keyword = materialSearch.trim().toLowerCase();
    return materials.filter((item) => {
      const inCategory = !materialCategory || (item.category || '미분류') === materialCategory;
      const haystack = [item.category, item.process, item.name, item.spec, item.unit, item.note].join(' ').toLowerCase();
      return inCategory && (!keyword || haystack.includes(keyword));
    });
  }, [materials, materialCategory, materialSearch]);
  const lineDbMaterials = useMemo(() => {
    const keyword = lineDbSearch.trim().toLowerCase();
    return materials
      .filter((item) => {
        const inCategory = !lineDbCategory || (item.category || '미분류') === lineDbCategory;
        const haystack = [item.category, item.process, item.name, item.spec, item.unit, item.note].join(' ').toLowerCase();
        return inCategory && (!keyword || haystack.includes(keyword));
      })
      .slice(0, 120);
  }, [materials, lineDbCategory, lineDbSearch]);

  useEffect(() => {
    const savedPassword = window.localStorage.getItem(MANAGER_PASSWORD_STORAGE_KEY) || '';
    const siteIdFromUrl = new URLSearchParams(window.location.search).get('siteId') || '';
    setPassword(savedPassword);
    if (siteIdFromUrl) setSelectedSiteId(siteIdFromUrl);
    if (savedPassword) void loadData(savedPassword, siteIdFromUrl);
  }, []);

  useEffect(() => {
    const estimate = estimates.find((item) => item.siteId === selectedSiteId);
    const site = sites.find((item) => item._id === selectedSiteId);

    setEstimateId(estimate?._id || '');
    setVersionLabel(estimate?.versionLabel || '기본 견적');
    setMemo(estimate?.memo || '');
    setLines(parseJson<EstimateLine[]>(estimate?.linesJson, [emptyLine()]));
    setSchedule(parseJson<ScheduleTask[]>(estimate?.scheduleJson, [emptyTask()]));
    setSelectedLineId('');

    if (!estimate && site) {
      setLines([{ ...emptyLine(), space: '공용', category: site.siteType || '', name: `${site.title || '현장'} 기본 견적` }]);
    }
  }, [selectedSiteId, estimates, sites]);

  const authHeaders = (nextPassword = password) => ({ 'x-manager-password': nextPassword });

  const loadData = async (nextPassword = password, preferredSiteId = selectedSiteId) => {
    setError('');
    setStatus('');
    if (!nextPassword) return;

    try {
      const response = await fetch('/api/manager/estimate', { headers: authHeaders(nextPassword) });
      const data = (await response.json()) as EstimateApiData;
      if (!response.ok) throw new Error(data.error || '견적 데이터를 불러오지 못했습니다.');

      setSites(data.sites || []);
      setEstimates(data.estimates || []);
      setMaterials(data.materials || []);
      setSelectedSiteId(preferredSiteId || data.sites?.[0]?._id || '');
      setIsUnlocked(true);
      window.localStorage.setItem(MANAGER_PASSWORD_STORAGE_KEY, nextPassword);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '견적 데이터 조회 중 오류가 발생했습니다.');
    }
  };

  const saveEstimate = async () => {
    if (!selectedSite) {
      setError('현장을 먼저 선택해주세요.');
      return;
    }

    setIsSaving(true);
    setError('');
    setStatus('');

    try {
      const response = await fetch('/api/manager/estimate', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'saveEstimate',
          id: estimateId,
          siteId: selectedSite._id,
          siteTitle: selectedSite.title,
          customerName: selectedSite.customerName,
          versionLabel,
          lines,
          schedule,
          memo,
        }),
      });
      const data = (await response.json()) as EstimateApiData;
      if (!response.ok) throw new Error(data.error || '견적 저장에 실패했습니다.');

      setStatus('견적 작업이 저장되었습니다.');
      await loadData(password, selectedSite._id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '견적 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const uploadMaterials = async () => {
    if (!uploadFile) {
      setError('업로드할 자재 단가 엑셀 파일을 선택해주세요.');
      return;
    }

    setIsSaving(true);
    setError('');
    setStatus('');

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      const response = await fetch('/api/manager/estimate', {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      const data = (await response.json()) as EstimateApiData;
      if (!response.ok) throw new Error(data.error || '자재 단가 업로드에 실패했습니다.');

      setStatus(`자재 단가 ${data.importedCount || 0}개를 반영했습니다.`);
      setUploadFile(null);
      await loadData(password, selectedSiteId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '자재 단가 업로드 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const saveMaterial = async () => {
    setIsSaving(true);
    setError('');

    try {
      const response = await fetch('/api/manager/estimate', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'saveMaterial', material: editingMaterial }),
      });
      const data = (await response.json()) as EstimateApiData;
      if (!response.ok) throw new Error(data.error || '자재 단가 저장에 실패했습니다.');

      setEditingMaterial({});
      setStatus('자재 단가를 저장했습니다.');
      await loadData(password, selectedSiteId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '자재 단가 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const materialToLine = (material: Material): Partial<EstimateLine> => ({
    category: material.category || '',
    process: material.process || material.category || '',
    name: material.name || '',
    spec: material.spec || '',
    unit: material.unit || '',
    customerUnitPrice: Number(material.unitPrice || 0),
    executionUnitPrice: Number(material.unitPrice || 0),
  });

  const addMaterialToEstimate = (material: Material) => {
    setLines((current) => [
      ...current,
      {
        ...emptyLine(),
        ...materialToLine(material),
      },
    ]);
    setActiveTab('lines');
  };

  const applyMaterialToSelectedLine = (material: Material) => {
    if (!selectedLineId) {
      addMaterialToEstimate(material);
      return;
    }

    setLines((current) => current.map((line) => (line.id === selectedLineId ? { ...line, ...materialToLine(material) } : line)));
    setActiveTab('lines');
  };

  const updateLine = (id: string, updates: Partial<EstimateLine>) => {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...updates } : line)));
  };

  const updateTask = (id: string, updates: Partial<ScheduleTask>) => {
    setSchedule((current) => current.map((task) => (task.id === id ? { ...task, ...updates } : task)));
  };

  if (!isUnlocked) {
    return (
      <main className="min-h-screen bg-[#edf2f5] px-5 py-10 text-[#171512]">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void loadData(password);
          }}
          className="mx-auto max-w-md rounded-lg border border-[#d5dde2] bg-white p-6 shadow-sm"
        >
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#38a9bd]">WEVE ESTIMATE</p>
          <h1 className="mt-2 text-3xl font-semibold">견적 작업 로그인</h1>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="관리자 비밀번호"
            className="mt-5 w-full rounded-md border border-[#d5dde2] px-4 py-3 outline-none focus:border-[#38a9bd]"
          />
          <button type="submit" className="mt-4 w-full rounded-md bg-[#171512] px-4 py-3 font-semibold text-white">
            들어가기
          </button>
          {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#edf2f5] text-[#171512]">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #estimate-print, #estimate-print * { visibility: visible; }
          #estimate-print { position: absolute; inset: 0; width: 100%; background: white; }
          .no-print { display: none !important; }
        }
      `}</style>
      <header className="no-print sticky top-0 z-10 border-b border-[#d5dde2] bg-white/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <button type="button" onClick={() => (window.location.href = '/manager-weve-7519')} className="inline-flex items-center gap-2 text-sm font-semibold text-[#60717d] hover:text-[#171512]">
              <ArrowLeft size={16} />
              관리자 현장 목록으로
            </button>
            <p className="mt-4 text-sm font-bold uppercase tracking-[0.22em] text-[#38a9bd]">WEVE ESTIMATE</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal md:text-4xl">현장별 견적 작업</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={selectedSiteId} onChange={(event) => setSelectedSiteId(event.target.value)} className="min-w-64 rounded-md border border-[#d5dde2] bg-white px-4 py-3 font-semibold outline-none focus:border-[#38a9bd]">
              {sites.map((site) => (
                <option key={site._id} value={site._id}>
                  {site.title || '현장명 없음'} · {site.customerName || '고객명 없음'}
                </option>
              ))}
            </select>
            <button type="button" onClick={saveEstimate} disabled={isSaving} className="inline-flex items-center gap-2 rounded-md bg-[#f1c76a] px-5 py-3 font-semibold disabled:opacity-60">
              <Save size={17} />
              저장
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-6">
        {(status || error) && (
          <div className={`no-print rounded-lg border p-4 text-sm font-semibold ${error ? 'border-red-200 bg-red-50 text-red-600' : 'border-[#cde8d6] bg-[#f0fbf4] text-[#2f7d45]'}`}>
            {error || status}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-4">
          <SummaryCard title="견적 금액" value={formatMoney(totals.customerEstimateTotal)} sub="고객 제안 금액" />
          <SummaryCard title="실행 원가" value={formatMoney(totals.executionCostTotal)} sub="자재·공정 원가" />
          <SummaryCard title="예상 마진" value={formatMoney(totals.marginAmount)} sub={`${totals.marginRate.toFixed(1)}%`} />
          <SummaryCard title="내역 수" value={`${lines.filter((line) => line.name).length}개`} sub="견적 항목" />
        </div>

        <section className="rounded-lg border border-[#d5dde2] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#38a9bd]">SITE</p>
              <h2 className="mt-1 text-3xl font-semibold">{selectedSite?.title || '현장을 선택해주세요'}</h2>
              <p className="mt-2 text-sm leading-6 text-[#60717d]">
                {[selectedSite?.customerName, selectedSite?.customerPhone, selectedSite?.address].filter(Boolean).join(' · ') || '현장 정보가 없습니다.'}
              </p>
            </div>
            <div className="grid gap-2 md:min-w-96">
              <label className="text-sm font-semibold text-[#4d5d66]">견적 버전</label>
              <input value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} className="rounded-md border border-[#d5dde2] px-4 py-3 outline-none focus:border-[#38a9bd]" />
              <textarea value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="현장 메모" rows={3} className="rounded-md border border-[#d5dde2] px-4 py-3 outline-none focus:border-[#38a9bd]" />
            </div>
          </div>
        </section>

        <nav className="no-print flex gap-2 overflow-x-auto">
          {[
            { key: 'lines' as const, label: '견적 내역', Icon: FileSpreadsheet },
            { key: 'materials' as const, label: '자재 단가', Icon: Search },
            { key: 'schedule' as const, label: '공정 일정', Icon: CalendarDays },
            { key: 'documents' as const, label: '서류 출력', Icon: Printer },
          ].map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-md px-4 py-3 text-sm font-semibold ${activeTab === key ? 'bg-[#171512] text-white' : 'bg-white text-[#4d5d66]'}`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>

        {activeTab === 'lines' && (
          <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="rounded-lg border border-[#d5dde2] bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#38a9bd]">GLOBAL DB</p>
                  <h2 className="mt-1 text-xl font-semibold">자재 단가 DB</h2>
                  <p className="mt-2 text-sm leading-6 text-[#60717d]">한 번 업로드한 단가는 모든 현장에서 공통으로 불러옵니다.</p>
                </div>
                <span className="rounded-full bg-[#edf8fb] px-3 py-1 text-xs font-bold text-[#267d8c]">{materials.length}개</span>
              </div>

              <div className="mt-5 grid gap-3">
                <select value={lineDbCategory} onChange={(event) => setLineDbCategory(event.target.value)} className="rounded-md border border-[#d5dde2] px-3 py-3 text-sm outline-none focus:border-[#38a9bd]">
                  <option value="">전체 카테고리</option>
                  {materialCategories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
                <input value={lineDbSearch} onChange={(event) => setLineDbSearch(event.target.value)} placeholder="공정, 품명, 규격 검색" className="rounded-md border border-[#d5dde2] px-4 py-3 text-sm outline-none focus:border-[#38a9bd]" />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {materialCategories.slice(0, 10).map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setLineDbCategory(lineDbCategory === category ? '' : category)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${lineDbCategory === category ? 'border-[#171512] bg-[#171512] text-white' : 'border-[#d5dde2] bg-white text-[#4d5d66]'}`}
                  >
                    {category}
                  </button>
                ))}
              </div>

              <div className="mt-4 max-h-[640px] overflow-y-auto pr-1">
                {lineDbMaterials.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[#d5dde2] bg-[#f7fafb] p-6 text-center text-sm text-[#60717d]">
                    자재 단가 DB가 비어 있습니다. `자재 단가` 탭에서 엑셀을 먼저 업로드해주세요.
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {lineDbMaterials.map((material) => (
                      <article key={material._id || `${material.name}-${material.spec}`} className="rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{material.name || '품명 없음'}</p>
                            <p className="mt-1 text-xs text-[#60717d]">{[material.category, material.spec, material.unit].filter(Boolean).join(' · ') || '규격 정보 없음'}</p>
                          </div>
                          <b className="shrink-0 text-sm">{formatMoney(Number(material.unitPrice || 0))}</b>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => applyMaterialToSelectedLine(material)} className="rounded-md bg-[#f1c76a] px-3 py-2 text-xs font-semibold">
                            선택 행 적용
                          </button>
                          <button type="button" onClick={() => addMaterialToEstimate(material)} className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-xs font-semibold">
                            새 행 추가
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </aside>

            <section className="min-w-0 rounded-lg border border-[#d5dde2] bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">견적 내역</h2>
                  <p className="mt-1 text-sm text-[#60717d]">
                    행을 선택한 뒤 왼쪽 DB에서 `선택 행 적용`을 누르면 분류, 공정, 품명, 규격, 단가가 자동 입력됩니다.
                  </p>
                </div>
                <button type="button" onClick={() => setLines((current) => [...current, emptyLine()])} className="inline-flex items-center gap-2 rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white">
                  <Plus size={16} />
                  항목 추가
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[1320px] w-full border-collapse text-sm">
                  <thead className="bg-[#f7fafb] text-left text-xs uppercase tracking-[0.08em] text-[#60717d]">
                    <tr>
                      {['선택', '공간', '분류', '공종', '품명', '규격', '단위', '수량', '견적단가', '실행단가', '견적금액', '원가', '마진', '비고', ''].map((header) => (
                        <th key={header} className="border-b border-[#d5dde2] px-3 py-3">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      const margin = line.quantity * line.customerUnitPrice - line.quantity * line.executionUnitPrice;
                      return (
                        <tr key={line.id} className={`border-b border-[#edf2f5] ${selectedLineId === line.id ? 'bg-[#fff9e8]' : ''}`}>
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              onClick={() => setSelectedLineId(line.id)}
                              className={`rounded-full px-3 py-1 text-xs font-bold ${selectedLineId === line.id ? 'bg-[#171512] text-white' : 'bg-[#edf2f5] text-[#60717d]'}`}
                            >
                              선택
                            </button>
                          </td>
                          <td className="px-2 py-2"><CellSelect value={line.space} options={defaultSpaces} onChange={(value) => updateLine(line.id, { space: value })} /></td>
                          <td className="px-2 py-2"><CellInput value={line.category} listId="estimate-categories" onChange={(value) => updateLine(line.id, { category: value })} /></td>
                          <td className="px-2 py-2"><CellInput value={line.process} listId="estimate-processes" onChange={(value) => updateLine(line.id, { process: value })} /></td>
                          <td className="px-2 py-2"><CellInput value={line.name} listId="estimate-material-names" onChange={(value) => updateLine(line.id, { name: value })} /></td>
                          <td className="px-2 py-2"><CellInput value={line.spec} onChange={(value) => updateLine(line.id, { spec: value })} /></td>
                          <td className="px-2 py-2"><CellInput value={line.unit} onChange={(value) => updateLine(line.id, { unit: value })} /></td>
                          <td className="px-2 py-2"><CellNumber value={line.quantity} onChange={(value) => updateLine(line.id, { quantity: value })} /></td>
                          <td className="px-2 py-2"><CellNumber value={line.customerUnitPrice} onChange={(value) => updateLine(line.id, { customerUnitPrice: value })} /></td>
                          <td className="px-2 py-2"><CellNumber value={line.executionUnitPrice} onChange={(value) => updateLine(line.id, { executionUnitPrice: value })} /></td>
                          <td className="px-3 py-2 font-semibold">{formatMoney(line.quantity * line.customerUnitPrice)}</td>
                          <td className="px-3 py-2 font-semibold">{formatMoney(line.quantity * line.executionUnitPrice)}</td>
                          <td className={`px-3 py-2 font-semibold ${margin >= 0 ? 'text-[#217346]' : 'text-red-600'}`}>{formatMoney(margin)}</td>
                          <td className="px-2 py-2"><CellInput value={line.note} onChange={(value) => updateLine(line.id, { note: value })} /></td>
                          <td className="px-2 py-2">
                            <button type="button" onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))} className="rounded-md border border-red-200 p-2 text-red-600">
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <datalist id="estimate-categories">
                  {materialCategories.map((category) => <option key={category} value={category} />)}
                </datalist>
                <datalist id="estimate-processes">
                  {materialProcesses.map((process) => <option key={process} value={process} />)}
                </datalist>
                <datalist id="estimate-material-names">
                  {materialNames.map((name) => <option key={name} value={name} />)}
                </datalist>
              </div>
            </section>
          </section>
        )}

        {activeTab === 'materials' && (
          <section className="grid gap-5 xl:grid-cols-[0.65fr_1.35fr]">
            <div className="rounded-lg border border-[#d5dde2] bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold">자재 단가 업로드/수정</h2>
              <p className="mt-2 text-sm leading-6 text-[#60717d]">엑셀의 각 시트를 카테고리로 읽고, 품명/규격/단위/단가를 검색 가능한 단가표로 저장합니다.</p>
              <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#c6a25d] bg-[#fffdf8] p-6 text-center">
                <UploadCloud size={28} />
                <span className="mt-2 text-sm font-semibold">{uploadFile ? uploadFile.name : '자재단가.xlsx 선택'}</span>
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} />
              </label>
              <button type="button" onClick={uploadMaterials} disabled={isSaving} className="mt-3 w-full rounded-md bg-[#171512] px-4 py-3 font-semibold text-white disabled:opacity-60">
                자재 단가 반영
              </button>

              <div className="mt-6 grid gap-3">
                <input value={editingMaterial.category || ''} onChange={(event) => setEditingMaterial({ ...editingMaterial, category: event.target.value })} placeholder="카테고리" className="rounded-md border border-[#d5dde2] px-3 py-2" />
                <input value={editingMaterial.process || ''} onChange={(event) => setEditingMaterial({ ...editingMaterial, process: event.target.value })} placeholder="공정" className="rounded-md border border-[#d5dde2] px-3 py-2" />
                <input value={editingMaterial.name || ''} onChange={(event) => setEditingMaterial({ ...editingMaterial, name: event.target.value })} placeholder="품명" className="rounded-md border border-[#d5dde2] px-3 py-2" />
                <input value={editingMaterial.spec || ''} onChange={(event) => setEditingMaterial({ ...editingMaterial, spec: event.target.value })} placeholder="규격" className="rounded-md border border-[#d5dde2] px-3 py-2" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={editingMaterial.unit || ''} onChange={(event) => setEditingMaterial({ ...editingMaterial, unit: event.target.value })} placeholder="단위" className="rounded-md border border-[#d5dde2] px-3 py-2" />
                  <input value={editingMaterial.unitPrice || ''} onChange={(event) => setEditingMaterial({ ...editingMaterial, unitPrice: Number(event.target.value.replace(/[^\d]/g, '')) })} placeholder="단가" className="rounded-md border border-[#d5dde2] px-3 py-2" />
                </div>
                <button type="button" onClick={saveMaterial} disabled={isSaving} className="rounded-md bg-[#f1c76a] px-4 py-3 font-semibold disabled:opacity-60">
                  단가 저장
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-[#d5dde2] bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <select value={materialCategory} onChange={(event) => setMaterialCategory(event.target.value)} className="rounded-md border border-[#d5dde2] px-3 py-3">
                  <option value="">전체 카테고리</option>
                  {materialCategories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
                <input value={materialSearch} onChange={(event) => setMaterialSearch(event.target.value)} placeholder="품명, 규격, 공종 검색" className="min-w-0 flex-1 rounded-md border border-[#d5dde2] px-4 py-3" />
              </div>
              <div className="mt-4 max-h-[620px] overflow-auto">
                <table className="min-w-[820px] w-full text-sm">
                  <thead className="sticky top-0 bg-[#f7fafb] text-left text-xs uppercase tracking-[0.08em] text-[#60717d]">
                    <tr>
                      {['카테고리', '공정', '품명', '규격', '단위', '단가', '작업'].map((header) => (
                        <th key={header} className="border-b border-[#d5dde2] px-3 py-3">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMaterials.map((material) => (
                      <tr key={material._id || `${material.name}-${material.spec}`} className="border-b border-[#edf2f5]">
                        <td className="px-3 py-3">{material.category}</td>
                        <td className="px-3 py-3">{material.process}</td>
                        <td className="px-3 py-3 font-semibold">{material.name}</td>
                        <td className="px-3 py-3">{material.spec}</td>
                        <td className="px-3 py-3">{material.unit}</td>
                        <td className="px-3 py-3">{formatMoney(Number(material.unitPrice || 0))}</td>
                        <td className="px-3 py-3">
                          <div className="flex gap-2">
                            <button type="button" onClick={() => addMaterialToEstimate(material)} className="rounded-md bg-[#171512] px-3 py-2 text-xs font-semibold text-white">견적 추가</button>
                            <button type="button" onClick={() => setEditingMaterial(material)} className="rounded-md border border-[#d5dde2] px-3 py-2 text-xs font-semibold">수정</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'schedule' && (
          <section className="rounded-lg border border-[#d5dde2] bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">공정 일정</h2>
              <button type="button" onClick={() => setSchedule((current) => [...current, emptyTask()])} className="inline-flex items-center gap-2 rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white">
                <Plus size={16} />
                일정 추가
              </button>
            </div>
            <div className="grid gap-3">
              {schedule.map((task) => (
                <div key={task.id} className="grid gap-2 rounded-lg border border-[#d5dde2] p-4 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.5fr_1.2fr_auto] md:items-center">
                  <input value={task.name} onChange={(event) => updateTask(task.id, { name: event.target.value })} placeholder="공정명" className="rounded-md border border-[#d5dde2] px-3 py-2" />
                  <input type="date" value={task.startDate} onChange={(event) => updateTask(task.id, { startDate: event.target.value })} className="rounded-md border border-[#d5dde2] px-3 py-2" />
                  <input type="date" value={task.endDate} onChange={(event) => updateTask(task.id, { endDate: event.target.value })} className="rounded-md border border-[#d5dde2] px-3 py-2" />
                  <input type="number" min={0} max={100} value={task.progress} onChange={(event) => updateTask(task.id, { progress: Number(event.target.value) })} className="rounded-md border border-[#d5dde2] px-3 py-2" />
                  <input value={task.memo} onChange={(event) => updateTask(task.id, { memo: event.target.value })} placeholder="메모" className="rounded-md border border-[#d5dde2] px-3 py-2" />
                  <button type="button" onClick={() => setSchedule((current) => current.filter((item) => item.id !== task.id))} className="rounded-md border border-red-200 p-2 text-red-600">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'documents' && (
          <section className="grid gap-5 xl:grid-cols-[0.4fr_1.6fr]">
            <div className="no-print rounded-lg border border-[#d5dde2] bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold">서류 출력</h2>
              <p className="mt-2 text-sm leading-6 text-[#60717d]">
                기존 엑셀의 `표지(견)`, `갑지`, `내역서` 흐름에 맞춰 같은 데이터로 서류를 나눠 확인합니다.
              </p>
              <div className="mt-5 grid gap-2">
                {[
                  ['cover', '표지'],
                  ['summary', '갑지'],
                  ['detail', '내역서'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDocumentView(key as typeof documentView)}
                    className={`rounded-md border px-4 py-3 text-left text-sm font-semibold ${documentView === key ? 'border-[#171512] bg-[#171512] text-white' : 'border-[#d5dde2] bg-white text-[#4d5d66]'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => window.print()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#171512] px-5 py-3 font-semibold text-white">
                <Printer size={17} />
                현재 서류 인쇄
              </button>
            </div>
            <PrintPreview site={selectedSite} lines={lines} totals={totals} versionLabel={versionLabel} view={documentView} />
          </section>
        )}
      </section>
    </main>
  );
}

function SummaryCard({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <section className="rounded-lg border border-[#d5dde2] bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#60717d]">{title}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
      <p className="mt-2 text-sm text-[#60717d]">{sub}</p>
    </section>
  );
}

function CellInput({ value, listId, onChange }: { value: string; listId?: string; onChange: (value: string) => void }) {
  return <input value={value} list={listId} onChange={(event) => onChange(event.target.value)} className="w-full min-w-28 rounded-md border border-[#d5dde2] px-2 py-2 outline-none focus:border-[#38a9bd]" />;
}

function CellNumber({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full min-w-24 rounded-md border border-[#d5dde2] px-2 py-2 text-right outline-none focus:border-[#38a9bd]" />;
}

function CellSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full min-w-24 rounded-md border border-[#d5dde2] px-2 py-2 outline-none focus:border-[#38a9bd]">
      <option value="">선택</option>
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  );
}

function PrintPreview({
  site,
  lines,
  totals,
  versionLabel,
  view,
}: {
  site?: Site;
  lines: EstimateLine[];
  totals: ReturnType<typeof calculateTotals>;
  versionLabel: string;
  view: 'cover' | 'summary' | 'detail';
}) {
  const visibleLines = lines.filter((line) => line.name);
  const grouped = groupLinesByCategory(visibleLines);
  const today = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long' }).format(new Date());

  return (
    <article id="estimate-print" className="min-h-[920px] rounded-lg border border-[#d5dde2] bg-white p-8 shadow-sm">
      {view === 'cover' && (
        <section className="mx-auto flex min-h-[820px] max-w-[760px] flex-col justify-between border border-[#171512] p-10">
          <div>
            <div className="text-right text-sm">견 적 일: {today}</div>
            <h1 className="mt-16 border-y-4 border-[#171512] py-8 text-center text-5xl font-semibold tracking-[0.28em]">견 적 서</h1>
            <div className="mt-16 text-center">
              <p className="text-3xl font-semibold">{site?.title || '현장명'}</p>
              <p className="mt-4 text-lg text-[#4d5d66]">{site?.customerName || '고객'} 고객님 귀하</p>
            </div>
            <table className="mt-16 w-full border-collapse text-lg">
              <tbody>
                <CoverRow label="공 사 명" value={site?.title || '-'} />
                <CoverRow label="현장 주소" value={site?.address || '-'} />
                <CoverRow label="견적 금액" value={`${formatMoney(totals.customerEstimateTotal)} (부가세 별도)`} strong />
                <CoverRow label="공사 기간" value="협의 후 확정" />
              </tbody>
            </table>
          </div>
          <div className="text-center">
            <p className="text-3xl font-semibold tracking-[0.32em]">위브 디자인</p>
            <p className="mt-4 text-sm text-[#4d5d66]">WEVE DESIGN · INTERIOR REMODELING</p>
          </div>
        </section>
      )}

      {view === 'summary' && (
        <section className="mx-auto max-w-[980px]">
          <header className="border-b-2 border-[#171512] pb-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm">{today}</p>
                <h1 className="mt-2 text-3xl font-semibold">{site?.title || '현장명'} 님 귀하</h1>
                <p className="mt-2 text-[#4d5d66]">평형/유형: {site?.siteType || '-'} · {versionLabel}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#9d7234]">WEVE DESIGN</p>
                <p className="mt-2 text-sm text-[#60717d]">아래와 같이 견적합니다.</p>
              </div>
            </div>
            <div className="mt-6 border-y-2 border-[#171512] py-4 text-2xl font-semibold">
              합계 금액 {formatMoney(totals.customerEstimateTotal)} <span className="text-base font-normal">(부가세 별도)</span>
            </div>
          </header>

          <table className="mt-6 w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#f1efe9]">
                {['NO', '공정', '규격', '산식', '단위', '금액', '세액'].map((header) => (
                  <th key={header} className="border border-[#171512] px-3 py-3">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map((group, index) => (
                <tr key={group.category}>
                  <td className="border border-[#171512] px-3 py-3 text-center">{index + 1}</td>
                  <td className="border border-[#171512] px-3 py-3 font-semibold">{group.category}</td>
                  <td className="border border-[#171512] px-3 py-3">{group.representativeSpec}</td>
                  <td className="border border-[#171512] px-3 py-3 text-center">1</td>
                  <td className="border border-[#171512] px-3 py-3 text-center">식</td>
                  <td className="border border-[#171512] px-3 py-3 text-right font-semibold">{formatMoney(group.customerAmount)}</td>
                  <td className="border border-[#171512] px-3 py-3 text-right"></td>
                </tr>
              ))}
              <tr className="bg-[#f7f3e8] font-semibold">
                <td className="border border-[#171512] px-3 py-3 text-center" colSpan={5}>합 계</td>
                <td className="border border-[#171512] px-3 py-3 text-right">{formatMoney(totals.customerEstimateTotal)}</td>
                <td className="border border-[#171512] px-3 py-3"></td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {view === 'detail' && (
        <section className="mx-auto max-w-[1100px]">
          <h1 className="border-b-4 border-[#171512] pb-5 text-center text-3xl font-semibold tracking-[0.35em]">[ 내 역 서 ]</h1>
          <table className="mt-6 w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#f1efe9]">
                {['품명', '규격', '단위', '수량', '단가', '금액', '비고'].map((header) => (
                  <th key={header} className="border border-[#171512] px-3 py-3">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map((group, groupIndex) => (
                <Fragment key={group.category}>
                  <tr key={`${group.category}-heading`} className="bg-[#faf8f2] font-semibold">
                    <td className="border border-[#171512] px-3 py-3" colSpan={7}>{groupIndex + 1}. {group.category}</td>
                  </tr>
                  {group.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="border border-[#171512] px-3 py-3">{line.name}</td>
                      <td className="border border-[#171512] px-3 py-3">{line.spec || line.space}</td>
                      <td className="border border-[#171512] px-3 py-3 text-center">{line.unit}</td>
                      <td className="border border-[#171512] px-3 py-3 text-right">{line.quantity.toLocaleString('ko-KR')}</td>
                      <td className="border border-[#171512] px-3 py-3 text-right">{formatMoney(line.customerUnitPrice)}</td>
                      <td className="border border-[#171512] px-3 py-3 text-right font-semibold">{formatMoney(line.quantity * line.customerUnitPrice)}</td>
                      <td className="border border-[#171512] px-3 py-3">{line.note}</td>
                    </tr>
                  ))}
                  <tr key={`${group.category}-subtotal`} className="font-semibold">
                    <td className="border border-[#171512] px-3 py-3 text-center" colSpan={5}>소 계</td>
                    <td className="border border-[#171512] px-3 py-3 text-right">{formatMoney(group.customerAmount)}</td>
                    <td className="border border-[#171512] px-3 py-3"></td>
                  </tr>
                </Fragment>
              ))}
              <tr className="bg-[#f7f3e8] text-lg font-semibold">
                <td className="border border-[#171512] px-3 py-4 text-center" colSpan={5}>총 합 계</td>
                <td className="border border-[#171512] px-3 py-4 text-right">{formatMoney(totals.customerEstimateTotal)}</td>
                <td className="border border-[#171512] px-3 py-4"></td>
              </tr>
            </tbody>
          </table>
        </section>
      )}
    </article>
  );
}

function CoverRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <tr>
      <th className="w-40 border border-[#171512] bg-[#f1efe9] px-4 py-4 text-left">{label}</th>
      <td className={`border border-[#171512] px-4 py-4 ${strong ? 'text-2xl font-semibold' : ''}`}>{value}</td>
    </tr>
  );
}

function groupLinesByCategory(lines: EstimateLine[]) {
  const map = new Map<string, EstimateLine[]>();

  lines.forEach((line) => {
    const category = line.category || line.process || '기타 공사';
    map.set(category, [...(map.get(category) || []), line]);
  });

  return Array.from(map.entries()).map(([category, groupLines]) => ({
    category,
    lines: groupLines,
    representativeSpec: groupLines.find((line) => line.spec)?.spec || groupLines.find((line) => line.space)?.space || '',
    customerAmount: groupLines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.customerUnitPrice || 0), 0),
    executionAmount: groupLines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.executionUnitPrice || 0), 0),
  }));
}

function calculateTotals(lines: EstimateLine[]) {
  const customerEstimateTotal = Math.round(lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.customerUnitPrice || 0), 0));
  const executionCostTotal = Math.round(lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.executionUnitPrice || 0), 0));
  const marginAmount = customerEstimateTotal - executionCostTotal;
  const marginRate = customerEstimateTotal > 0 ? Math.round((marginAmount / customerEstimateTotal) * 1000) / 10 : 0;
  return { customerEstimateTotal, executionCostTotal, marginAmount, marginRate };
}

function parseJson<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function formatMoney(value: number) {
  return `${Math.round(Number(value || 0)).toLocaleString('ko-KR')}원`;
}
