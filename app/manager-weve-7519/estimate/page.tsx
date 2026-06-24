'use client';

import { Fragment, useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Copy, FileSpreadsheet, Plus, Printer, Save, Search, Trash2, UploadCloud, X } from 'lucide-react';

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

type WorkLine = {
  id: string;
  sourceLineId?: string;
  space: string;
  category: string;
  process: string;
  name: string;
  spec: string;
  unit: string;
  quantity: number;
  executionUnitPrice: number;
  vendor: string;
  status: string;
  note: string;
};

type ScheduleTask = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  progress: number;
  color: string;
  vendorId: string;
  vendorName: string;
  vendorPhone: string;
  memo: string;
};

type Vendor = {
  _id?: string;
  name?: string;
  manager?: string;
  phone?: string;
  service?: string;
  status?: string;
};

type EstimateVersionType = 'draft' | 'revision' | 'final' | 'change';

type SiteEstimate = {
  _id?: string;
  siteId?: string;
  siteTitle?: string;
  customerName?: string;
  versionType?: EstimateVersionType;
  versionLabel?: string;
  linesJson?: string;
  workLinesJson?: string;
  scheduleJson?: string;
  holidaysJson?: string;
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
  vendors?: Vendor[];
  record?: SiteEstimate | Material;
  importedCount?: number;
};

type MaterialPickerState = {
  lineId: string;
  step: 'category' | 'process' | 'material';
  category: string;
  process: string;
  search: string;
};

const MANAGER_PASSWORD_STORAGE_KEY = 'weve-manager-password';
const NEW_ESTIMATE_ID = '__new_estimate_version__';
const estimateVersionTypes: Array<{ key: EstimateVersionType; label: string; description: string }> = [
  { key: 'draft', label: '초안', description: '첫 상담/초기 견적' },
  { key: 'revision', label: '수정안', description: '고객 피드백 반영' },
  { key: 'final', label: '최종안', description: '계약 전 최종 확정' },
  { key: 'change', label: '변경견적', description: '추가·변경 공사' },
];

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
  durationDays: 1,
  progress: 0,
  color: '#f1c76a',
  vendorId: '',
  vendorName: '',
  vendorPhone: '',
  memo: '',
});

const emptyWorkLine = (): WorkLine => ({
  id: `work-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  sourceLineId: '',
  space: '',
  category: '',
  process: '',
  name: '',
  spec: '',
  unit: '',
  quantity: 1,
  executionUnitPrice: 0,
  vendor: '',
  status: '예정',
  note: '',
});

const defaultSpaces = ['거실', '주방', '침실', '욕실', '현관', '공용', '기타'];
const workStatuses = ['예정', '발주', '진행', '완료', '보류'];

export default function EstimateWorkspacePage() {
  const [password, setPassword] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [estimates, setEstimates] = useState<SiteEstimate[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [selectedEstimateId, setSelectedEstimateId] = useState('');
  const [estimateId, setEstimateId] = useState('');
  const [versionType, setVersionType] = useState<EstimateVersionType>('draft');
  const [newVersionType, setNewVersionType] = useState<EstimateVersionType>('revision');
  const [versionLabel, setVersionLabel] = useState('초안');
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState<EstimateLine[]>([emptyLine()]);
  const [workLines, setWorkLines] = useState<WorkLine[]>([emptyWorkLine()]);
  const [schedule, setSchedule] = useState<ScheduleTask[]>([emptyTask()]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [holidayDate, setHolidayDate] = useState(() => todayKey());
  const [activeTab, setActiveTab] = useState<'lines' | 'work' | 'materials' | 'schedule' | 'documents'>('lines');
  const [isVersionPanelOpen, setIsVersionPanelOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [materialSearch, setMaterialSearch] = useState('');
  const [materialCategory, setMaterialCategory] = useState('');
  const [lineDbSearch, setLineDbSearch] = useState('');
  const [lineDbCategory, setLineDbCategory] = useState('');
  const [selectedLineId, setSelectedLineId] = useState('');
  const [materialPicker, setMaterialPicker] = useState<MaterialPickerState | null>(null);
  const [scheduleEditor, setScheduleEditor] = useState<ScheduleTask | null>(null);
  const [documentView, setDocumentView] = useState<'cover' | 'summary' | 'detail'>('detail');
  const [lineGroupBy, setLineGroupBy] = useState<'space' | 'category'>('category');
  const [workGroupBy, setWorkGroupBy] = useState<'space' | 'category'>('category');
  const [editingMaterial, setEditingMaterial] = useState<Material>({});
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const selectedSite = sites.find((site) => site._id === selectedSiteId);
  const selectedSiteEstimates = useMemo(
    () => sortEstimateVersions(estimates.filter((estimate) => estimate.siteId === selectedSiteId)),
    [estimates, selectedSiteId],
  );
  const selectedEstimate = useMemo(
    () => selectedSiteEstimates.find((estimate) => estimate._id === selectedEstimateId),
    [selectedEstimateId, selectedSiteEstimates],
  );
  const totals = useMemo(() => calculateTotals(lines, workLines), [lines, workLines]);
  const sortedLines = useMemo(() => sortEstimateLines(lines, lineGroupBy), [lines, lineGroupBy]);
  const sortedWorkLines = useMemo(() => sortWorkLines(workLines, workGroupBy), [workLines, workGroupBy]);
  const processPool = useMemo(() => buildProcessPool(lines, workLines), [lines, workLines]);
  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth]);
  const holidaySet = useMemo(() => new Set(holidays), [holidays]);
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
    if (!selectedSiteId) return;
    if (selectedEstimateId === NEW_ESTIMATE_ID) return;

    if (selectedSiteEstimates.length === 0) {
      const site = sites.find((item) => item._id === selectedSiteId);
      setSelectedEstimateId(NEW_ESTIMATE_ID);
      setEstimateId('');
      setVersionType('draft');
      setNewVersionType('revision');
      setVersionLabel(defaultVersionLabel('draft', []));
      setMemo('');
      const nextLines = site ? [{ ...emptyLine(), space: '공용', category: site.siteType || '', name: `${site.title || '현장'} 초안` }] : [emptyLine()];
      setLines(nextLines);
      setWorkLines(deriveWorkLines(nextLines));
      setSchedule([emptyTask()]);
      setHolidays([]);
      setSelectedLineId('');
      return;
    }

    if (!selectedEstimateId || !selectedSiteEstimates.some((estimate) => estimate._id === selectedEstimateId)) {
      setSelectedEstimateId(selectedSiteEstimates[0]?._id || '');
    }
  }, [selectedEstimateId, selectedSiteEstimates, selectedSiteId, sites]);

  useEffect(() => {
    if (!selectedSiteId || selectedEstimateId === NEW_ESTIMATE_ID) return;
    const estimate = selectedEstimate;
    const site = sites.find((item) => item._id === selectedSiteId);

    setEstimateId(estimate?._id || '');
    const nextVersionType = normalizeVersionType(estimate?.versionType);
    setVersionType(nextVersionType);
    setVersionLabel(estimate?.versionLabel || defaultVersionLabel(nextVersionType, selectedSiteEstimates));
    setMemo(estimate?.memo || '');
    const nextLines = parseJson<EstimateLine[]>(estimate?.linesJson, [emptyLine()]);
    const nextWorkLines = parseJson<WorkLine[]>(estimate?.workLinesJson, []);
    setLines(nextLines);
    setWorkLines(nextWorkLines.length ? nextWorkLines : deriveWorkLines(nextLines));
    setSchedule(hydrateScheduleTasks(parseJson<Partial<ScheduleTask>[]>(estimate?.scheduleJson, [emptyTask()])));
    setHolidays(parseJson<string[]>(estimate?.holidaysJson, []));
    setSelectedLineId('');

    if (!estimate && site) {
      setVersionType('draft');
      setVersionLabel(defaultVersionLabel('draft', selectedSiteEstimates));
      const nextLinesForSite = [{ ...emptyLine(), space: '공용', category: site.siteType || '', name: `${site.title || '현장'} 초안` }];
      setLines(nextLinesForSite);
      setWorkLines(deriveWorkLines(nextLinesForSite));
      setHolidays([]);
    }
  }, [selectedEstimate, selectedEstimateId, selectedSiteEstimates, selectedSiteId, sites]);

  const authHeaders = (nextPassword = password) => ({ 'x-manager-password': nextPassword });

  const loadData = async (nextPassword = password, preferredSiteId = selectedSiteId, preferredEstimateId = selectedEstimateId) => {
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
      setVendors(data.vendors || []);
      setSelectedSiteId(preferredSiteId || data.sites?.[0]?._id || '');
      if (preferredEstimateId && preferredEstimateId !== NEW_ESTIMATE_ID) {
        setSelectedEstimateId(preferredEstimateId);
      }
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
          versionType,
          versionLabel,
          lines,
          workLines,
          schedule,
          holidays,
          memo,
          createdAt: selectedEstimate?.createdAt,
        }),
      });
      const data = (await response.json()) as EstimateApiData;
      if (!response.ok) throw new Error(data.error || '견적 저장에 실패했습니다.');
      const savedRecord = data.record as SiteEstimate | undefined;
      const savedEstimateId = savedRecord?._id || estimateId;

      if (savedEstimateId) {
        setEstimateId(savedEstimateId);
        setSelectedEstimateId(savedEstimateId);
      }
      setStatus(`${versionLabel || estimateVersionLabel(versionType)} 버전이 저장되었습니다.`);
      await loadData(password, selectedSite._id, savedEstimateId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '견적 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteEstimate = async () => {
    if (!estimateId || selectedEstimateId === NEW_ESTIMATE_ID) {
      setError('삭제할 저장된 버전을 선택해주세요.');
      return;
    }
    if (!window.confirm(`${versionLabel || estimateVersionLabel(versionType)} 버전을 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.`)) return;

    setIsSaving(true);
    setError('');
    setStatus('');

    try {
      const response = await fetch('/api/manager/estimate', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteEstimate', id: estimateId }),
      });
      const data = (await response.json()) as EstimateApiData;
      if (!response.ok) throw new Error(data.error || '견적 버전 삭제에 실패했습니다.');

      setStatus('견적 버전을 삭제했습니다.');
      setEstimateId('');
      setSelectedEstimateId('');
      await loadData(password, selectedSiteId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '견적 버전 삭제 중 오류가 발생했습니다.');
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

  const openMaterialPicker = (line: EstimateLine, step: MaterialPickerState['step'] = 'category') => {
    setSelectedLineId(line.id);
    setMaterialPicker({
      lineId: line.id,
      step,
      category: line.category,
      process: line.process,
      search: '',
    });
  };

  const choosePickerCategory = (category: string) => {
    setMaterialPicker((current) => (current ? { ...current, step: 'process', category, process: '', search: '' } : current));
  };

  const choosePickerProcess = (process: string) => {
    setMaterialPicker((current) => (current ? { ...current, step: 'material', process, search: '' } : current));
  };

  const choosePickerMaterial = (material: Material) => {
    if (!materialPicker) return;
    setLines((current) => current.map((line) => (line.id === materialPicker.lineId ? { ...line, ...materialToLine(material) } : line)));
    setMaterialPicker(null);
    setActiveTab('lines');
  };

  const startNewVersion = (copyCurrent = true) => {
    if (!selectedSite) {
      setError('현장을 먼저 선택해주세요.');
      return;
    }

    const nextLabel = defaultVersionLabel(newVersionType, selectedSiteEstimates);
    setSelectedEstimateId(NEW_ESTIMATE_ID);
    setEstimateId('');
    setVersionType(newVersionType);
    setVersionLabel(nextLabel);
    setMemo(copyCurrent ? memo : '');
    const nextLines =
      copyCurrent && lines.some((line) => line.name || line.category || line.process)
        ? cloneEstimateLines(lines)
        : [{ ...emptyLine(), space: '공용', category: selectedSite.siteType || '', name: `${selectedSite.title || '현장'} ${nextLabel}` }];
    setLines(nextLines);
    setWorkLines(copyCurrent && workLines.some((line) => line.name || line.category || line.process) ? cloneWorkLines(workLines) : deriveWorkLines(nextLines));
    setSchedule(copyCurrent && schedule.some((task) => task.name) ? cloneScheduleTasks(schedule) : [emptyTask()]);
    setHolidays(copyCurrent ? [...holidays] : []);
    setSelectedLineId('');
    setStatus(`${nextLabel} 새 버전을 작성 중입니다. 저장하면 현장별 버전 목록에 추가됩니다.`);
    setActiveTab('lines');
    setIsVersionPanelOpen(false);
  };

  const updateLine = (id: string, updates: Partial<EstimateLine>) => {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...updates } : line)));
  };

  const updateTask = (id: string, updates: Partial<ScheduleTask>) => {
    setSchedule((current) => current.map((task) => (task.id === id ? { ...task, ...updates } : task)));
  };

  const updateWorkLine = (id: string, updates: Partial<WorkLine>) => {
    setWorkLines((current) => current.map((line) => (line.id === id ? { ...line, ...updates } : line)));
  };

  const syncWorkLinesFromEstimate = () => {
    setWorkLines((current) => {
      const existingSourceIds = new Set(current.map((line) => line.sourceLineId).filter(Boolean));
      const additions = lines
        .filter((line) => (line.name || line.category || line.process) && !existingSourceIds.has(line.id))
        .map(estimateLineToWorkLine);
      return additions.length ? [...current, ...additions] : current;
    });
    setStatus('견적 내역의 공종과 품목을 공사 내역서에 반영했습니다.');
  };

  const addScheduleFromProcess = (name: string, date: string) => {
    const cleanName = name.trim();
    if (!cleanName || !date) return;
    setScheduleEditor({
      ...emptyTask(),
      name: cleanName,
      startDate: date,
      endDate: date,
      durationDays: 1,
      color: colorForName(cleanName),
    });
  };

  const handleCalendarDrop = (event: DragEvent<HTMLDivElement>, date: string) => {
    event.preventDefault();
    const processName = event.dataTransfer.getData('text/plain');
    addScheduleFromProcess(processName, date);
  };

  const saveScheduleEditor = () => {
    if (!scheduleEditor?.name.trim()) {
      setError('공정명을 입력해주세요.');
      return;
    }
    const startDate = scheduleEditor.startDate || todayKey();
    const durationDays = Math.max(1, Math.round(Number(scheduleEditor.durationDays || 1)));
    const rawEndDate = addDays(startDate, durationDays - 1);
    const nextTask = {
      ...scheduleEditor,
      name: scheduleEditor.name.trim(),
      startDate,
      endDate: rawEndDate,
      durationDays,
      color: normalizeColor(scheduleEditor.color),
    };
    setSchedule((current) => {
      const exists = current.some((task) => task.id === nextTask.id);
      return exists ? current.map((task) => (task.id === nextTask.id ? nextTask : task)) : [...current, nextTask];
    });
    setScheduleEditor(null);
    setError('');
  };

  const deleteScheduleTask = (id: string) => {
    setSchedule((current) => current.filter((task) => task.id !== id));
    setScheduleEditor((current) => (current?.id === id ? null : current));
  };

  const addHoliday = () => {
    if (!holidayDate) return;
    setHolidays((current) => Array.from(new Set([...current, holidayDate])).sort());
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
      <header className="no-print sticky top-0 z-20 border-b border-[#d5dde2] bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1680px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => (window.location.href = '/manager-weve-7519')} className="inline-flex items-center gap-2 text-sm font-semibold text-[#60717d] hover:text-[#171512]">
              <ArrowLeft size={16} />
              관리자 현장 목록으로
            </button>
            <div className="h-8 w-px bg-[#d5dde2]" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#38a9bd]">WEVE ESTIMATE</p>
              <h1 className="text-xl font-semibold tracking-normal md:text-2xl">현장별 견적 작업</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedSiteId}
              onChange={(event) => {
                setSelectedSiteId(event.target.value);
                setSelectedEstimateId('');
              }}
              className="min-w-72 rounded-md border border-[#d5dde2] bg-white px-4 py-2.5 font-semibold outline-none focus:border-[#38a9bd]"
            >
              {sites.map((site) => (
                <option key={site._id} value={site._id}>
                  {site.title || '현장명 없음'} · {site.customerName || '고객명 없음'}
                </option>
              ))}
            </select>
            <button type="button" onClick={saveEstimate} disabled={isSaving} className="inline-flex items-center gap-2 rounded-md bg-[#f1c76a] px-5 py-2.5 font-semibold disabled:opacity-60">
              <Save size={17} />
              저장
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1680px] gap-4 px-4 py-4">
        {(status || error) && (
          <div className={`no-print rounded-lg border p-4 text-sm font-semibold ${error ? 'border-red-200 bg-red-50 text-red-600' : 'border-[#cde8d6] bg-[#f0fbf4] text-[#2f7d45]'}`}>
            {error || status}
          </div>
        )}

        <section className="rounded-lg border border-[#d5dde2] bg-white p-3 shadow-sm">
          <div className="grid gap-3 2xl:grid-cols-[minmax(280px,1.35fr)_minmax(260px,0.85fr)_repeat(4,minmax(132px,0.45fr))]">
            <div className="rounded-md bg-[#f7fafb] px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#38a9bd]">SITE</p>
              <h2 className="mt-1 truncate text-xl font-semibold">{selectedSite?.title || '현장을 선택해주세요'}</h2>
              <p className="mt-1 truncate text-sm text-[#60717d]">
                {[selectedSite?.customerName, selectedSite?.customerPhone, selectedSite?.address].filter(Boolean).join(' · ') || '현장 정보가 없습니다.'}
              </p>
            </div>
            <div className="grid gap-2 rounded-md bg-[#f7fafb] p-3">
              <div className="grid grid-cols-[116px_minmax(0,1fr)] gap-2">
                <select
                  value={versionType}
                  onChange={(event) => setVersionType(event.target.value as EstimateVersionType)}
                  aria-label="견적 버전 구분"
                  className="min-w-0 rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-[#38a9bd]"
                >
                  {estimateVersionTypes.map((type) => (
                    <option key={type.key} value={type.key}>
                      {type.label}
                    </option>
                  ))}
                </select>
                <input value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} aria-label="견적 버전명" className="min-w-0 rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-[#38a9bd]" />
              </div>
              <input value={memo} onChange={(event) => setMemo(event.target.value)} aria-label="현장 메모" placeholder="현장 메모" className="min-w-0 rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm outline-none focus:border-[#38a9bd]" />
            </div>
            <CompactMetric title="견적 금액" value={formatMoney(totals.customerEstimateTotal)} />
            <CompactMetric title="실행 원가" value={formatMoney(totals.executionCostTotal)} />
            <CompactMetric title="예상 마진" value={formatMoney(totals.marginAmount)} tone={totals.marginAmount >= 0 ? 'positive' : 'negative'} sub={`${totals.marginRate.toFixed(1)}%`} />
            <CompactMetric title="내역 수" value={`${lines.filter((line) => line.name).length}개`} />
          </div>
          <div className="mt-3 grid gap-3 border-t border-[#edf2f5] pt-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
            <div className="grid gap-2 md:grid-cols-[minmax(220px,360px)_minmax(0,1fr)] md:items-center">
              <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.12em] text-[#60717d]">
                현재 버전
                <select
                  value={selectedEstimateId || NEW_ESTIMATE_ID}
                  onChange={(event) => setSelectedEstimateId(event.target.value)}
                  className="rounded-md border border-[#d5dde2] bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#171512] outline-none focus:border-[#38a9bd]"
                >
                  {selectedSiteEstimates.length === 0 && <option value={NEW_ESTIMATE_ID}>저장 전 새 초안</option>}
                  {selectedEstimateId === NEW_ESTIMATE_ID && selectedSiteEstimates.length > 0 && (
                    <option value={NEW_ESTIMATE_ID}>저장 전 {estimateVersionLabel(versionType)}</option>
                  )}
                  {selectedSiteEstimates.map((estimate) => (
                    <option key={estimate._id} value={estimate._id}>
                      {estimateVersionLabel(normalizeVersionType(estimate.versionType))} · {estimate.versionLabel || '버전명 없음'} · {formatShortDate(estimate.updatedAt || estimate.createdAt)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rounded-md border border-[#edf2f5] bg-[#f7fafb] px-3 py-2 text-sm text-[#4d5d66]">
                <b className="text-[#171512]">{versionLabel || estimateVersionLabel(versionType)}</b>
                <span className="mx-2 text-[#a9b4bb]">|</span>
                {selectedEstimateId === NEW_ESTIMATE_ID ? '저장 전 새 버전입니다.' : `최근 수정 ${formatShortDate(selectedEstimate?.updatedAt || selectedEstimate?.createdAt)}`}
              </div>
            </div>
            <div className="grid gap-2">
              <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                <button type="button" onClick={() => setIsVersionPanelOpen((current) => !current)} className="inline-flex items-center gap-2 rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white">
                  <Plus size={16} />
                  버전 추가
                </button>
                {estimateId && selectedEstimateId !== NEW_ESTIMATE_ID && (
                  <button type="button" onClick={deleteEstimate} disabled={isSaving} className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-60">
                    <Trash2 size={16} />
                    버전 삭제
                  </button>
                )}
              </div>
              {isVersionPanelOpen && (
                <div className="grid gap-2 rounded-md border border-[#d5dde2] bg-[#fffdf8] p-3 md:grid-cols-[140px_auto_auto]">
                  <select
                    value={newVersionType}
                    onChange={(event) => setNewVersionType(event.target.value as EstimateVersionType)}
                    aria-label="새 견적 버전 구분"
                    className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-[#38a9bd]"
                  >
                    {estimateVersionTypes.map((type) => (
                      <option key={type.key} value={type.key}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => startNewVersion(true)} className="inline-flex items-center justify-center gap-2 rounded-md bg-[#f1c76a] px-4 py-2 text-sm font-semibold">
                    <Copy size={16} />
                    현재 버전 복사
                  </button>
                  <button type="button" onClick={() => startNewVersion(false)} className="rounded-md border border-[#d5dde2] bg-white px-4 py-2 text-sm font-semibold">
                    빈 버전으로 시작
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        <nav className="no-print flex gap-2 overflow-x-auto rounded-lg border border-[#d5dde2] bg-white p-2 shadow-sm">
          {[
            { key: 'lines' as const, label: '견적 내역', Icon: FileSpreadsheet },
            { key: 'work' as const, label: '공사 내역서', Icon: ClipboardList },
            { key: 'materials' as const, label: '자재 단가', Icon: Search },
            { key: 'schedule' as const, label: '공정 일정', Icon: CalendarDays },
            { key: 'documents' as const, label: '서류 출력', Icon: Printer },
          ].map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold ${activeTab === key ? 'bg-[#171512] text-white' : 'bg-[#f7fafb] text-[#4d5d66] hover:bg-[#edf2f5]'}`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>

        <datalist id="estimate-categories">
          {materialCategories.map((category) => <option key={category} value={category} />)}
        </datalist>
        <datalist id="estimate-processes">
          {materialProcesses.map((process) => <option key={process} value={process} />)}
        </datalist>
        <datalist id="estimate-material-names">
          {materialNames.map((name) => <option key={name} value={name} />)}
        </datalist>

        {activeTab === 'lines' && (
          <section className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
            <aside className="rounded-lg border border-[#d5dde2] bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#38a9bd]">GLOBAL DB</p>
                  <h2 className="mt-1 text-lg font-semibold">자재 단가 DB</h2>
                  <p className="mt-1 text-xs leading-5 text-[#60717d]">검색 후 선택한 견적 행에 바로 적용합니다.</p>
                </div>
                <span className="rounded-full bg-[#edf8fb] px-3 py-1 text-xs font-bold text-[#267d8c]">{materials.length}개</span>
              </div>

              <div className="mt-4 grid gap-2">
                <select value={lineDbCategory} onChange={(event) => setLineDbCategory(event.target.value)} className="rounded-md border border-[#d5dde2] px-3 py-2.5 text-sm outline-none focus:border-[#38a9bd]">
                  <option value="">전체 카테고리</option>
                  {materialCategories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
                <input value={lineDbSearch} onChange={(event) => setLineDbSearch(event.target.value)} placeholder="공정, 품명, 규격 검색" className="rounded-md border border-[#d5dde2] px-4 py-2.5 text-sm outline-none focus:border-[#38a9bd]" />
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

              <div className="mt-4 max-h-[calc(100vh-380px)] min-h-[360px] overflow-y-auto pr-1">
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

            <section className="min-w-0 rounded-lg border border-[#d5dde2] bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">견적 내역</h2>
                  <p className="mt-1 text-sm text-[#60717d]">
                    분류·공종·품명을 누르면 단계별 선택창이 열리고, DB의 단가 정보가 자동 입력됩니다.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={lineGroupBy}
                    onChange={(event) => setLineGroupBy(event.target.value as typeof lineGroupBy)}
                    aria-label="견적 내역 정렬 기준"
                    className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-[#38a9bd]"
                  >
                    <option value="category">분류별 정렬</option>
                    <option value="space">공간별 정렬</option>
                  </select>
                  <button type="button" onClick={() => setLines((current) => [...current, emptyLine()])} className="inline-flex items-center gap-2 rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white">
                    <Plus size={16} />
                    항목 추가
                  </button>
                </div>
              </div>

              <div className="max-h-[calc(100vh-340px)] min-h-[430px] overflow-auto rounded-lg border border-[#edf2f5]">
                <table className="w-full min-w-[1320px] border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-[#f7fafb] text-left text-xs uppercase tracking-[0.08em] text-[#60717d]">
                    <tr>
                      {['선택', '공간', '분류', '공종', '품명', '규격', '단위', '수량', '견적단가', '실행단가', '견적금액', '원가', '마진', '비고', '삭제'].map((header) => (
                        <th key={header} className="border-b border-[#d5dde2] px-3 py-3">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLines.map((line, index) => {
                      const margin = line.quantity * line.customerUnitPrice - line.quantity * line.executionUnitPrice;
                      const currentGroup = lineGroupKey(line, lineGroupBy);
                      const previousGroup = index > 0 ? lineGroupKey(sortedLines[index - 1], lineGroupBy) : '';
                      return (
                        <Fragment key={line.id}>
                          {currentGroup !== previousGroup && (
                            <tr>
                              <td colSpan={15} className="border-y border-[#e7d8bd] bg-[#fff8e8] px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[#8b6420]">
                                {lineGroupBy === 'space' ? '공간' : '분류'} · {currentGroup}
                              </td>
                            </tr>
                          )}
                          <tr className={`border-b border-[#edf2f5] ${selectedLineId === line.id ? 'bg-[#fff9e8]' : ''}`}>
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
                          <td className="px-2 py-2">
                            <PickerCell value={line.category} placeholder="분류 선택" onClick={() => openMaterialPicker(line, 'category')} />
                          </td>
                          <td className="px-2 py-2">
                            <PickerCell value={line.process} placeholder="공종 선택" onClick={() => openMaterialPicker(line, line.category ? 'process' : 'category')} />
                          </td>
                          <td className="px-2 py-2">
                            <PickerCell value={line.name} placeholder="품명 선택" onClick={() => openMaterialPicker(line, line.category && line.process ? 'material' : line.category ? 'process' : 'category')} />
                          </td>
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
                            <button type="button" onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-2 text-red-600" aria-label="견적 항목 삭제">
                              <Trash2 size={15} />
                              <span className="text-xs font-semibold">삭제</span>
                            </button>
                          </td>
                        </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        )}

        {activeTab === 'work' && (
          <section className="rounded-lg border border-[#d5dde2] bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">공사 내역서</h2>
                <p className="mt-1 text-sm leading-6 text-[#60717d]">
                  실제 실행 원가를 관리하는 내역입니다. 이 합계가 예상 마진 계산에 반영됩니다.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={workGroupBy}
                  onChange={(event) => setWorkGroupBy(event.target.value as typeof workGroupBy)}
                  aria-label="공사 내역서 정렬 기준"
                  className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-[#38a9bd]"
                >
                  <option value="category">분류별 정렬</option>
                  <option value="space">공간별 정렬</option>
                </select>
                <button type="button" onClick={syncWorkLinesFromEstimate} className="inline-flex items-center gap-2 rounded-md border border-[#d5dde2] bg-white px-4 py-2 text-sm font-semibold">
                  <Copy size={16} />
                  견적에서 불러오기
                </button>
                <button type="button" onClick={() => setWorkLines((current) => [...current, emptyWorkLine()])} className="inline-flex items-center gap-2 rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white">
                  <Plus size={16} />
                  공사 항목 추가
                </button>
              </div>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <CompactMetric title="공사 실행 원가" value={formatMoney(totals.executionCostTotal)} />
              <CompactMetric title="견적 대비 마진" value={formatMoney(totals.marginAmount)} tone={totals.marginAmount >= 0 ? 'positive' : 'negative'} sub={`${totals.marginRate.toFixed(1)}%`} />
              <CompactMetric title="공사 항목" value={`${workLines.filter((line) => line.name).length}개`} />
            </div>

            <div className="grid gap-3">
              {sortedWorkLines.map((line, index) => {
                const amount = Number(line.quantity || 0) * Number(line.executionUnitPrice || 0);
                const currentGroup = workLineGroupKey(line, workGroupBy);
                const previousGroup = index > 0 ? workLineGroupKey(sortedWorkLines[index - 1], workGroupBy) : '';
                return (
                  <Fragment key={line.id}>
                    {currentGroup !== previousGroup && (
                      <div className="mt-2 rounded-md border border-[#e7d8bd] bg-[#fff8e8] px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[#8b6420]">
                        {workGroupBy === 'space' ? '공간' : '분류'} · {currentGroup}
                      </div>
                    )}
                    <article className="rounded-lg border border-[#d5dde2] bg-[#fdfdfb] p-3">
                      <div className="grid gap-2 2xl:grid-cols-[0.75fr_0.9fr_0.9fr_1.2fr_0.9fr_0.45fr_0.45fr_0.75fr_0.8fr_0.65fr_0.9fr_auto]">
                        <FieldShell label="공간">
                          <CellSelect value={line.space} options={defaultSpaces} onChange={(value) => updateWorkLine(line.id, { space: value })} />
                        </FieldShell>
                        <FieldShell label="분류">
                          <CellInput value={line.category} listId="estimate-categories" onChange={(value) => updateWorkLine(line.id, { category: value })} />
                        </FieldShell>
                        <FieldShell label="공종">
                          <CellInput value={line.process} listId="estimate-processes" onChange={(value) => updateWorkLine(line.id, { process: value })} />
                        </FieldShell>
                        <FieldShell label="품명">
                          <CellInput value={line.name} listId="estimate-material-names" onChange={(value) => updateWorkLine(line.id, { name: value })} />
                        </FieldShell>
                        <FieldShell label="규격">
                          <CellInput value={line.spec} onChange={(value) => updateWorkLine(line.id, { spec: value })} />
                        </FieldShell>
                        <FieldShell label="수량">
                          <CellNumber value={line.quantity} onChange={(value) => updateWorkLine(line.id, { quantity: value })} />
                        </FieldShell>
                        <FieldShell label="단위">
                          <CellInput value={line.unit} onChange={(value) => updateWorkLine(line.id, { unit: value })} />
                        </FieldShell>
                        <FieldShell label="실행단가">
                          <CellNumber value={line.executionUnitPrice} onChange={(value) => updateWorkLine(line.id, { executionUnitPrice: value })} />
                        </FieldShell>
                        <FieldShell label="협력업체">
                          <CellInput value={line.vendor} onChange={(value) => updateWorkLine(line.id, { vendor: value })} />
                        </FieldShell>
                        <FieldShell label="상태">
                          <CellSelect value={line.status} options={workStatuses} onChange={(value) => updateWorkLine(line.id, { status: value })} />
                        </FieldShell>
                        <FieldShell label="메모">
                          <CellInput value={line.note} onChange={(value) => updateWorkLine(line.id, { note: value })} />
                        </FieldShell>
                        <div className="grid grid-cols-[1fr_auto] items-end gap-2 2xl:grid-cols-1">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#60717d]">금액</p>
                            <p className="mt-2 whitespace-nowrap text-sm font-semibold">{formatMoney(amount)}</p>
                          </div>
                          <button type="button" onClick={() => setWorkLines((current) => current.filter((item) => item.id !== line.id))} className="inline-flex h-10 items-center justify-center gap-1 rounded-md border border-red-200 px-2 text-red-600" aria-label="공사 항목 삭제">
                            <Trash2 size={16} />
                            <span className="text-xs font-semibold">삭제</span>
                          </button>
                        </div>
                      </div>
                    </article>
                  </Fragment>
                );
              })}
            </div>
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
                  <NumberTextInput value={Number(editingMaterial.unitPrice || 0)} onChange={(value) => setEditingMaterial({ ...editingMaterial, unitPrice: value })} />
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
          <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="rounded-lg border border-[#d5dde2] bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">공정 작업</h2>
                  <p className="mt-1 text-sm leading-6 text-[#60717d]">견적/공사내역의 공종을 날짜에 끌어 놓아 일정을 만듭니다.</p>
                </div>
                <span className="rounded-full bg-[#edf8fb] px-3 py-1 text-xs font-bold text-[#267d8c]">{processPool.length}개</span>
              </div>
              <div className="mt-4 grid gap-2">
                {processPool.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[#d5dde2] bg-[#f7fafb] p-5 text-sm text-[#60717d]">
                    견적 내역 또는 공사 내역서에 공종을 입력하면 이곳에 자동으로 표시됩니다.
                  </div>
                ) : (
                  processPool.map((process) => (
                    <button
                      key={process.name}
                      type="button"
                      draggable
                      onDragStart={(event) => event.dataTransfer.setData('text/plain', process.name)}
                      onClick={() => addScheduleFromProcess(process.name, todayKey())}
                      className="rounded-lg border border-[#d5dde2] bg-[#fdfdfb] px-4 py-3 text-left transition hover:border-[#c6a25d] hover:bg-[#fff8e8]"
                    >
                      <span className="block text-sm font-semibold">{process.name}</span>
                      <span className="mt-1 block text-xs text-[#60717d]">{process.meta || '공종 정보'}</span>
                    </button>
                  ))
                )}
              </div>
              <button type="button" onClick={() => setScheduleEditor({ ...emptyTask(), startDate: todayKey(), endDate: todayKey() })} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#171512] px-4 py-3 text-sm font-semibold text-white">
                <Plus size={16} />
                빈 일정 추가
              </button>
              <div className="mt-4 rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-3">
                <p className="text-sm font-semibold">휴일 지정</p>
                <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                  <input type="date" value={holidayDate} onChange={(event) => setHolidayDate(event.target.value)} className="rounded-md border border-[#d5dde2] px-3 py-2 text-sm" />
                  <button type="button" onClick={addHoliday} className="rounded-md bg-[#f1c76a] px-3 py-2 text-sm font-semibold">추가</button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {holidays.length === 0 ? (
                    <span className="text-xs text-[#60717d]">지정된 휴일 없음</span>
                  ) : (
                    holidays.map((date) => (
                      <button
                        key={date}
                        type="button"
                        onClick={() => setHolidays((current) => current.filter((item) => item !== date))}
                        className="inline-flex items-center gap-1 rounded-full border border-[#ead9b9] bg-white px-2 py-1 text-xs font-semibold text-[#8b6420]"
                      >
                        {date}
                        <X size={12} />
                      </button>
                    ))
                  )}
                </div>
              </div>
            </aside>

            <section className="min-w-0 rounded-lg border border-[#d5dde2] bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">공정 달력</h2>
                  <p className="mt-1 text-sm text-[#60717d]">날짜 칸에 공종을 드래그하면 해당 날짜 일정으로 등록됩니다.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setCalendarMonth(shiftMonth(calendarMonth, -1))} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#d5dde2] bg-white">
                    <ChevronLeft size={18} />
                  </button>
                  <div className="min-w-32 rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-2 text-center text-sm font-semibold">
                    {formatMonthLabel(calendarMonth)}
                  </div>
                  <button type="button" onClick={() => setCalendarMonth(shiftMonth(calendarMonth, 1))} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#d5dde2] bg-white">
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-[#edf2f5]">
                <div className="grid min-w-[980px] grid-cols-7 bg-[#f7fafb] text-center text-xs font-bold uppercase tracking-[0.12em] text-[#60717d]">
                  {['월', '화', '수', '목', '금', '토', '일'].map((day) => (
                    <div key={day} className="border-b border-r border-[#edf2f5] px-2 py-3 last:border-r-0">{day}</div>
                  ))}
                </div>
                <div className="grid min-w-[980px] grid-cols-7">
                  {calendarDays.map((day) => {
                    const dayTasks = tasksForDate(schedule, day.date, holidaySet);
                    const isHoliday = holidaySet.has(day.date);
                    return (
                      <div
                        key={day.key}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => handleCalendarDrop(event, day.date)}
                        className={`min-h-36 border-b border-r border-[#edf2f5] p-2 last:border-r-0 ${day.isCurrentMonth ? 'bg-white' : 'bg-[#f7fafb] text-[#a9b4bb]'} ${isHoliday ? 'bg-[linear-gradient(135deg,#fff7f7_0,#fff7f7_50%,#fff_50%,#fff_100%)]' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-bold ${day.date === todayKey() ? 'rounded-full bg-[#171512] px-2 py-1 text-white' : ''}`}>{day.day}</span>
                          {isHoliday && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">휴일</span>}
                          <button
                            type="button"
                            onClick={() => setScheduleEditor({ ...emptyTask(), startDate: day.date, endDate: day.date })}
                            className="text-xs text-[#87949c]"
                          >
                            +
                          </button>
                        </div>
                        <div className="mt-2 grid gap-1">
                          {dayTasks.map((task) => {
                            const adjustedEndDate = adjustedTaskEndDate(task, holidaySet);
                            const isStart = day.date === task.startDate;
                            const isEnd = day.date === adjustedEndDate;
                            return (
                              <div
                                key={task.id}
                                onDoubleClick={() => setScheduleEditor(task)}
                                className={`group relative flex min-h-7 cursor-pointer items-center gap-1 px-2 py-1 text-left text-xs font-semibold text-[#171512] shadow-sm ${
                                  isStart ? 'rounded-l-full' : '-ml-2'
                                } ${isEnd ? 'rounded-r-full' : '-mr-2'} ${!isStart && !isEnd ? 'rounded-none' : ''}`}
                                style={{ backgroundColor: softenColor(task.color || '#f1c76a') }}
                                title={`${task.name} · ${task.startDate}~${adjustedEndDate}`}
                              >
                                {isStart && <span className="truncate">{task.name || '공정명 없음'}</span>}
                                {isHoliday && <span className="text-[10px] text-red-600">연장</span>}
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    deleteScheduleTask(task.id);
                                  }}
                                  className="ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/80 text-red-600"
                                  aria-label="공정 삭제"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-base font-semibold">일정 상세</h3>
                  <span className="text-xs font-semibold text-[#60717d]">{schedule.filter((task) => task.name).length}개 일정</span>
                </div>
                <div className="grid gap-3">
                  {schedule.map((task) => (
                    <div key={task.id} className="grid gap-2 rounded-lg border border-[#d5dde2] p-4 md:grid-cols-[1.2fr_0.75fr_0.75fr_0.45fr_1.1fr_auto] md:items-center">
                      <button type="button" onDoubleClick={() => setScheduleEditor(task)} onClick={() => setScheduleEditor(task)} className="rounded-md border border-[#d5dde2] px-3 py-2 text-left font-semibold">
                        <span className="mr-2 inline-block h-3 w-3 rounded-full" style={{ backgroundColor: task.color || '#f1c76a' }} />
                        {task.name || '공정명 없음'}
                      </button>
                      <div className="rounded-md border border-[#d5dde2] px-3 py-2 text-sm">{task.startDate || '-'}</div>
                      <div className="rounded-md border border-[#d5dde2] px-3 py-2 text-sm">{adjustedTaskEndDate(task, holidaySet) || '-'}</div>
                      <div className="rounded-md border border-[#d5dde2] px-3 py-2 text-sm">{formatNumber(task.durationDays || 1)}일</div>
                      <div className="rounded-md border border-[#d5dde2] px-3 py-2 text-sm">{task.vendorName || '담당자 미지정'}</div>
                      <button type="button" onClick={() => deleteScheduleTask(task.id)} className="rounded-md border border-red-200 p-2 text-red-600">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>
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

      {materialPicker && (
        <MaterialPickerModal
          state={materialPicker}
          materials={materials}
          onChange={setMaterialPicker}
          onChooseCategory={choosePickerCategory}
          onChooseProcess={choosePickerProcess}
          onChooseMaterial={choosePickerMaterial}
          onClose={() => setMaterialPicker(null)}
        />
      )}

      {scheduleEditor && (
        <ScheduleEditorModal
          task={scheduleEditor}
          vendors={vendors}
          holidaySet={holidaySet}
          onChange={setScheduleEditor}
          onSave={saveScheduleEditor}
          onDelete={() => deleteScheduleTask(scheduleEditor.id)}
          onClose={() => setScheduleEditor(null)}
        />
      )}
    </main>
  );
}

function CompactMetric({ title, value, sub, tone = 'default' }: { title: string; value: string; sub?: string; tone?: 'default' | 'positive' | 'negative' }) {
  const toneClass = tone === 'positive' ? 'text-[#217346]' : tone === 'negative' ? 'text-red-600' : 'text-[#171512]';
  return (
    <section className="rounded-md border border-[#d5dde2] bg-white px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#60717d]">{title}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className={`truncate text-2xl font-semibold ${toneClass}`}>{value}</p>
        {sub && <p className="pb-1 text-xs font-semibold text-[#60717d]">{sub}</p>}
      </div>
    </section>
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

function PickerCell({ value, placeholder, onClick }: { value: string; placeholder: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full min-w-32 rounded-md border px-3 py-2 text-left text-sm outline-none transition hover:border-[#38a9bd] hover:bg-[#edf8fb] ${
        value ? 'border-[#d5dde2] bg-white text-[#171512]' : 'border-dashed border-[#c7d4dc] bg-[#f7fafb] text-[#60717d]'
      }`}
    >
      <span className="block truncate">{value || placeholder}</span>
    </button>
  );
}

function MaterialPickerModal({
  state,
  materials,
  onChange,
  onChooseCategory,
  onChooseProcess,
  onChooseMaterial,
  onClose,
}: {
  state: MaterialPickerState;
  materials: Material[];
  onChange: (state: MaterialPickerState | null) => void;
  onChooseCategory: (category: string) => void;
  onChooseProcess: (process: string) => void;
  onChooseMaterial: (material: Material) => void;
  onClose: () => void;
}) {
  const keyword = state.search.trim().toLowerCase();
  const categoryGroups = countBy(materials, (item) => item.category || '미분류')
    .filter((item) => !keyword || item.label.toLowerCase().includes(keyword))
    .sort((a, b) => a.label.localeCompare(b.label, 'ko-KR'));
  const processSource = materials.filter((item) => (item.category || '미분류') === state.category);
  const processGroups = countBy(processSource, (item) => item.process || item.category || '기타 공정')
    .filter((item) => !keyword || item.label.toLowerCase().includes(keyword))
    .sort((a, b) => a.label.localeCompare(b.label, 'ko-KR'));
  const materialResults = materials
    .filter((item) => {
      const category = item.category || '미분류';
      const process = item.process || item.category || '기타 공정';
      const haystack = [item.category, item.process, item.name, item.spec, item.unit, item.note].join(' ').toLowerCase();
      return category === state.category && process === state.process && (!keyword || haystack.includes(keyword));
    })
    .slice(0, 160);

  const stepLabel = state.step === 'category' ? '분류 선택' : state.step === 'process' ? '공종 선택' : '품명 선택';

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#171512]/45 px-4 py-6 backdrop-blur-sm">
      <section className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[#d5dde2] bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-[#edf2f5] p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#38a9bd]">MATERIAL DB</p>
            <h2 className="mt-1 text-2xl font-semibold">{stepLabel}</h2>
            <p className="mt-1 text-sm text-[#60717d]">분류를 고르면 공종으로, 공종을 고르면 해당 품명 목록으로 자동 이동합니다.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-[#d5dde2] p-2 text-[#60717d] hover:bg-[#f7fafb]">
            <X size={18} />
          </button>
        </header>

        <div className="grid gap-4 border-b border-[#edf2f5] p-4 lg:grid-cols-[1fr_280px]">
          <div className="flex flex-wrap gap-2">
            <StepButton label="1 분류" active={state.step === 'category'} enabled onClick={() => onChange({ ...state, step: 'category', search: '' })} />
            <StepButton label="2 공종" active={state.step === 'process'} enabled={Boolean(state.category)} onClick={() => state.category && onChange({ ...state, step: 'process', search: '' })} />
            <StepButton label="3 품명" active={state.step === 'material'} enabled={Boolean(state.category && state.process)} onClick={() => state.category && state.process && onChange({ ...state, step: 'material', search: '' })} />
          </div>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#60717d]" size={16} />
            <input
              value={state.search}
              onChange={(event) => onChange({ ...state, search: event.target.value })}
              placeholder={`${stepLabel} 검색`}
              className="w-full rounded-md border border-[#d5dde2] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#38a9bd]"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {state.step === 'category' && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categoryGroups.map((group) => (
                <button key={group.label} type="button" onClick={() => onChooseCategory(group.label)} className="rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#38a9bd] hover:shadow-md">
                  <span className="block text-lg font-semibold">{group.label}</span>
                  <span className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#60717d]">{group.count}개 품목</span>
                </button>
              ))}
            </div>
          )}

          {state.step === 'process' && (
            <div>
              <div className="mb-4 rounded-lg bg-[#f7fafb] px-4 py-3 text-sm text-[#60717d]">
                선택 분류 <b className="text-[#171512]">{state.category}</b>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {processGroups.map((group) => (
                  <button key={group.label} type="button" onClick={() => onChooseProcess(group.label)} className="rounded-lg border border-[#d5dde2] bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-[#38a9bd] hover:shadow-md">
                    <span className="block text-lg font-semibold">{group.label}</span>
                    <span className="mt-2 inline-flex rounded-full bg-[#edf8fb] px-2.5 py-1 text-xs font-bold text-[#267d8c]">{group.count}개 품목</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {state.step === 'material' && (
            <div>
              <div className="mb-4 flex flex-wrap gap-2 rounded-lg bg-[#f7fafb] px-4 py-3 text-sm text-[#60717d]">
                <span>분류 <b className="text-[#171512]">{state.category}</b></span>
                <span>·</span>
                <span>공종 <b className="text-[#171512]">{state.process}</b></span>
              </div>
              <div className="grid gap-2">
                {materialResults.map((material) => (
                  <button
                    key={material._id || `${material.category}-${material.process}-${material.name}-${material.spec}`}
                    type="button"
                    onClick={() => onChooseMaterial(material)}
                    className="grid gap-2 rounded-lg border border-[#d5dde2] bg-white p-4 text-left transition hover:border-[#38a9bd] hover:bg-[#edf8fb] md:grid-cols-[1.2fr_1fr_90px_130px]"
                  >
                    <span>
                      <b className="block truncate">{material.name || '품명 없음'}</b>
                      <small className="mt-1 block text-[#60717d]">{material.note || material.sourceSheet || ''}</small>
                    </span>
                    <span className="text-sm text-[#4d5d66]">{material.spec || '규격 없음'}</span>
                    <span className="text-sm text-[#4d5d66]">{material.unit || '-'}</span>
                    <span className="font-semibold md:text-right">{formatMoney(Number(material.unitPrice || 0))}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {((state.step === 'category' && categoryGroups.length === 0) || (state.step === 'process' && processGroups.length === 0) || (state.step === 'material' && materialResults.length === 0)) && (
            <div className="rounded-lg border border-dashed border-[#d5dde2] bg-[#f7fafb] p-10 text-center text-sm text-[#60717d]">
              검색 결과가 없습니다. 자재 단가 DB에 해당 항목이 있는지 확인해주세요.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ScheduleEditorModal({
  task,
  vendors,
  holidaySet,
  onChange,
  onSave,
  onDelete,
  onClose,
}: {
  task: ScheduleTask;
  vendors: Vendor[];
  holidaySet: Set<string>;
  onChange: (task: ScheduleTask) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const durationDays = Math.max(1, Math.round(Number(task.durationDays || 1)));
  const startDate = task.startDate || todayKey();
  const rawEndDate = addDays(startDate, durationDays - 1);
  const adjustedEndDate = adjustedTaskEndDate({ ...task, startDate, endDate: rawEndDate, durationDays }, holidaySet);
  const holidayExtension = Math.max(0, daysBetween(rawEndDate, adjustedEndDate));

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#171512]/45 px-4 py-6 backdrop-blur-sm">
      <section className="w-full max-w-2xl rounded-xl border border-[#d5dde2] bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-[#edf2f5] p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#38a9bd]">SCHEDULE</p>
            <h2 className="mt-1 text-2xl font-semibold">공정 일정 수정</h2>
            <p className="mt-1 text-sm text-[#60717d]">기간, 담당 작업자, 색상을 지정하면 달력에 바로 반영됩니다.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-[#d5dde2] p-2 text-[#60717d] hover:bg-[#f7fafb]">
            <X size={18} />
          </button>
        </header>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <label className="grid gap-1 md:col-span-2">
            <span className="text-sm font-semibold">공정명</span>
            <input value={task.name} onChange={(event) => onChange({ ...task, name: event.target.value })} className="rounded-md border border-[#d5dde2] px-3 py-2.5 outline-none focus:border-[#38a9bd]" />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">시작일</span>
            <input value={startDate} type="date" onChange={(event) => onChange({ ...task, startDate: event.target.value })} className="rounded-md border border-[#d5dde2] px-3 py-2.5 outline-none focus:border-[#38a9bd]" />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">진행 기간</span>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <NumberTextInput value={durationDays} onChange={(value) => onChange({ ...task, durationDays: Math.max(1, Math.round(value || 1)) })} />
              <span className="rounded-md border border-[#d5dde2] bg-[#f7fafb] px-3 py-2.5 text-sm font-semibold">일</span>
            </div>
          </label>
          <div className="rounded-md border border-[#e7d8bd] bg-[#fffdf8] p-3 md:col-span-2">
            <p className="text-sm font-semibold">표시 종료일 {adjustedEndDate}</p>
            <p className="mt-1 text-xs leading-5 text-[#60717d]">
              기본 종료일은 {rawEndDate}입니다. {holidayExtension > 0 ? `휴일 ${formatNumber(holidayExtension)}일이 포함되어 자동 연장됩니다.` : '지정 휴일과 겹치지 않습니다.'}
            </p>
          </div>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">색상</span>
            <input value={task.color || '#f1c76a'} type="color" onChange={(event) => onChange({ ...task, color: event.target.value })} className="h-11 rounded-md border border-[#d5dde2] bg-white px-2 py-1" />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">진행률</span>
            <NumberTextInput value={task.progress} onChange={(value) => onChange({ ...task, progress: Math.max(0, Math.min(100, value)) })} />
          </label>
          <label className="grid gap-1 md:col-span-2">
            <span className="text-sm font-semibold">담당 작업자</span>
            <select
              value={task.vendorId}
              onChange={(event) => {
                const vendor = vendors.find((item) => item._id === event.target.value);
                onChange({
                  ...task,
                  vendorId: vendor?._id || '',
                  vendorName: vendor ? [vendor.name, vendor.manager].filter(Boolean).join(' · ') : '',
                  vendorPhone: vendor?.phone || '',
                });
              }}
              className="rounded-md border border-[#d5dde2] px-3 py-2.5 outline-none focus:border-[#38a9bd]"
            >
              <option value="">담당자 미지정</option>
              {vendors.map((vendor) => (
                <option key={vendor._id || vendor.name} value={vendor._id || ''}>
                  {[vendor.name, vendor.manager, vendor.service, vendor.phone].filter(Boolean).join(' · ')}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 md:col-span-2">
            <span className="text-sm font-semibold">메모</span>
            <textarea value={task.memo} onChange={(event) => onChange({ ...task, memo: event.target.value })} rows={3} className="rounded-md border border-[#d5dde2] px-3 py-2.5 outline-none focus:border-[#38a9bd]" />
          </label>
        </div>

        <footer className="flex flex-wrap justify-between gap-2 border-t border-[#edf2f5] p-5">
          <button type="button" onClick={onDelete} className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600">
            <Trash2 size={16} />
            삭제
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-[#d5dde2] bg-white px-4 py-2 text-sm font-semibold">취소</button>
            <button type="button" onClick={onSave} className="rounded-md bg-[#171512] px-5 py-2 text-sm font-semibold text-white">저장</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function StepButton({ label, active, enabled, onClick }: { label: string; active: boolean; enabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-[#171512] text-white' : 'bg-[#edf2f5] text-[#4d5d66] hover:bg-[#d5dde2]'
      }`}
    >
      {label}
    </button>
  );
}

function countBy<T>(items: T[], getLabel: (item: T) => string) {
  const map = new Map<string, number>();
  items.forEach((item) => {
    const label = getLabel(item);
    map.set(label, (map.get(label) || 0) + 1);
  });
  return Array.from(map.entries()).map(([label, count]) => ({ label, count }));
}

function FieldShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#60717d]">{label}</span>
      {children}
    </label>
  );
}

function CellInput({ value, listId, onChange }: { value: string; listId?: string; onChange: (value: string) => void }) {
  return <input value={value} list={listId} onChange={(event) => onChange(event.target.value)} className="w-full min-w-28 rounded-md border border-[#d5dde2] px-2 py-2 outline-none focus:border-[#38a9bd]" />;
}

function CellNumber({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <NumberTextInput value={value} onChange={onChange} className="w-full min-w-24" />;
}

function NumberTextInput({ value, onChange, className = '' }: { value: number; onChange: (value: number) => void; className?: string }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={formatNumberInput(value)}
      onChange={(event) => onChange(parseNumberInput(event.target.value))}
      className={`${className} rounded-md border border-[#d5dde2] px-2 py-2 text-right outline-none focus:border-[#38a9bd]`}
    />
  );
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

function normalizeVersionType(value?: string): EstimateVersionType {
  if (value === 'revision' || value === 'final' || value === 'change') return value;
  return 'draft';
}

function estimateVersionLabel(type: EstimateVersionType) {
  return estimateVersionTypes.find((item) => item.key === type)?.label || '초안';
}

function estimateVersionRank(type?: string) {
  const rank: Record<EstimateVersionType, number> = {
    final: 0,
    change: 1,
    revision: 2,
    draft: 3,
  };
  return rank[normalizeVersionType(type)];
}

function sortEstimateVersions(estimates: SiteEstimate[]) {
  return [...estimates].sort((a, b) => {
    const baseDiff = Number(!isBaseEstimate(a)) - Number(!isBaseEstimate(b));
    if (baseDiff !== 0) return baseDiff;
    const rankDiff = estimateVersionRank(a.versionType) - estimateVersionRank(b.versionType);
    if (rankDiff !== 0) return rankDiff;
    return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
  });
}

function isBaseEstimate(estimate: SiteEstimate) {
  return (estimate.versionLabel || '').includes('기본 견적');
}

function defaultVersionLabel(type: EstimateVersionType, estimates: SiteEstimate[]) {
  const base = estimateVersionLabel(type);
  const sameTypeCount = estimates.filter((estimate) => normalizeVersionType(estimate.versionType) === type).length;
  if (type === 'draft' && sameTypeCount === 0) return '초안';
  if (type === 'final' && sameTypeCount === 0) return '최종안';
  return `${base} ${sameTypeCount + 1}`;
}

function cloneEstimateLines(lines: EstimateLine[]) {
  return lines.map((line, index) => ({
    ...line,
    id: `line-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
  }));
}

function cloneScheduleTasks(tasks: ScheduleTask[]) {
  return tasks.map((task, index) => ({
    ...task,
    id: `task-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
  }));
}

function hydrateScheduleTasks(tasks: Partial<ScheduleTask>[]) {
  return tasks.map((task) => {
    const startDate = task.startDate || '';
    const endDate = task.endDate || startDate;
    const durationDays = Math.max(1, Math.round(Number(task.durationDays || (startDate && endDate ? daysBetween(startDate, endDate) + 1 : 1))));
    return {
      ...emptyTask(),
      ...task,
      id: task.id || `task-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      startDate,
      endDate,
      durationDays,
      progress: Number(task.progress || 0),
      color: normalizeColor(task.color || colorForName(task.name || '공정')),
      vendorId: task.vendorId || '',
      vendorName: task.vendorName || '',
      vendorPhone: task.vendorPhone || '',
      memo: task.memo || '',
    };
  });
}

function estimateLineToWorkLine(line: EstimateLine): WorkLine {
  return {
    id: `work-${Date.now()}-${line.id}-${Math.random().toString(16).slice(2)}`,
    sourceLineId: line.id,
    space: line.space,
    category: line.category,
    process: line.process,
    name: line.name,
    spec: line.spec,
    unit: line.unit,
    quantity: Number(line.quantity || 0),
    executionUnitPrice: Number(line.executionUnitPrice || 0),
    vendor: '',
    status: '예정',
    note: line.note,
  };
}

function deriveWorkLines(lines: EstimateLine[]) {
  const workItems = lines.filter((line) => line.name || line.category || line.process).map(estimateLineToWorkLine);
  return workItems.length ? workItems : [emptyWorkLine()];
}

function cloneWorkLines(lines: WorkLine[]) {
  return lines.map((line, index) => ({
    ...line,
    id: `work-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
  }));
}

function lineGroupKey(line: EstimateLine, groupBy: 'space' | 'category') {
  return (groupBy === 'space' ? line.space : line.category || line.process) || '미분류';
}

function workLineGroupKey(line: WorkLine, groupBy: 'space' | 'category') {
  return (groupBy === 'space' ? line.space : line.category || line.process) || '미분류';
}

function sortEstimateLines(lines: EstimateLine[], groupBy: 'space' | 'category') {
  return [...lines].sort((a, b) => {
    const groupDiff = lineGroupKey(a, groupBy).localeCompare(lineGroupKey(b, groupBy), 'ko-KR');
    if (groupDiff !== 0) return groupDiff;
    return (a.process || a.name).localeCompare(b.process || b.name, 'ko-KR');
  });
}

function sortWorkLines(lines: WorkLine[], groupBy: 'space' | 'category') {
  return [...lines].sort((a, b) => {
    const groupDiff = workLineGroupKey(a, groupBy).localeCompare(workLineGroupKey(b, groupBy), 'ko-KR');
    if (groupDiff !== 0) return groupDiff;
    return (a.process || a.name).localeCompare(b.process || b.name, 'ko-KR');
  });
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

function calculateTotals(lines: EstimateLine[], workLines: WorkLine[] = []) {
  const customerEstimateTotal = Math.round(lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.customerUnitPrice || 0), 0));
  const executionCostTotal = workLines.some((line) => line.name || line.category || line.process)
    ? Math.round(workLines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.executionUnitPrice || 0), 0))
    : Math.round(lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.executionUnitPrice || 0), 0));
  const marginAmount = customerEstimateTotal - executionCostTotal;
  const marginRate = customerEstimateTotal > 0 ? Math.round((marginAmount / customerEstimateTotal) * 1000) / 10 : 0;
  return { customerEstimateTotal, executionCostTotal, marginAmount, marginRate };
}

function buildProcessPool(lines: EstimateLine[], workLines: WorkLine[]) {
  const map = new Map<string, string>();
  [...workLines, ...lines].forEach((line) => {
    const name = (line.process || line.category || line.name || '').trim();
    if (!name) return;
    const meta = [line.space, line.category, line.name].filter(Boolean).join(' · ');
    if (!map.has(name)) map.set(name, meta);
  });
  return Array.from(map.entries()).map(([name, meta]) => ({ name, meta }));
}

function todayKey() {
  return dateKey(new Date());
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftMonth(monthKey: string, offset: number) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`;
}

function buildCalendarDays(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  const first = new Date(year, month - 1, 1);
  const start = new Date(first);
  const mondayOffset = (first.getDay() + 6) % 7;
  start.setDate(first.getDate() - mondayOffset);

  return Array.from({ length: 42 }).map((_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = dateKey(date);
    return {
      key,
      date: key,
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === month - 1,
    };
  });
}

function tasksForDate(tasks: ScheduleTask[], date: string, holidays: Set<string>) {
  return tasks.filter((task) => {
    const start = task.startDate || task.endDate;
    const end = adjustedTaskEndDate(task, holidays);
    if (!start && !end) return false;
    return date >= start && date <= end;
  });
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  return `${year}년 ${month}월`;
}

function formatShortDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.getFullYear()}.${`${date.getMonth() + 1}`.padStart(2, '0')}.${`${date.getDate()}`.padStart(2, '0')}`;
}

function adjustedTaskEndDate(task: ScheduleTask, holidays: Set<string>) {
  const start = task.startDate || task.endDate;
  if (!start) return '';
  const rawEnd = task.durationDays ? addDays(start, Math.max(1, Number(task.durationDays || 1)) - 1) : task.endDate || start;
  return extendEndDateForHolidays(start, rawEnd, holidays);
}

function extendEndDateForHolidays(start: string, rawEnd: string, holidays: Set<string>) {
  let end = rawEnd;
  let previousEnd = '';
  while (end !== previousEnd) {
    previousEnd = end;
    const holidayCount = countHolidaysBetween(start, end, holidays);
    end = addDays(rawEnd, holidayCount);
  }
  return end;
}

function countHolidaysBetween(start: string, end: string, holidays: Set<string>) {
  let count = 0;
  holidays.forEach((date) => {
    if (date >= start && date <= end) count += 1;
  });
  return count;
}

function addDays(dateKeyValue: string, days: number) {
  const date = parseDateKey(dateKeyValue);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function daysBetween(start: string, end: string) {
  const startTime = parseDateKey(start).getTime();
  const endTime = parseDateKey(end).getTime();
  return Math.max(0, Math.round((endTime - startTime) / 86400000));
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
}

function colorForName(name: string) {
  const colors = ['#f1c76a', '#8fc6a8', '#8bb8e8', '#d9a1a1', '#b9a7e8', '#e3a85f', '#79c7c5'];
  const seed = Array.from(name || '공정').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return colors[seed % colors.length];
}

function normalizeColor(value?: string) {
  const color = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#f1c76a';
}

function softenColor(color: string) {
  const normalized = normalizeColor(color).replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.72)`;
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString('ko-KR');
}

function formatNumberInput(value: number) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '';
  return Number(value).toLocaleString('ko-KR');
}

function parseNumberInput(value: string) {
  const normalized = value.replace(/,/g, '').replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
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
