'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Copy, FileSpreadsheet, GripVertical, Loader2, Plus, Printer, Save, Search, Trash2, UploadCloud, X } from 'lucide-react';
import { hasAnyPermission } from '../../lib/manager-permissions';
import { clearStoredSession, readStoredSession, saveStoredSession, type StoredManagerUser } from '../../lib/manager-session-storage';
import { ManagerLoadingScreen } from '@/app/lib/manager-loading-screen';
import {
  COMMON_MATERIAL_NAME,
  appendCommonOption,
  buildCommonBulkLines,
  findCommonSaveTarget,
  isCommonMaterialName,
  materialSaveKey,
  placeCommonBulkLines,
  type CommonBulkRow,
  type CommonBulkShared,
} from '../../lib/estimate-common-options';
import { linkedWorkLineCount, unlinkWorkLinesFromLine, unnamedPricedLineCount } from '../../lib/estimate-save-safety';
import {
  appendTemplateLines,
  insertIntoTemplateGroup,
  isBlankEstimateLine,
  isMaterialListCurrent,
  orderTemplateLinesByGroup,
  pinBaseGroupFirst,
  placeTemplateLines,
  withTemplateSpace,
} from '../../lib/estimate-templates';
import { CommonBulkAddDialog } from './common-bulk-add-dialog';
import { SaveAsTemplateDialog } from './save-as-template-dialog';
import { TemplateLoadDialog } from './template-load-dialog';
import { TemplateManager, type TemplateApiData } from './template-manager';
import { TemplateDocumentPreview } from './template-document-preview';
import { GroupedLinesEditor } from './grouped-lines-editor';
import { CommonOptionPicker, CommonOptionsField } from './common-options';

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
  // Saved 품명s of a '공통' item, offered when it is picked into an estimate.
  commonOptions?: string[];
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
  commonName?: boolean;
  // The 자재 DB item the line was picked from; a template load takes that item's current 단가.
  materialId?: string;
};

type WorkLine = {
  id: string;
  sourceLineId?: string;
  date: string;
  space: string;
  category: string;
  process: string;
  name: string;
  spec: string;
  unit: string;
  quantity: number;
  executionUnitPrice: number;
  income: number;
  expense: number;
  payment: number;
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

type PurchaseOrderItem = {
  id: string;
  category: string;
  modelName: string;
  vendorName: string;
  spec: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  note: string;
};

type PurchaseOrder = {
  id: string;
  title: string;
  vendorName: string;
  orderDate: string;
  deliveryDate: string;
  memo: string;
  templateKey: 'modelSpec' | 'subType' | 'doorSet' | 'custom';
  doorModelName?: string;
  doorFinish?: string;
  doorBrand?: string;
  columnLabels: PurchaseOrderColumnLabels;
  visibleColumns: PurchaseOrderTableColumn[];
  columnWidths?: Partial<Record<PurchaseOrderTableColumn, string>>;
  cellAlignments?: Partial<Record<PurchaseOrderTableColumn, PurchaseOrderCellAlign>>;
  mergeSameCategory?: boolean;
  headerMergeLabel?: string;
  headerMergeColumns?: PurchaseOrderTableColumn[];
  items: PurchaseOrderItem[];
};

type PurchaseOrderTableColumn = 'category' | 'modelName' | 'spec' | 'quantity' | 'unit' | 'amount' | 'note';
type PurchaseOrderCellAlign = 'left' | 'center' | 'right';

type PurchaseOrderTemplatePreset = {
  id: string;
  name: string;
  templateKey: PurchaseOrder['templateKey'];
  columnLabels: PurchaseOrderColumnLabels;
  visibleColumns: PurchaseOrderTableColumn[];
  columnWidths: Partial<Record<PurchaseOrderTableColumn, string>>;
  cellAlignments?: Partial<Record<PurchaseOrderTableColumn, PurchaseOrderCellAlign>>;
  mergeSameCategory?: boolean;
  headerMergeLabel?: string;
  headerMergeColumns?: PurchaseOrderTableColumn[];
};

type PurchaseOrderColumnLabels = {
  category: string;
  modelName: string;
  spec: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  amount: string;
};

type ExtraItem = {
  id: string;
  name: string;
  spec: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  date: string;
  vendorName: string;
  note: string;
};

type LegacyWorkSite = {
  id: string;
  siteName: string;
  rows: WorkLine[];
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
  constructionStartDate?: string;
  purchaseOrdersJson?: string;
  purchaseOrderTemplatesJson?: string;
  extraItemsJson?: string;
  legacyWorkbooksJson?: string;
  customerEstimateTotal?: number;
  executionCostTotal?: number;
  marginAmount?: number;
  marginRate?: number;
  estimateExecutionCostTotal?: number;
  estimatedMarginAmount?: number;
  estimatedMarginRate?: number;
  actualExecutionCostTotal?: number;
  additionalCostTotal?: number;
  actualMarginAmount?: number;
  actualMarginRate?: number;
  memo?: string;
  createdAt?: string;
  updatedAt?: string;
};

type EstimateApiData = {
  error?: string;
  sites?: Site[];
  estimates?: SiteEstimate[];
  estimatesSiteId?: string;
  materials?: Material[];
  materialsMeta?: MaterialCacheMeta | null;
  materialSettings?: MaterialSettings;
  // The server could not read the estimate-DB settings; what came with it is not the stored settings.
  materialSettingsUnavailable?: boolean;
  vendors?: Vendor[];
  record?: SiteEstimate | Material;
  importedCount?: number;
  // A 409 from saveEstimate: the version changed or was deleted elsewhere after this page loaded it.
  conflict?: 'changed' | 'deleted';
};

type MaterialLibrary = 'estimate' | 'full';

type MaterialSettings = {
  estimateCategories: string[];
  estimateItems: Record<string, string>;
  materialOrder: string[];
};

type MaterialCacheMeta = {
  version?: string;
  updatedAt?: string;
  count?: number;
};

type MaterialCacheRecord = {
  savedAt: string;
  meta?: MaterialCacheMeta | null;
  materials: Material[];
};

type MaterialPickerState = {
  lineId: string;
  step: 'category' | 'process' | 'material';
  category: string;
  process: string;
  search: string;
};

// "공통 항목 한번에 추가": the '공통' item and the options ticked in the picker, and the line (or the draft) it was opened for.
type CommonBulkAddState = {
  material: Material;
  options: string[];
  library: MaterialLibrary;
  category: string;
  targetLineId: string;
  space: string;
  // The line row 1 replaces ('' = every row is added), and its 수량 / 비고 for row 1's defaults.
  replaceLineId: string;
  replacedLine: { quantity: number; note: string } | null;
  opener: HTMLElement | null;
};

type DetailPrintRow =
  | { type: 'group'; key: string; groupIndex: number; category: string }
  | { type: 'line'; key: string; line: EstimateLine }
  | { type: 'nameSubtotal'; key: string; amount: number }
  | { type: 'subtotal'; key: string; amount: number; hasNameSubtotals: boolean }
  | { type: 'total'; key: string; amount: number };

const SESSION_EXPIRED_MESSAGE = '로그인이 만료되었습니다. 다시 로그인해 주세요.';
const MATERIAL_SETTINGS_UNAVAILABLE_MESSAGE = '견적 DB 설정(견적 카테고리·자재 순서)을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';
const MATERIAL_CACHE_STORAGE_KEY = 'weve-estimate-materials-cache-v1';
const NEW_ESTIMATE_ID = '__new_estimate_version__';
// The material picker was opened by the template editor; picked lines go to it, not into the estimate.
const TEMPLATE_PICKER_ID = '__template__';
const DETAIL_PRINT_ROWS_PER_PAGE = 20;
const NEW_ESTIMATE_CATEGORY_OPTION = '__new_estimate_category__';
const SAME_AS_CATEGORY_TARGET = '__same_as_category__';
const emptyMaterialSettings: MaterialSettings = { estimateCategories: [], estimateItems: {}, materialOrder: [] };

const readMaterialCache = (): MaterialCacheRecord | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(MATERIAL_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MaterialCacheRecord;
    return Array.isArray(parsed.materials) ? parsed : null;
  } catch {
    return null;
  }
};

const writeMaterialCache = (materials: Material[], meta?: MaterialCacheMeta | null) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      MATERIAL_CACHE_STORAGE_KEY,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        meta: meta || null,
        materials,
      } satisfies MaterialCacheRecord),
    );
  } catch {
    // If browser storage is full or blocked, continue without cache.
  }
};

const clearMaterialCache = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(MATERIAL_CACHE_STORAGE_KEY);
};

const materialMetaKey = (meta?: MaterialCacheMeta | null) =>
  [meta?.version || '', meta?.updatedAt || '', typeof meta?.count === 'number' ? String(meta.count) : ''].join('|');

const isMaterialCacheFresh = (cache: MaterialCacheRecord | null, serverMeta?: MaterialCacheMeta | null) => {
  if (!cache?.materials?.length) return false;
  if (!serverMeta) return true;
  return materialMetaKey(cache.meta) === materialMetaKey(serverMeta);
};

const estimateVersionTypes: Array<{ key: EstimateVersionType; label: string; description: string }> = [
  { key: 'draft', label: '초안', description: '첫 상담/초기 견적' },
  { key: 'revision', label: '수정안', description: '고객 피드백 반영' },
  { key: 'final', label: '최종안', description: '계약 전 최종 확정' },
  { key: 'change', label: '변경견적', description: '추가·변경 공사' },
];
const favoriteScheduleColors = [
  { label: '골드', value: '#f1c76a' },
  { label: '그린', value: '#8fc6a8' },
  { label: '블루', value: '#8bb8e8' },
  { label: '코랄', value: '#d9a1a1' },
  { label: '퍼플', value: '#b9a7e8' },
  { label: '오렌지', value: '#e3a85f' },
  { label: '민트', value: '#79c7c5' },
  { label: '차콜', value: '#4d5d66' },
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
  date: todayKey(),
  space: '',
  category: '',
  process: '',
  name: '',
  spec: '',
  unit: '',
  quantity: 1,
  executionUnitPrice: 0,
  income: 0,
  expense: 0,
  payment: 0,
  vendor: '',
  status: '예정',
  note: '',
});

const emptyPurchaseOrderItem = (): PurchaseOrderItem => ({
  id: `po-item-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  category: '',
  modelName: '',
  vendorName: '',
  spec: '',
  unit: '',
  quantity: 0,
  unitPrice: 0,
  note: '',
});

const purchaseOrderTemplates: Record<PurchaseOrder['templateKey'], PurchaseOrderColumnLabels> = {
  modelSpec: {
    category: '구분',
    modelName: '모델명',
    spec: '규격',
    quantity: '수량',
    unit: '단위',
    unitPrice: '단가',
    amount: '금액',
  },
  subType: {
    category: '구분',
    modelName: '소구분',
    spec: '종류',
    quantity: '수량',
    unit: '단위',
    unitPrice: '단가',
    amount: '금액',
  },
  doorSet: {
    category: '번호/항목',
    modelName: '프레임 규격',
    spec: '도어 규격',
    quantity: '세트 수량',
    unit: '프레임 옵션',
    unitPrice: '단가',
    amount: '금액',
  },
  custom: {
    category: '구분',
    modelName: '모델명',
    spec: '규격',
    quantity: '수량',
    unit: '단위',
    unitPrice: '단가',
    amount: '금액',
  },
};

const purchaseOrderColumnKeys: PurchaseOrderTableColumn[] = ['category', 'modelName', 'spec', 'quantity', 'unit', 'amount', 'note'];

const defaultPurchaseOrderVisibleColumns: Record<PurchaseOrder['templateKey'], PurchaseOrderTableColumn[]> = {
  modelSpec: ['category', 'modelName', 'spec', 'quantity', 'unit', 'amount', 'note'],
  subType: ['category', 'modelName', 'spec', 'quantity', 'unit'],
  doorSet: ['category', 'modelName', 'spec', 'unit', 'quantity', 'note'],
  custom: ['category', 'modelName', 'spec', 'quantity', 'unit', 'amount', 'note'],
};

const purchaseOrderColumnWidths: Record<PurchaseOrderTableColumn, string> = {
  category: 'w-[18%]',
  modelName: 'w-[30%]',
  spec: 'w-[22%]',
  quantity: 'w-[10%]',
  unit: 'w-[10%]',
  amount: 'w-[14%]',
  note: 'w-[14%]',
};

const purchaseOrderColumnWidthValues: Record<PurchaseOrderTableColumn, string> = {
  category: '18',
  modelName: '30',
  spec: '22',
  quantity: '10',
  unit: '10',
  amount: '14',
  note: '14',
};

const purchaseUnitOptions = ['평', 'EA', 'SET', '식', '개'];

const purchaseOrderDefaultCellAlignments: Record<PurchaseOrderTableColumn, PurchaseOrderCellAlign> = {
  category: 'left',
  modelName: 'left',
  spec: 'left',
  quantity: 'right',
  unit: 'center',
  amount: 'right',
  note: 'left',
};

const defaultPurchaseOrderTemplatePresets: PurchaseOrderTemplatePreset[] = [
  {
    id: 'preset-model-spec',
    name: '템플릿1 · 모델/규격',
    templateKey: 'modelSpec',
    columnLabels: purchaseOrderTemplates.modelSpec,
    visibleColumns: defaultPurchaseOrderVisibleColumns.modelSpec,
    columnWidths: purchaseOrderColumnWidthValues,
    cellAlignments: purchaseOrderDefaultCellAlignments,
    mergeSameCategory: false,
    headerMergeLabel: '',
    headerMergeColumns: [],
  },
  {
    id: 'preset-sub-type',
    name: '템플릿2 · 구분/종류',
    templateKey: 'subType',
    columnLabels: purchaseOrderTemplates.subType,
    visibleColumns: defaultPurchaseOrderVisibleColumns.subType,
    columnWidths: { ...purchaseOrderColumnWidthValues, category: '20', modelName: '20', spec: '36', quantity: '12', unit: '12' },
    cellAlignments: { ...purchaseOrderDefaultCellAlignments, category: 'center', modelName: 'center', spec: 'center' },
    mergeSameCategory: true,
    headerMergeLabel: '구분',
    headerMergeColumns: ['category', 'modelName'],
  },
  {
    id: 'preset-door-set',
    name: '도어 발주 템플릿',
    templateKey: 'doorSet',
    columnLabels: purchaseOrderTemplates.doorSet,
    visibleColumns: defaultPurchaseOrderVisibleColumns.doorSet,
    columnWidths: { ...purchaseOrderColumnWidthValues, category: '16', modelName: '24', spec: '24', unit: '16', quantity: '12', note: '20' },
    cellAlignments: { ...purchaseOrderDefaultCellAlignments, category: 'left', modelName: 'center', spec: 'center', unit: 'center', quantity: 'center', note: 'center' },
    mergeSameCategory: false,
    headerMergeLabel: '',
    headerMergeColumns: [],
  },
];

const emptyPurchaseOrder = (title = '새 발주서'): PurchaseOrder => ({
  id: `purchase-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  title,
  vendorName: '',
  orderDate: todayKey(),
  deliveryDate: '',
  memo: '',
  templateKey: 'modelSpec',
  doorModelName: '',
  doorFinish: '필름',
  doorBrand: '',
  columnLabels: purchaseOrderTemplates.modelSpec,
  visibleColumns: defaultPurchaseOrderVisibleColumns.modelSpec,
  columnWidths: purchaseOrderColumnWidthValues,
  cellAlignments: purchaseOrderDefaultCellAlignments,
  mergeSameCategory: false,
  headerMergeLabel: '',
  headerMergeColumns: [],
  items: [],
});

const emptyExtraItem = (): ExtraItem => ({
  id: `extra-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  name: '',
  spec: '',
  unit: '',
  quantity: 0,
  unitPrice: 0,
  date: todayKey(),
  vendorName: '',
  note: '',
});

const defaultSpaces = ['거실', '주방', '침실', '욕실', '현관', '공용', '기타'];
const workStatuses = ['예정', '발주', '진행', '완료', '보류'];

export default function EstimateWorkspacePage() {
  // Holds the signed session token shared with the manager dashboard (the name predates signed sessions).
  const [password, setPassword] = useState('');
  const [firebaseToken, setFirebaseToken] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [loginId, setLoginId] = useState('admin');
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [needsRelogin, setNeedsRelogin] = useState(false);
  // Starts true so opening or refreshing with a saved session shows a loading screen instead of the password form.
  const [isLoadingData, setIsLoadingData] = useState(true);
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
  const [lineDraft, setLineDraft] = useState<EstimateLine>(() => emptyLine());
  const [workLines, setWorkLines] = useState<WorkLine[]>([emptyWorkLine()]);
  const [workLineDraft, setWorkLineDraft] = useState<WorkLine>(() => emptyWorkLine());
  const [editingWorkLineId, setEditingWorkLineId] = useState('');
  const [schedule, setSchedule] = useState<ScheduleTask[]>([emptyTask()]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([emptyPurchaseOrder()]);
  const [selectedPurchaseOrderId, setSelectedPurchaseOrderId] = useState('');
  const [purchaseItemDraft, setPurchaseItemDraft] = useState<PurchaseOrderItem>(() => emptyPurchaseOrderItem());
  const [editingPurchaseItemId, setEditingPurchaseItemId] = useState('');
  const [isPurchaseTemplateEditorOpen, setIsPurchaseTemplateEditorOpen] = useState(false);
  const [purchaseOrderTemplatePresets, setPurchaseOrderTemplatePresets] = useState<PurchaseOrderTemplatePreset[]>(defaultPurchaseOrderTemplatePresets);
  const [selectedPurchaseTemplatePresetId, setSelectedPurchaseTemplatePresetId] = useState(defaultPurchaseOrderTemplatePresets[0].id);
  const [purchaseTemplateNameDraft, setPurchaseTemplateNameDraft] = useState('');
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([emptyExtraItem()]);
  const [extraItemDraft, setExtraItemDraft] = useState<ExtraItem>(() => emptyExtraItem());
  const [editingExtraItemId, setEditingExtraItemId] = useState('');
  const [legacyWorkSites, setLegacyWorkSites] = useState<LegacyWorkSite[]>([]);
  const [selectedLegacyWorkSiteId, setSelectedLegacyWorkSiteId] = useState('');
  const [legacyWorkSearch, setLegacyWorkSearch] = useState('');
  const [isLegacyWorkModalOpen, setIsLegacyWorkModalOpen] = useState(false);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [holidayDate, setHolidayDate] = useState(() => todayKey());
  const [constructionStartDate, setConstructionStartDate] = useState('');
  const [calendarView, setCalendarView] = useState<'month' | 'startWeek'>('month');
  const [calendarWeekOffset, setCalendarWeekOffset] = useState(0);
  const [materialSettings, setMaterialSettings] = useState<MaterialSettings>(emptyMaterialSettings);
  const [dbLibrary, setDbLibrary] = useState<MaterialLibrary>('estimate');
  const [materialLibrary, setMaterialLibrary] = useState<MaterialLibrary>('full');
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [assignTargetCategory, setAssignTargetCategory] = useState('');
  const [newEstimateCategory, setNewEstimateCategory] = useState('');
  const [editingMaterialEstimateCategory, setEditingMaterialEstimateCategory] = useState('');
  const [materialOrderDraft, setMaterialOrderDraft] = useState<string[] | null>(null);
  const [draggingMaterialId, setDraggingMaterialId] = useState('');
  const [dragOverMaterialId, setDragOverMaterialId] = useState('');
  const [isBulkMoveOpen, setIsBulkMoveOpen] = useState(false);
  const [lineDraftSource, setLineDraftSource] = useState<Material | null>(null);
  const [isLineDbSaveOpen, setIsLineDbSaveOpen] = useState(false);
  const [lineDbSaveCategory, setLineDbSaveCategory] = useState('');
  const [lineDbSaveCommon, setLineDbSaveCommon] = useState(false);
  const [lineDbSaveOptions, setLineDbSaveOptions] = useState<string[]>([]);
  const [lineDbSaveKey, setLineDbSaveKey] = useState('');
  const [commonBulkAdd, setCommonBulkAdd] = useState<CommonBulkAddState | null>(null);
  const pickerOpenerRef = useRef<HTMLElement | null>(null);
  const templatePickRef = useRef<((lines: EstimateLine[]) => void) | null>(null);
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);
  const [isTemplateLoadOpen, setIsTemplateLoadOpen] = useState(false);
  const [isTemplateSaveOpen, setIsTemplateSaveOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'lines' | 'work' | 'materials' | 'schedule' | 'purchase' | 'extras' | 'documents'>('lines');
  const [isVersionPanelOpen, setIsVersionPanelOpen] = useState(false);
  const [isManualNewEstimateVersion, setIsManualNewEstimateVersion] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [materialSearch, setMaterialSearch] = useState('');
  const [materialCategory, setMaterialCategory] = useState('');
  const [lineDbSearch, setLineDbSearch] = useState('');
  const [lineDbCategory, setLineDbCategory] = useState('');
  const [selectedLineId, setSelectedLineId] = useState('');
  const [materialPicker, setMaterialPicker] = useState<MaterialPickerState | null>(null);
  const [scheduleEditor, setScheduleEditor] = useState<ScheduleTask | null>(null);
  const [documentView, setDocumentView] = useState<string>('detail');
  const [documentDetailPageIndex, setDocumentDetailPageIndex] = useState(0);
  const [isDocumentBatchOpen, setIsDocumentBatchOpen] = useState(false);
  // 견적서 tab (spec 2026-10-23 §3): 공간 보기 filter, the two side panels, '공사 추가' name, and a 'DB에 저장' request from a line menu.
  const [lineSpaceFilter, setLineSpaceFilter] = useState('');
  const [isDbPanelOpen, setIsDbPanelOpen] = useState(true);
  const [isEstimatePreviewOpen, setIsEstimatePreviewOpen] = useState(true);
  const [estimateNewGroup, setEstimateNewGroup] = useState<string | null>(null);
  const [pendingDbSaveOpen, setPendingDbSaveOpen] = useState(false);
  // The line the 'DB에 저장' panel was opened for; the panel follows its later edits and closes if it is deleted.
  const [dbSaveLineId, setDbSaveLineId] = useState('');
  const [workGroupBy, setWorkGroupBy] = useState<'space' | 'category'>('category');
  const [editingMaterial, setEditingMaterial] = useState<Material>({});
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSite, setIsLoadingSite] = useState(false);
  const siteRequestRef = useRef(0);
  const [savedSnapshot, setSavedSnapshot] = useState<{ editor: string; legacy: string } | null>(null);
  const [snapshotRequest, setSnapshotRequest] = useState(0);
  const [leaveGuard, setLeaveGuard] = useState<{ proceed: () => void } | null>(null);
  const allowLeaveRef = useRef(false);
  const [saveConflict, setSaveConflict] = useState<'changed' | 'deleted' | null>(null);
  const [materialSettingsUnavailable, setMaterialSettingsUnavailable] = useState(false);
  // The version id this page just saved: the version load effect leaves the editor alone for it, so a save never
  // throws away drafts, the selected purchase order or the calendar view, or anything typed while it ran.
  const keepEditorForSavedIdRef = useRef('');
  // The material order a reorder started from; the server refuses the save if the stored order changed since.
  const materialOrderBaseRef = useRef<string[]>([]);

  const selectedSite = sites.find((site) => site._id === selectedSiteId);
  const selectedSiteEstimates = useMemo(
    () => sortEstimateVersions(estimates.filter((estimate) => estimate.siteId === selectedSiteId)),
    [estimates, selectedSiteId],
  );
  const selectedEstimate = useMemo(
    () => selectedSiteEstimates.find((estimate) => estimate._id === selectedEstimateId),
    [selectedEstimateId, selectedSiteEstimates],
  );
  const selectedPurchaseOrder = useMemo(
    () => purchaseOrders.find((order) => order.id === selectedPurchaseOrderId) || purchaseOrders[0],
    [purchaseOrders, selectedPurchaseOrderId],
  );
  const selectedPurchaseOrderLabels = selectedPurchaseOrder ? getPurchaseOrderLabels(selectedPurchaseOrder) : purchaseOrderTemplates.modelSpec;
  const selectedPurchaseOrderVisibleColumns = selectedPurchaseOrder ? getPurchaseOrderVisibleColumns(selectedPurchaseOrder) : defaultPurchaseOrderVisibleColumns.modelSpec;
  const hiddenPurchaseOrderColumns = purchaseOrderColumnKeys.filter((key) => !selectedPurchaseOrderVisibleColumns.includes(key));
  const selectedPurchaseOrderInputColumns = selectedPurchaseOrderVisibleColumns.filter((column) => column !== 'amount' && column !== 'note');
  const purchaseCategoryOptions = useMemo(
    () => {
      const existing = Array.from(new Set((selectedPurchaseOrder?.items || []).map((item) => item.category.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko'));
      if (selectedPurchaseOrder?.templateKey !== 'doorSet') return existing;
      return Array.from(new Set(['1', '2', '3', '1. 프레임', '1. 도어', '2. 프레임', '2. 도어', '평판', '걸레받이', '기타', ...existing]));
    },
    [selectedPurchaseOrder],
  );
  const purchaseOrderTotal = useMemo(
    () => purchaseOrders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0), 0),
    [purchaseOrders],
  );
  const totals = useMemo(() => calculateTotals(lines, workLines, extraItems), [extraItems, lines, workLines]);
  const unnamedPricedCount = useMemo(() => unnamedPricedLineCount(lines), [lines]);
  const lineSpaceOptions = useMemo(() => uniqueLineValues(lines, (line) => line.space), [lines]);
  const sortedWorkLines = useMemo(() => sortWorkLines(workLines, workGroupBy), [workLines, workGroupBy]);
  const detailPreviewPages = useMemo(() => buildEstimateDetailPrintPages(lines, totals.customerEstimateTotal), [lines, totals.customerEstimateTotal]);
  const documentPurchaseOrder = documentView.startsWith('purchase:')
    ? purchaseOrders.find((order) => order.id === documentView.slice('purchase:'.length)) || null
    : null;
  const estimateDocumentView: 'cover' | 'summary' | 'detail' =
    documentView === 'cover' || documentView === 'summary' ? documentView : 'detail';
  const printPageOrientation: 'portrait' | 'landscape' = documentPurchaseOrder ? 'portrait' : 'landscape';
  const processPool = useMemo(() => buildProcessPool(lines, workLines), [lines, workLines]);
  const effectiveStartDate = constructionStartDate || earliestTaskStartDate(schedule);
  const calendarWeekStart = effectiveStartDate ? addDays(mondayOfWeek(effectiveStartDate), calendarWeekOffset * 7) : '';
  const isStartWeekCalendar = calendarView === 'startWeek' && Boolean(calendarWeekStart);
  const calendarDays = useMemo(
    () => (isStartWeekCalendar ? buildWeekCalendarDays(calendarWeekStart, effectiveStartDate) : buildCalendarDays(calendarMonth)),
    [calendarMonth, calendarWeekStart, effectiveStartDate, isStartWeekCalendar],
  );
  const holidaySet = useMemo(() => new Set(holidays), [holidays]);
  const { estimateCategories, estimateItems } = materialSettings;
  const orderedMaterials = useMemo(
    () => applyMaterialOrder(materials, materialOrderDraft || materialSettings.materialOrder),
    [materialOrderDraft, materialSettings.materialOrder, materials],
  );
  const estimateCategoryOf = (material: Material) => estimateItems[material._id || ''] || '';
  const estimateMaterials = useMemo(
    () => orderedMaterials.filter((item) => estimateItems[item._id || '']),
    [estimateItems, orderedMaterials],
  );
  const estimateCategoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    estimateMaterials.forEach((item) => {
      const category = estimateItems[item._id || ''];
      counts.set(category, (counts.get(category) || 0) + 1);
    });
    return counts;
  }, [estimateItems, estimateMaterials]);
  const materialCategories = useMemo(() => uniqueInOrder(orderedMaterials.map((item) => item.category || '미분류')), [orderedMaterials]);
  const dbLibraryCategories = dbLibrary === 'estimate' ? estimateCategories : materialCategories;
  const materialProcesses = useMemo(() => Array.from(new Set(materials.map((item) => item.process || item.category || '').filter(Boolean))).sort(), [materials]);
  const materialProcessNames = useMemo(() => uniqueInOrder(orderedMaterials.map(materialProcessOf)), [orderedMaterials]);
  const materialNames = useMemo(() => Array.from(new Set(materials.map((item) => item.name || '').filter(Boolean))).sort(), [materials]);
  const vendorNames = useMemo(() => Array.from(new Set(vendors.map((vendor) => vendor.name || '').filter(Boolean))).sort(), [vendors]);
  // The DB tab shows group boxes (공정 for the full DB, 견적 카테고리 for the estimate DB); materialCategory is the opened box.
  const materialGroups = useMemo(
    () =>
      materialLibrary === 'estimate'
        ? estimateCategories.map((label) => ({ label, items: estimateMaterials.filter((item) => estimateItems[item._id || ''] === label) }))
        : groupMaterials(orderedMaterials, materialProcessOf),
    [estimateCategories, estimateItems, estimateMaterials, materialLibrary, orderedMaterials],
  );
  const isMaterialListView = Boolean(materialCategory || materialSearch.trim());
  const filteredMaterials = useMemo(() => {
    const keyword = materialSearch.trim().toLowerCase();
    const source = materialLibrary === 'estimate' ? estimateMaterials : orderedMaterials;
    return source.filter((item) => {
      const itemGroup = materialLibrary === 'estimate' ? estimateItems[item._id || ''] : materialProcessOf(item);
      const inGroup = !materialCategory || itemGroup === materialCategory;
      const haystack = [item.process, item.name, item.spec, item.unit, item.note, estimateItems[item._id || '']].join(' ').toLowerCase();
      return inGroup && (!keyword || haystack.includes(keyword));
    });
  }, [estimateItems, estimateMaterials, materialCategory, materialLibrary, materialSearch, orderedMaterials]);
  const lineDbMaterials = useMemo(() => {
    const keyword = lineDbSearch.trim().toLowerCase();
    const source = dbLibrary === 'estimate' ? estimateMaterials : orderedMaterials;
    return source
      .filter((item) => {
        const itemCategory = dbLibrary === 'estimate' ? estimateItems[item._id || ''] : item.category || '미분류';
        const inCategory = !lineDbCategory || itemCategory === lineDbCategory;
        const haystack = [item.category, item.process, item.name, item.spec, item.unit, item.note].join(' ').toLowerCase();
        return inCategory && (!keyword || haystack.includes(keyword));
      })
      .slice(0, 120);
  }, [dbLibrary, estimateItems, estimateMaterials, lineDbCategory, lineDbSearch, orderedMaterials]);
  const lineProcessOptions = useMemo(
    () => uniqueLineValues(lines, (line) => line.process || line.category || line.name),
    [lines],
  );
  const workLedgerTotals = useMemo(
    () => ({
      income: Math.round(workLines.reduce((sum, line) => sum + Number(line.income || 0), 0)),
      expense: Math.round(workLines.reduce((sum, line) => sum + Number(workLineExpense(line) || 0), 0)),
      payment: Math.round(workLines.reduce((sum, line) => sum + Number(line.payment || 0), 0)),
    }),
    [workLines],
  );
  const selectedLegacyWorkSite = useMemo(
    () => legacyWorkSites.find((site) => site.id === selectedLegacyWorkSiteId) || legacyWorkSites[0],
    [legacyWorkSites, selectedLegacyWorkSiteId],
  );
  const filteredLegacyWorkSites = useMemo(() => {
    const keyword = legacyWorkSearch.trim().toLowerCase();
    if (!keyword) return legacyWorkSites;
    return legacyWorkSites.filter((site) => {
      const haystack = [site.siteName, `${site.rows.length}`].join(' ').toLowerCase();
      return haystack.includes(keyword);
    });
  }, [legacyWorkSearch, legacyWorkSites]);

  useEffect(() => {
    setDocumentDetailPageIndex((current) => Math.min(current, Math.max(0, detailPreviewPages.length - 1)));
  }, [detailPreviewPages.length]);

  // Unsaved-change tracking: the load effects bump snapshotRequest after filling the editor from a saved version,
  // and the snapshot taken on that render becomes the "saved" state to compare against.
  const editorSnapshot = useMemo(
    () => JSON.stringify({ versionType, versionLabel, memo, lines, workLines, schedule, purchaseOrders, purchaseOrderTemplatePresets, extraItems, holidays, constructionStartDate }),
    [constructionStartDate, extraItems, holidays, lines, memo, purchaseOrderTemplatePresets, purchaseOrders, schedule, versionLabel, versionType, workLines],
  );
  const legacySnapshot = useMemo(() => JSON.stringify(legacyWorkSites), [legacyWorkSites]);
  const hasUnsavedChanges = Boolean(savedSnapshot && (savedSnapshot.editor !== editorSnapshot || savedSnapshot.legacy !== legacySnapshot));

  useEffect(() => {
    if (snapshotRequest) setSavedSnapshot({ editor: editorSnapshot, legacy: legacySnapshot });
    // Only a new request should move the saved snapshot; later edits must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotRequest]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (allowLeaveRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [hasUnsavedChanges]);

  const guardUnsavedChanges = (proceed: () => void) => {
    if (hasUnsavedChanges) setLeaveGuard({ proceed });
    else proceed();
  };

  useEffect(() => {
    // Never auto-login from a stored password: only this tab's signed manager session is used.
    window.localStorage.removeItem('weve-manager-password');
    const siteIdFromUrl = new URLSearchParams(window.location.search).get('siteId') || '';
    if (siteIdFromUrl) setSelectedSiteId(siteIdFromUrl);
    const session = readStoredSession();
    if (!session) {
      setIsLoadingData(false);
      return;
    }
    setPassword(session.token);
    setFirebaseToken(session.firebaseToken);
    setLoginId(session.user.loginId || 'admin');
    if (!hasAnyPermission(session.user, ['estimates'])) {
      setAccessDenied(true);
      setIsLoadingData(false);
      return;
    }
    void loadData(session.token, siteIdFromUrl, '', session.firebaseToken);
  }, []);

  useEffect(() => {
    if (lineSpaceFilter && !lineSpaceOptions.includes(lineSpaceFilter)) setLineSpaceFilter('');
  }, [lineSpaceFilter, lineSpaceOptions]);

  useEffect(() => {
    if (!isLineDbSaveOpen || !dbSaveLineId) return;
    const line = lines.find((item) => item.id === dbSaveLineId);
    if (!line) {
      setIsLineDbSaveOpen(false);
      setDbSaveLineId('');
      return;
    }
    setLineDraft((current) => (JSON.stringify(current) === JSON.stringify(line) ? current : { ...line }));
  }, [dbSaveLineId, isLineDbSaveOpen, lines]);

  // A line menu's 'DB에 저장' puts the line into the draft first; the save panel reads the draft, so it opens on the next render.
  useEffect(() => {
    if (!pendingDbSaveOpen) return;
    setPendingDbSaveOpen(false);
    openLineDbSave();
    requestAnimationFrame(() => document.getElementById('line-db-save-heading')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    // openLineDbSave reads the draft set together with this request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDbSaveOpen]);

  useEffect(() => {
    if (!selectedSiteId) return;
    if (selectedEstimateId === NEW_ESTIMATE_ID) {
      if (isManualNewEstimateVersion) return;
      if (selectedSiteEstimates.length > 0) {
        setIsManualNewEstimateVersion(false);
        setSelectedEstimateId(selectedSiteEstimates[0]?._id || '');
      }
      return;
    }

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
      setLineDraft(emptyLine());
      setWorkLineDraft(emptyWorkLine());
      setEditingWorkLineId('');
      setSchedule([emptyTask()]);
      const nextPurchaseOrders = [emptyPurchaseOrder()];
      setPurchaseOrders(nextPurchaseOrders);
      setSelectedPurchaseOrderId(nextPurchaseOrders[0].id);
      setPurchaseOrderTemplatePresets(defaultPurchaseOrderTemplatePresets);
      setSelectedPurchaseTemplatePresetId(defaultPurchaseOrderTemplatePresets[0].id);
      setPurchaseTemplateNameDraft('');
      setExtraItems([]);
      setPurchaseItemDraft(emptyPurchaseOrderItem());
      setEditingPurchaseItemId('');
      setExtraItemDraft(emptyExtraItem());
      setEditingExtraItemId('');
      setLegacyWorkSites([]);
      setSelectedLegacyWorkSiteId('');
      setHolidays([]);
      setConstructionStartDate('');
      setCalendarView('month');
      setCalendarWeekOffset(0);
      setSelectedLineId('');
      setSnapshotRequest((current) => current + 1);
      return;
    }

    if (!selectedEstimateId || !selectedSiteEstimates.some((estimate) => estimate._id === selectedEstimateId)) {
      setIsManualNewEstimateVersion(false);
      setSelectedEstimateId(selectedSiteEstimates[0]?._id || '');
    }
  }, [isManualNewEstimateVersion, selectedEstimateId, selectedSiteEstimates, selectedSiteId, sites]);

  useEffect(() => {
    if (!selectedSiteId || selectedEstimateId === NEW_ESTIMATE_ID) return;
    const estimate = selectedEstimate;
    const site = sites.find((item) => item._id === selectedSiteId);

    // The version this page just saved: the editor already holds its content (and possibly newer typing), and
    // saveEstimate set the saved state, so nothing is reloaded.
    if (estimate?._id && keepEditorForSavedIdRef.current === estimate._id) {
      keepEditorForSavedIdRef.current = '';
      setEstimateId(estimate._id);
      return;
    }

    setEstimateId(estimate?._id || '');
    const nextVersionType = normalizeVersionType(estimate?.versionType);
    setVersionType(nextVersionType);
    setVersionLabel(estimate?.versionLabel || defaultVersionLabel(nextVersionType, selectedSiteEstimates));
    setMemo(estimate?.memo || '');
    // Lines are shown and saved gathered by 공사 with the 기본견적 공사 first (spec 2026-10-23 §3). The saved-state snapshot
    // is taken after this, so opening an estimate never counts as an unsaved change.
    const nextLines = arrangeEstimateLines(parseJson<EstimateLine[]>(estimate?.linesJson, [emptyLine()]));
    const nextWorkLines = hydrateWorkLines(parseJson<Partial<WorkLine>[]>(estimate?.workLinesJson, []));
    const nextPurchaseOrders = hydratePurchaseOrders(parseJson<Partial<PurchaseOrder>[]>(estimate?.purchaseOrdersJson, [emptyPurchaseOrder()]));
    const nextPurchaseOrderTemplatePresets = hydratePurchaseOrderTemplatePresets(parseJson<Partial<PurchaseOrderTemplatePreset>[]>(estimate?.purchaseOrderTemplatesJson, defaultPurchaseOrderTemplatePresets));
    setLines(nextLines);
    setWorkLines(nextWorkLines.length ? nextWorkLines : deriveWorkLines(nextLines));
    setLineDraft(emptyLine());
    setWorkLineDraft(emptyWorkLine());
    setEditingWorkLineId('');
    setSchedule(hydrateScheduleTasks(parseJson<Partial<ScheduleTask>[]>(estimate?.scheduleJson, [emptyTask()])));
    setPurchaseOrders(nextPurchaseOrders);
    setSelectedPurchaseOrderId(nextPurchaseOrders[0]?.id || '');
    setPurchaseOrderTemplatePresets(nextPurchaseOrderTemplatePresets);
    setSelectedPurchaseTemplatePresetId(nextPurchaseOrderTemplatePresets[0]?.id || defaultPurchaseOrderTemplatePresets[0].id);
    setPurchaseTemplateNameDraft('');
    setExtraItems(hydrateExtraItems(parseJson<Partial<ExtraItem>[]>(estimate?.extraItemsJson, [])));
    setPurchaseItemDraft(emptyPurchaseOrderItem());
    setEditingPurchaseItemId('');
    setExtraItemDraft(emptyExtraItem());
    setEditingExtraItemId('');
    const nextLegacyWorkSites = hydrateLegacyWorkSites(parseJson<Partial<LegacyWorkSite>[]>(estimate?.legacyWorkbooksJson, []));
    setLegacyWorkSites(nextLegacyWorkSites);
    setSelectedLegacyWorkSiteId(nextLegacyWorkSites[0]?.id || '');
    setHolidays(parseJson<string[]>(estimate?.holidaysJson, []));
    setConstructionStartDate(estimate?.constructionStartDate || '');
    setCalendarView(estimate?.constructionStartDate ? 'startWeek' : 'month');
    setCalendarWeekOffset(0);
    setSelectedLineId('');

    if (!estimate && site) {
      setVersionType('draft');
      setVersionLabel(defaultVersionLabel('draft', selectedSiteEstimates));
      const nextLinesForSite = [{ ...emptyLine(), space: '공용', category: site.siteType || '', name: `${site.title || '현장'} 초안` }];
      setLines(nextLinesForSite);
      setWorkLines(deriveWorkLines(nextLinesForSite));
      setLineDraft(emptyLine());
      setWorkLineDraft(emptyWorkLine());
      setEditingWorkLineId('');
      const nextSitePurchaseOrders = [emptyPurchaseOrder()];
      setPurchaseOrders(nextSitePurchaseOrders);
      setSelectedPurchaseOrderId(nextSitePurchaseOrders[0].id);
      setPurchaseOrderTemplatePresets(defaultPurchaseOrderTemplatePresets);
      setSelectedPurchaseTemplatePresetId(defaultPurchaseOrderTemplatePresets[0].id);
      setPurchaseTemplateNameDraft('');
      setExtraItems([]);
      setPurchaseItemDraft(emptyPurchaseOrderItem());
      setEditingPurchaseItemId('');
      setExtraItemDraft(emptyExtraItem());
      setEditingExtraItemId('');
      setLegacyWorkSites([]);
      setSelectedLegacyWorkSiteId('');
      setHolidays([]);
    }
    setSnapshotRequest((current) => current + 1);
  }, [selectedEstimate, selectedEstimateId, selectedSiteEstimates, selectedSiteId, sites]);

  useEffect(() => {
    setPurchaseItemDraft(emptyPurchaseOrderItem());
    setEditingPurchaseItemId('');
    setIsPurchaseTemplateEditorOpen(false);
  }, [selectedPurchaseOrderId]);

  const authHeaders = (nextPassword = password, nextFirebaseToken = firebaseToken) => ({
    Authorization: `Bearer ${nextPassword}`,
    ...(nextFirebaseToken ? { 'x-firebase-token': nextFirebaseToken } : {}),
  });

  // 401: the session expired or was rejected, so show the login form. 403: the account lacks the estimates permission.
  const handleAuthFailure = (response: Response) => {
    if (response.status === 401) {
      clearStoredSession();
      setPassword('');
      setFirebaseToken('');
      setIsUnlocked(false);
      setError(SESSION_EXPIRED_MESSAGE);
      return true;
    }
    if (response.status === 403) {
      setAccessDenied(true);
      return true;
    }
    return false;
  };

  // Requests made while editing: a 401 opens the re-login overlay instead of leaving the page, so edits survive.
  const managerFetch = async (input: string, init: RequestInit = {}) => {
    const response = await fetch(input, { ...init, headers: { ...authHeaders(), ...(init.headers as Record<string, string> | undefined) } });
    if (response.status === 401) setNeedsRelogin(true);
    return response;
  };

  const requestSession = async () => {
    const response = await fetch('/api/manager/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId, password: loginPassword }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      token?: string;
      expiresAt?: number;
      firebaseToken?: string;
      user?: StoredManagerUser;
    };
    if (!response.ok || !result.token || !result.user || !result.expiresAt) {
      throw new Error(result.error || '로그인에 실패했습니다.');
    }

    const session = saveStoredSession({ token: result.token, expiresAt: result.expiresAt, user: result.user, firebaseToken: result.firebaseToken });
    setLoginPassword('');
    setPassword(session.token);
    setFirebaseToken(session.firebaseToken);
    return session;
  };

  const handleLogin = async () => {
    setError('');
    setIsLoggingIn(true);
    try {
      const session = await requestSession();
      if (!hasAnyPermission(session.user, ['estimates'])) {
        setAccessDenied(true);
        return;
      }
      await loadData(session.token, selectedSiteId, '', session.firebaseToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '로그인 처리 중 오류가 발생했습니다.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Only the token is replaced; nothing is reloaded, so unsaved edits stay on screen.
  const handleRelogin = async () => {
    setError('');
    setIsLoggingIn(true);
    try {
      const session = await requestSession();
      setNeedsRelogin(false);
      if (!hasAnyPermission(session.user, ['estimates'])) {
        setAccessDenied(true);
        return;
      }
      setStatus('다시 로그인했습니다. 저장 버튼을 다시 눌러 주세요.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '로그인 처리 중 오류가 발생했습니다.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const postEstimateApi = (body: Record<string, unknown>) =>
    managerFetch('/api/manager/estimate', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const fetchEstimateApi = async (query: Record<string, string>, headers = authHeaders(), fallbackError = '견적 데이터를 불러오지 못했습니다.') => {
    const response = await fetch(`/api/manager/estimate?${new URLSearchParams(query)}`, { headers });
    // Before the workspace opens, a rejected session shows the login form (or the no-permission screen);
    // once it is open, a 401 brings up the re-login overlay so unsaved edits survive.
    if (response.status === 401 && isUnlocked) setNeedsRelogin(true);
    else if (handleAuthFailure(response)) throw new Error(response.status === 401 ? SESSION_EXPIRED_MESSAGE : '견적 작업 권한이 없습니다.');
    const data = (await response.json()) as EstimateApiData;
    if (!response.ok) throw new Error(data.error || fallbackError);
    return data;
  };

  // When the server could not read the settings, the empty settings that came with the answer are not used: the page
  // keeps what it had, warns, and blocks reordering until a reload brings the real settings.
  const applyMaterialSettingsFromServer = (data: EstimateApiData) => {
    if (data.materialSettingsUnavailable) {
      setMaterialSettingsUnavailable(true);
      setError(MATERIAL_SETTINGS_UNAVAILABLE_MESSAGE);
      return;
    }
    setMaterialSettingsUnavailable(false);
    setMaterialSettings(data.materialSettings || emptyMaterialSettings);
  };

  const applyMaterials = async (request: Promise<EstimateApiData>) => {
    try {
      const data = await request;
      const nextMaterials = Array.isArray(data.materials) ? data.materials : [];
      writeMaterialCache(nextMaterials, data.materialsMeta);
      setMaterials(nextMaterials);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '자재 단가를 불러오지 못했습니다.');
    }
  };

  // For a template load: reads only the server's material version (one Firestore read) and uses the cached materials when
  // they are of that version; otherwise reads every material again. Throws when either read fails.
  const ensureLatestMaterials = async (): Promise<Material[]> => {
    const { materialsMeta } = await fetchEstimateApi({ part: 'materialsMeta' }, authHeaders(), '최신 단가를 확인하지 못했어요. 다시 시도해 주세요.');
    const cached = readMaterialCache();
    if (isMaterialListCurrent(cached?.meta ? materialMetaKey(cached.meta) : null, materialsMeta ? materialMetaKey(materialsMeta) : null, cached?.materials.length || 0)) {
      return cached?.materials || [];
    }
    const data = await fetchEstimateApi({ part: 'materials' }, authHeaders(), '최신 단가를 확인하지 못했어요. 다시 시도해 주세요.');
    const nextMaterials = Array.isArray(data.materials) ? data.materials : [];
    writeMaterialCache(nextMaterials, data.materialsMeta);
    setMaterials(nextMaterials);
    return nextMaterials;
  };

  // Opens the workspace with only the selected site's versions. Materials come from the browser cache and are
  // refreshed in the background when the server's material version differs, so they never hold up the first screen.
  const loadData = async (
    nextPassword = password,
    preferredSiteId = selectedSiteId,
    preferredEstimateId = selectedEstimateId,
    nextFirebaseToken = firebaseToken,
  ) => {
    setError('');
    setStatus('');
    if (!nextPassword) return;

    setIsLoadingData(true);
    const headers = authHeaders(nextPassword, nextFirebaseToken);
    const cachedMaterials = readMaterialCache();
    // With no cache there is nothing to show yet, so materials are fetched alongside the workspace instead of after it.
    const materialsRequest = cachedMaterials?.materials?.length ? null : fetchEstimateApi({ part: 'materials' }, headers);
    materialsRequest?.catch(() => undefined);
    try {
      const data = await fetchEstimateApi({ estimates: 'site', siteId: preferredSiteId, materials: 'skip' }, headers);

      setSites(data.sites || []);
      setEstimates(data.estimates || []);
      setMaterials(cachedMaterials?.materials || []);
      applyMaterialSettingsFromServer(data);
      setVendors(data.vendors || []);
      setSelectedSiteId(data.estimatesSiteId || preferredSiteId || data.sites?.[0]?._id || '');
      if (preferredEstimateId && preferredEstimateId !== NEW_ESTIMATE_ID) {
        setIsManualNewEstimateVersion(false);
        setSelectedEstimateId(preferredEstimateId);
      }
      setIsUnlocked(true);
      if (materialsRequest) void applyMaterials(materialsRequest);
      else if (!isMaterialCacheFresh(cachedMaterials, data.materialsMeta)) void applyMaterials(fetchEstimateApi({ part: 'materials' }, headers));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '견적 데이터 조회 중 오류가 발생했습니다.');
    } finally {
      setIsLoadingData(false);
    }
  };

  // Loads one site's versions and only then moves the selection, so the header never shows one site over another
  // site's estimate. A later call wins if several are in flight.
  const loadSiteEstimates = async (siteId: string, preferredEstimateId = '') => {
    const requestId = ++siteRequestRef.current;
    setIsLoadingSite(true);
    try {
      const data = await fetchEstimateApi({ part: 'estimates', siteId }, authHeaders(), '현장 견적을 불러오지 못했습니다.');
      if (requestId !== siteRequestRef.current) return;
      setEstimates(data.estimates || []);
      setSelectedSiteId(siteId);
      setIsManualNewEstimateVersion(false);
      setSelectedEstimateId(preferredEstimateId);
    } catch (caught) {
      if (requestId === siteRequestRef.current) setError(caught instanceof Error ? caught.message : '현장 견적 조회 중 오류가 발생했습니다.');
    } finally {
      if (requestId === siteRequestRef.current) setIsLoadingSite(false);
    }
  };

  // asNewVersion saves the editor's content as a new version of the same type (the way out of a save conflict).
  const saveEstimate = async (options: { asNewVersion?: boolean } = {}) => {
    if (!selectedSite) {
      setError('현장을 먼저 선택해주세요.');
      return false;
    }

    const asNewVersion = Boolean(options.asNewVersion);
    const saveId = asNewVersion ? '' : estimateId;
    const saveLabel = asNewVersion ? defaultVersionLabel(versionType, selectedSiteEstimates) : versionLabel;
    // The version the editor was loaded from; the server refuses the save if it changed elsewhere since.
    const baseUpdatedAt = saveId ? estimates.find((estimate) => estimate._id === saveId)?.updatedAt : undefined;
    // What this save sends. It becomes the saved state, so anything typed while the request runs still counts as unsaved.
    // A new version is saved under saveLabel, which the editor takes on after the save, so the snapshot uses it too
    // (parsing and re-serializing keeps the key order of editorSnapshot).
    const sentSnapshot = {
      editor: asNewVersion ? JSON.stringify({ ...JSON.parse(editorSnapshot), versionLabel: saveLabel }) : editorSnapshot,
      legacy: legacySnapshot,
    };

    setIsSaving(true);
    setError('');
    setStatus('');

    try {
      const response = await managerFetch('/api/manager/estimate', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'saveEstimate',
          id: saveId,
          baseUpdatedAt,
          siteId: selectedSite._id,
          siteTitle: selectedSite.title,
          customerName: selectedSite.customerName,
          versionType,
          versionLabel: saveLabel,
          lines,
          workLines,
          schedule,
          purchaseOrders,
          purchaseOrderTemplatePresets,
          extraItems,
          legacyWorkSites,
          holidays,
          constructionStartDate,
          memo,
          createdAt: asNewVersion ? undefined : selectedEstimate?.createdAt,
        }),
      });
      const data = (await response.json()) as EstimateApiData;
      // The conflict dialog explains it and offers the ways out; nothing was saved.
      if (response.status === 409 && data.conflict) {
        setSaveConflict(data.conflict);
        return false;
      }
      if (!response.ok) throw new Error(data.error || '견적 저장에 실패했습니다.');
      const savedRecord = data.record as SiteEstimate | undefined;
      if (!savedRecord?._id) throw new Error('저장한 견적 버전을 확인하지 못했습니다. 새로고침해 주세요.');

      // The editor already shows what was saved, so the list takes the saved version as it is and the editor stays put.
      keepEditorForSavedIdRef.current = savedRecord._id;
      setEstimates((current) => [savedRecord, ...current.filter((estimate) => estimate._id !== savedRecord._id)]);
      setEstimateId(savedRecord._id);
      setIsManualNewEstimateVersion(false);
      setSelectedEstimateId(savedRecord._id);
      if (asNewVersion) setVersionLabel(saveLabel);
      setSavedSnapshot(sentSnapshot);
      setSaveConflict(null);
      setStatus(`${saveLabel || estimateVersionLabel(versionType)} 버전이 저장되었습니다.`);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '견적 저장 중 오류가 발생했습니다.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // After a conflict: drop this page's edits and load the version as it is stored now.
  const reloadAfterConflict = async () => {
    setSaveConflict(null);
    if (!selectedSite) return;
    keepEditorForSavedIdRef.current = '';
    setStatus('저장된 최신 내용을 다시 불러왔습니다.');
    await loadSiteEstimates(selectedSite._id, saveConflict === 'deleted' ? '' : estimateId);
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
      const response = await managerFetch('/api/manager/estimate', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteEstimate', id: estimateId }),
      });
      const data = (await response.json()) as EstimateApiData;
      if (!response.ok) throw new Error(data.error || '견적 버전 삭제에 실패했습니다.');

      setStatus('견적 버전을 삭제했습니다.');
      setEstimateId('');
      setEstimates((current) => current.filter((estimate) => estimate._id !== estimateId));
      setSelectedEstimateId('');
      await loadSiteEstimates(selectedSiteId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '견적 버전 삭제 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  // Reloads only the material DB. Reloading the estimate versions too would re-run the version load effect and
  // throw away unsaved edits in the estimate.
  const refreshMaterials = async () => {
    const data = await fetchEstimateApi({ part: 'materials' }, authHeaders(), '자재 단가를 다시 불러오지 못했습니다.');
    const nextMaterials = Array.isArray(data.materials) ? data.materials : [];
    writeMaterialCache(nextMaterials, data.materialsMeta);
    setMaterials(nextMaterials);
    applyMaterialSettingsFromServer(data);
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
      const response = await managerFetch('/api/manager/estimate', {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      const data = (await response.json()) as EstimateApiData;
      if (!response.ok) throw new Error(data.error || '자재 단가 업로드에 실패했습니다.');

      setUploadFile(null);
      clearMaterialCache();
      await refreshMaterials();
      setStatus(`자재 단가 ${data.importedCount || 0}개를 반영했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '자재 단가 업로드 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const saveMaterial = async (materialOverride?: Material, options: { estimateCategory?: string } = {}) => {
    setIsSaving(true);
    setError('');

    try {
      // 카테고리 is no longer entered separately; it follows 공정.
      // A '공통' item always sends its 공통 항목, so an emptied list clears them.
      const materialToSave = materialOverride || {
        ...editingMaterial,
        category: (editingMaterial.process || editingMaterial.category || '').trim(),
        ...(isCommonMaterialName(editingMaterial.name) ? { commonOptions: editingMaterial.commonOptions || [] } : {}),
      };
      const estimateCategory = materialOverride ? options.estimateCategory : editingMaterialEstimateCategory;
      const response = await managerFetch('/api/manager/estimate', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'saveMaterial', material: materialToSave, estimateCategory }),
      });
      const data = (await response.json()) as EstimateApiData;
      if (!response.ok) throw new Error(data.error || '자재 단가 저장에 실패했습니다.');

      if (!materialOverride) {
        setEditingMaterial({});
        setEditingMaterialEstimateCategory(materialLibrary === 'estimate' ? materialCategory : '');
      }
      if (data.materialSettings) setMaterialSettings(data.materialSettings);
      clearMaterialCache();
      await refreshMaterials();
      setStatus('자재 단가를 저장했습니다.');
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '자재 단가 저장 중 오류가 발생했습니다.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const updateMaterialSettings = async (payload: Record<string, unknown>, successMessage: string) => {
    setIsSaving(true);
    setError('');
    setStatus('');

    try {
      const response = await managerFetch('/api/manager/estimate', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateMaterialSettings', ...payload }),
      });
      const data = (await response.json()) as EstimateApiData;
      if (!response.ok || !data.materialSettings) throw new Error(data.error || '자재 DB 설정 저장에 실패했습니다.');
      setMaterialSettings(data.materialSettings);
      setStatus(successMessage);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '자재 DB 설정 저장 중 오류가 발생했습니다.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const addEstimateCategory = async () => {
    const name = newEstimateCategory.trim();
    if (!name) {
      setError('추가할 견적 카테고리 이름을 입력해주세요.');
      return;
    }
    if (await updateMaterialSettings({ op: 'addCategory', name }, `${name} 견적 카테고리를 추가했습니다.`)) {
      setNewEstimateCategory('');
      setAssignTargetCategory(name);
    }
  };

  // Used by the "+ 새 견적 카테고리" option in category selects; returns the new name, or '' if cancelled or failed.
  const promptNewEstimateCategory = async () => {
    const name = (window.prompt('새 견적 카테고리 이름을 입력해주세요. (예: 욕실 공사)') || '').trim();
    if (!name) return '';
    if (estimateCategories.includes(name)) return name;
    return (await updateMaterialSettings({ op: 'addCategory', name }, `${name} 견적 카테고리를 추가했습니다.`)) ? name : '';
  };

  const deleteEstimateCategory = async (name: string) => {
    const count = estimateCategoryCounts.get(name) || 0;
    const message = count
      ? `'${name}' 견적 카테고리를 삭제할까요?\n안에 있는 ${count}개 품목은 전체 DB에 그대로 남고 견적 DB에서만 빠집니다.`
      : `'${name}' 견적 카테고리를 삭제할까요?`;
    if (!window.confirm(message)) return;
    if (await updateMaterialSettings({ op: 'deleteCategory', name }, `${name} 견적 카테고리를 삭제했습니다.`)) {
      if (materialCategory === name) setMaterialCategory('');
      if (lineDbCategory === name) setLineDbCategory('');
      if (assignTargetCategory === name) setAssignTargetCategory('');
    }
  };

  const assignMaterialsToEstimateCategory = async (ids: string[], category: string, clearSelection = true) => {
    if (!ids.length) {
      setError('견적 DB에 넣을 품목을 선택해주세요.');
      return;
    }
    const message = category ? `${ids.length}개 품목을 '${category}' 견적 카테고리에 넣었습니다.` : `${ids.length}개 품목을 견적 DB에서 뺐습니다.`;
    if ((await updateMaterialSettings({ op: 'assign', ids, category }, message)) && clearSelection) {
      setSelectedMaterialIds([]);
    }
  };

  const moveMaterialsToEstimate = (assignments: Record<string, string>) =>
    updateMaterialSettings({ op: 'assignMany', assignments }, `${Object.keys(assignments).length}개 품목을 견적 DB로 옮겼습니다.`);

  const toggleMaterialSelection = (id: string) => {
    setSelectedMaterialIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const startMaterialOrderEditing = () => {
    if (materialSettingsUnavailable) {
      setError(MATERIAL_SETTINGS_UNAVAILABLE_MESSAGE);
      return;
    }
    materialOrderBaseRef.current = materialSettings.materialOrder;
    setMaterialOrderDraft(orderedMaterials.map((item) => item._id || '').filter(Boolean));
    setSelectedMaterialIds([]);
  };

  const cancelMaterialOrderEditing = () => {
    setMaterialOrderDraft(null);
    setDraggingMaterialId('');
    setDragOverMaterialId('');
  };

  const saveMaterialOrder = async () => {
    if (!materialOrderDraft) return;
    if (await updateMaterialSettings({ op: 'reorder', order: materialOrderDraft, baseOrder: materialOrderBaseRef.current }, '자재 순서를 저장했습니다.')) {
      cancelMaterialOrderEditing();
    }
  };

  const dropMaterialOnto = (targetId: string) => {
    if (draggingMaterialId && targetId && draggingMaterialId !== targetId) {
      setMaterialOrderDraft((current) => (current ? moveIdInOrder(current, draggingMaterialId, targetId) : current));
    }
    setDraggingMaterialId('');
    setDragOverMaterialId('');
  };

  const changeDbLibrary = (library: MaterialLibrary) => {
    setDbLibrary(library);
    setLineDbCategory('');
  };

  const materialToLine = (material: Material, library: MaterialLibrary = dbLibrary): Partial<EstimateLine> => {
    const isCommon = isCommonMaterialName(material.name);
    return {
      category: (library === 'estimate' ? estimateCategoryOf(material) : '') || material.category || '',
      process: material.process || material.category || '',
      name: isCommon ? '' : material.name || '',
      commonName: isCommon,
      spec: material.spec || '',
      unit: material.unit || '',
      customerUnitPrice: Number(material.unitPrice || 0),
      executionUnitPrice: Number(material.unitPrice || 0),
      materialId: material._id || undefined,
    };
  };

  // A '공통' DB item keeps the name already typed on a line that was common before.
  const applyMaterialToLine = (line: EstimateLine, material: Material, library: MaterialLibrary = dbLibrary): EstimateLine => {
    const next = { ...line, ...materialToLine(material, library) };
    return next.commonName && line.commonName ? { ...next, name: line.name } : next;
  };

  const addMaterialToEstimate = (material: Material, library: MaterialLibrary = dbLibrary) => {
    setLines((current) => arrangeEstimateLines([...current, ...withTemplateSpace([applyMaterialToLine(emptyLine(), material, library)], lineSpaceFilter)]));
    setActiveTab('lines');
  };

  const applyMaterialToSelectedLine = (material: Material) => {
    if (!selectedLineId) {
      addMaterialToEstimate(material);
      return;
    }

    setLines((current) => arrangeEstimateLines(current.map((line) => (line.id === selectedLineId ? applyMaterialToLine(line, material) : line))));
    setActiveTab('lines');
  };

  // A line's category may come from the other DB, so fall back to the category step when it is not in the current one.
  const pickerStepFor = (step: MaterialPickerState['step'], category: string, process: string): MaterialPickerState['step'] => {
    if (step === 'category' || !category || !dbLibraryCategories.includes(category)) return 'category';
    if (step === 'material' && !process) return 'process';
    return step;
  };

  // The cell that opened the picker; "공통 항목 한번에 추가" gives focus back to it when it closes.
  const rememberPickerOpener = () => {
    pickerOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };

  const openMaterialPicker = (line: EstimateLine, step: MaterialPickerState['step'] = 'category') => {
    rememberPickerOpener();
    setSelectedLineId(line.id);
    setMaterialPicker({
      lineId: line.id,
      step: pickerStepFor(step, line.category, line.process),
      category: line.category,
      process: line.process,
      search: '',
    });
  };

  // The template editor's 'DB에서 추가': the picked lines are handed to onPicked.
  const openTemplateMaterialPicker = (onPicked: (lines: EstimateLine[]) => void) => {
    rememberPickerOpener();
    templatePickRef.current = onPicked;
    setMaterialPicker({ lineId: TEMPLATE_PICKER_ID, step: 'category', category: '', process: '', search: '' });
  };

  // 카테고리 follows 공정; a line from the estimate DB carries the estimate category in 분류, so it is not used here.
  const lineDraftDbProcess = () => lineDraft.process || lineDraftSource?.process || (estimateCategories.includes(lineDraft.category) ? '' : lineDraft.category);

  // A '공통' save has no _id, so it overwrites the '공통' item with the same 공종 / 규격 / 단위. Its list starts from that item's
  // 공통 항목 (the picked item's only when no such item exists yet), plus the typed 품명; saveKey tells which item the list was loaded for.
  const lineDraftCommonPrefill = () => {
    const draft = { category: lineDraftDbProcess(), spec: lineDraft.spec, unit: lineDraft.unit };
    const target = findCommonSaveTarget(materials, draft);
    return {
      options: appendCommonOption(target ? target.commonOptions : lineDraftSource?.commonOptions, lineDraft.name),
      saveKey: materialSaveKey({ ...draft, name: COMMON_MATERIAL_NAME }),
    };
  };

  const openLineDbSave = () => {
    const prefill = lineDraftCommonPrefill();
    setLineDbSaveCategory(estimateCategories.includes(lineDraft.category) ? lineDraft.category : '');
    setLineDbSaveCommon(Boolean(lineDraft.commonName));
    setLineDbSaveOptions(prefill.options);
    setLineDbSaveKey(prefill.saveKey);
    setIsLineDbSaveOpen(true);
  };

  const saveLineDraftToDb = async () => {
    const name = lineDbSaveCommon ? COMMON_MATERIAL_NAME : lineDraft.name.trim();
    if (!name) {
      setError('DB에 저장할 품명을 입력하거나 품명을 공통으로 저장해주세요.');
      return;
    }
    // The draft's 공종 / 규격 / 단위 changed after the list was loaded: the list belongs to another item, so reload it first.
    const prefill = lineDraftCommonPrefill();
    if (lineDbSaveCommon && prefill.saveKey !== lineDbSaveKey) {
      setLineDbSaveOptions(prefill.options);
      setLineDbSaveKey(prefill.saveKey);
      setError('저장할 DB 품목이 바뀌어 공통 항목을 다시 불러왔습니다. 확인한 뒤 다시 저장해주세요.');
      return;
    }
    const process = lineDraftDbProcess();
    const saved = await saveMaterial(
      {
        category: process,
        process,
        name,
        spec: lineDraft.spec,
        unit: lineDraft.unit,
        unitPrice: lineDraft.customerUnitPrice,
        note: lineDraftSource?.note || '',
        sourceSheet: '견적서 입력',
        ...(lineDbSaveCommon ? { commonOptions: lineDbSaveOptions } : {}),
      },
      { estimateCategory: lineDbSaveCategory },
    );
    if (saved) setIsLineDbSaveOpen(false);
  };

  // When a 분류 has a single 공종 (imported data uses the same value for both), skip straight to the item list.
  const choosePickerCategory = (category: string) => {
    const source = dbLibrary === 'estimate'
      ? estimateMaterials.filter((item) => estimateItems[item._id || ''] === category)
      : orderedMaterials.filter((item) => (item.category || '미분류') === category);
    const processes = uniqueInOrder(source.map((item) => item.process || item.category || '기타 공정'));
    setMaterialPicker((current) => {
      if (!current) return current;
      return processes.length === 1
        ? { ...current, step: 'material', category, process: processes[0], search: '' }
        : { ...current, step: 'process', category, process: '', search: '' };
    });
  };

  const choosePickerProcess = (process: string) => {
    setMaterialPicker((current) => (current ? { ...current, step: 'material', process, search: '' } : current));
  };

  // commonOption: a saved 공통 항목 of a '공통' item, used as the 품명.
  const choosePickerMaterial = (material: Material, commonOption = '') => {
    if (!materialPicker) return;
    const apply = (line: EstimateLine) => {
      const next = applyMaterialToLine(line, material);
      return commonOption ? { ...next, name: commonOption } : next;
    };
    if (materialPicker.lineId === TEMPLATE_PICKER_ID) {
      templatePickRef.current?.([apply(emptyLine())]);
      setMaterialPicker(null);
      return;
    }
    setLines((current) => arrangeEstimateLines(current.map((line) => (line.id === materialPicker.lineId ? apply(line) : line))));
    setMaterialPicker(null);
    setActiveTab('lines');
  };

  // One ticked 공통 항목 goes straight in as the 품명; several open "공통 항목 한번에 추가".
  const choosePickerCommonOptions = (material: Material, options: string[]) => {
    if (!materialPicker || !options.length) return;
    if (options.length === 1) {
      choosePickerMaterial(material, options[0]);
      return;
    }
    const target = lines.find((line) => line.id === materialPicker.lineId);
    // Row 1 replaces the line the picker was opened for.
    const replaceLineId = materialPicker.lineId;
    const replacing = Boolean(target && lines.some((line) => line.id === replaceLineId));
    setCommonBulkAdd({
      material,
      options,
      library: dbLibrary,
      category: materialToLine(material, dbLibrary).category || '',
      targetLineId: materialPicker.lineId,
      space: target?.space || '',
      replaceLineId: replacing ? replaceLineId : '',
      replacedLine: replacing && target ? { quantity: target.quantity, note: target.note } : null,
      opener: pickerOpenerRef.current,
    });
    setMaterialPicker(null);
  };

  // Every row becomes a line built like a single pick of the item: the line the picker was opened for becomes row 1 and
  // the rest follow it (the template editor gets the rows instead).
  const addCommonBulkLines = (shared: CommonBulkShared, rows: CommonBulkRow[]) => {
    if (!commonBulkAdd) return;
    const { material, library, targetLineId, replaceLineId } = commonBulkAdd;
    const base = lines.find((line) => line.id === targetLineId) || emptyLine();
    const newLines = buildCommonBulkLines(applyMaterialToLine(base, material, library), shared, rows, () => emptyLine().id);
    if (targetLineId === TEMPLATE_PICKER_ID) {
      templatePickRef.current?.(newLines);
      setCommonBulkAdd(null);
      return;
    }
    setLines((current) => arrangeEstimateLines(placeCommonBulkLines(current, newLines, replaceLineId)));
    setCommonBulkAdd(null);
    setActiveTab('lines');
    setError('');
  };

  const startNewVersion = (copyCurrent = true) => {
    if (!selectedSite) {
      setError('현장을 먼저 선택해주세요.');
      return;
    }

    const nextLabel = defaultVersionLabel(newVersionType, selectedSiteEstimates);
    setIsManualNewEstimateVersion(true);
    setSelectedEstimateId(NEW_ESTIMATE_ID);
    setEstimateId('');
    setVersionType(newVersionType);
    setVersionLabel(nextLabel);
    setMemo(copyCurrent ? memo : '');
    const copiesLines = copyCurrent && lines.some((line) => line.name || line.category || line.process);
    const nextLines = copiesLines
      ? cloneEstimateLines(lines)
      : [{ ...emptyLine(), space: '공용', category: selectedSite.siteType || '', name: `${selectedSite.title || '현장'} ${nextLabel}` }];
    // Copied lines get new ids, so the copied 실행 내역 rows are pointed at the copies; otherwise 견적 공종 반영 would add every line again.
    const copiedLineIds = new Map(copiesLines ? lines.map((line, index) => [line.id, nextLines[index].id]) : []);
    setLines(nextLines);
    setWorkLines(
      copyCurrent && workLines.some((line) => line.name || line.category || line.process)
        ? cloneWorkLines(workLines).map((line) => ({ ...line, sourceLineId: copiedLineIds.get(line.sourceLineId || '') || line.sourceLineId }))
        : deriveWorkLines(nextLines),
    );
    setLineDraft(emptyLine());
    setWorkLineDraft(emptyWorkLine());
    setEditingWorkLineId('');
    setSchedule(copyCurrent && schedule.some((task) => task.name) ? cloneScheduleTasks(schedule) : [emptyTask()]);
    const nextPurchaseOrders = copyCurrent && purchaseOrders.some((order) => order.title || order.vendorName || order.items.some((item) => item.modelName || item.spec))
      ? clonePurchaseOrders(purchaseOrders)
      : [emptyPurchaseOrder()];
    setPurchaseOrders(nextPurchaseOrders);
    setSelectedPurchaseOrderId(nextPurchaseOrders[0]?.id || '');
    setExtraItems(copyCurrent && extraItems.some((item) => item.name || item.spec || item.vendorName) ? cloneExtraItems(extraItems) : []);
    const nextLegacyWorkSites = copyCurrent ? cloneLegacyWorkSites(legacyWorkSites) : [];
    setLegacyWorkSites(nextLegacyWorkSites);
    setSelectedLegacyWorkSiteId(nextLegacyWorkSites[0]?.id || '');
    setPurchaseItemDraft(emptyPurchaseOrderItem());
    setEditingPurchaseItemId('');
    setExtraItemDraft(emptyExtraItem());
    setEditingExtraItemId('');
    setHolidays(copyCurrent ? [...holidays] : []);
    setConstructionStartDate(copyCurrent ? constructionStartDate : '');
    setCalendarWeekOffset(0);
    setSelectedLineId('');
    setStatus(`${nextLabel} 새 버전을 작성 중입니다. 저장하면 현장별 버전 목록에 추가됩니다.`);
    setActiveTab('lines');
    setIsVersionPanelOpen(false);
  };

  const updateLine = (id: string, updates: Partial<EstimateLine>) => {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...updates } : line)));
  };

  // 템플릿 불러오기: the lines come in with new ids; 실행 내역 rows that pointed at lines this removes are unlinked, as when
  // a line is deleted.
  const applyTemplateLines = (incoming: EstimateLine[], mode: 'replace' | 'append') => {
    const removedIds = (mode === 'replace' ? lines : lines.filter(isBlankEstimateLine)).map((line) => line.id);
    setLines((current) => {
      const next = arrangeEstimateLines(placeTemplateLines(current, incoming, mode));
      return next.length ? next : [emptyLine()];
    });
    setWorkLines((current) => removedIds.reduce((rows, id) => unlinkWorkLinesFromLine(rows, id), current));
    setActiveTab('lines');
  };

  const openLineDbSaveFor = (line: EstimateLine) => {
    setLineDraft({ ...line });
    setLineDraftSource(null);
    setDbSaveLineId(line.id);
    setPendingDbSaveOpen(true);
  };

  const addEstimateGroup = () => {
    const name = (estimateNewGroup || '').trim();
    if (!name) return;
    setLines((current) => arrangeEstimateLines(insertIntoTemplateGroup(current, name, [{ ...emptyLine(), space: lineSpaceFilter }])));
    setEstimateNewGroup(null);
  };

  const updateTask = (id: string, updates: Partial<ScheduleTask>) => {
    setSchedule((current) => current.map((task) => (task.id === id ? { ...task, ...updates } : task)));
  };

  const updateWorkLine = (id: string, updates: Partial<WorkLine>) => {
    setWorkLines((current) => current.map((line) => (line.id === id ? { ...line, ...updates } : line)));
  };

  const resetWorkLineDraft = () => {
    setWorkLineDraft(emptyWorkLine());
    setEditingWorkLineId('');
  };

  const editWorkLine = (line: WorkLine) => {
    setWorkLineDraft({ ...line, expense: workLineExpense(line) });
    setEditingWorkLineId(line.id);
  };

  const submitWorkLine = () => {
    if (!workLineDraft.date && !workLineDraft.process && !workLineDraft.income && !workLineDraft.expense && !workLineDraft.payment && !workLineDraft.note) {
      setError('실행 내역 내용을 먼저 입력해주세요.');
      return;
    }
    const nextLine = {
      ...workLineDraft,
      id: editingWorkLineId || `work-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      date: workLineDraft.date || todayKey(),
    };
    setWorkLines((current) =>
      editingWorkLineId
        ? current.map((line) => (line.id === editingWorkLineId ? nextLine : line))
        : [...current, nextLine],
    );
    resetWorkLineDraft();
    setError('');
  };

  const deleteWorkLine = (id: string) => {
    setWorkLines((current) => current.filter((line) => line.id !== id));
    if (editingWorkLineId === id) resetWorkLineDraft();
  };

  const importLegacyWorkExcel = async (file: File | null) => {
    if (!file) return;
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const imported = workbook.SheetNames.map((sheetName) => ({
        id: `legacy-${Date.now()}-${hashString(sheetName)}-${Math.random().toString(16).slice(2)}`,
        siteName: sheetName,
        rows: parseLegacyWorkSheet(XLSX.utils.sheet_to_json<Array<string | number | Date>>(workbook.Sheets[sheetName], { header: 1, defval: '' })),
      })).filter((site) => site.rows.length > 0);
      if (!imported.length) {
        setError('가져올 실행 내역서 행을 찾지 못했습니다. 1행에 날짜/공종/수입/지출/결제/비고 머리글이 있는지 확인해주세요.');
        return;
      }
      setLegacyWorkSites((current) => mergeLegacyWorkSites(current, imported));
      setSelectedLegacyWorkSiteId(imported[0]?.id || '');
      setIsLegacyWorkModalOpen(true);
      setStatus(`과거 실행 내역서 ${imported.length}개 시트를 불러왔습니다. 저장 버튼을 눌러 현재 견적 버전에 반영하세요.`);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '과거 실행 내역서 엑셀을 불러오지 못했습니다.');
    }
  };

  const exportWorkExcel = async () => {
    const XLSX = await import('xlsx');
    const book = XLSX.utils.book_new();
    const currentRows = workLines.filter(isMeaningfulWorkLine).map(workLineToExcelRow);
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(currentRows), sheetSafeName(selectedSite?.title || '현재 실행내역'));
    legacyWorkSites.forEach((site) => {
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(site.rows.map(workLineToExcelRow)), sheetSafeName(site.siteName));
    });
    XLSX.writeFile(book, `weve-work-ledger-${todayKey()}.xlsx`);
  };

  const addPurchaseOrder = () => {
    const nextOrder = emptyPurchaseOrder(`발주서 ${purchaseOrders.length + 1}`);
    setPurchaseOrders((current) => [...current, nextOrder]);
    setSelectedPurchaseOrderId(nextOrder.id);
    setActiveTab('purchase');
  };

  const updatePurchaseOrder = (id: string, updates: Partial<PurchaseOrder>) => {
    setPurchaseOrders((current) => current.map((order) => (order.id === id ? { ...order, ...updates } : order)));
  };

  const updatePurchaseOrderTemplate = (id: string, templateKey: PurchaseOrder['templateKey']) => {
    setPurchaseOrders((current) =>
      current.map((order) =>
        order.id === id
          ? {
              ...order,
              templateKey,
              columnLabels: templateKey === 'custom' ? order.columnLabels : purchaseOrderTemplates[templateKey],
              visibleColumns: defaultPurchaseOrderVisibleColumns[templateKey],
              columnWidths:
                templateKey === 'doorSet'
                  ? { ...purchaseOrderColumnWidthValues, category: '16', modelName: '24', spec: '24', unit: '16', quantity: '12', note: '20' }
                  : { ...purchaseOrderColumnWidthValues },
              cellAlignments: { ...purchaseOrderDefaultCellAlignments },
              mergeSameCategory: templateKey === 'subType',
              headerMergeLabel: templateKey === 'subType' ? '구분' : '',
              headerMergeColumns: templateKey === 'subType' ? ['category', 'modelName'] : [],
              doorFinish: templateKey === 'doorSet' ? order.doorFinish || '필름' : order.doorFinish,
            }
          : order,
      ),
    );
  };

  const applyPurchaseOrderPreset = (orderId: string, presetId: string) => {
    const preset = purchaseOrderTemplatePresets.find((item) => item.id === presetId);
    if (!preset) return;
    setSelectedPurchaseTemplatePresetId(preset.id);
    setPurchaseTemplateNameDraft(preset.name);
    updatePurchaseOrder(orderId, {
      templateKey: preset.templateKey,
      columnLabels: { ...preset.columnLabels },
      visibleColumns: [...preset.visibleColumns],
      columnWidths: { ...preset.columnWidths },
      cellAlignments: { ...purchaseOrderDefaultCellAlignments, ...(preset.cellAlignments || {}) },
      mergeSameCategory: Boolean(preset.mergeSameCategory),
      headerMergeLabel: preset.headerMergeLabel || '',
      headerMergeColumns: [...(preset.headerMergeColumns || [])],
      doorFinish: preset.templateKey === 'doorSet' ? '필름' : undefined,
    });
  };

  const savePurchaseOrderPreset = (order: PurchaseOrder) => {
    const name = (purchaseTemplateNameDraft || order.title || '사용자 템플릿').trim();
    const id = selectedPurchaseTemplatePresetId || `purchase-template-${Date.now()}`;
    const preset: PurchaseOrderTemplatePreset = {
      id,
      name,
      templateKey: order.templateKey,
      columnLabels: getPurchaseOrderLabels(order),
      visibleColumns: getPurchaseOrderVisibleColumns(order),
      columnWidths: { ...purchaseOrderColumnWidthValues, ...(order.columnWidths || {}) },
      cellAlignments: { ...purchaseOrderDefaultCellAlignments, ...(order.cellAlignments || {}) },
      mergeSameCategory: Boolean(order.mergeSameCategory),
      headerMergeLabel: order.headerMergeLabel || '',
      headerMergeColumns: [...(order.headerMergeColumns || [])],
    };
    setPurchaseOrderTemplatePresets((current) => {
      const exists = current.some((item) => item.id === id);
      return exists ? current.map((item) => (item.id === id ? preset : item)) : [...current, preset];
    });
    setSelectedPurchaseTemplatePresetId(id);
    setPurchaseTemplateNameDraft(name);
    setStatus(`${name} 템플릿을 저장했습니다. 견적 저장을 누르면 서버에 반영됩니다.`);
  };

  const addPurchaseOrderPreset = (order: PurchaseOrder) => {
    const id = `purchase-template-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const name = `새 템플릿 ${purchaseOrderTemplatePresets.length + 1}`;
    const preset: PurchaseOrderTemplatePreset = {
      id,
      name,
      templateKey: order.templateKey,
      columnLabels: getPurchaseOrderLabels(order),
      visibleColumns: getPurchaseOrderVisibleColumns(order),
      columnWidths: { ...purchaseOrderColumnWidthValues, ...(order.columnWidths || {}) },
      cellAlignments: { ...purchaseOrderDefaultCellAlignments, ...(order.cellAlignments || {}) },
      mergeSameCategory: Boolean(order.mergeSameCategory),
      headerMergeLabel: order.headerMergeLabel || '',
      headerMergeColumns: [...(order.headerMergeColumns || [])],
    };
    setPurchaseOrderTemplatePresets((current) => [...current, preset]);
    setSelectedPurchaseTemplatePresetId(id);
    setPurchaseTemplateNameDraft(name);
  };

  const deletePurchaseOrderPreset = (presetId: string) => {
    setPurchaseOrderTemplatePresets((current) => {
      if (current.length <= 1) return current;
      const next = current.filter((item) => item.id !== presetId);
      const fallback = next[0] || defaultPurchaseOrderTemplatePresets[0];
      setSelectedPurchaseTemplatePresetId(fallback.id);
      setPurchaseTemplateNameDraft(fallback.name);
      return next.length ? next : [fallback];
    });
  };

  const updatePurchaseOrderColumnLabel = (id: string, key: keyof PurchaseOrderColumnLabels, value: string) => {
    setPurchaseOrders((current) =>
      current.map((order) =>
        order.id === id
          ? {
              ...order,
              templateKey: 'custom',
              columnLabels: { ...order.columnLabels, [key]: value },
            }
          : order,
      ),
    );
  };

  const updatePurchaseOrderColumnWidth = (id: string, key: PurchaseOrderTableColumn, value: string) => {
    const width = value.replace(/[^0-9.]/g, '').slice(0, 5);
    setPurchaseOrders((current) =>
      current.map((order) =>
        order.id === id
          ? {
              ...order,
              templateKey: 'custom',
              columnWidths: { ...(order.columnWidths || {}), [key]: width },
            }
          : order,
      ),
    );
  };

  const updatePurchaseOrderCellAlignment = (id: string, key: PurchaseOrderTableColumn, value: PurchaseOrderCellAlign) => {
    setPurchaseOrders((current) =>
      current.map((order) =>
        order.id === id
          ? {
              ...order,
              templateKey: 'custom',
              cellAlignments: {
                ...purchaseOrderDefaultCellAlignments,
                ...(order.cellAlignments || {}),
                [key]: value,
              },
            }
          : order,
      ),
    );
  };

  const updatePurchaseOrderMergeSameCategory = (id: string, value: boolean) => {
    setPurchaseOrders((current) =>
      current.map((order) =>
        order.id === id
          ? {
              ...order,
              templateKey: 'custom',
              mergeSameCategory: value,
            }
          : order,
      ),
    );
  };

  const addPurchaseOrderColumn = (id: string, key: PurchaseOrderTableColumn) => {
    setPurchaseOrders((current) =>
      current.map((order) => {
        if (order.id !== id) return order;
        const visibleColumns = getPurchaseOrderVisibleColumns(order);
        if (visibleColumns.includes(key)) return order;
        return { ...order, templateKey: 'custom', visibleColumns: [...visibleColumns, key] };
      }),
    );
  };

  const removePurchaseOrderColumn = (id: string, key: PurchaseOrderTableColumn) => {
    setPurchaseOrders((current) =>
      current.map((order) => {
        if (order.id !== id) return order;
        const visibleColumns = getPurchaseOrderVisibleColumns(order).filter((column) => column !== key);
        if (visibleColumns.length === 0) return order;
        return { ...order, templateKey: 'custom', visibleColumns };
      }),
    );
  };

  const deletePurchaseOrder = (id: string) => {
    setPurchaseOrders((current) => {
      const next = current.filter((order) => order.id !== id);
      if (next.length === 0) {
        const fallback = emptyPurchaseOrder();
        setSelectedPurchaseOrderId(fallback.id);
        return [fallback];
      }
      if (selectedPurchaseOrderId === id) setSelectedPurchaseOrderId(next[0].id);
      return next;
    });
  };

  const submitPurchaseOrderItem = (orderId: string) => {
    if (!purchaseItemDraft.category && !purchaseItemDraft.modelName && !purchaseItemDraft.spec && !purchaseItemDraft.unit && !purchaseItemDraft.unitPrice && !purchaseItemDraft.note) {
      setError('발주 항목 내용을 먼저 입력해주세요.');
      return;
    }
    const nextItem = { ...purchaseItemDraft, id: editingPurchaseItemId || `po-item-${Date.now()}-${Math.random().toString(16).slice(2)}` };
    setPurchaseOrders((current) =>
      current.map((order) => {
        if (order.id !== orderId) return order;
        const items = editingPurchaseItemId
          ? order.items.map((item) => (item.id === editingPurchaseItemId ? nextItem : item))
          : [...order.items, nextItem];
        return { ...order, items };
      }),
    );
    setPurchaseItemDraft(emptyPurchaseOrderItem());
    setEditingPurchaseItemId('');
    setError('');
  };

  const editPurchaseOrderItem = (item: PurchaseOrderItem) => {
    setPurchaseItemDraft({ ...item });
    setEditingPurchaseItemId(item.id);
  };

  const deletePurchaseOrderItem = (orderId: string, itemId: string) => {
    setPurchaseOrders((current) =>
      current.map((order) => {
        if (order.id !== orderId) return order;
        const nextItems = order.items.filter((item) => item.id !== itemId);
        return { ...order, items: nextItems };
      }),
    );
    if (editingPurchaseItemId === itemId) {
      setPurchaseItemDraft(emptyPurchaseOrderItem());
      setEditingPurchaseItemId('');
    }
  };

  const submitExtraItem = () => {
    if (!extraItemDraft.name && !extraItemDraft.spec && !extraItemDraft.unit && !extraItemDraft.unitPrice && !extraItemDraft.note) {
      setError('추가 항목 내용을 먼저 입력해주세요.');
      return;
    }
    const nextItem = { ...extraItemDraft, id: editingExtraItemId || `extra-${Date.now()}-${Math.random().toString(16).slice(2)}` };
    setExtraItems((current) =>
      editingExtraItemId
        ? current.map((item) => (item.id === editingExtraItemId ? nextItem : item))
        : [...current, nextItem],
    );
    setExtraItemDraft(emptyExtraItem());
    setEditingExtraItemId('');
    setError('');
  };

  const editExtraItem = (item: ExtraItem) => {
    setExtraItemDraft({ ...item });
    setEditingExtraItemId(item.id);
  };

  const deleteExtraItem = (id: string) => {
    setExtraItems((current) => current.filter((item) => item.id !== id));
    if (editingExtraItemId === id) {
      setExtraItemDraft(emptyExtraItem());
      setEditingExtraItemId('');
    }
  };

  const syncWorkLinesFromEstimate = () => {
    setWorkLines((current) => {
      const existingSourceIds = new Set(current.map((line) => line.sourceLineId).filter(Boolean));
      const additions = lines
        .filter((line) => (line.name || line.category || line.process) && !existingSourceIds.has(line.id))
        .map(estimateLineToWorkLine);
      return additions.length ? [...current, ...additions] : current;
    });
    setStatus('견적 내역의 공종과 품목을 실행 내역서에 반영했습니다.');
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

  if (accessDenied) {
    return (
      <main className="min-h-screen bg-[#edf2f5] px-5 py-10 text-[#171512]">
        <div className="mx-auto max-w-md rounded-lg border border-[#d5dde2] bg-white p-6 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#38a9bd]">WEVE ESTIMATE</p>
          <h1 className="mt-2 text-3xl font-semibold">견적 작업 권한이 없습니다</h1>
          <p className="mt-3 text-sm text-[#60717d]">총괄 관리자에게 &apos;견적 작업&apos; 권한을 요청해 주세요.</p>
          <button
            type="button"
            onClick={() => {
              window.location.href = '/manager-weve-7519';
            }}
            className="mt-5 w-full rounded-md bg-[#171512] px-4 py-3 font-semibold text-white"
          >
            매니저로 돌아가기
          </button>
        </div>
      </main>
    );
  }

  if (!isUnlocked && isLoadingData) {
    return (
      <main className="min-h-screen bg-[#eef3f5]">
        <ManagerLoadingScreen message="견적 데이터를 불러오는 중입니다" />
      </main>
    );
  }

  if (!isUnlocked) {
    return (
      <main className="min-h-screen bg-[#edf2f5] px-5 py-10 text-[#171512]">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleLogin();
          }}
          className="mx-auto max-w-md rounded-lg border border-[#d5dde2] bg-white p-6 shadow-sm"
        >
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#38a9bd]">WEVE ESTIMATE</p>
          <h1 className="mt-2 text-3xl font-semibold">견적 작업 로그인</h1>
          <input
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
            placeholder="아이디 또는 이메일"
            autoComplete="username"
            className="mt-5 w-full rounded-md border border-[#d5dde2] px-4 py-3 outline-none focus:border-[#38a9bd]"
          />
          <input
            type="password"
            value={loginPassword}
            onChange={(event) => setLoginPassword(event.target.value)}
            placeholder="비밀번호"
            autoComplete="current-password"
            className="mt-3 w-full rounded-md border border-[#d5dde2] px-4 py-3 outline-none focus:border-[#38a9bd]"
          />
          <button type="submit" disabled={isLoggingIn} className="mt-4 w-full rounded-md bg-[#171512] px-4 py-3 font-semibold text-white disabled:opacity-60">
            {isLoggingIn ? '확인 중...' : '들어가기'}
          </button>
          {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#edf2f5] text-[#171512]">
      {needsRelogin && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#171512]/40 px-5 print:hidden">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleRelogin();
            }}
            className="w-full max-w-sm rounded-lg border border-[#d5dde2] bg-white p-6 shadow-lg"
          >
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#38a9bd]">WEVE ESTIMATE</p>
            <h2 className="mt-2 text-xl font-semibold">다시 로그인해 주세요</h2>
            <p className="mt-2 text-sm text-[#60717d]">로그인이 만료되었습니다. 작업 중인 내용은 화면에 그대로 남아 있습니다.</p>
            <input
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              placeholder="아이디 또는 이메일"
              autoComplete="username"
              className="mt-4 w-full rounded-md border border-[#d5dde2] px-4 py-3 outline-none focus:border-[#38a9bd]"
            />
            <input
              type="password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              placeholder="비밀번호"
              autoComplete="current-password"
              className="mt-3 w-full rounded-md border border-[#d5dde2] px-4 py-3 outline-none focus:border-[#38a9bd]"
            />
            <button type="submit" disabled={isLoggingIn} className="mt-4 w-full rounded-md bg-[#171512] px-4 py-3 font-semibold text-white disabled:opacity-60">
              {isLoggingIn ? '확인 중...' : '다시 로그인'}
            </button>
            {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
          </form>
        </div>
      )}
      <style>{`
        @media print {
          @page { size: A4 ${printPageOrientation}; margin: ${printPageOrientation === 'portrait' ? '10mm 12mm' : '8mm 10mm'}; }
          @page portraitPage { size: A4 portrait; margin: 10mm 12mm; }
          @page landscapePage { size: A4 landscape; margin: 8mm 10mm; }
          html, body, #main-content {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            overflow: visible !important;
          }
          body * { visibility: hidden; }
          body *:not(#estimate-print):not(#estimate-print *):not(:has(#estimate-print)) {
            display: none !important;
          }
          body *:has(#estimate-print) {
            display: block !important;
            position: static !important;
            inset: auto !important;
            width: auto !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
            overflow: visible !important;
            background: white !important;
          }
          #estimate-print, #estimate-print * { visibility: visible; }
          #estimate-print {
            position: static !important;
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
            overflow: visible !important;
            background: white;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          #estimate-print > section {
            aspect-ratio: auto !important;
            box-sizing: border-box !important;
            display: block !important;
            margin: 0 !important;
            max-width: none !important;
            overflow: visible !important;
            break-inside: auto;
            page-break-inside: auto;
          }
          #estimate-print:not(.batch-print) > section {
            break-after: auto;
            page-break-after: auto;
          }
          #estimate-print.batch-print {
            display: block !important;
            gap: 0 !important;
          }
          #estimate-print.batch-print > section {
            break-before: auto;
            page-break-before: auto;
          }
          #estimate-print.batch-print > section:not(:last-child) {
            break-after: page;
            page-break-after: always;
          }
          #estimate-print.batch-print > section:last-child {
            break-after: auto;
            page-break-after: auto;
          }
          #estimate-print.batch-print > .print-portrait {
            page: portraitPage;
            width: 186mm !important;
            height: 245mm !important;
            min-height: 0 !important;
            max-width: none !important;
          }
          #estimate-print.batch-print > .print-landscape {
            page: landscapePage;
            width: 277mm !important;
            height: 172mm !important;
            min-height: 0 !important;
            max-width: none !important;
          }
          #estimate-print.batch-print > section:first-child {
            page: auto;
          }
          #estimate-print:not(.batch-print) > .print-portrait,
          #estimate-print:not(.batch-print) > .print-landscape {
            page: auto;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            max-width: none !important;
          }
          #estimate-print > .print-detail {
            overflow: visible !important;
          }
          #estimate-print.batch-print > .print-detail {
            height: 172mm !important;
            min-height: 0 !important;
            break-inside: avoid-page !important;
            page-break-inside: avoid !important;
          }
          #estimate-print > .print-detail + .print-detail {
            break-before: page;
            page-break-before: always;
          }
          #estimate-print .print-detail-title-screen {
            display: none !important;
          }
          #estimate-print .print-detail-title-row {
            display: table-row !important;
          }
          #estimate-print .print-detail-table {
            page-break-inside: auto;
          }
          #estimate-print .print-detail-table thead {
            display: table-header-group;
          }
          #estimate-print .print-detail-table tbody {
            display: table-row-group;
          }
          #estimate-print .print-detail-table tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .estimate-title-strip {
            background: #d9d9d9 !important;
            box-shadow: inset 0 0 0 9999px #d9d9d9;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print { display: none !important; }
        }
      `}</style>
      <header className="no-print sticky top-0 z-20 border-b border-[#d5dde2] bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1680px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() =>
                guardUnsavedChanges(() => {
                  allowLeaveRef.current = true;
                  window.location.href = '/manager-weve-7519';
                })
              }
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#60717d] hover:text-[#171512]"
            >
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
              disabled={isLoadingSite}
              onChange={(event) => {
                const nextSiteId = event.target.value;
                guardUnsavedChanges(() => {
                  void loadSiteEstimates(nextSiteId);
                });
              }}
              className="min-w-72 rounded-md border border-[#d5dde2] bg-white px-4 py-2.5 font-semibold outline-none focus:border-[#38a9bd] disabled:opacity-60"
            >
              {sites.map((site) => (
                <option key={site._id} value={site._id}>
                  {site.title || '현장명 없음'} · {site.customerName || '고객명 없음'}
                </option>
              ))}
            </select>
            {isLoadingSite && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#60717d]">
                <Loader2 className="animate-spin text-[#38a9bd]" size={14} />
                불러오는 중
              </span>
            )}
            {hasUnsavedChanges && <span className="rounded-full bg-[#fff3c7] px-3 py-1 text-xs font-bold text-[#8b6420]">저장 안 된 변경 있음</span>}
            <button type="button" onClick={() => void saveEstimate()} disabled={isSaving || isLoadingSite} className="inline-flex items-center gap-2 rounded-md bg-[#f1c76a] px-5 py-2.5 font-semibold disabled:opacity-60">
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
          <div className="grid gap-3 2xl:grid-cols-[minmax(260px,0.8fr)_minmax(300px,0.8fr)_minmax(560px,1.4fr)]">
            <div className="rounded-md bg-[#f7fafb] px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#38a9bd]">SITE</p>
              <h2 className="mt-1 truncate text-lg font-semibold">{selectedSite?.title || '현장을 선택해주세요'}</h2>
              <p className="mt-1 text-sm leading-5 text-[#60717d]">
                <span className="block truncate">{[selectedSite?.customerName, selectedSite?.customerPhone].filter(Boolean).join(' · ') || '고객 정보 없음'}</span>
                <span className="block truncate">{selectedSite?.address || '주소 정보 없음'}</span>
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
              <textarea
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                aria-label="수정 기록 메모"
                placeholder="수정 기록 메모: 다른 컴퓨터에서도 이어서 확인할 작업 내용을 적어주세요."
                rows={2}
                className="min-w-0 resize-none rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm outline-none focus:border-[#38a9bd]"
              />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <CompactMetric title="견적 금액" value={formatMoney(totals.customerEstimateTotal)} />
              <CompactMetric title="예상 마진" value={formatMoney(totals.estimatedMarginAmount)} tone={totals.estimatedMarginAmount >= 0 ? 'positive' : 'negative'} sub={`${totals.estimatedMarginRate.toFixed(1)}%`} />
              <CompactMetric title="견적 예상원가" value={formatMoney(totals.estimateExecutionCostTotal)} />
              <CompactMetric title="실제 마진" value={totals.hasWorkLines ? formatMoney(totals.actualMarginAmount) : '미작성'} tone={totals.actualMarginAmount >= 0 ? 'positive' : 'negative'} sub={totals.hasWorkLines ? `${totals.actualMarginRate.toFixed(1)}%` : '실행 내역서 기준'} />
            </div>
          </div>
          <div className="mt-3 grid gap-3 border-t border-[#edf2f5] pt-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
            <div className="grid gap-2 md:grid-cols-[minmax(220px,360px)_minmax(0,1fr)] md:items-end">
              <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.12em] text-[#60717d]">
                현재 버전
                <select
                  value={selectedEstimateId || NEW_ESTIMATE_ID}
                  onChange={(event) => {
                    const nextEstimateId = event.target.value;
                    guardUnsavedChanges(() => {
                      setIsManualNewEstimateVersion(nextEstimateId === NEW_ESTIMATE_ID);
                      setSelectedEstimateId(nextEstimateId);
                    });
                  }}
                  className="h-11 rounded-md border border-[#d5dde2] bg-white px-3 text-sm font-semibold normal-case tracking-normal text-[#171512] outline-none focus:border-[#38a9bd]"
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
              <div className="grid gap-1">
                <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#60717d]">버전 정보</span>
                <div className="flex h-11 items-center rounded-md border border-[#edf2f5] bg-[#f7fafb] px-3 text-sm text-[#4d5d66]">
                  <b className="text-[#171512]">{versionLabel || estimateVersionLabel(versionType)}</b>
                  <span className="mx-2 text-[#a9b4bb]">|</span>
                  {selectedEstimateId === NEW_ESTIMATE_ID ? '저장 전 새 버전입니다.' : `최근 수정 ${formatShortDate(selectedEstimate?.updatedAt || selectedEstimate?.createdAt)}`}
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <span className="hidden text-xs font-bold uppercase tracking-[0.12em] text-transparent xl:block">버전 작업</span>
              <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                <button type="button" onClick={() => setIsVersionPanelOpen((current) => !current)} className="inline-flex h-11 items-center gap-2 rounded-md bg-[#171512] px-4 text-sm font-semibold text-white">
                  <Plus size={16} />
                  버전 추가
                </button>
                {estimateId && selectedEstimateId !== NEW_ESTIMATE_ID && (
                  <button type="button" onClick={deleteEstimate} disabled={isSaving} className="inline-flex h-11 items-center gap-2 rounded-md border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 disabled:opacity-60">
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
                  <button type="button" onClick={() => guardUnsavedChanges(() => startNewVersion(false))} className="rounded-md border border-[#d5dde2] bg-white px-4 py-2 text-sm font-semibold">
                    빈 버전으로 시작
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        <nav className="no-print flex gap-2 overflow-x-auto rounded-lg border border-[#d5dde2] bg-white p-2 shadow-sm">
          {[
            { key: 'lines' as const, label: '견적서', Icon: FileSpreadsheet },
            { key: 'work' as const, label: '실행 내역서', Icon: ClipboardList },
            { key: 'materials' as const, label: '자재 / 견적 단가', Icon: Search },
            { key: 'schedule' as const, label: '공정 일정', Icon: CalendarDays },
            { key: 'purchase' as const, label: '발주서', Icon: ClipboardList },
            { key: 'extras' as const, label: '추가 사항', Icon: FileSpreadsheet },
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
        <datalist id="estimate-vendors">
          {vendorNames.map((name) => <option key={name} value={name} />)}
        </datalist>

        {activeTab === 'lines' && (
          <section
            className={`grid gap-4 xl:items-start ${
              isDbPanelOpen
                ? `xl:grid-cols-[320px_minmax(0,1fr)] ${isEstimatePreviewOpen ? '2xl:grid-cols-[320px_minmax(0,1fr)_420px]' : '2xl:grid-cols-[320px_minmax(0,1fr)_44px]'}`
                : `xl:grid-cols-[44px_minmax(0,1fr)] ${isEstimatePreviewOpen ? '2xl:grid-cols-[44px_minmax(0,1fr)_420px]' : '2xl:grid-cols-[44px_minmax(0,1fr)_44px]'}`
            }`}
          >
            {isDbPanelOpen ? (
              <aside className="rounded-lg border border-[#d5dde2] bg-white p-4 shadow-sm xl:sticky xl:top-4">
                <div className="mb-2 flex justify-end">
                  <button type="button" onClick={() => setIsDbPanelOpen(false)} className="rounded-md border border-[#d5dde2] bg-white px-2 py-1 text-xs font-semibold">DB 패널 접기</button>
                </div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#38a9bd]">{dbLibrary === 'estimate' ? 'ESTIMATE DB' : 'GLOBAL DB'}</p>
                  <h2 className="mt-1 text-lg font-semibold">{dbLibrary === 'estimate' ? '견적 단가 DB' : '자재 단가 DB'}</h2>
                  <p className="mt-1 text-xs leading-5 text-[#60717d]">검색 후 선택한 견적 행에 바로 적용합니다.</p>
                </div>
                <span className="rounded-full bg-[#edf8fb] px-3 py-1 text-xs font-bold text-[#267d8c]">{dbLibrary === 'estimate' ? estimateMaterials.length : materials.length}개</span>
              </div>

              <LibraryToggle value={dbLibrary} estimateCount={estimateMaterials.length} fullCount={materials.length} onChange={changeDbLibrary} className="mt-4" />

              <div className="mt-2 grid gap-2">
                <select value={lineDbCategory} onChange={(event) => setLineDbCategory(event.target.value)} className="rounded-md border border-[#d5dde2] px-3 py-2.5 text-sm outline-none focus:border-[#38a9bd]">
                  <option value="">{dbLibrary === 'estimate' ? '전체 견적 카테고리' : '전체 카테고리'}</option>
                  {dbLibraryCategories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
                <input value={lineDbSearch} onChange={(event) => setLineDbSearch(event.target.value)} placeholder="공정, 품명, 규격 검색" className="rounded-md border border-[#d5dde2] px-4 py-2.5 text-sm outline-none focus:border-[#38a9bd]" />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {dbLibraryCategories.slice(0, 10).map((category) => (
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

              <div className="mt-4 max-h-[60vh] min-h-[360px] overflow-y-auto rounded-lg border border-[#edf2f5] bg-white p-2 pr-1">
                {lineDbMaterials.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[#d5dde2] bg-[#f7fafb] p-6 text-center text-sm text-[#60717d]">
                    {dbLibrary === 'estimate' && estimateMaterials.length === 0 ? (
                      <>
                        견적 DB가 비어 있습니다. `자재 / 견적 단가` 탭의 견적 데이터베이스에서 카테고리를 만들고 품목을 넣어주세요.
                        <button type="button" onClick={() => changeDbLibrary('full')} className="mt-3 block w-full rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-xs font-semibold text-[#171512]">
                          전체 DB 보기
                        </button>
                      </>
                    ) : materials.length === 0 ? (
                      '자재 단가 DB가 비어 있습니다. `자재 / 견적 단가` 탭에서 엑셀을 먼저 업로드해주세요.'
                    ) : (
                      '검색 결과가 없습니다.'
                    )}
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {lineDbMaterials.map((material) => (
                      <article key={material._id || `${material.name}-${material.spec}`} className="rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{material.name || '품명 없음'}</p>
                            <p className="mt-1 text-xs text-[#60717d]">{[dbLibrary === 'estimate' ? estimateCategoryOf(material) : material.category, material.spec, material.unit].filter(Boolean).join(' · ') || '규격 정보 없음'}</p>
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
            ) : (
              <button type="button" onClick={() => setIsDbPanelOpen(true)} className="rounded-md border border-[#d5dde2] bg-white px-1 py-4 text-xs font-semibold xl:[writing-mode:vertical-rl]">
                DB 패널 펼치기
              </button>
            )}

            <section className="flex min-w-0 flex-col rounded-lg border border-[#d5dde2] bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">견적서</h2>
                  <p className="mt-1 text-sm text-[#60717d]">
                    공사별로 묶어 보여 줘요. 줄을 누르면 선택되고, 왼쪽 DB 패널의 &apos;선택 행 적용&apos;이 그 줄에 들어가요. Tab·Enter로 칸을 옮기고,
                    공사의 마지막 줄에서 Enter를 누르면 새 줄이 생겨요.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {estimateNewGroup === null ? (
                    <button type="button" onClick={() => setEstimateNewGroup('')} className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold hover:bg-[#f2f6f8]">
                      공사 추가
                    </button>
                  ) : (
                    <form
                      className="flex gap-1"
                      onSubmit={(event) => {
                        event.preventDefault();
                        addEstimateGroup();
                      }}
                    >
                      <input
                        value={estimateNewGroup}
                        onChange={(event) => setEstimateNewGroup(event.target.value)}
                        list="grouped-editor-categories"
                        placeholder="공사 이름 (예: 욕실 공사)"
                        aria-label="새 공사 이름"
                        autoFocus
                        className="w-48 rounded-md border border-[#d5dde2] px-2 py-1.5 text-sm outline-none focus:border-[#38a9bd]"
                      />
                      <button type="submit" disabled={!estimateNewGroup.trim()} className="rounded-md bg-[#171512] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">추가</button>
                      <button type="button" onClick={() => setEstimateNewGroup(null)} className="rounded-md border border-[#d5dde2] bg-white px-3 py-1.5 text-sm font-semibold">취소</button>
                    </form>
                  )}
                  <button
                    type="button"
                    onClick={() => openTemplateMaterialPicker((picked) => setLines((current) => arrangeEstimateLines(appendTemplateLines(current, withTemplateSpace(picked, lineSpaceFilter)))))}
                    className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold hover:bg-[#f2f6f8]"
                  >
                    DB에서 추가
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsTemplateManagerOpen(true)}
                    className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold hover:bg-[#f2f6f8]"
                  >
                    템플릿 관리
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsTemplateLoadOpen(true)}
                    disabled={isLoadingSite || !selectedSite}
                    className="rounded-md bg-[#171512] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    템플릿 불러오기
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsTemplateSaveOpen(true)}
                    disabled={isLoadingSite || !selectedSite}
                    className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold hover:bg-[#f2f6f8] disabled:opacity-50"
                  >
                    이 견적을 템플릿으로 저장
                  </button>
                  <select
                    value={lineSpaceFilter}
                    onChange={(event) => setLineSpaceFilter(event.target.value)}
                    aria-label="공간 보기"
                    className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-[#38a9bd]"
                  >
                    <option value="">공간 전체 보기</option>
                    {lineSpaceOptions.map((space) => (
                      <option key={space} value={space}>{space}만 보기</option>
                    ))}
                  </select>
                </div>
              </div>

              {isLineDbSaveOpen && (
                <p id="line-db-save-heading" className="mb-1 text-sm font-semibold">DB에 저장 · {lineDraft.name || '이름 없는 항목'} {lineDraft.spec ? `(${lineDraft.spec})` : ''}</p>
              )}
                {isLineDbSaveOpen && (
                  <div className="mt-3 grid gap-2 rounded-md border border-[#e7d8bd] bg-[#fffdf8] p-3 md:grid-cols-[minmax(0,220px)_auto_auto_auto] md:items-center">
                    <select
                      value={lineDbSaveCategory}
                      onChange={async (event) => {
                        const value = event.target.value;
                        if (value !== NEW_ESTIMATE_CATEGORY_OPTION) {
                          setLineDbSaveCategory(value);
                          return;
                        }
                        const name = await promptNewEstimateCategory();
                        if (name) setLineDbSaveCategory(name);
                      }}
                      aria-label="DB 저장 견적 카테고리"
                      className="min-w-0 rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm outline-none focus:border-[#38a9bd]"
                    >
                      <option value="">견적 DB에는 넣지 않음</option>
                      {estimateCategories.map((category) => (
                        <option key={category} value={category}>견적 카테고리 · {category}</option>
                      ))}
                      <option value={NEW_ESTIMATE_CATEGORY_OPTION}>+ 새 견적 카테고리 추가…</option>
                    </select>
                    <label className="inline-flex items-center gap-2 text-sm font-semibold">
                      <input type="checkbox" checked={lineDbSaveCommon} onChange={(event) => setLineDbSaveCommon(event.target.checked)} />
                      품명을 &apos;공통&apos;으로 저장
                    </label>
                    <button type="button" onClick={saveLineDraftToDb} disabled={isSaving} className="rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                      DB에 저장
                    </button>
                    <button type="button" onClick={() => setIsLineDbSaveOpen(false)} className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold">
                      닫기
                    </button>
                    {lineDbSaveCommon && <CommonOptionsField key={lineDbSaveKey || 'new'} options={lineDbSaveOptions} onChange={setLineDbSaveOptions} className="md:col-span-4" />}
                    <p className="text-xs leading-5 text-[#60717d] md:col-span-4">
                      분류·공종·규격·단위·견적단가를 자재 DB에 저장합니다. 공통으로 저장하면 여러 곳에 쓰는 같은 규격 품목을 불러올 때 품명을 직접 입력합니다.
                    </p>
                  </div>
                )}
              <div className={isLineDbSaveOpen ? 'mt-4' : ''}>
                <GroupedLinesEditor
                  lines={lines}
                  onChange={setLines}
                  newLine={(group) => ({ ...emptyLine(), category: group, space: lineSpaceFilter })}
                  newId={() => emptyLine().id}
                  columns={['space', 'category', 'process', 'name', 'spec', 'unit', 'quantity', 'customerUnitPrice', 'executionUnitPrice', 'margin', 'note']}
                  columnLabels={{ customerUnitPrice: '견적단가', executionUnitPrice: '실행단가' }}
                  spaceOptions={defaultSpaces}
                  categoryOptions={estimateCategories}
                  renderCell={{
                    category: (line) => <PickerCell value={line.category} placeholder="분류 선택" onClick={() => openMaterialPicker(line, 'category')} />,
                    process: (line) => <PickerCell value={line.process} placeholder="공종 선택" onClick={() => openMaterialPicker(line, line.category ? 'process' : 'category')} />,
                    name: (line) =>
                      line.commonName ? (
                        <CommonNameCell value={line.name} onChange={(value) => updateLine(line.id, { name: value })} onPick={() => openMaterialPicker(line, 'material')} />
                      ) : (
                        <PickerCell value={line.name} placeholder="품명 선택" onClick={() => openMaterialPicker(line, line.category && line.process ? 'material' : line.category ? 'process' : 'category')} />
                      ),
                  }}
                  onAddFromDb={(group) => openTemplateMaterialPicker((picked) => setLines((current) => arrangeEstimateLines(insertIntoTemplateGroup(current, group, withTemplateSpace(picked, lineSpaceFilter)))))}
                  selectedLineId={selectedLineId}
                  onSelectLine={setSelectedLineId}
                  spaceFilter={lineSpaceFilter}
                  isPinned={isBaseEstimateLine}
                  removeNote={(removed) => {
                    const linked = removed.reduce((sum, line) => sum + linkedWorkLineCount(workLines, line.id), 0);
                    return linked ? `실행 내역서에 연결된 ${linked}개 항목은 지우지 않고 그대로 둡니다.` : '';
                  }}
                  onRemoved={(ids) => {
                    setWorkLines((current) => ids.reduce((rows, id) => unlinkWorkLinesFromLine(rows, id), current));
                    setSelectedLineId((current) => (ids.includes(current) ? '' : current));
                  }}
                  lineMenuExtras={(line) => [{ label: 'DB에 저장', run: () => openLineDbSaveFor(line) }]}
                  emptyLineWhenAllRemoved
                />
              </div>
            </section>

            {isEstimatePreviewOpen ? (
              <aside className="min-w-0 rounded-lg border border-[#d5dde2] bg-[#eef2f4] p-4 xl:col-span-2 2xl:sticky 2xl:top-4 2xl:col-span-1">
                <TemplateDocumentPreview title={selectedSite?.title || '현장'} subtitle={versionLabel} lines={lines} onCollapse={() => setIsEstimatePreviewOpen(false)} />
              </aside>
            ) : (
              <button type="button" onClick={() => setIsEstimatePreviewOpen(true)} className="rounded-md border border-[#d5dde2] bg-white px-1 py-4 text-xs font-semibold xl:col-span-2 2xl:col-span-1 2xl:[writing-mode:vertical-rl]">
                미리보기 펼치기
              </button>
            )}
          </section>
        )}

        {activeTab === 'work' && (
          <section className="rounded-lg border border-[#d5dde2] bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">실행 내역서</h2>
                <p className="mt-1 text-sm leading-6 text-[#60717d]">
                  날짜별 수입, 지출, 결제 내역을 기록합니다. 지출 합계는 실제 마진 계산에 반영됩니다.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={syncWorkLinesFromEstimate} className="inline-flex items-center gap-2 rounded-md border border-[#d5dde2] bg-white px-4 py-2 text-sm font-semibold">
                  <Copy size={16} />
                  견적 공종 반영
                </button>
                <button type="button" onClick={() => setIsLegacyWorkModalOpen(true)} className="rounded-md border border-[#d5dde2] bg-white px-4 py-2 text-sm font-semibold">
                  과거 실행 내역서 확인
                </button>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[#d5dde2] bg-white px-4 py-2 text-sm font-semibold">
                  <UploadCloud size={16} />
                  과거 엑셀 불러오기
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => importLegacyWorkExcel(event.target.files?.[0] || null)} />
                </label>
                <button type="button" onClick={exportWorkExcel} className="rounded-md border border-[#d5dde2] bg-white px-4 py-2 text-sm font-semibold">
                  엑셀 내보내기
                </button>
              </div>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-4">
              <CompactMetric title="수입 합계" value={formatMoney(workLedgerTotals.income)} />
              <CompactMetric title="지출 합계" value={formatMoney(workLedgerTotals.expense)} />
              <CompactMetric title="결제 합계" value={formatMoney(workLedgerTotals.payment)} />
              <CompactMetric title="실제 마진" value={totals.hasWorkLines ? formatMoney(totals.actualMarginAmount) : '미작성'} tone={totals.actualMarginAmount >= 0 ? 'positive' : 'negative'} sub={totals.hasWorkLines ? `${totals.actualMarginRate.toFixed(1)}%` : '실행 내역서 기준'} />
            </div>

            <div className="sticky top-0 z-20 mb-4 rounded-lg border border-[#cfd9df] bg-white p-3 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{editingWorkLineId ? '실행 항목 수정' : '실행 항목 입력'}</h3>
                  <p className="mt-1 text-xs text-[#60717d]">날짜는 오늘로 기본 입력됩니다. 공종은 현재 견적 내역에 존재하는 공종을 선택하거나 직접 입력할 수 있습니다.</p>
                </div>
                <div className="flex gap-2">
                  {editingWorkLineId && (
                    <button type="button" onClick={resetWorkLineDraft} className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-xs font-semibold">
                      입력 초기화
                    </button>
                  )}
                  <button type="button" onClick={submitWorkLine} className="inline-flex items-center gap-2 rounded-md bg-[#f1c76a] px-4 py-2 text-sm font-semibold text-[#171512]">
                    <Plus size={16} />
                    {editingWorkLineId ? '수정 반영' : '항목 추가'}
                  </button>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[150px_1fr_150px_150px_150px_1.4fr]">
                <FieldShell label="날짜">
                  <input type="date" value={workLineDraft.date || todayKey()} onChange={(event) => setWorkLineDraft((current) => ({ ...current, date: event.target.value }))} className="w-full rounded-md border border-[#d5dde2] px-3 py-2 outline-none focus:border-[#38a9bd]" />
                </FieldShell>
                <FieldShell label="공종">
                  <CellInput value={workLineDraft.process} listId="work-process-options" onChange={(value) => setWorkLineDraft((current) => ({ ...current, process: value }))} />
                  <datalist id="work-process-options">
                    {lineProcessOptions.map((process) => (
                      <option key={process} value={process} />
                    ))}
                  </datalist>
                </FieldShell>
                <FieldShell label="수입">
                  <CellNumber value={workLineDraft.income} onChange={(value) => setWorkLineDraft((current) => ({ ...current, income: value }))} />
                </FieldShell>
                <FieldShell label="지출">
                  <CellNumber value={workLineDraft.expense} onChange={(value) => setWorkLineDraft((current) => ({ ...current, expense: value }))} />
                </FieldShell>
                <FieldShell label="결제">
                  <CellNumber value={workLineDraft.payment} onChange={(value) => setWorkLineDraft((current) => ({ ...current, payment: value }))} />
                </FieldShell>
                <FieldShell label="비고">
                  <CellInput value={workLineDraft.note} onChange={(value) => setWorkLineDraft((current) => ({ ...current, note: value }))} />
                </FieldShell>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-[#d5dde2]">
              <table className="w-full table-fixed border-collapse text-sm">
                <colgroup>
                  <col className="w-[13%]" />
                  <col className="w-[22%]" />
                  <col className="w-[14%]" />
                  <col className="w-[14%]" />
                  <col className="w-[14%]" />
                  <col className="w-[17%]" />
                  <col className="w-[6%]" />
                </colgroup>
                <thead className="bg-[#f3f1ec]">
                  <tr>
                    {['날짜', '공종', '수입', '지출', '결제', '비고', ''].map((header) => (
                      <th key={header || 'actions'} className="border-b border-[#d5dde2] px-3 py-2 text-left font-semibold">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {workLines.filter(isMeaningfulWorkLine).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-[#60717d]">등록된 실행 내역이 없습니다.</td>
                    </tr>
                  ) : (
                    [...workLines]
                      .filter(isMeaningfulWorkLine)
                      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.process || '').localeCompare(b.process || '', 'ko-KR'))
                      .map((line) => (
                        <tr key={line.id} onDoubleClick={() => editWorkLine(line)} className="cursor-pointer border-t border-[#edf2f5] hover:bg-[#fff8e8]">
                          <td className="px-3 py-2">{line.date || '-'}</td>
                          <td className="truncate px-3 py-2 font-semibold">{line.process || '-'}</td>
                          <td className="px-3 py-2 text-right">{formatMoney(line.income || 0)}</td>
                          <td className="px-3 py-2 text-right">{formatMoney(workLineExpense(line))}</td>
                          <td className="px-3 py-2 text-right">{formatMoney(line.payment || 0)}</td>
                          <td className="truncate px-3 py-2 text-[#60717d]">{line.note || '-'}</td>
                          <td className="px-3 py-2 text-right">
                            <button type="button" onClick={(event) => { event.stopPropagation(); deleteWorkLine(line.id); }} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600" aria-label="실행 항목 삭제">
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'materials' && (
          <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
            <div className="h-fit rounded-lg border border-[#d5dde2] bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">단가 업로드·수정</h2>
              <p className="mt-1 text-xs leading-5 text-[#60717d]">엑셀의 각 시트를 카테고리로 읽어 품명/규격/단위/단가를 저장합니다.</p>
              <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[#c6a25d] bg-[#fffdf8] px-3 py-3 text-center">
                <UploadCloud size={20} className="shrink-0" />
                <span className="truncate text-sm font-semibold">{uploadFile ? uploadFile.name : '자재단가.xlsx 선택'}</span>
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} />
              </label>
              <button type="button" onClick={uploadMaterials} disabled={isSaving} className="mt-2 w-full rounded-md bg-[#171512] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                자재 단가 반영
              </button>

              <div className="mt-5 grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <b className="text-sm">{editingMaterial._id ? `단가 수정 · ${editingMaterial.name || ''}` : '새 단가 입력'}</b>
                  {editingMaterial._id && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMaterial({});
                        setEditingMaterialEstimateCategory(materialLibrary === 'estimate' ? materialCategory : '');
                      }}
                      className="rounded-md border border-[#d5dde2] bg-white px-2 py-1 text-xs font-semibold"
                    >
                      새로 입력
                    </button>
                  )}
                </div>
                <input list="estimate-material-processes" value={editingMaterial.process || ''} onChange={(event) => setEditingMaterial({ ...editingMaterial, process: event.target.value })} placeholder="공정" className="min-w-0 rounded-md border border-[#d5dde2] px-3 py-1.5 text-sm" />
                <input value={editingMaterial.name || ''} onChange={(event) => setEditingMaterial({ ...editingMaterial, name: event.target.value })} placeholder="품명" className="min-w-0 rounded-md border border-[#d5dde2] px-3 py-1.5 text-sm" />
                <input value={editingMaterial.spec || ''} onChange={(event) => setEditingMaterial({ ...editingMaterial, spec: event.target.value })} placeholder="규격" className="min-w-0 rounded-md border border-[#d5dde2] px-3 py-1.5 text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={editingMaterial.unit || ''} onChange={(event) => setEditingMaterial({ ...editingMaterial, unit: event.target.value })} placeholder="단위" className="min-w-0 rounded-md border border-[#d5dde2] px-3 py-1.5 text-sm" />
                  <NumberTextInput value={Number(editingMaterial.unitPrice || 0)} onChange={(value) => setEditingMaterial({ ...editingMaterial, unitPrice: value })} className="min-w-0 py-1.5 text-sm" />
                </div>
                {isCommonMaterialName(editingMaterial.name) && (
                  <CommonOptionsField key={editingMaterial._id || 'new'} options={editingMaterial.commonOptions} onChange={(commonOptions) => setEditingMaterial((current) => ({ ...current, commonOptions }))} />
                )}
                <label className="grid gap-1 text-xs font-bold text-[#60717d]">
                  견적 카테고리
                  <select
                    value={editingMaterialEstimateCategory}
                    onChange={async (event) => {
                      const value = event.target.value;
                      if (value !== NEW_ESTIMATE_CATEGORY_OPTION) {
                        setEditingMaterialEstimateCategory(value);
                        return;
                      }
                      const name = await promptNewEstimateCategory();
                      if (name) setEditingMaterialEstimateCategory(name);
                    }}
                    disabled={isSaving}
                    className="rounded-md border border-[#d5dde2] bg-white px-3 py-1.5 text-sm font-normal text-[#171512]"
                  >
                    <option value="">견적 DB에 넣지 않음</option>
                    {estimateCategories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                    <option value={NEW_ESTIMATE_CATEGORY_OPTION}>+ 새 견적 카테고리 추가…</option>
                  </select>
                </label>
                <button type="button" onClick={() => saveMaterial()} disabled={isSaving} className="rounded-md bg-[#f1c76a] px-4 py-2.5 text-sm font-semibold disabled:opacity-60">
                  단가 저장
                </button>
                <datalist id="estimate-material-processes">
                  {materialProcessNames.map((process) => (
                    <option key={process} value={process} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="min-w-0 rounded-lg border border-[#d5dde2] bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <LibraryToggle
                  value={materialLibrary}
                  estimateCount={estimateMaterials.length}
                  fullCount={materials.length}
                  fullFirst
                  long
                  onChange={(library) => {
                    setMaterialLibrary(library);
                    setMaterialCategory('');
                    setSelectedMaterialIds([]);
                  }}
                  className="w-full max-w-md"
                />
                {materialOrderDraft ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-[#8b6420]">행을 끌어 순서를 바꾼 뒤 저장하세요.</span>
                    <button type="button" onClick={cancelMaterialOrderEditing} className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold">
                      취소
                    </button>
                    <button type="button" onClick={saveMaterialOrder} disabled={isSaving} className="rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                      순서 저장
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setIsBulkMoveOpen(true);
                      }}
                      disabled={materials.length === 0}
                      className="inline-flex items-center gap-2 rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      <Copy size={16} />
                      전체 DB → 견적 DB 한번에 옮기기
                    </button>
                    <button type="button" onClick={startMaterialOrderEditing} disabled={materials.length === 0} className="inline-flex items-center gap-2 rounded-md border border-[#171512] bg-white px-4 py-2 text-sm font-semibold text-[#171512] disabled:opacity-40">
                      <GripVertical size={16} />
                      순서 수정
                    </button>
                  </div>
                )}
              </div>

              {!materialOrderDraft && (
                <div className="mt-4 rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b className="text-sm">견적 카테고리</b>
                    <span className="text-xs text-[#60717d]">견적 DB 품목은 전체 DB와 같은 품목이라 어느 쪽에서 고쳐도 함께 바뀝니다.</span>
                  </div>
                  {materialLibrary === 'full' && (
                    <p className="mt-2 text-xs leading-5 text-[#4d5d66]">
                      <b className="text-[#171512]">견적 DB에 넣는 방법</b> · 공사·공종 단위로 많이 옮길 때는 <b>전체 DB → 견적 DB 한번에 옮기기</b> 버튼을 쓰세요. 하나씩은 표의 <b>견적 카테고리</b> 칸에서 바로 고르거나, 품목을 체크한 뒤 위에 나타나는 막대에서 <b>견적 DB에 넣기</b>를 누르면 됩니다.
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {estimateCategories.length === 0 && <span className="text-xs text-[#60717d]">아직 견적 카테고리가 없습니다. 아래에서 추가해주세요.</span>}
                    {estimateCategories.map((category) => (
                      <span key={category} className={`inline-flex items-center overflow-hidden rounded-full border text-xs font-semibold ${materialLibrary === 'estimate' && materialCategory === category ? 'border-[#171512] bg-[#171512] text-white' : 'border-[#d5dde2] bg-white text-[#4d5d66]'}`}>
                        <button
                          type="button"
                          onClick={() => {
                            if (materialLibrary !== 'estimate') {
                              setMaterialLibrary('estimate');
                              setSelectedMaterialIds([]);
                              setMaterialCategory(category);
                              return;
                            }
                            setMaterialCategory(materialCategory === category ? '' : category);
                          }}
                          title={materialLibrary === 'estimate' ? undefined : '견적 데이터베이스에서 이 카테고리 보기'}
                          className="py-1.5 pl-3 pr-2"
                        >
                          {category} <span className="opacity-60">{estimateCategoryCounts.get(category) || 0}</span>
                        </button>
                        <button type="button" onClick={() => deleteEstimateCategory(category)} disabled={isSaving} aria-label={`${category} 견적 카테고리 삭제`} className="py-1.5 pl-1 pr-2.5 opacity-70 hover:opacity-100">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void addEstimateCategory();
                    }}
                    className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:max-w-md"
                  >
                    <input value={newEstimateCategory} onChange={(event) => setNewEstimateCategory(event.target.value)} placeholder="새 견적 카테고리 (예: 욕실 공사)" className="min-w-0 rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm outline-none focus:border-[#38a9bd]" />
                    <button type="submit" disabled={isSaving} className="inline-flex items-center gap-1 rounded-md bg-[#171512] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                      <Plus size={14} />
                      추가
                    </button>
                  </form>
                </div>
              )}

              <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  {materialCategory ? (
                    <>
                      <button type="button" onClick={() => setMaterialCategory('')} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#d5dde2] bg-white px-3 py-2.5 font-semibold hover:border-[#38a9bd]">
                        <ChevronLeft size={16} />
                        {materialLibrary === 'estimate' ? '견적 카테고리 목록' : '공정 목록'}
                      </button>
                      <b className="truncate text-base">{materialCategory}</b>
                      <span className="shrink-0 text-[#60717d]">{filteredMaterials.length}개</span>
                    </>
                  ) : (
                    <span className="font-semibold text-[#60717d]">{materialLibrary === 'estimate' ? '견적 카테고리' : '공정'} 상자를 누르면 품목 목록이 나옵니다.</span>
                  )}
                </div>
                <input
                  value={materialSearch}
                  onChange={(event) => setMaterialSearch(event.target.value)}
                  placeholder={materialCategory ? `${materialCategory}에서 품명·규격 검색` : '전체에서 품명·규격 검색'}
                  className="min-w-0 flex-1 rounded-md border border-[#d5dde2] px-4 py-2.5"
                />
              </div>

              {selectedMaterialIds.length > 0 && !materialOrderDraft && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-[#e7d8bd] bg-[#fffdf8] px-3 py-2 text-sm">
                  <b>선택 {selectedMaterialIds.length}개</b>
                  <select
                    value={assignTargetCategory}
                    onChange={async (event) => {
                      const value = event.target.value;
                      if (value !== NEW_ESTIMATE_CATEGORY_OPTION) {
                        setAssignTargetCategory(value);
                        return;
                      }
                      const name = await promptNewEstimateCategory();
                      if (name) setAssignTargetCategory(name);
                    }}
                    aria-label="넣을 견적 카테고리"
                    className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm"
                  >
                    <option value="">견적 카테고리 선택</option>
                    {estimateCategories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                    <option value={NEW_ESTIMATE_CATEGORY_OPTION}>+ 새 견적 카테고리 추가…</option>
                  </select>
                  <button type="button" onClick={() => assignMaterialsToEstimateCategory(selectedMaterialIds, assignTargetCategory)} disabled={isSaving || !assignTargetCategory} className="rounded-md bg-[#171512] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {materialLibrary === 'estimate' ? '견적 카테고리 이동' : '견적 DB에 넣기'}
                  </button>
                  {selectedMaterialIds.some((id) => estimateItems[id]) && (
                    <button type="button" onClick={() => assignMaterialsToEstimateCategory(selectedMaterialIds, '')} disabled={isSaving} className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 disabled:opacity-50">
                      견적 DB에서 빼기
                    </button>
                  )}
                  <button type="button" onClick={() => setSelectedMaterialIds([])} className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold">
                    선택 해제
                  </button>
                  {estimateCategories.length === 0 && <span className="text-xs text-[#60717d]">위 견적 카테고리 칸에서 카테고리를 먼저 추가해주세요.</span>}
                </div>
              )}

              {!isMaterialListView ? (
                <div className="mt-4 max-h-[min(720px,70vh)] overflow-auto">
                  {materialOrderDraft && <p className="mb-3 text-sm font-semibold text-[#8b6420]">순서를 바꿀 {materialLibrary === 'estimate' ? '견적 카테고리' : '공정'} 상자를 열어 행을 끌어 주세요.</p>}
                  <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                    {materialGroups.length === 0 && (
                      <div className="col-span-full rounded-lg border border-dashed border-[#d5dde2] bg-[#f7fafb] p-10 text-center text-sm text-[#60717d]">
                        {materialLibrary === 'estimate' ? '견적 카테고리가 없습니다. 위에서 추가하거나 전체 DB → 견적 DB 한번에 옮기기를 써 주세요.' : '자재 단가 DB가 비어 있습니다. 왼쪽에서 엑셀을 먼저 업로드해주세요.'}
                      </div>
                    )}
                    {materialGroups.map((group) => {
                      const inEstimateCount = materialLibrary === 'full' ? group.items.filter((item) => estimateItems[item._id || '']).length : 0;
                      const selectedCount = group.items.filter((item) => selectedMaterialIds.includes(item._id || '')).length;
                      return (
                        <button
                          key={group.label}
                          type="button"
                          onClick={() => setMaterialCategory(group.label)}
                          className="min-w-0 rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#38a9bd] hover:shadow-md"
                        >
                          <span className="block truncate text-lg font-semibold">{group.label}</span>
                          <span className="mt-2 flex flex-wrap gap-1.5 text-xs font-bold">
                            <span className="rounded-full bg-white px-2.5 py-1 text-[#60717d]">{group.items.length}개 품목</span>
                            {inEstimateCount > 0 && <span className="rounded-full bg-[#fff3c7] px-2.5 py-1 text-[#8b6420]">견적 DB {inEstimateCount}</span>}
                            {selectedCount > 0 && <span className="rounded-full bg-[#171512] px-2.5 py-1 text-white">{selectedCount}개 선택</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
              <div className="mt-4 max-h-[min(720px,70vh)] overflow-auto rounded-lg border border-[#edf2f5]">
                <table className="min-w-[820px] w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-[#f7fafb] text-left text-xs uppercase tracking-[0.08em] text-[#60717d]">
                    <tr>
                      <th className="w-10 border-b border-[#d5dde2] px-3 py-3">
                        {!materialOrderDraft && (
                          <input
                            type="checkbox"
                            aria-label="보이는 품목 모두 선택"
                            checked={filteredMaterials.length > 0 && filteredMaterials.every((item) => selectedMaterialIds.includes(item._id || ''))}
                            onChange={(event) => setSelectedMaterialIds(event.target.checked ? filteredMaterials.map((item) => item._id || '').filter(Boolean) : [])}
                          />
                        )}
                      </th>
                      {['공정', '품명', '규격', '단위', '단가', '견적 카테고리', '작업'].map((header) => (
                        <th key={header} className="border-b border-[#d5dde2] px-3 py-3">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMaterials.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-sm text-[#60717d]">
                          {materialSearch.trim() ? '검색 결과가 없습니다.' : materialLibrary === 'estimate' ? '이 견적 카테고리에 품목이 없습니다. 전체 DB → 견적 DB 한번에 옮기기로 넣어주세요.' : '표시할 자재가 없습니다.'}
                        </td>
                      </tr>
                    )}
                    {filteredMaterials.map((material) => {
                      const id = material._id || '';
                      const isDragging = draggingMaterialId === id;
                      const isDropTarget = dragOverMaterialId === id && draggingMaterialId !== id;
                      return (
                        <tr
                          key={id || `${material.name}-${material.spec}`}
                          draggable={Boolean(materialOrderDraft && id)}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', id);
                            setDraggingMaterialId(id);
                          }}
                          onDragOver={(event) => {
                            if (!materialOrderDraft || !draggingMaterialId) return;
                            event.preventDefault();
                            if (dragOverMaterialId !== id) setDragOverMaterialId(id);
                          }}
                          onDrop={(event) => {
                            if (!materialOrderDraft) return;
                            event.preventDefault();
                            dropMaterialOnto(id);
                          }}
                          onDragEnd={() => {
                            setDraggingMaterialId('');
                            setDragOverMaterialId('');
                          }}
                          className={`border-b border-[#edf2f5] ${materialLibrary === 'full' && estimateItems[id] ? 'bg-[#fffbea] shadow-[inset_3px_0_0_#e3c47a]' : ''} ${materialOrderDraft ? 'cursor-grab active:cursor-grabbing' : ''} ${isDragging ? 'opacity-40' : ''} ${isDropTarget ? 'bg-[#fff8e8] shadow-[inset_0_2px_0_#c6a25d]' : ''}`}
                        >
                          <td className="px-3 py-3">
                            {materialOrderDraft ? (
                              <GripVertical size={16} className="text-[#87949c]" />
                            ) : (
                              <input type="checkbox" aria-label={`${material.name || '품목'} 선택`} checked={selectedMaterialIds.includes(id)} onChange={() => toggleMaterialSelection(id)} disabled={!id} />
                            )}
                          </td>
                          <td className="px-3 py-3">{materialProcessOf(material)}</td>
                          <td className="px-3 py-3 font-semibold">
                            {material.name}
                            {materialLibrary === 'full' && estimateItems[id] && (
                              <span className="ml-1.5 whitespace-nowrap rounded-full bg-[#f1c76a] px-2 py-0.5 align-middle text-[10px] font-bold text-[#171512]">견적</span>
                            )}
                          </td>
                          <td className="px-3 py-3">{material.spec}</td>
                          <td className="px-3 py-3">{material.unit}</td>
                          <td className="px-3 py-3">{formatMoney(Number(material.unitPrice || 0))}</td>
                          <td className="px-3 py-3">
                            {materialOrderDraft ? (
                              <span className={`text-xs font-bold ${estimateItems[id] ? 'text-[#8b6420]' : 'text-[#a9b4bb]'}`}>{estimateItems[id] || '-'}</span>
                            ) : (
                              <select
                                value={estimateItems[id] || ''}
                                onChange={async (event) => {
                                  const value = event.target.value;
                                  const category = value === NEW_ESTIMATE_CATEGORY_OPTION ? await promptNewEstimateCategory() : value;
                                  if (value === NEW_ESTIMATE_CATEGORY_OPTION && !category) return;
                                  await assignMaterialsToEstimateCategory([id], category, false);
                                }}
                                disabled={isSaving || !id}
                                aria-label={`${material.name || '품목'} 견적 카테고리`}
                                title="고르면 바로 견적 DB에 들어갑니다."
                                className={`w-full min-w-[104px] rounded-md border px-2 py-1.5 text-xs font-semibold outline-none focus:border-[#38a9bd] disabled:cursor-not-allowed disabled:opacity-50 ${estimateItems[id] ? 'border-[#e3c47a] bg-[#fff3c7] text-[#8b6420]' : 'border-dashed border-[#d5dde2] bg-transparent text-[#a9b4bb]'}`}
                              >
                                <option value="">{estimateItems[id] ? '견적 DB에서 빼기' : '+ 견적 DB에 넣기'}</option>
                                {estimateCategories.map((category) => (
                                  <option key={category} value={category}>{category}</option>
                                ))}
                                <option value={NEW_ESTIMATE_CATEGORY_OPTION}>+ 새 견적 카테고리…</option>
                              </select>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex gap-1.5">
                              <button type="button" onClick={() => addMaterialToEstimate(material, materialLibrary)} className="whitespace-nowrap rounded-md bg-[#171512] px-2.5 py-2 text-xs font-semibold text-white">견적서에 추가</button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMaterial(material);
                                  setEditingMaterialEstimateCategory(estimateCategoryOf(material));
                                }}
                                className="whitespace-nowrap rounded-md border border-[#d5dde2] px-2.5 py-2 text-xs font-semibold"
                              >
                                수정
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          </section>
        )}

        {activeTab === 'schedule' && (
          <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="rounded-lg border border-[#d5dde2] bg-white p-4 shadow-sm xl:flex xl:min-h-[calc(100vh-260px)] xl:flex-col">
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
                    견적 내역 또는 실행 내역서에 공종을 입력하면 이곳에 자동으로 표시됩니다.
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

            <section className="flex min-w-0 flex-col rounded-lg border border-[#d5dde2] bg-white p-4 shadow-sm xl:min-h-[calc(100vh-260px)]">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">공정 달력</h2>
                  <p className="mt-1 text-sm text-[#60717d]">날짜 칸에 공종을 드래그하면 해당 날짜 일정으로 등록됩니다.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => (isStartWeekCalendar ? setCalendarWeekOffset((current) => current - 1) : setCalendarMonth(shiftMonth(calendarMonth, -1)))} aria-label={isStartWeekCalendar ? '이전 주' : '이전 달'} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#d5dde2] bg-white">
                    <ChevronLeft size={18} />
                  </button>
                  <div className="min-w-32 rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-2 text-center text-sm font-semibold">
                    {isStartWeekCalendar ? `${formatMonthDay(calendarWeekStart)} 주부터 6주` : formatMonthLabel(calendarMonth)}
                  </div>
                  <button type="button" onClick={() => (isStartWeekCalendar ? setCalendarWeekOffset((current) => current + 1) : setCalendarMonth(shiftMonth(calendarMonth, 1)))} aria-label={isStartWeekCalendar ? '다음 주' : '다음 달'} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#d5dde2] bg-white">
                    <ChevronRight size={18} />
                  </button>
                  {isStartWeekCalendar && calendarWeekOffset !== 0 && (
                    <button type="button" onClick={() => setCalendarWeekOffset(0)} className="h-10 rounded-md border border-[#d5dde2] bg-white px-3 text-sm font-semibold">
                      시작 주로
                    </button>
                  )}
                </div>
              </div>

              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-[#e7d8bd] bg-[#fffdf8] px-3 py-2">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  공사 시작일
                  <input
                    type="date"
                    value={constructionStartDate}
                    onChange={(event) => {
                      setConstructionStartDate(event.target.value);
                      setCalendarWeekOffset(0);
                      if (event.target.value) setCalendarView('startWeek');
                    }}
                    className="rounded-md border border-[#d5dde2] bg-white px-3 py-1.5 text-sm font-normal outline-none focus:border-[#38a9bd]"
                  />
                </label>
                {constructionStartDate && (
                  <button
                    type="button"
                    onClick={() => {
                      setConstructionStartDate('');
                      setCalendarWeekOffset(0);
                      setStatus('공사 시작일을 지웠습니다. 저장을 누르면 이 버전에 반영됩니다.');
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-[#d5dde2] bg-white px-3 py-1.5 text-sm font-semibold text-[#4d5d66] hover:border-red-200 hover:text-red-600"
                  >
                    <X size={14} />
                    초기화
                  </button>
                )}
                <span className="text-xs text-[#60717d]">
                  {constructionStartDate
                    ? '견적 저장 시 이 버전에 함께 저장됩니다.'
                    : effectiveStartDate
                      ? `비워 두면 첫 공정 시작일(${effectiveStartDate})을 사용합니다.`
                      : '공사 시작일을 지정하거나 공정을 등록하면 시작 주부터 볼 수 있습니다.'}
                </span>
                <div className="ml-auto grid grid-cols-2 gap-1 rounded-md bg-[#edf2f5] p-1">
                  {([
                    ['month', '월별 보기'],
                    ['startWeek', '공사 시작 주부터'],
                  ] as const).map(([view, label]) => (
                    <button
                      key={view}
                      type="button"
                      disabled={view === 'startWeek' && !effectiveStartDate}
                      onClick={() => {
                        setCalendarView(view);
                        setCalendarWeekOffset(0);
                      }}
                      className={`rounded px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${(view === 'startWeek') === isStartWeekCalendar ? 'bg-white text-[#171512] shadow-sm' : 'text-[#60717d] hover:text-[#171512]'}`}
                    >
                      {label}
                    </button>
                  ))}
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
                          <span className={`text-xs font-bold ${day.date === todayKey() ? 'rounded-full bg-[#171512] px-2 py-1 text-white' : ''}`}>{day.label}</span>
                          {day.date === effectiveStartDate && <span className="rounded-full bg-[#171512] px-2 py-0.5 text-[10px] font-bold text-white">공사 시작</span>}
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

        {activeTab === 'purchase' && (
          <section className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="rounded-lg border border-[#d5dde2] bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">발주서 리스트</h2>
                  <p className="mt-1 text-sm leading-6 text-[#60717d]">업체별 발주 내용을 저장하고 관리합니다.</p>
                </div>
                <button type="button" onClick={addPurchaseOrder} className="inline-flex items-center gap-2 rounded-md bg-[#171512] px-3 py-2 text-sm font-semibold text-white">
                  <Plus size={15} />
                  추가
                </button>
              </div>
              <div className="mt-4 grid max-h-[calc(100vh-340px)] gap-2 overflow-y-auto pr-1">
                {purchaseOrders.map((order) => {
                  const orderTotal = order.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
                  return (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => setSelectedPurchaseOrderId(order.id)}
                      className={`rounded-lg border p-3 text-left transition ${selectedPurchaseOrder?.id === order.id ? 'border-[#38a9bd] bg-[#edf8fb]' : 'border-[#d5dde2] bg-[#f7fafb] hover:border-[#c6a25d]'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{order.title || '발주서'}</p>
                          <p className="mt-1 truncate text-xs text-[#60717d]">{order.vendorName || '업체 미지정'} · {order.orderDate || '날짜 없음'}</p>
                        </div>
                        <span title={formatMoney(orderTotal)} className="shrink-0 text-xs font-bold text-[#217346]">{formatCompactMoney(orderTotal)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 rounded-lg border border-[#edf2f5] bg-[#f7fafb] p-3 text-sm">
                <p className="font-semibold">발주 총액</p>
                <p title={formatMoney(purchaseOrderTotal)} className="mt-1 text-2xl font-bold text-[#171512]">{formatCompactMoney(purchaseOrderTotal)}</p>
              </div>
            </aside>

            <section className="min-w-0 rounded-lg border border-[#d5dde2] bg-white p-4 shadow-sm">
              {selectedPurchaseOrder ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold">발주서 작성</h2>
                      <p className="mt-1 text-sm leading-6 text-[#60717d]">모델명, 업체명, 규격, 개수, 날짜를 입력하면 아래 발주 틀에 정리됩니다.</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 2xl:grid-cols-[minmax(0,1fr)_300px]">
                    <div className="min-w-0">

                  <div className="mt-4 rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{editingPurchaseItemId ? '발주 항목 수정' : '발주 항목 입력'}</h3>
                        <p className="mt-1 text-xs text-[#60717d]">항목을 작성한 뒤 추가하면 아래 발주서 표에 반영되고 입력란은 비워집니다.</p>
                      </div>
                      <div className="flex gap-2">
                        {editingPurchaseItemId && (
                          <button type="button" onClick={() => deletePurchaseOrderItem(selectedPurchaseOrder.id, editingPurchaseItemId)} className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600">
                            <Trash2 size={14} />
                            선택 항목 삭제
                          </button>
                        )}
                        <button type="button" onClick={() => submitPurchaseOrderItem(selectedPurchaseOrder.id)} className="inline-flex items-center gap-2 rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white">
                          <Plus size={16} />
                          {editingPurchaseItemId ? '수정 반영' : '항목 추가'}
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-[repeat(auto-fit,minmax(88px,1fr))] 2xl:items-end">
                      {selectedPurchaseOrder.templateKey === 'doorSet' && (
                        <label className="grid gap-1 text-xs font-bold text-[#60717d]">
                          세트 모델명
                          <input
                            value={purchaseItemDraft.vendorName}
                            onChange={(event) => setPurchaseItemDraft((current) => ({ ...current, vendorName: event.target.value }))}
                            placeholder={selectedPurchaseOrder.doorModelName || '예: TA-13'}
                            className="min-w-0 rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-[#38a9bd]"
                          />
                        </label>
                      )}
                      {selectedPurchaseOrderInputColumns.map((column) => (
                        <label key={`purchase-draft-${column}`} className="grid gap-1 text-xs font-bold text-[#60717d]">
                          {selectedPurchaseOrder.templateKey === 'doorSet' ? doorPurchaseDraftColumnLabel(column) : purchaseOrderColumnLabel(selectedPurchaseOrderLabels, column)}
                          {column === 'quantity' ? (
                            <NumberTextInput value={purchaseItemDraft.quantity} onChange={(value) => setPurchaseItemDraft((current) => ({ ...current, quantity: value }))} className="w-full min-w-0 bg-white text-sm font-semibold" />
                          ) : column === 'category' ? (
                            <>
                              <input list="purchase-category-options" value={purchaseItemDraft.category} onChange={(event) => setPurchaseItemDraft((current) => ({ ...current, category: event.target.value }))} placeholder={selectedPurchaseOrder.templateKey === 'doorSet' ? '예: 1, 2, 평판, 걸레받이, 기타' : undefined} className="min-w-0 rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-[#38a9bd]" />
                              <datalist id="purchase-category-options">
                                {purchaseCategoryOptions.map((category) => (
                                  <option key={category} value={category} />
                                ))}
                              </datalist>
                            </>
                          ) : column === 'unit' ? (
                            <>
                              <input
                                list="purchase-unit-options"
                                value={purchaseItemDraft.unit}
                                onChange={(event) => setPurchaseItemDraft((current) => ({ ...current, unit: event.target.value }))}
                                placeholder={selectedPurchaseOrder.templateKey === 'doorSet' ? '프레임 옵션 / 단위' : undefined}
                                className="min-w-0 rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-[#38a9bd]"
                              />
                              <datalist id="purchase-unit-options">
                                {purchaseUnitOptions.map((unit) => (
                                  <option key={unit} value={unit} />
                                ))}
                              </datalist>
                            </>
                          ) : (
                            <input
                              value={column === 'modelName' ? purchaseItemDraft.modelName : purchaseItemDraft.spec}
                              onChange={(event) => {
                                const value = event.target.value;
                                setPurchaseItemDraft((current) => ({
                                  ...current,
                                  ...(column === 'modelName' ? { modelName: value } : { spec: value }),
                                }));
                              }}
                              placeholder={selectedPurchaseOrder.templateKey === 'doorSet' ? (column === 'modelName' ? '프레임 규격 / 단일 규격' : column === 'spec' ? '도어 규격 / 행거 모델' : '프레임 옵션') : undefined}
                              className="min-w-0 rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-[#38a9bd]"
                            />
                          )}
                        </label>
                      ))}
                      {selectedPurchaseOrder.templateKey !== 'doorSet' && (
                        <>
                          <label className="grid gap-1 text-xs font-bold text-[#60717d]">
                            {selectedPurchaseOrderLabels.unitPrice}
                            <NumberTextInput value={purchaseItemDraft.unitPrice} onChange={(value) => setPurchaseItemDraft((current) => ({ ...current, unitPrice: value }))} className="w-full min-w-0 bg-white text-sm font-semibold" />
                          </label>
                          <div className="min-w-0 rounded-md border border-[#edf2f5] bg-white px-3 py-2">
                            <p className="text-[11px] font-bold text-[#60717d]">{selectedPurchaseOrderLabels.amount}</p>
                            <p title={formatMoney(purchaseItemDraft.quantity * purchaseItemDraft.unitPrice)} className="mt-1 truncate font-semibold">
                              {formatCompactMoney(purchaseItemDraft.quantity * purchaseItemDraft.unitPrice)}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                    <label className="mt-2 grid gap-1 text-xs font-bold text-[#60717d]">
                      {selectedPurchaseOrder.templateKey === 'doorSet' ? '도어 옵션 / 기타 내용' : '비고'}
                      <input value={purchaseItemDraft.note} onChange={(event) => setPurchaseItemDraft((current) => ({ ...current, note: event.target.value }))} placeholder={selectedPurchaseOrder.templateKey === 'doorSet' ? '예: 실린더타공, 오목이/하부홈가공, 기타 부속 일체' : '비고'} className="w-full rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm outline-none focus:border-[#38a9bd]" />
                    </label>
                    {selectedPurchaseOrder.templateKey === 'doorSet' && (
                      <p className="mt-2 text-xs leading-5 text-[#60717d]">
                        번호만 입력하면 프레임/도어 2줄 세트로 표시됩니다. 두 가지 이상 모델은 세트 모델명을 각 항목마다 입력하고, 평판·걸레받이는 단일 규격 칸만 사용합니다. 기타는 도어 옵션/기타 내용이 한 줄로 병합됩니다.
                      </p>
                    )}
                  </div>

                  <div className="mt-5 overflow-hidden rounded-lg border border-[#171512] bg-white">
                    <div className="grid grid-cols-[1fr_auto] border-b border-[#171512]">
                      <h3 className="py-3 text-center text-2xl font-bold tracking-[0.35em]">발 주 서</h3>
                      <div className="border-l border-[#171512] px-6 py-3 font-semibold">위브디자인</div>
                    </div>
                    {selectedPurchaseOrder.templateKey === 'doorSet' ? (
                      <DoorPurchaseOrderTable order={selectedPurchaseOrder} onEdit={editPurchaseOrderItem} />
                    ) : (
                      <table className="w-full table-fixed border-collapse text-sm">
                        <colgroup>
                          {selectedPurchaseOrderVisibleColumns.map((column) => (
                            <col key={column} className={purchaseOrderColumnWidths[column]} style={{ width: `${purchaseOrderColumnWidth(selectedPurchaseOrder, column)}%` }} />
                          ))}
                        </colgroup>
                        <thead className="bg-[#f3f1ec]">
                          {renderPurchaseOrderHeaderRows(selectedPurchaseOrder, selectedPurchaseOrderLabels, selectedPurchaseOrderVisibleColumns)}
                        </thead>
                        <tbody>
                          {selectedPurchaseOrder.items.length === 0 ? (
                            <tr>
                              <td className="border border-[#171512] px-3 py-8 text-center text-[#60717d]" colSpan={selectedPurchaseOrderVisibleColumns.length}>작성된 발주 항목이 없습니다.</td>
                            </tr>
                          ) : selectedPurchaseOrder.mergeSameCategory ? (
                            renderGroupedPurchaseRows(selectedPurchaseOrder.items, editPurchaseOrderItem, selectedPurchaseOrderVisibleColumns, selectedPurchaseOrder)
                          ) : (
                            selectedPurchaseOrder.items.map((item) => (
                              <tr key={`summary-${item.id}`} onDoubleClick={() => editPurchaseOrderItem(item)} className="cursor-pointer hover:bg-[#fff8e8]">
                                {selectedPurchaseOrderVisibleColumns.map((column) => (
                                  <td key={`${item.id}-${column}`} className={purchaseOrderCellClass(column, selectedPurchaseOrder)}>
                                    {renderPurchaseOrderCell(item, column)}
                                  </td>
                                ))}
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>
                    </div>

                    <aside className="h-fit rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-4 shadow-sm 2xl:sticky 2xl:top-24">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#38a9bd]">ORDER INFO</p>
                          <h3 className="mt-1 text-lg font-semibold">발주 정보</h3>
                        </div>
                        <button type="button" onClick={() => deletePurchaseOrder(selectedPurchaseOrder.id)} className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600">
                          <Trash2 size={14} />
                          삭제
                        </button>
                      </div>
                      <div className="mt-4 grid gap-3">
                        <label className="grid gap-1 text-xs font-bold text-[#60717d]">
                          발주서명
                          <input value={selectedPurchaseOrder.title} onChange={(event) => updatePurchaseOrder(selectedPurchaseOrder.id, { title: event.target.value })} className="min-w-0 rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm text-[#171512] outline-none focus:border-[#38a9bd]" />
                        </label>
                        <label className="grid gap-1 text-xs font-bold text-[#60717d]">
                          업체명
                          <input list="estimate-vendors" value={selectedPurchaseOrder.vendorName} onChange={(event) => updatePurchaseOrder(selectedPurchaseOrder.id, { vendorName: event.target.value })} className="min-w-0 rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm text-[#171512] outline-none focus:border-[#38a9bd]" />
                        </label>
                        <label className="grid gap-1 text-xs font-bold text-[#60717d]">
                          발주일
                          <input type="date" value={selectedPurchaseOrder.orderDate} onChange={(event) => updatePurchaseOrder(selectedPurchaseOrder.id, { orderDate: event.target.value })} className="min-w-0 rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm text-[#171512] outline-none focus:border-[#38a9bd]" />
                        </label>
                        <label className="grid gap-1 text-xs font-bold text-[#60717d]">
                          입고 예정일
                          <input type="date" value={selectedPurchaseOrder.deliveryDate} onChange={(event) => updatePurchaseOrder(selectedPurchaseOrder.id, { deliveryDate: event.target.value })} className="min-w-0 rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm text-[#171512] outline-none focus:border-[#38a9bd]" />
                        </label>
                        <label className="grid gap-1 text-xs font-bold text-[#60717d]">
                          메모
                          <textarea value={selectedPurchaseOrder.memo} onChange={(event) => updatePurchaseOrder(selectedPurchaseOrder.id, { memo: event.target.value })} rows={5} className="min-w-0 resize-none rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm text-[#171512] outline-none focus:border-[#38a9bd]" />
                        </label>
                        <div className="border-t border-[#d5dde2] pt-3">
                          <label className="grid gap-1 text-xs font-bold text-[#60717d]">
                            발주서 템플릿
                            <select value={selectedPurchaseOrder.templateKey} onChange={(event) => updatePurchaseOrderTemplate(selectedPurchaseOrder.id, event.target.value as PurchaseOrder['templateKey'])} className="min-w-0 rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm text-[#171512] outline-none focus:border-[#38a9bd]">
                              <option value="modelSpec">템플릿1 · 구분/모델명/규격</option>
                              <option value="subType">템플릿2 · 구분 통합/종류</option>
                              <option value="doorSet">도어 템플릿 · 프레임/도어 세트</option>
                              <option value="custom">사용자 지정</option>
                            </select>
                          </label>
                          {selectedPurchaseOrder.templateKey === 'doorSet' && (
                            <div className="mt-3 grid gap-2 rounded-md border border-[#d5dde2] bg-white p-3">
                              <p className="text-xs font-bold text-[#171512]">도어 상단 정보</p>
                              <label className="grid gap-1 text-[11px] font-bold text-[#60717d]">
                                모델명
                                <input value={selectedPurchaseOrder.doorModelName || ''} onChange={(event) => updatePurchaseOrder(selectedPurchaseOrder.id, { doorModelName: event.target.value })} placeholder="예: TA-13" className="min-w-0 rounded-md border border-[#d5dde2] bg-white px-2 py-2 text-xs text-[#171512] outline-none focus:border-[#38a9bd]" />
                              </label>
                              <label className="grid gap-1 text-[11px] font-bold text-[#60717d]">
                                마감/필름
                                <input value={selectedPurchaseOrder.doorFinish || ''} onChange={(event) => updatePurchaseOrder(selectedPurchaseOrder.id, { doorFinish: event.target.value })} placeholder="예: 필름" className="min-w-0 rounded-md border border-[#d5dde2] bg-white px-2 py-2 text-xs text-[#171512] outline-none focus:border-[#38a9bd]" />
                              </label>
                              <label className="grid gap-1 text-[11px] font-bold text-[#60717d]">
                                업체/코드
                                <input value={selectedPurchaseOrder.doorBrand || ''} onChange={(event) => updatePurchaseOrder(selectedPurchaseOrder.id, { doorBrand: event.target.value })} placeholder="예: 영림83" className="min-w-0 rounded-md border border-[#d5dde2] bg-white px-2 py-2 text-xs text-[#171512] outline-none focus:border-[#38a9bd]" />
                              </label>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const preset = purchaseOrderTemplatePresets.find((item) => item.id === selectedPurchaseTemplatePresetId);
                              setPurchaseTemplateNameDraft(preset?.name || selectedPurchaseOrder.title || '');
                              setIsPurchaseTemplateEditorOpen(true);
                            }}
                            className="mt-3 w-full rounded-md border border-[#171512] bg-white px-3 py-2 text-xs font-semibold text-[#171512] transition hover:bg-[#171512] hover:text-white"
                          >
                            템플릿 수정
                          </button>
                          <div className="mt-3 rounded-md border border-[#d5dde2] bg-white p-3 text-xs leading-5 text-[#60717d]">
                            <p>
                              <b className="text-[#171512]">표시 열</b> · {selectedPurchaseOrderVisibleColumns.map((column) => purchaseOrderColumnLabel(selectedPurchaseOrderLabels, column)).join(', ')}
                            </p>
                            <p>
                              <b className="text-[#171512]">머리글 병합</b> · {purchaseOrderHeaderMergeRange(selectedPurchaseOrder, selectedPurchaseOrderVisibleColumns)?.label || '없음'}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 rounded-lg border border-[#edf2f5] bg-white p-3">
                        <p className="text-[11px] font-bold text-[#60717d]">현재 발주 금액</p>
                        <p title={formatMoney(selectedPurchaseOrder.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0))} className="mt-1 text-xl font-bold text-[#171512]">
                          {formatCompactMoney(selectedPurchaseOrder.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0))}
                        </p>
                      </div>
                    </aside>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-[#d5dde2] bg-[#f7fafb] p-10 text-center text-sm text-[#60717d]">발주서를 추가해주세요.</div>
              )}
            </section>
          </section>
        )}

        {activeTab === 'extras' && (
          <section className="rounded-lg border border-[#d5dde2] bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">추가 사항</h2>
                <p className="mt-1 text-sm leading-6 text-[#60717d]">공사 중 발생한 추가 비용을 기록합니다. 실제 마진 계산에 반영됩니다.</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-2">
                  <p className="text-[11px] font-bold text-[#60717d]">추가 비용 합계</p>
                  <p title={formatMoney(totals.additionalCostTotal)} className="text-xl font-bold text-red-600">{formatCompactMoney(totals.additionalCostTotal)}</p>
                </div>
                <button type="button" onClick={submitExtraItem} className="inline-flex items-center gap-2 rounded-md bg-[#171512] px-4 py-2 font-semibold text-white">
                  <Plus size={16} />
                  {editingExtraItemId ? '수정 반영' : '항목 추가'}
                </button>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border border-[#171512]">
              <h3 className="border-b border-[#171512] py-3 text-center text-2xl font-bold tracking-[0.3em]">추가 사항</h3>
              <div className="grid gap-3 bg-[#f7fafb] p-3">
                <article className="rounded-lg border border-[#d5dde2] bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{editingExtraItemId ? '추가 항목 수정' : '추가 항목 입력'}</h3>
                      <p className="mt-1 text-xs text-[#60717d]">항목을 추가하면 아래 양식에 들어가고 입력란은 초기화됩니다.</p>
                    </div>
                    {editingExtraItemId && (
                      <button type="button" onClick={() => deleteExtraItem(editingExtraItemId)} className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600">
                        <Trash2 size={14} />
                        선택 항목 삭제
                      </button>
                    )}
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(150px,1.2fr)_minmax(130px,1fr)_72px_82px_110px_120px] xl:items-end">
                    <label className="grid gap-1 text-xs font-bold text-[#60717d]">
                      품명
                      <input value={extraItemDraft.name} onChange={(event) => setExtraItemDraft((current) => ({ ...current, name: event.target.value }))} className="min-w-0 rounded-md border border-[#d5dde2] px-3 py-2 text-sm font-semibold outline-none focus:border-[#38a9bd]" />
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-[#60717d]">
                      규격
                      <input value={extraItemDraft.spec} onChange={(event) => setExtraItemDraft((current) => ({ ...current, spec: event.target.value }))} className="min-w-0 rounded-md border border-[#d5dde2] px-3 py-2 text-sm font-semibold outline-none focus:border-[#38a9bd]" />
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-[#60717d]">
                      단위
                      <input value={extraItemDraft.unit} onChange={(event) => setExtraItemDraft((current) => ({ ...current, unit: event.target.value }))} className="min-w-0 rounded-md border border-[#d5dde2] px-3 py-2 text-sm font-semibold outline-none focus:border-[#38a9bd]" />
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-[#60717d]">
                      수량
                      <NumberTextInput value={extraItemDraft.quantity} onChange={(value) => setExtraItemDraft((current) => ({ ...current, quantity: value }))} className="w-full min-w-0 bg-white text-sm font-semibold" />
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-[#60717d]">
                      단가
                      <NumberTextInput value={extraItemDraft.unitPrice} onChange={(value) => setExtraItemDraft((current) => ({ ...current, unitPrice: value }))} className="w-full min-w-0 bg-white text-sm font-semibold" />
                    </label>
                    <div className="min-w-0 rounded-md border border-[#edf2f5] bg-[#f7fafb] px-3 py-2">
                      <p className="text-[11px] font-bold text-[#60717d]">금액</p>
                      <p title={formatMoney(extraItemDraft.quantity * extraItemDraft.unitPrice)} className="truncate font-semibold">{formatCompactMoney(extraItemDraft.quantity * extraItemDraft.unitPrice)}</p>
                    </div>
                  </div>
                </article>

                <table className="w-full table-fixed border-collapse bg-white text-sm">
                  <colgroup>
                    <col className="w-[28%]" />
                    <col className="w-[20%]" />
                    <col className="w-[8%]" />
                    <col className="w-[8%]" />
                    <col className="w-[16%]" />
                    <col className="w-[20%]" />
                  </colgroup>
                  <thead className="bg-[#e8e7f8]">
                    <tr>
                      {['품명', '규격', '단위', '수량', '단가', '금액'].map((header) => (
                        <th key={header} className="border border-[#171512] px-3 py-2 text-center">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {extraItems.length === 0 ? (
                      <tr>
                        <td className="border border-[#171512] px-3 py-8 text-center text-[#60717d]" colSpan={6}>작성된 추가 항목이 없습니다.</td>
                      </tr>
                    ) : (
                      extraItems.map((item, index) => (
                        <tr key={item.id} onDoubleClick={() => editExtraItem(item)} className="cursor-pointer hover:bg-[#fff8e8]">
                          <td className="break-words border border-[#171512] px-2 py-2">{index + 1}. {item.name}</td>
                          <td className="break-words border border-[#171512] px-2 py-2 text-center">{item.spec}</td>
                          <td className="break-words border border-[#171512] px-2 py-2 text-center">{item.unit}</td>
                          <td className="break-all border border-[#171512] px-2 py-2 text-right tabular-nums">{formatNumber(item.quantity)}</td>
                          <td className="break-all border border-[#171512] px-2 py-2 text-right tabular-nums">{formatPlainNumber(item.unitPrice)}</td>
                          <td className="break-all border border-[#171512] px-2 py-2 text-right tabular-nums">{formatPlainNumber(item.quantity * item.unitPrice)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-[1fr_220px] border-t border-[#171512] bg-[#f8e8da] text-lg font-bold">
                <div className="px-4 py-3 text-center">합계</div>
                <div title={formatMoney(totals.additionalCostTotal)} className="border-l border-[#171512] px-4 py-3 text-right">{formatMoney(totals.additionalCostTotal)}</div>
              </div>
              <div className="grid grid-cols-[1fr_220px] border-t border-[#171512] bg-[#eeeeee] text-lg font-bold">
                <div className="px-4 py-3 text-center">총합계</div>
                <div title={formatMoney(totals.additionalCostTotal)} className="border-l border-[#171512] px-4 py-3 text-right">{formatMoney(totals.additionalCostTotal)}</div>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'documents' && (
          <section className="grid gap-5 xl:grid-cols-[0.4fr_1.6fr]">
            <div className="no-print rounded-lg border border-[#d5dde2] bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold">서류 출력</h2>
              <p className="mt-2 text-sm leading-6 text-[#60717d]">
                기존 엑셀의 `표지(견)`, `갑지`, `세부내역서` 흐름에 맞춰 같은 데이터로 서류를 나눠 확인합니다.
              </p>
              <UnnamedPricedLinesWarning count={unnamedPricedCount} className="mt-4" />
              <div className="mt-5 grid gap-2">
                {([
                  ['cover', '표지'],
                  ['summary', '갑지'],
                  ['detail', '세부내역서'],
                  ...purchaseOrders.map((order) => [`purchase:${order.id}`, `발주서 - ${order.title || order.vendorName || '무제'}`]),
                ] as [string, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setDocumentView(key);
                      setDocumentDetailPageIndex(0);
                    }}
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
              <button type="button" onClick={() => setIsDocumentBatchOpen(true)} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#171512] bg-white px-5 py-3 font-semibold text-[#171512]">
                <FileSpreadsheet size={17} />
                여러 서류 선택 출력
              </button>
            </div>
            {!isDocumentBatchOpen && (
              <div className="min-w-0">
                <div className="relative">
                  {documentPurchaseOrder ? (
                    <article id="estimate-print" className="rounded-lg border border-[#d5dde2] bg-white p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
                      <PurchaseOrderPrintPage order={documentPurchaseOrder} site={selectedSite} />
                    </article>
                  ) : (
                    <LandscapeEstimateDocumentPreview site={selectedSite} lines={lines} totals={totals} versionLabel={versionLabel} view={estimateDocumentView} detailPreviewPageIndex={documentDetailPageIndex} />
                  )}
                  {documentView === 'detail' && detailPreviewPages.length > 1 && (
                    <div className="no-print pointer-events-none absolute inset-0 flex items-center justify-between px-4">
                      <button
                        type="button"
                        onClick={() => setDocumentDetailPageIndex((current) => Math.max(0, current - 1))}
                        disabled={documentDetailPageIndex === 0}
                        aria-label="이전 세부내역서 페이지"
                        className="pointer-events-auto inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#d5dde2] bg-white/95 text-[#171512] shadow-lg transition hover:border-[#38a9bd] hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <ChevronLeft size={24} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDocumentDetailPageIndex((current) => Math.min(detailPreviewPages.length - 1, current + 1))}
                        disabled={documentDetailPageIndex >= detailPreviewPages.length - 1}
                        aria-label="다음 세부내역서 페이지"
                        className="pointer-events-auto inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#d5dde2] bg-white/95 text-[#171512] shadow-lg transition hover:border-[#38a9bd] hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <ChevronRight size={24} />
                      </button>
                    </div>
                  )}
                </div>
                {documentView === 'detail' && (
                  <div className="mt-4 rounded-lg border border-dashed border-[#cbd6dc] bg-white p-4 text-sm text-[#60717d]">
                    <button type="button" onClick={() => setIsDocumentBatchOpen(true)} className="inline-flex items-center gap-2 rounded-md border border-[#171512] bg-white px-4 py-2 font-semibold text-[#171512]">
                      <FileSpreadsheet size={16} />
                      서류 불러오기
                    </button>
                    <span className="ml-3">공정 일정, 발주서, 추가 사항을 선택해 같은 디자인으로 함께 출력합니다.</span>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </section>

      {isTemplateManagerOpen && (
        <TemplateManager
          api={(query) => fetchEstimateApi(query) as Promise<TemplateApiData>}
          post={postEstimateApi}
          materials={materials}
          sites={sites}
          spaceOptions={defaultSpaces}
          categoryOptions={estimateCategories}
          pickFromDb={openTemplateMaterialPicker}
          newLineId={() => emptyLine().id}
          onClose={() => setIsTemplateManagerOpen(false)}
        />
      )}

      {isTemplateSaveOpen && (
        <SaveAsTemplateDialog
          api={(query) => fetchEstimateApi(query) as Promise<TemplateApiData>}
          post={postEstimateApi}
          lines={lines}
          isBase={isBaseEstimateLine}
          newLineId={() => emptyLine().id}
          onClose={() => setIsTemplateSaveOpen(false)}
        />
      )}

      {isTemplateLoadOpen && (
        <TemplateLoadDialog
          api={(query) => fetchEstimateApi(query) as Promise<TemplateApiData>}
          materials={materials}
          ensureLatestMaterials={ensureLatestMaterials}
          currentLines={lines}
          newLineId={() => emptyLine().id}
          onApply={applyTemplateLines}
          onClose={() => setIsTemplateLoadOpen(false)}
        />
      )}

      {materialPicker && (
        <MaterialPickerModal
          state={materialPicker}
          materials={orderedMaterials}
          library={dbLibrary}
          estimateCategories={estimateCategories}
          estimateItems={estimateItems}
          onLibraryChange={(library) => {
            changeDbLibrary(library);
            setMaterialPicker((current) => (current ? { ...current, step: 'category', category: '', process: '', search: '' } : current));
          }}
          onChange={setMaterialPicker}
          onChooseCategory={choosePickerCategory}
          onChooseProcess={choosePickerProcess}
          onChooseMaterial={choosePickerMaterial}
          onChooseCommonOptions={choosePickerCommonOptions}
          onSaveMaterial={saveMaterial}
          onClose={() => setMaterialPicker(null)}
        />
      )}

      {commonBulkAdd && (
        <CommonBulkAddDialog
          material={commonBulkAdd.material}
          category={commonBulkAdd.category}
          options={commonBulkAdd.options}
          firstRowSpace={commonBulkAdd.space}
          replacedLine={commonBulkAdd.replacedLine}
          returnFocusTo={commonBulkAdd.opener}
          spaceOptions={defaultSpaces}
          onCancel={() => setCommonBulkAdd(null)}
          onAdd={addCommonBulkLines}
        />
      )}

      {leaveGuard && (
        <div className="no-print fixed inset-0 z-[60] flex items-center justify-center bg-[#171512]/45 px-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="leave-guard-title" className="w-full max-w-md rounded-xl border border-[#d5dde2] bg-white p-6 shadow-2xl">
            <h2 id="leave-guard-title" className="text-xl font-semibold">저장하지 않은 변경 사항이 있습니다</h2>
            <p className="mt-2 text-sm leading-6 text-[#60717d]">지금 견적 작업 내용을 저장할까요? 저장하지 않으면 바뀐 내용이 사라집니다.</p>
            <div className="mt-5 grid gap-2">
              <button
                type="button"
                disabled={isSaving}
                onClick={async () => {
                  const { proceed } = leaveGuard;
                  if (await saveEstimate()) {
                    setLeaveGuard(null);
                    proceed();
                  }
                }}
                className="rounded-md bg-[#171512] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                저장하고 계속
              </button>
              <button
                type="button"
                onClick={() => {
                  const { proceed } = leaveGuard;
                  setLeaveGuard(null);
                  proceed();
                }}
                className="rounded-md border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600"
              >
                저장하지 않고 계속
              </button>
              <button type="button" onClick={() => setLeaveGuard(null)} className="rounded-md border border-[#d5dde2] bg-white px-4 py-2.5 text-sm font-semibold">
                취소
              </button>
            </div>
            {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
          </section>
        </div>
      )}

      {saveConflict && (
        <div className="no-print fixed inset-0 z-[70] flex items-center justify-center bg-[#171512]/45 px-4 backdrop-blur-sm">
          <section role="alertdialog" aria-modal="true" aria-labelledby="save-conflict-title" className="w-full max-w-md rounded-xl border border-[#d5dde2] bg-white p-6 shadow-2xl">
            <h2 id="save-conflict-title" className="text-xl font-semibold">
              {saveConflict === 'deleted' ? '이 견적 버전은 다른 곳에서 삭제되었습니다' : '다른 컴퓨터에서 먼저 저장했습니다'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#60717d]">
              {saveConflict === 'deleted'
                ? '지금 화면의 내용은 아직 그대로 있습니다. 새 버전으로 저장하면 이 내용이 새 견적 버전으로 남습니다.'
                : '이 화면을 연 뒤 같은 버전이 다른 곳에서 저장되었습니다. 그대로 저장하면 그 내용이 사라지므로 덮어쓰지 않았습니다. 지금 화면의 내용은 그대로 있습니다.'}
            </p>
            <div className="mt-5 grid gap-2">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void saveEstimate({ asNewVersion: true })}
                className="rounded-md bg-[#171512] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                지금 내용을 새 버전으로 저장
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => {
                  if (window.confirm('지금 화면에서 저장하지 않은 내용이 사라집니다. 저장된 최신 내용을 불러올까요?')) void reloadAfterConflict();
                }}
                className="rounded-md border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 disabled:opacity-60"
              >
                {saveConflict === 'deleted' ? '내 변경을 버리고 목록 다시 불러오기' : '내 변경을 버리고 최신 내용 불러오기'}
              </button>
              <button type="button" onClick={() => setSaveConflict(null)} className="rounded-md border border-[#d5dde2] bg-white px-4 py-2.5 text-sm font-semibold">
                닫기
              </button>
            </div>
            {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
          </section>
        </div>
      )}

      {isBulkMoveOpen && (
        <EstimateBulkMoveModal
          materials={orderedMaterials}
          estimateCategories={estimateCategories}
          estimateItems={estimateItems}
          isSaving={isSaving}
          errorText={error}
          onSubmit={moveMaterialsToEstimate}
          onPromptNewCategory={promptNewEstimateCategory}
          onClose={() => setIsBulkMoveOpen(false)}
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

      {isLegacyWorkModalOpen && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#171512]/45 px-4 py-6 backdrop-blur-sm">
          <section className="flex max-h-[86vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-[#d5dde2] bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-[#edf2f5] p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#38a9bd]">LEGACY LEDGER</p>
                <h2 className="mt-1 text-2xl font-semibold">과거 실행 내역서</h2>
                <p className="mt-1 text-sm text-[#60717d]">엑셀 시트명을 현장명으로 저장해 두고 필요할 때 실행 내역만 확인합니다.</p>
              </div>
              <button type="button" onClick={() => setIsLegacyWorkModalOpen(false)} className="rounded-full border border-[#d5dde2] p-2 text-[#60717d] hover:bg-[#f7fafb]">
                <X size={18} />
              </button>
            </header>
            <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)]">
              <aside className="min-h-0 overflow-y-auto border-r border-[#edf2f5] bg-[#f7fafb] p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <b className="text-sm">현장 목록</b>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#60717d]">{legacyWorkSites.length}개</span>
                </div>
                <input
                  value={legacyWorkSearch}
                  onChange={(event) => setLegacyWorkSearch(event.target.value)}
                  placeholder="현장명 검색"
                  className="mb-3 w-full rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm outline-none focus:border-[#38a9bd]"
                />
                <div className="grid gap-2">
                  {legacyWorkSites.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[#d5dde2] bg-white p-6 text-center text-sm text-[#60717d]">불러온 과거 실행 내역서가 없습니다.</div>
                  ) : filteredLegacyWorkSites.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[#d5dde2] bg-white p-6 text-center text-sm text-[#60717d]">검색 결과가 없습니다.</div>
                  ) : (
                    filteredLegacyWorkSites.map((site) => (
                      <button
                        key={site.id}
                        type="button"
                        onClick={() => setSelectedLegacyWorkSiteId(site.id)}
                        className={`rounded-lg border p-3 text-left ${selectedLegacyWorkSite?.id === site.id ? 'border-[#38a9bd] bg-white shadow-sm' : 'border-[#d5dde2] bg-white/70'}`}
                      >
                        <p className="truncate font-semibold">{site.siteName}</p>
                        <p className="mt-1 text-xs text-[#60717d]">{site.rows.length}개 행</p>
                      </button>
                    ))
                  )}
                </div>
              </aside>
              <div className="min-h-0 overflow-auto p-5">
                {selectedLegacyWorkSite ? (
                  <>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xl font-semibold">{selectedLegacyWorkSite.siteName}</h3>
                        <p className="mt-1 text-sm text-[#60717d]">
                          수입 {formatMoney(selectedLegacyWorkSite.rows.reduce((sum, row) => sum + Number(row.income || 0), 0))} · 지출 {formatMoney(selectedLegacyWorkSite.rows.reduce((sum, row) => sum + Number(workLineExpense(row) || 0), 0))}
                        </p>
                      </div>
                      <button type="button" onClick={exportWorkExcel} className="rounded-md border border-[#d5dde2] bg-white px-4 py-2 text-sm font-semibold">
                        전체 엑셀 내보내기
                      </button>
                    </div>
                    <div className="overflow-hidden rounded-lg border border-[#d5dde2]">
                      <table className="w-full table-fixed border-collapse text-sm">
                        <colgroup>
                          <col className="w-[14%]" />
                          <col className="w-[22%]" />
                          <col className="w-[14%]" />
                          <col className="w-[14%]" />
                          <col className="w-[14%]" />
                          <col className="w-[22%]" />
                        </colgroup>
                        <thead className="bg-[#f3f1ec]">
                          <tr>
                            {['날짜', '공종', '수입', '지출', '결제', '비고'].map((header) => (
                              <th key={header} className="border-b border-[#d5dde2] px-3 py-2 text-left font-semibold">{header}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedLegacyWorkSite.rows.map((row) => (
                            <tr key={row.id} className="border-t border-[#edf2f5]">
                              <td className="px-3 py-2">{row.date || '-'}</td>
                              <td className="truncate px-3 py-2 font-semibold">{row.process || '-'}</td>
                              <td className="px-3 py-2 text-right">{formatMoney(row.income || 0)}</td>
                              <td className="px-3 py-2 text-right">{formatMoney(workLineExpense(row))}</td>
                              <td className="px-3 py-2 text-right">{formatMoney(row.payment || 0)}</td>
                              <td className="truncate px-3 py-2 text-[#60717d]">{row.note || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-[#d5dde2] bg-[#f7fafb] p-10 text-center text-sm text-[#60717d]">과거 실행 내역서 엑셀을 먼저 불러와주세요.</div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {isPurchaseTemplateEditorOpen && selectedPurchaseOrder && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#171512]/45 px-4 py-6 backdrop-blur-sm">
          <section className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-[#d5dde2] bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-[#edf2f5] p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#38a9bd]">PURCHASE TEMPLATE</p>
                <h2 className="mt-1 text-2xl font-semibold">발주서 템플릿 수정</h2>
                <p className="mt-1 text-sm text-[#60717d]">열 이름, 너비, 표시 여부와 머리글 병합을 조정합니다. 항목 데이터 칸은 병합하지 않습니다.</p>
              </div>
              <button type="button" onClick={() => setIsPurchaseTemplateEditorOpen(false)} className="rounded-full border border-[#d5dde2] p-2 text-[#60717d] hover:bg-[#f7fafb]">
                <X size={18} />
              </button>
            </header>
            <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(0,1.3fr)_360px]">
              <div className="min-h-0 overflow-auto p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">미리보기</h3>
                    <p className="mt-1 text-sm text-[#60717d]">머리글 병합은 상단 제목 셀에만 적용됩니다. 행 데이터는 각 열에 그대로 남습니다.</p>
                  </div>
                  <label className="inline-flex items-center gap-2 rounded-full border border-[#d5dde2] bg-[#f7fafb] px-3 py-2 text-xs font-semibold text-[#171512]">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedPurchaseOrder.mergeSameCategory)}
                      onChange={(event) => updatePurchaseOrderMergeSameCategory(selectedPurchaseOrder.id, event.target.checked)}
                      className="h-4 w-4 rounded border-[#d5dde2]"
                    />
                    같은 구분 자동 병합
                  </label>
                </div>
                <div className="overflow-hidden rounded-lg border border-[#171512] bg-white">
                  <div className="grid grid-cols-[1fr_auto] border-b border-[#171512]">
                    <h3 className="py-3 text-center text-2xl font-bold tracking-[0.35em]">발 주 서</h3>
                    <div className="border-l border-[#171512] px-6 py-3 font-semibold">위브디자인</div>
                  </div>
                  {selectedPurchaseOrder.templateKey === 'doorSet' ? (
                    <DoorPurchaseOrderTable order={{ ...selectedPurchaseOrder, items: selectedPurchaseOrder.items.length ? selectedPurchaseOrder.items.slice(0, 4) : [purchaseItemDraft] }} />
                  ) : (
                    <table className="w-full table-fixed border-collapse text-sm">
                      <colgroup>
                        {selectedPurchaseOrderVisibleColumns.map((column) => (
                          <col key={column} style={{ width: `${purchaseOrderColumnWidth(selectedPurchaseOrder, column)}%` }} />
                        ))}
                      </colgroup>
                      <thead className="bg-[#f3f1ec]">
                        {renderPurchaseOrderHeaderRows(selectedPurchaseOrder, selectedPurchaseOrderLabels, selectedPurchaseOrderVisibleColumns)}
                      </thead>
                      <tbody>
                        {(selectedPurchaseOrder.items.length ? selectedPurchaseOrder.items.slice(0, 6) : [purchaseItemDraft]).map((item, index) => (
                          <tr key={`purchase-template-preview-${item.id || index}`}>
                            {selectedPurchaseOrderVisibleColumns.map((column) => (
                              <td key={`${item.id || index}-${column}`} className={purchaseOrderCellClass(column, selectedPurchaseOrder)}>
                                {renderPurchaseOrderCell(item, column)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="mt-4 rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-4 text-sm leading-6 text-[#60717d]">
                  <b className="text-[#171512]">사용 방법</b>
                  <p>열 머리글 병합에서 병합할 열을 2개 이상 선택하고 병합 제목을 입력하면, 표의 머리글만 하나로 합쳐집니다.</p>
                </div>
              </div>

              <aside className="min-h-0 overflow-y-auto border-l border-[#edf2f5] bg-[#f7fafb] p-5">
                <div className="grid gap-4">
                  <div className="rounded-lg border border-[#d5dde2] bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-bold text-[#171512]">저장 템플릿</p>
                      <span className="text-[11px] font-semibold text-[#60717d]">{purchaseOrderTemplatePresets.length}개</span>
                    </div>
                    <label className="mt-3 grid gap-1 text-[11px] font-bold text-[#60717d]">
                      템플릿 선택
                      <select
                        value={selectedPurchaseTemplatePresetId}
                        onChange={(event) => {
                          const presetId = event.target.value;
                          const preset = purchaseOrderTemplatePresets.find((item) => item.id === presetId);
                          setSelectedPurchaseTemplatePresetId(presetId);
                          setPurchaseTemplateNameDraft(preset?.name || '');
                        }}
                        className="min-w-0 rounded-md border border-[#d5dde2] bg-white px-2 py-2 text-xs text-[#171512] outline-none focus:border-[#38a9bd]"
                      >
                        {purchaseOrderTemplatePresets.map((preset) => (
                          <option key={preset.id} value={preset.id}>{preset.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="mt-2 grid gap-1 text-[11px] font-bold text-[#60717d]">
                      템플릿 이름
                      <input
                        value={purchaseTemplateNameDraft}
                        onChange={(event) => setPurchaseTemplateNameDraft(event.target.value)}
                        placeholder="예: 욕실 발주 템플릿"
                        className="min-w-0 rounded-md border border-[#d5dde2] bg-white px-2 py-2 text-xs text-[#171512] outline-none focus:border-[#38a9bd]"
                      />
                    </label>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => applyPurchaseOrderPreset(selectedPurchaseOrder.id, selectedPurchaseTemplatePresetId)}
                        className="rounded-md border border-[#d5dde2] bg-[#f7fafb] px-2 py-2 text-[11px] font-semibold text-[#171512]"
                      >
                        불러오기
                      </button>
                      <button
                        type="button"
                        onClick={() => savePurchaseOrderPreset(selectedPurchaseOrder)}
                        className="rounded-md bg-[#171512] px-2 py-2 text-[11px] font-semibold text-white"
                      >
                        저장/수정
                      </button>
                      <button
                        type="button"
                        onClick={() => addPurchaseOrderPreset(selectedPurchaseOrder)}
                        className="rounded-md border border-[#d5dde2] bg-white px-2 py-2 text-[11px] font-semibold text-[#171512]"
                      >
                        추가
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePurchaseOrderPreset(selectedPurchaseTemplatePresetId)}
                        disabled={purchaseOrderTemplatePresets.length <= 1}
                        className="rounded-md border border-red-200 bg-white px-2 py-2 text-[11px] font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        삭제
                      </button>
                    </div>
                  </div>

                  <label className="grid gap-1 text-xs font-bold text-[#60717d]">
                    기본 템플릿
                    <select
                      value={selectedPurchaseOrder.templateKey}
                      onChange={(event) => updatePurchaseOrderTemplate(selectedPurchaseOrder.id, event.target.value as PurchaseOrder['templateKey'])}
                      className="min-w-0 rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm text-[#171512] outline-none focus:border-[#38a9bd]"
                    >
                      <option value="modelSpec">템플릿1 · 구분/모델명/규격</option>
                      <option value="subType">템플릿2 · 구분 머리글 병합/종류</option>
                      <option value="doorSet">도어 템플릿 · 프레임/도어 세트</option>
                      <option value="custom">사용자 지정</option>
                    </select>
                  </label>

                  <div className="rounded-lg border border-[#d5dde2] bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-bold text-[#171512]">열 설정</p>
                      <span className="text-[11px] font-semibold text-[#60717d]">{selectedPurchaseOrderVisibleColumns.length}열</span>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {selectedPurchaseOrderVisibleColumns.map((column) => (
                        <div key={`popup-template-editor-${column}`} className="grid grid-cols-[minmax(0,1fr)_72px_86px_auto] items-end gap-2 rounded-md border border-[#edf2f5] bg-[#fbfdfe] p-2">
                          <label className="grid gap-1 text-[11px] font-bold text-[#60717d]">
                            열 이름
                            <input
                              value={purchaseOrderColumnLabel(selectedPurchaseOrderLabels, column)}
                              onChange={(event) => {
                                if (column !== 'note') updatePurchaseOrderColumnLabel(selectedPurchaseOrder.id, column as keyof PurchaseOrderColumnLabels, event.target.value);
                              }}
                              disabled={column === 'note'}
                              className="min-w-0 rounded-md border border-[#d5dde2] bg-white px-2 py-1.5 text-xs text-[#171512] outline-none focus:border-[#38a9bd] disabled:bg-[#f1f5f7]"
                            />
                          </label>
                          <label className="grid gap-1 text-[11px] font-bold text-[#60717d]">
                            너비
                            <input
                              inputMode="decimal"
                              value={purchaseOrderColumnWidth(selectedPurchaseOrder, column)}
                              onChange={(event) => updatePurchaseOrderColumnWidth(selectedPurchaseOrder.id, column, event.target.value)}
                              className="min-w-0 rounded-md border border-[#d5dde2] bg-white px-2 py-1.5 text-xs text-[#171512] outline-none focus:border-[#38a9bd]"
                            />
                          </label>
                          <label className="grid gap-1 text-[11px] font-bold text-[#60717d]">
                            정렬
                            <select
                              value={purchaseOrderColumnAlign(selectedPurchaseOrder, column)}
                              onChange={(event) => updatePurchaseOrderCellAlignment(selectedPurchaseOrder.id, column, event.target.value as PurchaseOrderCellAlign)}
                              className="min-w-0 rounded-md border border-[#d5dde2] bg-white px-2 py-1.5 text-xs text-[#171512] outline-none focus:border-[#38a9bd]"
                            >
                              <option value="left">왼쪽</option>
                              <option value="center">중앙</option>
                              <option value="right">오른쪽</option>
                            </select>
                          </label>
                          <button
                            type="button"
                            onClick={() => removePurchaseOrderColumn(selectedPurchaseOrder.id, column)}
                            disabled={selectedPurchaseOrderVisibleColumns.length <= 1}
                            className="rounded-md border border-red-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            삭제
                          </button>
                        </div>
                      ))}
                    </div>
                    {hiddenPurchaseOrderColumns.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {hiddenPurchaseOrderColumns.map((column) => (
                          <button
                            key={`popup-hidden-template-${column}`}
                            type="button"
                            onClick={() => addPurchaseOrderColumn(selectedPurchaseOrder.id, column)}
                            className="rounded-full border border-[#d5dde2] bg-[#f7fafb] px-3 py-1 text-[11px] font-semibold text-[#171512]"
                          >
                            + {purchaseOrderColumnLabel(selectedPurchaseOrderLabels, column)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-[#d5dde2] bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-[#171512]">열 머리글 병합</p>
                      <button
                        type="button"
                        onClick={() => updatePurchaseOrder(selectedPurchaseOrder.id, { templateKey: 'custom', headerMergeLabel: '', headerMergeColumns: [] })}
                        className="rounded-md border border-[#d5dde2] px-2 py-1 text-[11px] font-semibold text-[#60717d]"
                      >
                        병합 해제
                      </button>
                    </div>
                    <label className="mt-3 grid gap-1 text-[11px] font-bold text-[#60717d]">
                      병합 제목
                      <input
                        value={selectedPurchaseOrder.headerMergeLabel || ''}
                        onChange={(event) => updatePurchaseOrder(selectedPurchaseOrder.id, { templateKey: 'custom', headerMergeLabel: event.target.value })}
                        placeholder="예: 구분"
                        className="min-w-0 rounded-md border border-[#d5dde2] bg-white px-2 py-2 text-xs text-[#171512] outline-none focus:border-[#38a9bd]"
                      />
                    </label>
                    <div className="mt-3 grid gap-2">
                      {selectedPurchaseOrderVisibleColumns.map((column) => {
                        const checked = Boolean(selectedPurchaseOrder.headerMergeColumns?.includes(column));
                        return (
                          <label key={`merge-column-${column}`} className="flex items-center justify-between gap-2 rounded-md border border-[#edf2f5] bg-[#fbfdfe] px-3 py-2 text-xs font-semibold text-[#171512]">
                            <span>{purchaseOrderColumnLabel(selectedPurchaseOrderLabels, column)}</span>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => {
                                const currentColumns = selectedPurchaseOrder.headerMergeColumns || [];
                                const nextColumns = event.target.checked
                                  ? Array.from(new Set([...currentColumns, column]))
                                  : currentColumns.filter((item) => item !== column);
                                updatePurchaseOrder(selectedPurchaseOrder.id, {
                                  templateKey: 'custom',
                                  headerMergeLabel: selectedPurchaseOrder.headerMergeLabel || '구분',
                                  headerMergeColumns: nextColumns,
                                });
                              }}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </aside>
            </div>
            <footer className="flex justify-end gap-2 border-t border-[#edf2f5] p-5">
              <button type="button" onClick={() => setIsPurchaseTemplateEditorOpen(false)} className="rounded-md bg-[#171512] px-5 py-2 text-sm font-semibold text-white">
                적용 완료
              </button>
            </footer>
          </section>
        </div>
      )}

      {isDocumentBatchOpen && (
        <DocumentBatchPrintModal
          site={selectedSite}
          lines={lines}
          totals={totals}
          versionLabel={versionLabel}
          schedule={schedule}
          holidays={holidays}
          purchaseOrders={purchaseOrders}
          extraItems={extraItems}
          onClose={() => setIsDocumentBatchOpen(false)}
        />
      )}
    </main>
  );
}

function CompactMetric({ title, value, fullValue, sub, tone = 'default' }: { title: string; value: string; fullValue?: string; sub?: string; tone?: 'default' | 'positive' | 'negative' }) {
  const toneClass = tone === 'positive' ? 'text-[#217346]' : tone === 'negative' ? 'text-red-600' : 'text-[#171512]';
  return (
    <section className="rounded-md border border-[#d5dde2] bg-white px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#60717d]">{title}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p title={fullValue || value} className={`truncate text-2xl font-semibold ${toneClass}`}>{value}</p>
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
      className={`w-full min-w-0 rounded-md border px-3 py-2 text-left text-sm outline-none transition hover:border-[#38a9bd] hover:bg-[#edf8fb] ${
        value ? 'border-[#d5dde2] bg-white text-[#171512]' : 'border-dashed border-[#c7d4dc] bg-[#f7fafb] text-[#60717d]'
      }`}
    >
      <span className="block truncate">{value || placeholder}</span>
    </button>
  );
}

function CommonNameCell({ value, onChange, onPick }: { value: string; onChange: (value: string) => void; onPick: () => void }) {
  return (
    <div className="flex min-w-0 gap-1">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="품명 직접 입력"
        className="w-full min-w-0 rounded-md border border-[#e3c47a] bg-[#fffdf5] px-2 py-2 text-sm outline-none focus:border-[#38a9bd]"
      />
      <button type="button" onClick={onPick} title="DB에서 다시 선택" aria-label="DB에서 다시 선택" className="shrink-0 rounded-md border border-[#d5dde2] bg-white px-2 text-[#60717d] hover:border-[#38a9bd]">
        <Search size={14} />
      </button>
    </div>
  );
}

function LibraryToggle({
  value,
  estimateCount,
  fullCount,
  onChange,
  fullFirst = false,
  long = false,
  className = '',
}: {
  value: MaterialLibrary;
  estimateCount: number;
  fullCount: number;
  onChange: (library: MaterialLibrary) => void;
  fullFirst?: boolean;
  long?: boolean;
  className?: string;
}) {
  const options: Array<{ key: MaterialLibrary; label: string; count: number }> = [
    { key: 'estimate', label: long ? '견적 데이터베이스' : '견적 DB', count: estimateCount },
    { key: 'full', label: long ? '전체 데이터베이스' : '전체 DB', count: fullCount },
  ];
  if (fullFirst) options.reverse();

  return (
    <div className={`grid grid-cols-2 gap-1 rounded-md bg-[#edf2f5] p-1 ${className}`}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          className={`rounded px-3 py-2 text-sm font-semibold ${value === option.key ? 'bg-white text-[#171512] shadow-sm' : 'text-[#60717d] hover:text-[#171512]'}`}
        >
          {option.label}
          <span className="ml-1.5 text-xs font-bold text-[#87949c]">{option.count}</span>
        </button>
      ))}
    </div>
  );
}

// The 갑지 and 세부내역서 leave out lines without a 품명, but their amounts still count in the totals.
function UnnamedPricedLinesWarning({ count, className = '' }: { count: number; className?: string }) {
  if (!count) return null;
  return (
    <p role="alert" className={`rounded-md border border-[#e7c37a] bg-[#fff8e8] px-3 py-2 text-sm font-semibold leading-6 text-[#8b6420] ${className}`}>
      품명이 비어 있는 견적 항목 {count}개는 서류에 나오지 않지만 금액은 합계에 들어갑니다. 견적서 탭에서 품명을 입력해 주세요.
    </p>
  );
}

function DocumentBatchPrintModal({
  site,
  lines,
  totals,
  versionLabel,
  schedule,
  holidays,
  purchaseOrders,
  extraItems,
  onClose,
}: {
  site?: Site;
  lines: EstimateLine[];
  totals: ReturnType<typeof calculateTotals>;
  versionLabel: string;
  schedule: ScheduleTask[];
  holidays: string[];
  purchaseOrders: PurchaseOrder[];
  extraItems: ExtraItem[];
  onClose: () => void;
}) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>(['cover', 'summary', 'detail']);
  const [scheduleMonth, setScheduleMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const documentOptions = [
    { key: 'cover', label: '견적 표지' },
    { key: 'summary', label: '견적 갑지' },
    { key: 'detail', label: '세부내역서' },
    { key: 'schedule', label: `공정표 (${formatMonthLabel(scheduleMonth)})` },
    { key: 'extras', label: '추가 사항' },
    ...purchaseOrders.map((order) => ({ key: `purchase:${order.id}`, label: `발주서 - ${order.title || order.vendorName || '무제'}` })),
  ];

  const toggleKey = (key: string) => {
    setSelectedKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  const orientationOfKey = (key: string): 'portrait' | 'landscape' =>
    key === 'extras' || key.startsWith('purchase:') ? 'portrait' : 'landscape';
  const firstOrientation = selectedKeys.length > 0 ? orientationOfKey(selectedKeys[0]) : 'landscape';

  return (
    <div className="fixed inset-0 z-[100] flex bg-[#e6eef2] text-[#171512]">
      <style>{`
        @media print {
          @page { size: A4 ${firstOrientation}; margin: ${firstOrientation === 'portrait' ? '10mm 12mm' : '8mm 10mm'}; }
        }
      `}</style>
      <aside className="no-print w-[320px] shrink-0 overflow-auto border-r border-[#c7d3da] bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#38a9bd]">PRINT SET</p>
            <h2 className="mt-1 text-2xl font-bold">여러 서류 출력</h2>
            <p className="mt-2 text-sm leading-6 text-[#60717d]">출력할 서류를 선택하고 오른쪽 미리보기에서 한 번에 인쇄합니다.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-[#d5dde2] p-2 text-[#60717d]">
            <X size={18} />
          </button>
        </div>
        <UnnamedPricedLinesWarning count={unnamedPricedLineCount(lines)} className="mt-4" />
        <label className="mt-5 block text-xs font-bold text-[#60717d]">공정표 출력 월</label>
        <input type="month" value={scheduleMonth} onChange={(event) => setScheduleMonth(event.target.value)} className="mt-2 w-full rounded-md border border-[#d5dde2] px-3 py-2" />
        <div className="mt-5 grid gap-2">
          {documentOptions.map((option) => (
            <label key={option.key} className="flex cursor-pointer items-center gap-3 rounded-md border border-[#d5dde2] bg-[#f8fbfc] px-3 py-3 text-sm font-semibold">
              <input type="checkbox" checked={selectedKeys.includes(option.key)} onChange={() => toggleKey(option.key)} />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <button type="button" onClick={() => window.print()} disabled={selectedKeys.length === 0} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#171512] px-4 py-3 font-semibold text-white disabled:opacity-50">
          <Printer size={17} />
          선택 서류 한 번에 출력
        </button>
      </aside>
      <section className="flex-1 overflow-auto p-6">
        <div className="no-print mb-4 flex items-center justify-between rounded-lg border border-[#c7d3da] bg-white px-4 py-3 shadow-sm">
          <span className="text-sm font-semibold text-[#60717d]">선택 {selectedKeys.length}개</span>
          <button type="button" onClick={() => window.print()} disabled={selectedKeys.length === 0} className="rounded-md bg-[#f1c76a] px-4 py-2 text-sm font-bold disabled:opacity-50">
            전체 인쇄
          </button>
        </div>
        <article id="estimate-print" className="batch-print mx-auto flex flex-col gap-6">
          {selectedKeys.length === 0 && (
            <section className="print-portrait rounded-lg bg-white p-10 text-center text-sm text-[#60717d]">왼쪽에서 출력할 서류를 선택해주세요.</section>
          )}
          {selectedKeys.map((key) => {
            if (key === 'cover') return <LandscapeEstimateDocumentPreview key={key} site={site} lines={lines} totals={totals} versionLabel={versionLabel} view="cover" unwrap />;
            if (key === 'summary') return <LandscapeEstimateDocumentPreview key={key} site={site} lines={lines} totals={totals} versionLabel={versionLabel} view="summary" unwrap />;
            if (key === 'detail') return <LandscapeEstimateDocumentPreview key={key} site={site} lines={lines} totals={totals} versionLabel={versionLabel} view="detail" unwrap />;
            if (key === 'schedule') return <SchedulePrintPage key={key} monthKey={scheduleMonth} tasks={schedule} holidays={holidays} site={site} />;
            if (key === 'extras') return <ExtraItemsPrintPage key={key} items={extraItems} site={site} />;
            if (key.startsWith('purchase:')) {
              const order = purchaseOrders.find((item) => item.id === key.replace('purchase:', ''));
              return order ? <PurchaseOrderPrintPage key={key} order={order} site={site} /> : null;
            }
            return null;
          })}
        </article>
      </section>
    </div>
  );
}

function BatchEstimatePage({ site, lines, totals, versionLabel, view }: { site?: Site; lines: EstimateLine[]; totals: ReturnType<typeof calculateTotals>; versionLabel: string; view: 'cover' | 'summary' | 'detail' }) {
  const visibleLines = lines.filter((line) => line.name || line.category || line.process);
  const grouped = groupLinesByCategory(visibleLines);
  const title = view === 'cover' ? '견적 표지' : view === 'summary' ? '견적서' : '세부내역서';

  return (
    <section className="print-portrait rounded-lg bg-white p-8 shadow-sm">
      <DocumentPrintHeader title={title} site={site} />
      {view === 'cover' ? (
        <div className="mt-10 grid gap-5 text-base">
          <DocumentInfoRow label="고객명" value={`${site?.address || site?.title || ''} · ${site?.customerName || '고객'} 귀하`} />
          <DocumentInfoRow label="공사명" value={site?.title || `${site?.siteType || '인테리어'} 공사`} />
          <DocumentInfoRow label="견적금액" value={`${formatMoney(totals.customerEstimateTotal)} (부가세 별도)`} />
          <p className="border-y-4 border-[#c9c9c9] py-6 font-bold">상기와 같이 견적을 제출합니다.</p>
          <div className="mt-8 grid grid-cols-2 gap-10">
            <div className="text-sm leading-8">
              <p>*견적 외 사항은 별도입니다.</p>
              <p>*견적서 유효기간은 발행일로부터 30일간 유효합니다.</p>
            </div>
            <CompanyInfoBlock />
          </div>
        </div>
      ) : view === 'summary' ? (
        <DocumentTable className="mt-6">
          <thead>
            <tr>{['공정', '규격', '산식', '단위', '금액', '세액'].map((label) => <th key={label}>{label}</th>)}</tr>
          </thead>
          <tbody>
            {grouped.map((group, index) => (
              <tr key={group.category}>
                <td>{index + 1}. {group.category}</td>
                <td />
                <td className="text-center">1</td>
                <td className="text-center">식</td>
                <td className="text-right">{formatMoney(group.customerAmount)}</td>
                <td />
              </tr>
            ))}
            <tr className="bg-[#f8e8da] font-bold">
              <td colSpan={4} className="text-center">합계 (부가세 별도)</td>
              <td className="text-right">{formatMoney(totals.customerEstimateTotal)}</td>
              <td />
            </tr>
          </tbody>
        </DocumentTable>
      ) : (
        <DocumentTable className="mt-6 text-xs">
          <thead>
            <tr>{['품명', '규격', '단위', '수량', '단가', '금액', '비고'].map((label) => <th key={label}>{label}</th>)}</tr>
          </thead>
          <tbody>
            {grouped.map((group, groupIndex) => (
              <Fragment key={group.category}>
                <tr className="bg-[#f4f4f4] font-bold"><td colSpan={7}>{groupIndex + 1}. {group.category}</td></tr>
                {group.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.name}</td>
                    <td>{line.spec}</td>
                    <td className="text-center">{line.unit}</td>
                    <td className="text-right">{formatNumber(line.quantity)}</td>
                    <td className="text-right">{formatMoney(line.customerUnitPrice)}</td>
                    <td className="text-right">{formatMoney(line.quantity * line.customerUnitPrice)}</td>
                    <td>{line.note}</td>
                  </tr>
                ))}
                <tr className="font-bold"><td colSpan={5} className="text-center">소계</td><td className="text-right">{formatMoney(group.customerAmount)}</td><td /></tr>
              </Fragment>
            ))}
          </tbody>
        </DocumentTable>
      )}
      <p className="mt-5 text-right text-xs text-[#60717d]">{versionLabel}</p>
    </section>
  );
}

function SchedulePrintPage({ monthKey, tasks, holidays, site }: { monthKey: string; tasks: ScheduleTask[]; holidays: string[]; site?: Site }) {
  const holidaySet = new Set(holidays);
  const days = buildCalendarDays(monthKey);
  const weeks = Array.from({ length: 6 }).map((_, index) => days.slice(index * 7, index * 7 + 7));

  return (
    <section className="print-landscape rounded-lg bg-white p-6 shadow-sm">
      <DocumentPrintHeader title={`${formatMonthLabel(monthKey)} 공정표`} site={site} compact />
      <table className="mt-5 w-full table-fixed border-collapse text-xs">
        <thead>
          <tr>{['월', '화', '수', '목', '금', '토', '일'].map((day) => <th key={day} className="border border-[#171512] bg-[#f4f1ec] py-2">{day}</th>)}</tr>
        </thead>
        <tbody>
          {weeks.map((week, weekIndex) => (
            <tr key={weekIndex}>
              {week.map((day) => {
                const dayTasks = tasksForDate(tasks, day.key, holidaySet);
                return (
                  <td key={day.key} className={`h-[28mm] align-top border border-[#171512] p-1 ${day.isCurrentMonth ? 'bg-white' : 'bg-[#f5f5f5] text-[#9aa6ad]'}`}>
                    <div className="flex justify-between text-[10px] font-bold">
                      <span>{day.day}</span>
                      {holidaySet.has(day.key) && <span className="text-red-600">휴일</span>}
                    </div>
                    <div className="mt-1 space-y-1">
                      {dayTasks.slice(0, 4).map((task) => (
                        <div key={`${day.key}-${task.id}`} className="truncate rounded px-1 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: normalizeColor(task.color || '#38a9bd') }}>
                          {task.name} {task.vendorName ? `· ${task.vendorName}` : ''}
                        </div>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function DoorPurchaseOrderTable({ order, onEdit }: { order: PurchaseOrder; onEdit?: (item: PurchaseOrderItem) => void }) {
  const cellClass = 'break-words border border-[#171512] px-3 py-2 align-middle';
  const centerClass = `${cellClass} text-center`;
  const items = order.items || [];
  const renderedRowCount = items.reduce((sum, item) => sum + (isDoorSetPair(item) ? 2 : 1), 0);
  const fillerRows = Math.max(0, 3 - renderedRowCount);

  return (
    <table className="w-full table-fixed border-collapse text-sm">
      <colgroup>
        <col style={{ width: '20%' }} />
        <col style={{ width: '28%' }} />
        <col style={{ width: '24%' }} />
        <col style={{ width: '14%' }} />
        <col style={{ width: '14%' }} />
      </colgroup>
      <thead className="bg-[#f3f1ec]">
        <tr>
          <th className={centerClass}></th>
          <th className={centerClass}>모델명</th>
          <td className={`${centerClass} font-semibold`}>{order.doorModelName || '-'}</td>
          <th className={centerClass}>{order.doorFinish || '필름'}</th>
          <td className={centerClass}>{order.doorBrand || order.vendorName || '-'}</td>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <tr>
            <td className="border border-[#171512] px-3 py-8 text-center text-[#60717d]" colSpan={5}>작성된 도어 발주 항목이 없습니다.</td>
          </tr>
        ) : (
          items.map((item, index) => renderDoorPurchaseOrderRows(item, index, items[index - 1], onEdit, order))
        )}
        {Array.from({ length: fillerRows }).map((_, index) => (
          <tr key={`door-filler-${index}`}>
            <td className={cellClass}>&nbsp;</td>
            <td className={cellClass}></td>
            <td className={cellClass}></td>
            <td className={cellClass}></td>
            <td className={cellClass}></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderDoorPurchaseOrderRows(item: PurchaseOrderItem, index: number, previousItem?: PurchaseOrderItem, onEdit?: (item: PurchaseOrderItem) => void, order?: PurchaseOrder) {
  const cellClass = 'break-words border border-[#171512] px-3 py-2 align-middle';
  const centerClass = `${cellClass} text-center`;
  const rowClass = `${onEdit ? 'cursor-pointer hover:bg-[#fff8e8]' : ''} ${isDoorGroupBreak(item, previousItem) ? '[&>td]:border-t-2 [&>td]:border-t-[#171512]' : ''}`;
  const rawCategory = (item.category || '').trim();
  const numberedMatch = rawCategory.match(/^(\d+)(?:[.\s-]+)?(.*)$/);
  const numberLabel = numberedMatch?.[1] || String(index + 1);
  const explicitLabel = (numberedMatch?.[2] || '').trim();
  const accessoryLabel = rawCategory || item.modelName || `항목 ${index + 1}`;
  const quantityLabel = formatQuantityWithUnit(item.quantity, item.unit);

  if (isDoorEtcItem(item)) {
    return (
      <tr key={`door-extra-${item.id}`} onDoubleClick={() => onEdit?.(item)} className={rowClass}>
        <td className={cellClass} colSpan={5}>
          <span className="mr-4 font-semibold">기타</span>
          {item.note || item.modelName || item.spec || item.unit}
        </td>
      </tr>
    );
  }

  if (isDoorSetPair(item)) {
    const setQuantity = item.quantity ? `${formatNumber(item.quantity)}SET` : '';
    const itemModelName = (item.vendorName || order?.doorModelName || '').trim();
    return (
      <Fragment key={`door-pair-${item.id}`}>
        <tr onDoubleClick={() => onEdit?.(item)} className={rowClass}>
          <td className={cellClass}>{numberLabel}. 프레임</td>
          <td className={centerClass}>{item.modelName}</td>
          <td className={centerClass}>{itemModelName}</td>
          <td className={centerClass}>{item.unit}</td>
          <td className={centerClass}>{setQuantity}</td>
        </tr>
        <tr onDoubleClick={() => onEdit?.(item)} className={onEdit ? 'cursor-pointer hover:bg-[#fff8e8]' : ''}>
          <td className={cellClass}>{numberLabel}. 도어</td>
          <td className={centerClass}>{item.spec}</td>
          <td className={centerClass} colSpan={3}>{item.note}</td>
        </tr>
      </Fragment>
    );
  }

  if (isDoorSingleSpecItem(item)) {
    return (
      <tr key={`door-single-spec-${item.id}`} onDoubleClick={() => onEdit?.(item)} className={rowClass}>
        <td className={cellClass}>{accessoryLabel}</td>
        <td className={centerClass} colSpan={2}>{item.modelName || item.spec}</td>
        <td className={centerClass}>{item.note}</td>
        <td className={centerClass}>{quantityLabel}</td>
      </tr>
    );
  }

  {
    const label = explicitLabel ? `${numberLabel}. ${explicitLabel}` : accessoryLabel;
    return (
      <tr key={`door-single-${item.id}`} onDoubleClick={() => onEdit?.(item)} className={rowClass}>
        <td className={cellClass}>{label}</td>
        <td className={centerClass}>{item.modelName}</td>
        <td className={centerClass}>{item.spec}</td>
        <td className={centerClass}>{item.unit}</td>
        <td className={centerClass}>{item.note || quantityLabel}</td>
      </tr>
    );
  }
}

function isDoorSetPair(item: PurchaseOrderItem) {
  const category = (item.category || '').trim();
  return /^\d+$/.test(category);
}

function isDoorEtcItem(item: PurchaseOrderItem) {
  return normalizeDoorCategory(item.category) === '기타';
}

function isDoorSingleSpecItem(item: PurchaseOrderItem) {
  return /평판|걸레받이|부자재|자재|몰딩|시멘트|타일|벽타일|바닥타일/.test(normalizeDoorCategory(item.category));
}

function isDoorGroupBreak(item: PurchaseOrderItem, previousItem?: PurchaseOrderItem) {
  if (!previousItem) return false;
  return doorGroupKey(item) !== doorGroupKey(previousItem);
}

function doorGroupKey(item: PurchaseOrderItem) {
  const category = (item.category || '').trim();
  const numberedMatch = category.match(/^(\d+)(?:[.\s-]+)?(.*)$/);
  if (numberedMatch?.[1]) return `number-${numberedMatch[1]}`;
  return normalizeDoorCategory(category || item.modelName || item.spec);
}

function normalizeDoorCategory(value: string) {
  return value.replace(/\s+/g, '').trim();
}

function formatQuantityWithUnit(quantity: number, unit: string) {
  const hasQuantity = Number.isFinite(Number(quantity)) && Number(quantity) !== 0;
  return [hasQuantity ? formatNumber(quantity) : '', unit || ''].filter(Boolean).join('');
}

function PurchaseOrderPrintPage({ order }: { order: PurchaseOrder; site?: Site }) {
  const labels = getPurchaseOrderLabels(order);
  const visibleColumns = getPurchaseOrderVisibleColumns(order);
  const total = order.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);

  return (
    <section className="print-portrait rounded-lg bg-white p-6 shadow-sm print:rounded-none print:p-0 print:shadow-none">
      <div className="overflow-hidden rounded-lg border border-[#171512] bg-white print:rounded-none">
        <div className="grid grid-cols-[1fr_auto] border-b border-[#171512]">
          <h3 className="py-3 text-center text-2xl font-bold tracking-[0.35em]">발 주 서</h3>
          <div className="border-l border-[#171512] px-6 py-3 font-semibold">위브디자인</div>
        </div>
        {order.templateKey === 'doorSet' ? (
          <DoorPurchaseOrderTable order={order} />
        ) : (
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              {visibleColumns.map((column) => (
                <col key={column} className={purchaseOrderColumnWidths[column]} style={{ width: `${purchaseOrderColumnWidth(order, column)}%` }} />
              ))}
            </colgroup>
            <thead className="bg-[#f3f1ec]">
              {renderPurchaseOrderHeaderRows(order, labels, visibleColumns)}
            </thead>
            <tbody>
              {order.mergeSameCategory
                ? renderGroupedPurchaseRows(order.items, () => undefined, visibleColumns, order)
                : order.items.map((item) => (
                    <tr key={item.id}>
                      {visibleColumns.map((column) => <td key={`${item.id}-${column}`} className={purchaseOrderCellClass(column, order)}>{renderPurchaseOrderCell(item, column)}</td>)}
                    </tr>
                  ))}
              <tr className="bg-[#f8e8da] font-bold">
                <td colSpan={Math.max(1, visibleColumns.length - 1)} className="border border-[#171512] px-3 py-2 text-center">합계</td>
                <td className="border border-[#171512] px-3 py-2 text-right">{formatMoney(total)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
      {order.memo && <p className="mt-4 rounded border border-[#d5dde2] p-3 text-sm">메모: {order.memo}</p>}
    </section>
  );
}

function ExtraItemsPrintPage({ items, site }: { items: ExtraItem[]; site?: Site }) {
  const total = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);

  return (
    <section className="print-portrait rounded-lg bg-white p-6 shadow-sm">
      <DocumentPrintHeader title="추가 사항" site={site} compact />
      <DocumentTable className="mt-5 text-sm">
        <thead>
          <tr>{['품명', '규격', '단위', '수량', '단가', '금액'].map((label) => <th key={label}>{label}</th>)}</tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>{item.spec}</td>
              <td className="text-center">{item.unit}</td>
              <td className="text-right">{formatNumber(item.quantity)}</td>
              <td className="text-right">{formatMoney(item.unitPrice)}</td>
              <td className="text-right">{formatMoney(item.quantity * item.unitPrice)}</td>
            </tr>
          ))}
          <tr className="bg-[#f8e8da] font-bold"><td colSpan={5} className="text-center">총합계</td><td className="text-right">{formatMoney(total)}</td></tr>
        </tbody>
      </DocumentTable>
    </section>
  );
}

function DocumentPrintHeader({ title, site, compact = false }: { title: string; site?: Site; compact?: boolean }) {
  return (
    <header className={compact ? 'text-sm' : 'text-base'}>
      <div className="mx-auto w-[300px] border-2 border-[#99bf5a] py-2 text-center text-2xl font-bold tracking-[0.25em]">{title}</div>
      <div className="mt-5 grid grid-cols-2 gap-6">
        <div className="leading-7">
          <p>{formatShortDate(todayKey())}</p>
          <p>{site?.address || site?.title || '-'}</p>
          <p>{site?.customerName || '고객'} 님 귀하</p>
        </div>
        <CompanyInfoBlock compact />
      </div>
    </header>
  );
}

function DocumentInfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] border-b border-[#171512] py-3">
      <span className="font-semibold text-[#4d5d66]">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CompanyInfoBlock({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`leading-7 ${compact ? 'text-sm' : 'text-base'}`}>
      <p className="font-bold tracking-[0.25em]">위 브 디 자 인</p>
      <p>경기도 의왕시 오리나무1길 12, 1층</p>
      <p>대표 : 김현종</p>
      <p>☎ 031.381.0489&nbsp;&nbsp;&nbsp; FAX 031.422.2915</p>
      <p>✉ weve0489@gmail.com</p>
      <p>담당자 : 김현종&nbsp;&nbsp;010.6346.3882</p>
    </div>
  );
}

function DocumentTable({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <table className={`${className} w-full table-fixed border-collapse [&_td]:border [&_td]:border-[#171512] [&_td]:px-2 [&_td]:py-2 [&_th]:border [&_th]:border-[#171512] [&_th]:bg-[#f4f1ec] [&_th]:px-2 [&_th]:py-2`}>
      {children}
    </table>
  );
}

function MaterialPickerModal({
  state,
  materials,
  library,
  estimateCategories,
  estimateItems,
  onLibraryChange,
  onChange,
  onChooseCategory,
  onChooseProcess,
  onChooseMaterial,
  onChooseCommonOptions,
  onSaveMaterial,
  onClose,
}: {
  state: MaterialPickerState;
  materials: Material[];
  library: MaterialLibrary;
  estimateCategories: string[];
  estimateItems: Record<string, string>;
  onLibraryChange: (library: MaterialLibrary) => void;
  onChange: (state: MaterialPickerState | null) => void;
  onChooseCategory: (category: string) => void;
  onChooseProcess: (process: string) => void;
  onChooseMaterial: (material: Material) => void;
  onChooseCommonOptions: (material: Material, options: string[]) => void;
  onSaveMaterial: (material: Material) => Promise<boolean>;
  onClose: () => void;
}) {
  const [editingPickerMaterial, setEditingPickerMaterial] = useState<Material | null>(null);
  // A '공통' item with saved 공통 항목 opens the option view first instead of going straight into the estimate.
  const [commonChoice, setCommonChoice] = useState<Material | null>(null);
  const pickMaterial = (material: Material) => {
    if (isCommonMaterialName(material.name) && material.commonOptions?.length) setCommonChoice(material);
    else onChooseMaterial(material);
  };
  const keyword = state.search.trim().toLowerCase();
  // In the estimate DB the first step groups by estimate category; processes and items stay those of the linked material.
  const categoryOf = (item: Material) => (library === 'estimate' ? estimateItems[item._id || ''] || '' : item.category || '미분류');
  const libraryMaterials = library === 'estimate' ? materials.filter((item) => categoryOf(item)) : materials;
  const estimateCounts = countBy(libraryMaterials, categoryOf);
  const categoryGroups = (library === 'estimate'
    ? estimateCategories.map((label) => ({ label, count: estimateCounts.find((group) => group.label === label)?.count || 0 }))
    : estimateCounts
  ).filter((item) => !keyword || item.label.toLowerCase().includes(keyword));
  const processSource = libraryMaterials.filter((item) => categoryOf(item) === state.category);
  const processGroups = countBy(processSource, (item) => item.process || item.category || '기타 공정')
    .filter((item) => !keyword || item.label.toLowerCase().includes(keyword));
  const materialResults = libraryMaterials
    .filter((item) => {
      const category = categoryOf(item);
      const process = item.process || item.category || '기타 공정';
      const haystack = [item.category, item.process, item.name, item.spec, item.unit, item.note].join(' ').toLowerCase();
      return category === state.category && process === state.process && (!keyword || haystack.includes(keyword));
    })
    .slice(0, 160);
  const pickerCategoryOptions = Array.from(new Set(materials.map((item) => item.category || '미분류'))).sort((a, b) => a.localeCompare(b, 'ko-KR'));
  const pickerProcessOptions = Array.from(
    new Set(
      materials
        .filter((item) => !editingPickerMaterial?.category || (item.category || '미분류') === editingPickerMaterial.category)
        .map((item) => item.process || item.category || '')
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, 'ko-KR'));

  const stepLabel = commonChoice ? '공통 항목 선택' : state.step === 'category' ? '분류 선택' : state.step === 'process' ? '공종 선택' : '품명 선택';

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#171512]/45 px-4 py-6 backdrop-blur-sm">
      <section className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[#d5dde2] bg-white shadow-2xl">
        <datalist id="picker-material-categories">
          {pickerCategoryOptions.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
        <datalist id="picker-material-processes">
          {pickerProcessOptions.map((process) => (
            <option key={process} value={process} />
          ))}
        </datalist>
        <header className="flex items-start justify-between gap-4 border-b border-[#edf2f5] p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#38a9bd]">{library === 'estimate' ? 'ESTIMATE DB' : 'MATERIAL DB'}</p>
            <h2 className="mt-1 text-2xl font-semibold">{stepLabel}</h2>
            <p className="mt-1 text-sm text-[#60717d]">
              {commonChoice
                ? '이 공통 품목에 저장된 항목 중에서 견적서에 넣을 품명을 고릅니다.'
                : '분류를 고르면 공종으로, 공종을 고르면 해당 품명 목록으로 자동 이동합니다.'}
            </p>
          </div>
          <div className="flex items-start gap-3">
            <LibraryToggle
              value={library}
              estimateCount={materials.filter((item) => estimateItems[item._id || '']).length}
              fullCount={materials.length}
              onChange={(next) => {
                setCommonChoice(null);
                onLibraryChange(next);
              }}
              className="w-64"
            />
            <button type="button" onClick={onClose} className="rounded-full border border-[#d5dde2] p-2 text-[#60717d] hover:bg-[#f7fafb]">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className={`grid gap-4 border-b border-[#edf2f5] p-4 lg:grid-cols-[1fr_280px] ${commonChoice ? 'hidden' : ''}`}>
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
          {commonChoice && (
            <CommonOptionPicker
              material={commonChoice}
              category={categoryOf(commonChoice) || commonChoice.category || ''}
              onBack={() => setCommonChoice(null)}
              onDirect={() => onChooseMaterial(commonChoice)}
              onSubmit={(options) => onChooseCommonOptions(commonChoice, options)}
            />
          )}

          {!commonChoice && state.step === 'category' && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categoryGroups.map((group) => (
                <button key={group.label} type="button" onClick={() => onChooseCategory(group.label)} className="rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#38a9bd] hover:shadow-md">
                  <span className="block text-lg font-semibold">{group.label}</span>
                  <span className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#60717d]">{group.count}개 품목</span>
                </button>
              ))}
            </div>
          )}

          {!commonChoice && state.step === 'process' && (
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

          {!commonChoice && state.step === 'material' && (
            <div>
              <div className="mb-4 flex flex-wrap gap-2 rounded-lg bg-[#f7fafb] px-4 py-3 text-sm text-[#60717d]">
                <span>분류 <b className="text-[#171512]">{state.category}</b></span>
                <span>·</span>
                <span>공종 <b className="text-[#171512]">{state.process}</b></span>
              </div>
              {editingPickerMaterial && (
                <div className="mb-4 rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <b className="text-sm">자재 단가 DB 수정</b>
                    <button type="button" onClick={() => setEditingPickerMaterial(null)} className="rounded-md border border-[#d5dde2] bg-white px-2 py-1 text-xs font-semibold">
                      닫기
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <input list="picker-material-categories" value={editingPickerMaterial.category || ''} onChange={(event) => setEditingPickerMaterial({ ...editingPickerMaterial, category: event.target.value })} placeholder="카테고리" className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm outline-none focus:border-[#38a9bd]" />
                    <input list="picker-material-processes" value={editingPickerMaterial.process || ''} onChange={(event) => setEditingPickerMaterial({ ...editingPickerMaterial, process: event.target.value })} placeholder="공정" className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm outline-none focus:border-[#38a9bd]" />
                    <input value={editingPickerMaterial.name || ''} onChange={(event) => setEditingPickerMaterial({ ...editingPickerMaterial, name: event.target.value })} placeholder="품명" className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm outline-none focus:border-[#38a9bd]" />
                    <input value={editingPickerMaterial.spec || ''} onChange={(event) => setEditingPickerMaterial({ ...editingPickerMaterial, spec: event.target.value })} placeholder="규격" className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm outline-none focus:border-[#38a9bd]" />
                    <input value={editingPickerMaterial.unit || ''} onChange={(event) => setEditingPickerMaterial({ ...editingPickerMaterial, unit: event.target.value })} placeholder="단위" className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm outline-none focus:border-[#38a9bd]" />
                    <NumberTextInput value={Number(editingPickerMaterial.unitPrice || 0)} onChange={(value) => setEditingPickerMaterial({ ...editingPickerMaterial, unitPrice: value })} className="bg-white text-sm" />
                  </div>
                  {isCommonMaterialName(editingPickerMaterial.name) && (
                    <CommonOptionsField
                      key={editingPickerMaterial._id || 'new'}
                      options={editingPickerMaterial.commonOptions}
                      onChange={(commonOptions) => setEditingPickerMaterial((current) => (current ? { ...current, commonOptions } : current))}
                      className="mt-3"
                    />
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      // A '공통' item always sends its 공통 항목, so an emptied list clears them.
                      await onSaveMaterial(
                        isCommonMaterialName(editingPickerMaterial.name)
                          ? { ...editingPickerMaterial, commonOptions: editingPickerMaterial.commonOptions || [] }
                          : editingPickerMaterial,
                      );
                      setEditingPickerMaterial(null);
                    }}
                    className="mt-3 rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white"
                  >
                    서버 DB 저장
                  </button>
                </div>
              )}
              <div className="grid gap-2">
                {materialResults.map((material) => (
                  <article
                    key={material._id || `${material.category}-${material.process}-${material.name}-${material.spec}`}
                    className="grid gap-2 rounded-lg border border-[#d5dde2] bg-white p-4 text-left transition hover:border-[#38a9bd] hover:bg-[#edf8fb] md:grid-cols-[1.2fr_1fr_90px_130px]"
                  >
                    <button type="button" onClick={() => pickMaterial(material)} className="min-w-0 text-left md:col-span-3">
                      <b className="block truncate">
                        {material.name || '품명 없음'}
                        {isCommonMaterialName(material.name) && material.commonOptions?.length ? (
                          <span className="ml-2 rounded-full bg-[#fff3c7] px-2 py-0.5 text-xs font-bold text-[#8b6420]">공통 항목 {material.commonOptions.length}개</span>
                        ) : null}
                      </b>
                      <small className="mt-1 block text-[#60717d]">{[material.category, material.process, material.spec, material.unit].filter(Boolean).join(' · ') || material.note || material.sourceSheet || ''}</small>
                    </button>
                    <div className="flex items-center justify-between gap-2 md:justify-end">
                      <span className="font-semibold">{formatMoney(Number(material.unitPrice || 0))}</span>
                      <button
                        type="button"
                        onClick={() => setEditingPickerMaterial(material)}
                        className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-xs font-semibold hover:border-[#38a9bd]"
                      >
                        DB 수정
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {!commonChoice && ((state.step === 'category' && categoryGroups.length === 0) || (state.step === 'process' && processGroups.length === 0) || (state.step === 'material' && materialResults.length === 0)) && (
            <div className="rounded-lg border border-dashed border-[#d5dde2] bg-[#f7fafb] p-10 text-center text-sm text-[#60717d]">
              {library === 'estimate' && libraryMaterials.length === 0
                ? '견적 DB가 비어 있습니다. `자재 / 견적 단가` 탭의 견적 데이터베이스에서 카테고리를 만들고 품목을 넣어주세요.'
                : library === 'estimate'
                  ? '이 견적 카테고리에 해당하는 품목이 없습니다. 전체 DB에서 찾아보세요.'
                  : '검색 결과가 없습니다. 자재 단가 DB에 해당 항목이 있는지 확인해주세요.'}
              {library === 'estimate' && (
                <button type="button" onClick={() => onLibraryChange('full')} className="mx-auto mt-4 block rounded-md border border-[#d5dde2] bg-white px-4 py-2 text-sm font-semibold text-[#171512]">
                  전체 DB 보기
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

type BulkMoveGroup = { label: string; items: Material[] };

// 카테고리 and 공정 hold the same value for imported materials, so the DB screens group by 공정 only.
function materialProcessOf(item: Material) {
  return item.process || item.category || '미분류';
}

function groupMaterials(items: Material[], keyOf: (item: Material) => string): BulkMoveGroup[] {
  const groups = new Map<string, Material[]>();
  items.forEach((item) => {
    const key = keyOf(item);
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  });
  return Array.from(groups.entries()).map(([label, groupItems]) => ({ label, items: groupItems }));
}

// Moves full-DB items into the estimate DB: browse 공정 → 품명 like the line picker,
// and tick a whole 공정 at once or single items.
function EstimateBulkMoveModal({
  materials,
  estimateCategories,
  estimateItems,
  isSaving,
  errorText,
  onSubmit,
  onPromptNewCategory,
  onClose,
}: {
  materials: Material[];
  estimateCategories: string[];
  estimateItems: Record<string, string>;
  isSaving: boolean;
  errorText: string;
  onSubmit: (assignments: Record<string, string>) => Promise<boolean>;
  onPromptNewCategory: () => Promise<string>;
  onClose: () => void;
}) {
  const [process, setProcess] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [target, setTarget] = useState(SAME_AS_CATEGORY_TARGET);
  const [doneMessage, setDoneMessage] = useState('');

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const keyword = search.trim().toLowerCase();
  const items = materials.filter((item) => item._id);
  const processGroups = groupMaterials(items, materialProcessOf).filter((group) => !keyword || group.label.toLowerCase().includes(keyword));
  const processItems = items.filter((item) => materialProcessOf(item) === process);
  const materialResults = processItems.filter((item) => {
    const haystack = [item.name, item.spec, item.unit, item.note].join(' ').toLowerCase();
    return !keyword || haystack.includes(keyword);
  });

  const selectionState = (list: Material[]): 'all' | 'some' | 'none' => {
    const count = list.filter((item) => selected.has(item._id || '')).length;
    return count === 0 ? 'none' : count === list.length ? 'all' : 'some';
  };
  const toggleItems = (list: Material[]) => {
    const ids = list.map((item) => item._id || '');
    const allSelected = ids.every((id) => selected.has(id));
    setSelectedIds((current) => {
      if (allSelected) {
        const removing = new Set(ids);
        return current.filter((id) => !removing.has(id));
      }
      return Array.from(new Set([...current, ...ids]));
    });
    setDoneMessage('');
  };
  const openProcess = (nextProcess: string) => {
    setProcess(nextProcess);
    setSearch('');
  };

  const selectedItems = items.filter((item) => selected.has(item._id || ''));
  const targetCategories = target === SAME_AS_CATEGORY_TARGET ? uniqueInOrder(selectedItems.map(materialProcessOf)) : target ? [target] : [];
  const newTargetCategories = targetCategories.filter((name) => !estimateCategories.includes(name));

  const moveSelected = async () => {
    if (!selectedItems.length || !targetCategories.length) return;
    const assignments = Object.fromEntries(
      selectedItems.map((item) => [item._id || '', target === SAME_AS_CATEGORY_TARGET ? materialProcessOf(item) : target]),
    );
    if (await onSubmit(assignments)) {
      setDoneMessage(`${selectedItems.length}개 품목을 견적 DB로 옮겼습니다. (${targetCategories.join(', ')})`);
      setSelectedIds([]);
    }
  };

  const stepLabel = process ? '품명 선택' : '공정 선택';

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#171512]/45 px-4 py-6 backdrop-blur-sm">
      <section className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[#d5dde2] bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-[#edf2f5] p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#38a9bd]">MATERIAL DB → ESTIMATE DB</p>
            <h2 className="mt-1 text-2xl font-semibold">전체 DB에서 견적 DB로 옮기기 · {stepLabel}</h2>
            <p className="mt-1 text-sm text-[#60717d]">상자 왼쪽 체크박스로 공정을 통째로 고르거나, 상자를 눌러 들어가 품목을 하나씩 고를 수 있습니다.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded-full border border-[#d5dde2] p-2 text-[#60717d] hover:bg-[#f7fafb]">
            <X size={18} />
          </button>
        </header>

        <div className="grid gap-4 border-b border-[#edf2f5] p-4 lg:grid-cols-[1fr_280px]">
          <div className="flex flex-wrap items-center gap-2">
            <StepButton label="1 공정" active={!process} enabled onClick={() => openProcess('')} />
            <StepButton label="2 품명" active={Boolean(process)} enabled={Boolean(process)} onClick={() => undefined} />
            {process && <span className="text-sm text-[#60717d]">· <b className="text-[#171512]">{process}</b></span>}
          </div>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#60717d]" size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`${stepLabel} 검색`} className="w-full rounded-md border border-[#d5dde2] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#38a9bd]" />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {!process && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {processGroups.map((group) => {
                const state = selectionState(group.items);
                const selectedCount = group.items.filter((item) => selected.has(item._id || '')).length;
                const inEstimateCount = group.items.filter((item) => estimateItems[item._id || '']).length;
                return (
                  <div key={group.label} className={`flex min-w-0 overflow-hidden rounded-lg border transition ${state === 'none' ? 'border-[#d5dde2] bg-[#f7fafb]' : 'border-[#38a9bd] bg-[#edf8fb]'}`}>
                    <label className="flex cursor-pointer items-center border-r border-[#d5dde2] px-3 hover:bg-white" title={`${group.label} 전체 선택`}>
                      <TriStateCheckbox state={state} onChange={() => toggleItems(group.items)} label={`${group.label} 전체 선택`} />
                    </label>
                    <button type="button" onClick={() => openProcess(group.label)} className="min-w-0 flex-1 p-4 text-left hover:bg-white">
                      <span className="block truncate text-lg font-semibold">{group.label}</span>
                      <span className="mt-2 flex flex-wrap gap-1.5 text-xs font-bold">
                        <span className="rounded-full bg-white px-2.5 py-1 text-[#60717d]">{group.items.length}개 품목</span>
                        {selectedCount > 0 && <span className="rounded-full bg-[#171512] px-2.5 py-1 text-white">{selectedCount}개 선택</span>}
                        {inEstimateCount > 0 && <span className="rounded-full bg-[#fff3c7] px-2.5 py-1 text-[#8b6420]">견적 DB {inEstimateCount}</span>}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {process && (
            <div>
              <label className="mb-4 flex cursor-pointer items-center gap-3 rounded-lg bg-[#f7fafb] px-4 py-3 text-sm">
                <TriStateCheckbox state={selectionState(processItems)} onChange={() => toggleItems(processItems)} label={`${process} 전체 선택`} />
                <span>
                  <b className="text-[#171512]">{process}</b> 공정 전체 선택 <span className="text-[#60717d]">({processItems.length}개 품목)</span>
                </span>
              </label>
              <div className="grid gap-2">
                {materialResults.map((item) => {
                  const id = item._id || '';
                  const isChecked = selected.has(id);
                  return (
                    <label key={id} className={`grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border p-3 transition ${isChecked ? 'border-[#38a9bd] bg-[#edf8fb]' : 'border-[#d5dde2] bg-white hover:border-[#38a9bd]'}`}>
                      <input type="checkbox" checked={isChecked} onChange={() => toggleItems([item])} aria-label={`${item.name || '품목'} 선택`} />
                      <span className="min-w-0">
                        <b className="block truncate">{item.name || '품명 없음'}</b>
                        <small className="mt-0.5 block truncate text-[#60717d]">{[item.spec, item.unit].filter(Boolean).join(' · ') || '규격 정보 없음'}</small>
                      </span>
                      <span className="flex items-center gap-2 text-sm">
                        {estimateItems[id] && <span className="rounded-full bg-[#fff3c7] px-2.5 py-1 text-xs font-bold text-[#8b6420]">견적 DB · {estimateItems[id]}</span>}
                        <b>{formatMoney(Number(item.unitPrice || 0))}</b>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {((!process && processGroups.length === 0) || (process && materialResults.length === 0)) && (
            <div className="rounded-lg border border-dashed border-[#d5dde2] bg-[#f7fafb] p-10 text-center text-sm text-[#60717d]">검색 결과가 없습니다.</div>
          )}
        </div>

        <footer className="grid gap-2 border-t border-[#edf2f5] bg-[#fbfdfe] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-sm">선택 {selectedItems.length}개</b>
            {selectedItems.length > 0 && (
              <button type="button" onClick={() => setSelectedIds([])} className="rounded-md border border-[#d5dde2] bg-white px-3 py-1.5 text-xs font-semibold">
                선택 해제
              </button>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select
                value={target}
                onChange={async (event) => {
                  const value = event.target.value;
                  if (value !== NEW_ESTIMATE_CATEGORY_OPTION) {
                    setTarget(value);
                    return;
                  }
                  const name = await onPromptNewCategory();
                  if (name) setTarget(name);
                }}
                aria-label="옮길 견적 카테고리"
                className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm"
              >
                <option value={SAME_AS_CATEGORY_TARGET}>공정 이름 그대로 견적 카테고리로</option>
                {estimateCategories.map((name) => (
                  <option key={name} value={name}>견적 카테고리 · {name}</option>
                ))}
                <option value={NEW_ESTIMATE_CATEGORY_OPTION}>+ 새 견적 카테고리 추가…</option>
              </select>
              <button type="button" onClick={moveSelected} disabled={isSaving || selectedItems.length === 0} className="rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                견적 DB로 옮기기
              </button>
            </div>
          </div>
          {selectedItems.length > 0 && (
            <p className="text-xs text-[#60717d]">
              들어갈 견적 카테고리: <b className="text-[#171512]">{targetCategories.join(', ')}</b>
              {newTargetCategories.length > 0 && ` (새로 만듦: ${newTargetCategories.join(', ')})`}
              {selectedItems.some((item) => estimateItems[item._id || '']) && ' · 이미 견적 DB에 있는 품목은 이 카테고리로 옮겨집니다.'}
            </p>
          )}
          {(errorText || doneMessage) && (
            <p className={`text-sm font-semibold ${errorText ? 'text-red-600' : 'text-[#2f7d45]'}`}>{errorText || doneMessage}</p>
          )}
        </footer>
      </section>
    </div>
  );
}

function TriStateCheckbox({ state, onChange, label }: { state: 'all' | 'some' | 'none'; onChange: () => void; label: string }) {
  return (
    <input
      type="checkbox"
      checked={state === 'all'}
      ref={(element) => {
        if (element) element.indeterminate = state === 'some';
      }}
      onChange={onChange}
      aria-label={label}
      className="h-4 w-4"
    />
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
          <div className="grid gap-2">
            <span className="text-sm font-semibold">색상</span>
            <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-2">
              <input value={task.color || '#f1c76a'} type="color" onChange={(event) => onChange({ ...task, color: event.target.value })} className="h-11 w-full rounded-md border border-[#d5dde2] bg-white px-2 py-1" />
              <div className="flex flex-wrap gap-1.5">
                {favoriteScheduleColors.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => onChange({ ...task, color: color.value })}
                    title={color.label}
                    className={`h-8 w-8 rounded-full border-2 shadow-sm transition hover:-translate-y-0.5 ${normalizeColor(task.color) === color.value ? 'border-[#171512]' : 'border-white'}`}
                    style={{ backgroundColor: color.value }}
                    aria-label={`${color.label} 색상 선택`}
                  />
                ))}
              </div>
            </div>
          </div>
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
    <div className="grid gap-1">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#60717d]">{label}</span>
      {children}
    </div>
  );
}

function CellInput({ value, listId, onChange }: { value: string; listId?: string; onChange: (value: string) => void }) {
  return <input value={value} list={listId} onChange={(event) => onChange(event.target.value)} className="w-full min-w-0 rounded-md border border-[#d5dde2] px-2 py-2 outline-none focus:border-[#38a9bd]" />;
}

function CellNumber({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <NumberTextInput value={value} onChange={onChange} className="w-full min-w-0" />;
}

function NumberTextInput({ value, onChange, className = '' }: { value: number; onChange: (value: number) => void; className?: string }) {
  const [displayValue, setDisplayValue] = useState(formatNumberInput(value));
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) setDisplayValue(formatNumberInput(value));
  }, [isEditing, value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={displayValue}
      onFocus={() => setIsEditing(true)}
      onBlur={() => {
        setIsEditing(false);
        setDisplayValue(formatNumberInput(value));
      }}
      onChange={(event) => {
        const nextValue = normalizeNumberInputText(event.target.value);
        setDisplayValue(nextValue);
        onChange(parseNumberInput(nextValue));
      }}
      className={`${className} rounded-md border border-[#d5dde2] px-2 py-2 text-right outline-none focus:border-[#38a9bd]`}
    />
  );
}

function LandscapeEstimateDocumentPreview({
  site,
  lines,
  totals,
  versionLabel,
  view,
  detailPreviewPageIndex = 0,
  unwrap = false,
}: {
  site?: Site;
  lines: EstimateLine[];
  totals: ReturnType<typeof calculateTotals>;
  versionLabel: string;
  view: 'cover' | 'summary' | 'detail';
  detailPreviewPageIndex?: number;
  unwrap?: boolean;
}) {
  const visibleLines = lines.filter((line) => line.name);
  const grouped = groupLinesByCategory(visibleLines);
  const detailPages = buildEstimateDetailPrintPages(lines, totals.customerEstimateTotal);
  const safeDetailPreviewPageIndex = Math.min(Math.max(0, detailPreviewPageIndex), Math.max(0, detailPages.length - 1));
  const today = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
  const customerAddress = site?.address || site?.title || '';
  const customerName = site?.customerName || '고객';
  const customerPhone = site?.customerPhone || '';
  const constructionTitle = site?.title || `${site?.siteType || '인테리어'} 공사`;
  const estimateAmountText = toKoreanEstimateAmount(totals.customerEstimateTotal);
  const documentTitle = versionLabel ? `견적서 · ${versionLabel}` : '견적서';
  const company = {
    name: '위브디자인',
    ceo: '김현종',
    address: '경기도 의왕시 오리나무1길 12, 1층',
    phone: '031.381.0489',
    fax: '031.422.2915',
    email: 'weve0489@gmail.com',
    manager: '김현종',
    managerPhone: '010.6346.3882',
    businessNumber: '138-05-48056',
  };

  const content = (
    <>
      {view === 'cover' && (
        <section className="print-landscape mx-auto aspect-[1.414/1] w-full max-w-[1120px] border border-[#111] bg-white px-16 py-10 text-[#111] print:max-w-none print:border-0 print:px-10 print:py-8">
          <div className="mx-auto max-w-[940px]">
            <div className="estimate-title-strip grid grid-cols-3 bg-[#d9d9d9] py-4 text-center text-3xl font-semibold tracking-[0.65em]">
              <span>견</span>
              <span>적</span>
              <span>서</span>
            </div>
            <p className="mt-3 border-b-[6px] border-[#bfbfbf] pb-3 text-right text-lg">견적 표지</p>
            <table className="mt-3 w-full border-collapse text-lg">
              <tbody>
                <DocumentCoverLine label="고객명" value={`${customerAddress} · ${customerName} 귀하`} side={customerPhone ? `(연락처: ${customerPhone})` : ''} />
                <DocumentCoverLine label="공사명" value={constructionTitle} side={`발행일 : ${today}`} />
                <DocumentCoverLine label="견적금액" value={`일금 ${estimateAmountText} 원정`} side={`${formatWonAmount(totals.customerEstimateTotal)} (부가세 별도)`} strong />
              </tbody>
            </table>
            <p className="border-b-[6px] border-[#bfbfbf] px-8 py-5 text-lg font-semibold">상기와 같이 견적을 제출합니다.</p>
            <div className="mt-7 grid grid-cols-[1fr_1fr] items-end gap-24">
              <div>
                <p className="mb-5 text-base leading-8">*견적 외 사항은 별도입니다.<br />*견적서 유효기간은 발행일로부터 30일간 유효합니다.</p>
                <img src="/weve-mark.png" alt="WEVE DESIGN" className="mx-auto h-auto w-[161px] object-contain" />
              </div>
              <div className="pl-16 text-lg leading-9 print:pl-20">
                <p className="tracking-[0.35em]">위 브 디 자 인</p>
                <p>{company.address}</p>
                <p>대표 : {company.ceo}</p>
                <p>☎ {company.phone} &nbsp;&nbsp; FAX {company.fax}</p>
                <p>✉ {company.email}</p>
                <p>담당자 : {company.manager} &nbsp; {company.managerPhone}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {view === 'summary' && (
        <section className="print-landscape mx-auto aspect-[1.414/1] w-full max-w-[1120px] border border-[#111] bg-white px-8 py-7 text-[#111] print:max-w-none print:border print:px-7 print:py-6">
          <h1 className="mx-auto w-[340px] border-2 border-[#93bd5b] py-2 text-center text-3xl font-semibold tracking-[0.5em]">견 적 서</h1>
          <header className="mt-4 grid grid-cols-[1fr_360px] gap-10 text-sm leading-6">
            <div>
              <div className="grid grid-cols-[145px_1fr] gap-x-4 text-base leading-7">
                <span>{today}</span>
                <span>{customerAddress}</span>
                <span>{site?.siteType ? `${site.siteType}` : ''}</span>
                <span>{customerName} 님 귀하</span>
              </div>
              <div className="mt-2 grid grid-cols-[145px_1fr] border-t border-[#111] pt-2 text-base">
                <div className="text-center text-lg font-semibold leading-7">
                  <p>합계금액</p>
                  <p className="text-base font-normal">(부가세 별도)</p>
                </div>
                <div className="flex items-end justify-between gap-4 font-semibold">
                  <span>일금&nbsp;&nbsp; {estimateAmountText} 원정</span>
                  <span>({formatWonAmount(totals.customerEstimateTotal)})</span>
                </div>
              </div>
            </div>
            <div className="pt-8 text-base leading-7">
              <p>등록 번호 <span className="float-right">{company.businessNumber}</span></p>
              <p>{company.address}</p>
              <p>{company.name}</p>
              <p>대표 &nbsp;&nbsp; {company.ceo}</p>
              <p>T-{company.phone} <span className="float-right">FAX-{company.fax}</span></p>
            </div>
          </header>
          <table className="mt-2 w-full table-fixed border-collapse text-base">
            <colgroup>
              <col className="w-[30%]" />
              <col className="w-[20%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[19%]" />
              <col className="w-[15%]" />
            </colgroup>
            <thead>
              <tr className="bg-[#f3f1ec]">
                {['공정', '규격', '산식', '단위', '금액', '세액'].map((header) => (
                  <th key={header} className="border border-[#111] px-3 py-1.5 text-center text-lg font-semibold tracking-[0.25em]">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map((group, index) => (
                <tr key={group.category}>
                  <td className="border border-[#111] px-3 py-1.5">{index + 1}. {group.category}</td>
                  <td className="border border-[#111] px-3 py-1.5"></td>
                  <td className="border border-[#111] px-3 py-1.5 text-center">1</td>
                  <td className="border border-[#111] px-3 py-1.5 text-center">식</td>
                  <td className="border border-[#111] px-3 py-1.5 text-right">{formatPlainNumber(group.customerAmount)}</td>
                  <td className="border border-[#111] px-3 py-1.5"></td>
                </tr>
              ))}
              {Array.from({ length: Math.max(0, 13 - grouped.length) }).map((_, index) => (
                <tr key={`summary-blank-${index}`}>
                  <td className="border border-[#111] px-3 py-1.5">&nbsp;</td>
                  <td className="border border-[#111] px-3 py-1.5"></td>
                  <td className="border border-[#111] px-3 py-1.5"></td>
                  <td className="border border-[#111] px-3 py-1.5"></td>
                  <td className="border border-[#111] px-3 py-1.5"></td>
                  <td className="border border-[#111] px-3 py-1.5"></td>
                </tr>
              ))}
              <tr className="bg-[#f8e8da] text-lg font-semibold">
                <td className="border border-[#111] px-3 py-2 text-center" colSpan={4}>합계 (부가세 별도)</td>
                <td className="border border-[#111] px-3 py-2 text-right">{formatPlainNumber(totals.customerEstimateTotal)}</td>
                <td className="border border-[#111] px-3 py-2"></td>
              </tr>
            </tbody>
          </table>
          <p className="mt-1 text-sm">※ 비고 및 특이사항</p>
        </section>
      )}

      {view === 'detail' && (
        detailPages.map((pageRows, pageIndex) => (
          <DetailEstimatePrintPage
            key={`detail-page-${pageIndex}`}
            rows={pageRows}
            pageNumber={pageIndex + 1}
            pageTotal={detailPages.length}
            companyName={company.name}
            documentTitle={documentTitle}
            hiddenOnScreen={!unwrap && pageIndex !== safeDetailPreviewPageIndex}
          />
        ))
      )}
    </>
  );

  if (unwrap) return content;

  return (
    <article id="estimate-print" className="rounded-lg border border-[#d5dde2] bg-white p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
      {content}
    </article>
  );
}

function DetailEstimatePrintPage({
  rows,
  pageNumber,
  pageTotal,
  companyName,
  documentTitle,
  hiddenOnScreen = false,
}: {
  rows: DetailPrintRow[];
  pageNumber: number;
  pageTotal: number;
  companyName: string;
  documentTitle: string;
  hiddenOnScreen?: boolean;
}) {
  return (
    <section className={`print-landscape print-detail mx-auto aspect-[1.414/1] w-full max-w-[1120px] border border-[#111] bg-white px-10 py-8 text-[#111] print:max-w-none print:border-0 print:px-4 print:py-4 ${hiddenOnScreen ? 'hidden print:block' : ''}`}>
      <h1 className="pb-4 text-center text-2xl font-semibold tracking-[0.7em]">[ 내 역 서 ]</h1>
      <table className="print-detail-table w-full border-collapse text-sm">
        <thead>
          <tr className="bg-[#e6e6f6]">
            {['품명', '규격', '단위', '수량', '단가', '금액', '비고'].map((header) => (
              <th key={header} className="border border-[#111] px-2 py-2 text-center text-base font-semibold tracking-[0.25em]">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(() => {
            const nameSpans = detailNameRowSpans(rows);
            return rows.map((row, index) => renderDetailPrintRow(row, nameSpans[index]));
          })()}
        </tbody>
      </table>
      <div className="mt-4 flex justify-between text-sm">
        <span>{pageNumber}/{pageTotal}</span>
        <span>{companyName}</span>
      </div>
      <p className="sr-only">{documentTitle}</p>
    </section>
  );
}

// Consecutive lines with the same 품명 on one page share a single merged 품명 cell (0 = covered by the cell above).
function detailNameRowSpans(rows: DetailPrintRow[]) {
  const spans = rows.map(() => 1);
  rows.forEach((row, index) => {
    if (row.type !== 'line' || spans[index] === 0) return;
    const name = row.line.name.trim();
    if (!name) return;
    let end = index + 1;
    while (end < rows.length) {
      const next = rows[end];
      if (next.type !== 'line' || next.line.name.trim() !== name) break;
      spans[end] = 0;
      end += 1;
    }
    spans[index] = end - index;
  });
  return spans;
}

function renderDetailPrintRow(row: DetailPrintRow, nameRowSpan = 1) {
  if (row.type === 'group') {
    return (
      <tr key={row.key} className="font-semibold">
        <td className="border border-[#111] px-3 py-1.5">{row.groupIndex + 1}. {row.category}</td>
        <td className="border border-[#111] px-3 py-1.5"></td>
        <td className="border border-[#111] px-3 py-1.5"></td>
        <td className="border border-[#111] px-3 py-1.5"></td>
        <td className="border border-[#111] px-3 py-1.5"></td>
        <td className="border border-[#111] px-3 py-1.5"></td>
        <td className="border border-[#111] px-3 py-1.5"></td>
      </tr>
    );
  }

  if (row.type === 'line') {
    const { line } = row;
    return (
      <tr key={row.key}>
        {nameRowSpan > 1 ? (
          <td rowSpan={nameRowSpan} className="border border-[#111] px-3 py-1.5 text-center align-middle">{line.name}</td>
        ) : nameRowSpan === 1 ? (
          <td className="border border-[#111] px-3 py-1.5">{line.name}</td>
        ) : null}
        <td className="border border-[#111] px-3 py-1.5 text-center">{line.spec || line.space}</td>
        <td className="border border-[#111] px-3 py-1.5 text-center">{line.unit || '식'}</td>
        <td className="border border-[#111] px-3 py-1.5 text-right">{formatPlainNumber(line.quantity)}</td>
        <td className="border border-[#111] px-3 py-1.5 text-right">{formatPlainNumber(line.customerUnitPrice)}</td>
        <td className="border border-[#111] px-3 py-1.5 text-right">{formatPlainNumber(line.quantity * line.customerUnitPrice)}</td>
        <td className="border border-[#111] px-2 py-1 text-center text-[11px] font-semibold leading-tight text-[#c00000]">{line.note}</td>
      </tr>
    );
  }

  const isTotal = row.type === 'total';
  // A category split into 품명 소계 rows (e.g. 거실 욕실 / 안방 욕실) closes with 합계, so the grand total reads 총합계.
  const label = isTotal ? '총합계' : row.type === 'subtotal' && row.hasNameSubtotals ? '합계' : '소계';
  return (
    <tr key={row.key} className={isTotal ? 'bg-[#dff1f4] text-lg font-semibold' : 'bg-[#f5f3ed] font-semibold'}>
      <td className="border border-[#111] px-3 py-1.5 text-center"><span className="pl-[0.8em] tracking-[0.8em]">{label}</span></td>
      <td className="border border-[#111] px-3 py-1.5"></td>
      <td className="border border-[#111] px-3 py-1.5"></td>
      <td className="border border-[#111] px-3 py-1.5"></td>
      <td className="border border-[#111] px-3 py-1.5"></td>
      <td className="border border-[#111] px-3 py-1.5 text-right">{formatPlainNumber(row.amount)}</td>
      <td className="border border-[#111] px-3 py-1.5"></td>
    </tr>
  );
}

function EstimateDocumentPreview({
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
  const today = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
  const customerLabel = [site?.address, site?.customerName].filter(Boolean).join(' · ') || site?.title || '고객';
  const constructionTitle = site?.title || `${site?.siteType || '인테리어'} 공사`;

  return (
    <article id="estimate-print" className="rounded-lg border border-[#d5dde2] bg-white p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
      {view === 'cover' && (
        <section className="mx-auto min-h-[760px] max-w-[980px] border border-[#111] bg-white px-14 py-16 text-[#111]">
          <div className="mx-auto max-w-[860px]">
            <div className="grid grid-cols-3 bg-[#d9d9d9] py-4 text-center text-3xl font-semibold tracking-[0.65em]">
              <span>견</span>
              <span>적</span>
              <span>서</span>
            </div>
            <p className="mt-3 border-b-[6px] border-[#bfbfbf] pb-3 text-right text-lg">견적 표지</p>
            <table className="mt-4 w-full border-collapse text-lg">
              <tbody>
                <DocumentCoverLine label="고객명" value={`${customerLabel} 귀하`} side={site?.customerPhone ? `(연락처: ${site.customerPhone})` : ''} />
                <DocumentCoverLine label="공사명" value={constructionTitle} side={`발행일 : ${today}`} />
                <DocumentCoverLine label="견적 금액" value={`일금 ${toKoreanEstimateAmount(totals.customerEstimateTotal)} 원정`} side={`${formatPlainNumber(totals.customerEstimateTotal)} (부가세 별도)`} strong />
              </tbody>
            </table>
            <p className="border-b-[6px] border-[#bfbfbf] px-8 py-5 text-lg font-semibold">상기와 같이 견적을 제출합니다.</p>
            <div className="mt-14 grid grid-cols-[1fr_1.1fr] gap-10">
              <div className="flex flex-col items-center justify-center">
                <div className="text-center text-5xl font-serif tracking-[0.22em] text-[#22313a]">WEVE</div>
                <div className="mt-2 text-[10px] tracking-[0.28em] text-[#22313a]">INTERIOR DESIGN</div>
              </div>
              <div className="text-lg leading-9">
                <p className="tracking-[0.35em]">위 브 디 자 인</p>
                <p>경기도 의왕시 오리나무1길 12, 1층</p>
                <p>대표 : 김현종</p>
                <p>☎ 031.381.0489 &nbsp;&nbsp; FAX 031.422.2915</p>
                <p>✉ weve0489@gmail.com</p>
                <p>담당자 : 김현종 &nbsp; 010.6346.3882</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {view === 'summary' && (
        <section className="mx-auto min-h-[760px] max-w-[980px] border border-[#111] bg-white p-8 text-[#111]">
          <header className="grid grid-cols-[1fr_340px] gap-6">
            <div>
              <h1 className="mx-auto w-[340px] border-2 border-[#93bd5b] py-3 text-center text-3xl font-semibold tracking-[0.65em]">견적서</h1>
              <div className="mt-4 text-base leading-7">
                <p>{today}</p>
                <p>{customerLabel} 님 귀하</p>
                <p>{site?.siteType ? `평형: ${site.siteType}` : ''}</p>
              </div>
              <div className="mt-1 border-t border-[#111] pt-2 text-center">
                <p className="text-xl font-semibold">합계 금액</p>
                <p className="mt-1 text-lg">(부가세 별도) &nbsp; 일금 {toKoreanEstimateAmount(totals.customerEstimateTotal)} 원정</p>
                <p className="mt-1 text-xl font-semibold">({formatPlainNumber(totals.customerEstimateTotal)})</p>
              </div>
            </div>
            <div className="pt-5 text-base leading-7">
              <p>등록 번호 <span className="float-right">138-05-48056</span></p>
              <p>경기도 의왕시 오리나무1길 12, 1층</p>
              <p>위브디자인</p>
              <p>대표 &nbsp;&nbsp; 김현종</p>
              <p>T-031.381.0489 <span className="float-right">FAX-031.422.2915</span></p>
            </div>
          </header>
          <table className="mt-2 w-full border-collapse text-base">
            <thead>
              <tr className="bg-[#f3f1ec]">
                {['공정', '규격', '산식', '단위', '금액', '세액'].map((header) => (
                  <th key={header} className="border border-[#111] px-3 py-1.5 text-center text-lg font-semibold tracking-[0.25em]">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map((group, index) => (
                <tr key={group.category}>
                  <td className="border border-[#111] px-3 py-1.5">{index + 1}. {group.category}</td>
                  <td className="border border-[#111] px-3 py-1.5">{group.representativeSpec}</td>
                  <td className="border border-[#111] px-3 py-1.5 text-center">1</td>
                  <td className="border border-[#111] px-3 py-1.5 text-center">식</td>
                  <td className="border border-[#111] px-3 py-1.5 text-right">{formatPlainNumber(group.customerAmount)}</td>
                  <td className="border border-[#111] px-3 py-1.5"></td>
                </tr>
              ))}
              {Array.from({ length: Math.max(0, 13 - grouped.length) }).map((_, index) => (
                <tr key={`blank-${index}`}>
                  <td className="border border-[#111] px-3 py-1.5">&nbsp;</td>
                  <td className="border border-[#111] px-3 py-1.5"></td>
                  <td className="border border-[#111] px-3 py-1.5"></td>
                  <td className="border border-[#111] px-3 py-1.5"></td>
                  <td className="border border-[#111] px-3 py-1.5"></td>
                  <td className="border border-[#111] px-3 py-1.5"></td>
                </tr>
              ))}
              <tr className="bg-[#f8e8da] text-lg font-semibold">
                <td className="border border-[#111] px-3 py-2 text-center" colSpan={4}>합 계 (부가세 별도)</td>
                <td className="border border-[#111] px-3 py-2 text-right">{formatPlainNumber(totals.customerEstimateTotal)}</td>
                <td className="border border-[#111] px-3 py-2"></td>
              </tr>
            </tbody>
          </table>
          <p className="mt-1 text-sm">※ 비고 및 특이사항</p>
        </section>
      )}

      {view === 'detail' && (
        <section className="mx-auto max-w-[1080px] border border-[#111] bg-white p-10 text-[#111]">
          <h1 className="pb-4 text-center text-2xl font-semibold tracking-[0.7em]">[ 내 역 서 ]</h1>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#e6e6f6]">
                {['품 명', '규 격', '단위', '수량', '단 가', '금 액', '비고'].map((header) => (
                  <th key={header} className="border border-[#111] px-2 py-2 text-center text-base font-semibold tracking-[0.35em]">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map((group, groupIndex) => (
                <Fragment key={group.category}>
                  <tr className="font-semibold">
                    <td className="border border-[#111] px-3 py-1.5">{groupIndex + 1}. {group.category}</td>
                    <td className="border border-[#111] px-3 py-1.5"></td>
                    <td className="border border-[#111] px-3 py-1.5"></td>
                    <td className="border border-[#111] px-3 py-1.5"></td>
                    <td className="border border-[#111] px-3 py-1.5"></td>
                    <td className="border border-[#111] px-3 py-1.5"></td>
                    <td className="border border-[#111] px-3 py-1.5"></td>
                  </tr>
                  {group.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="border border-[#111] px-3 py-1.5">{line.name}</td>
                      <td className="border border-[#111] px-3 py-1.5 text-center">{line.spec || line.space}</td>
                      <td className="border border-[#111] px-3 py-1.5 text-center">{line.unit || '식'}</td>
                      <td className="border border-[#111] px-3 py-1.5 text-right">{formatPlainNumber(line.quantity)}</td>
                      <td className="border border-[#111] px-3 py-1.5 text-right">{formatPlainNumber(line.customerUnitPrice)}</td>
                      <td className="border border-[#111] px-3 py-1.5 text-right">{formatPlainNumber(line.quantity * line.customerUnitPrice)}</td>
                      <td className="border border-[#111] px-3 py-1.5 text-xs">{line.note}</td>
                    </tr>
                  ))}
                  <tr className="bg-[#f5f3ed] font-semibold">
                    <td className="border border-[#111] px-3 py-1.5 text-center">소 계</td>
                    <td className="border border-[#111] px-3 py-1.5"></td>
                    <td className="border border-[#111] px-3 py-1.5"></td>
                    <td className="border border-[#111] px-3 py-1.5"></td>
                    <td className="border border-[#111] px-3 py-1.5"></td>
                    <td className="border border-[#111] px-3 py-1.5 text-right">{formatPlainNumber(group.customerAmount)}</td>
                    <td className="border border-[#111] px-3 py-1.5"></td>
                  </tr>
                </Fragment>
              ))}
              <tr className="bg-[#dff1f4] text-lg font-semibold">
                <td className="border border-[#111] px-3 py-2 text-center">합 계</td>
                <td className="border border-[#111] px-3 py-2"></td>
                <td className="border border-[#111] px-3 py-2"></td>
                <td className="border border-[#111] px-3 py-2"></td>
                <td className="border border-[#111] px-3 py-2"></td>
                <td className="border border-[#111] px-3 py-2 text-right">{formatPlainNumber(totals.customerEstimateTotal)}</td>
                <td className="border border-[#111] px-3 py-2"></td>
              </tr>
            </tbody>
          </table>
          <div className="mt-4 flex justify-between text-sm">
            <span>1/1</span>
            <span>위브디자인</span>
          </div>
        </section>
      )}
    </article>
  );
}

function DocumentCoverLine({ label, value, side = '', strong = false }: { label: string; value: string; side?: string; strong?: boolean }) {
  return (
    <tr>
      <th className="w-32 border-y-2 border-[#111] px-4 py-4 text-left font-normal tracking-[0.35em]">{label}</th>
      <td className={`border-y-2 border-[#111] px-4 py-4 ${strong ? 'font-semibold' : ''}`}>{value}</td>
      <td className="w-64 border-y-2 border-[#111] px-4 py-4 text-right">{side}</td>
    </tr>
  );
}

function formatPlainNumber(value: number) {
  return Number(value || 0).toLocaleString('ko-KR');
}

function formatWonAmount(value: number) {
  return `₩${formatPlainNumber(value)}`;
}

function toKoreanEstimateAmount(value: number) {
  const number = Math.max(0, Math.round(Number(value || 0)));
  if (!number) return '영';

  const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const smallUnits = ['', '십', '백', '천'];
  const largeUnits = ['', '만', '억', '조'];
  const chunks: string[] = [];
  let rest = number;

  for (let unitIndex = 0; rest > 0; unitIndex += 1) {
    const chunk = rest % 10000;
    if (chunk > 0) {
      const parts: string[] = [];
      const chunkText = String(chunk).padStart(4, '0');
      for (let index = 0; index < 4; index += 1) {
        const digit = Number(chunkText[index]);
        if (!digit) continue;
        const smallUnitIndex = 3 - index;
        parts.push(`${digits[digit]}${smallUnits[smallUnitIndex]}`);
      }
      chunks.unshift(`${parts.join('')}${largeUnits[unitIndex] || ''}`);
    }
    rest = Math.floor(rest / 10000);
  }

  return chunks.join('');
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
    const updatedDiff = estimateUpdatedTime(b) - estimateUpdatedTime(a);
    if (updatedDiff !== 0) return updatedDiff;
    const createdDiff = estimateCreatedTime(b) - estimateCreatedTime(a);
    if (createdDiff !== 0) return createdDiff;
    return estimateVersionRank(a.versionType) - estimateVersionRank(b.versionType);
  });
}

function estimateCreatedTime(estimate: SiteEstimate) {
  return new Date(estimate.createdAt || estimate.updatedAt || 0).getTime();
}

function estimateUpdatedTime(estimate: SiteEstimate) {
  return new Date(estimate.updatedAt || estimate.createdAt || 0).getTime();
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

function getPurchaseOrderLabels(order: Partial<PurchaseOrder>): PurchaseOrderColumnLabels {
  const templateKey = order.templateKey && purchaseOrderTemplates[order.templateKey] ? order.templateKey : 'modelSpec';
  const labels = {
    ...purchaseOrderTemplates[templateKey],
    ...(order.columnLabels || {}),
  };
  if (templateKey === 'subType') {
    return { ...labels, category: '구분', modelName: '소구분', spec: '종류' };
  }
  return labels;
}

function getPurchaseOrderVisibleColumns(order: Partial<PurchaseOrder>): PurchaseOrderTableColumn[] {
  const templateKey = order.templateKey && purchaseOrderTemplates[order.templateKey] ? order.templateKey : 'modelSpec';
  const visibleColumns = Array.isArray(order.visibleColumns) ? order.visibleColumns.filter((column): column is PurchaseOrderTableColumn => purchaseOrderColumnKeys.includes(column as PurchaseOrderTableColumn)) : [];
  return visibleColumns.length ? visibleColumns : defaultPurchaseOrderVisibleColumns[templateKey];
}

function purchaseOrderColumnLabel(labels: PurchaseOrderColumnLabels, column: PurchaseOrderTableColumn) {
  if (column === 'note') return '비고';
  return labels[column];
}

function doorPurchaseDraftColumnLabel(column: PurchaseOrderTableColumn) {
  const labels: Partial<Record<PurchaseOrderTableColumn, string>> = {
    category: '번호/항목',
    modelName: '프레임 규격 / 단일 규격',
    spec: '도어 규격 / 모델명',
    quantity: '세트 수량 / 수량',
    unit: '프레임 옵션 / 단위',
    amount: '금액',
    note: '도어 옵션 / 기타 내용',
  };
  return labels[column] || column;
}

function purchaseOrderColumnWidth(order: Partial<PurchaseOrder>, column: PurchaseOrderTableColumn) {
  const rawWidth = order.columnWidths?.[column] || purchaseOrderColumnWidthValues[column];
  const numericWidth = Number(String(rawWidth).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(numericWidth) || numericWidth <= 0) return Number(purchaseOrderColumnWidthValues[column]);
  return Math.min(100, Math.max(1, numericWidth));
}

function purchaseOrderHeaderMergeRange(order: Partial<PurchaseOrder>, visibleColumns: PurchaseOrderTableColumn[]) {
  const label = String(order.headerMergeLabel || '').trim();
  const selected = Array.isArray(order.headerMergeColumns)
    ? order.headerMergeColumns.filter((column): column is PurchaseOrderTableColumn => visibleColumns.includes(column as PurchaseOrderTableColumn))
    : [];
  if (!label || selected.length < 2) return null;

  const indexes = selected
    .map((column) => visibleColumns.indexOf(column))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
  if (indexes.length < 2) return null;
  const start = indexes[0];
  const end = indexes[indexes.length - 1];
  return {
    label,
    start,
    end,
    columns: visibleColumns.slice(start, end + 1),
  };
}

function renderPurchaseOrderHeaderRows(
  order: Partial<PurchaseOrder>,
  labels: PurchaseOrderColumnLabels,
  visibleColumns: PurchaseOrderTableColumn[],
  className = 'border border-[#171512] px-3 py-2 text-center',
) {
  const mergeRange = purchaseOrderHeaderMergeRange(order, visibleColumns);
  if (!mergeRange) {
    return (
      <tr>
        {visibleColumns.map((column) => (
          <th key={column} className={className}>
            {purchaseOrderColumnLabel(labels, column)}
          </th>
        ))}
      </tr>
    );
  }

  return (
    <tr>
      {visibleColumns.map((column, index) => {
        if (index > mergeRange.start && index <= mergeRange.end) return null;
        if (index === mergeRange.start) {
          return (
            <th key={`merged-${mergeRange.columns.join('-')}`} colSpan={mergeRange.end - mergeRange.start + 1} className={className}>
              {mergeRange.label}
            </th>
          );
        }
        return (
          <th key={column} className={className}>
            {purchaseOrderColumnLabel(labels, column)}
          </th>
        );
      })}
    </tr>
  );
}

function purchaseOrderColumnAlign(order: Partial<PurchaseOrder>, column: PurchaseOrderTableColumn): PurchaseOrderCellAlign {
  const value = order.cellAlignments?.[column];
  if (value === 'left' || value === 'center' || value === 'right') return value;
  return purchaseOrderDefaultCellAlignments[column];
}

function purchaseOrderCellClass(column: PurchaseOrderTableColumn, order: Partial<PurchaseOrder> = {}) {
  const base = 'break-words border border-[#171512] px-3 py-2 align-middle';
  const align = purchaseOrderColumnAlign(order, column);
  const alignClass = align === 'center' ? 'text-center' : align === 'right' ? 'text-right tabular-nums' : 'text-left';
  const numeric = column === 'quantity' || column === 'amount' ? 'break-all tabular-nums' : '';
  const weight = column === 'modelName' ? 'font-semibold' : '';
  return [base, alignClass, numeric, weight].filter(Boolean).join(' ');
}

function renderPurchaseOrderCell(item: PurchaseOrderItem, column: PurchaseOrderTableColumn) {
  if (column === 'quantity') return formatNumber(item.quantity);
  if (column === 'amount') return formatMoney(item.quantity * item.unitPrice);
  if (column === 'category') return item.category;
  if (column === 'modelName') return item.modelName;
  if (column === 'spec') return item.spec;
  if (column === 'unit') return item.unit;
  return item.note;
}

const purchaseOrderAutoMergeColumns = new Set<PurchaseOrderTableColumn>(['modelName', 'spec', 'quantity', 'unit']);

function purchaseOrderCellMergeKey(item: PurchaseOrderItem, column: PurchaseOrderTableColumn) {
  if (!purchaseOrderAutoMergeColumns.has(column)) return '';
  const modelName = (item.modelName || '').trim().toLocaleLowerCase('ko-KR');
  const spec = (item.spec || '').trim().toLocaleLowerCase('ko-KR');
  const quantity = String(Number(item.quantity || 0));
  const unit = (item.unit || '').trim().toLocaleLowerCase('ko-KR');
  const itemName = spec || modelName;
  if (!itemName || !unit) return '';
  return [modelName, spec, quantity, unit].join('|');
}

function purchaseOrderColumnRowSpan(groupItems: PurchaseOrderItem[], index: number, column: PurchaseOrderTableColumn) {
  if (!purchaseOrderAutoMergeColumns.has(column)) return 1;
  const key = purchaseOrderCellMergeKey(groupItems[index], column);
  if (!key) return 1;
  if (index > 0 && purchaseOrderCellMergeKey(groupItems[index - 1], column) === key) return 0;

  let span = 1;
  for (let nextIndex = index + 1; nextIndex < groupItems.length; nextIndex += 1) {
    if (purchaseOrderCellMergeKey(groupItems[nextIndex], column) !== key) break;
    span += 1;
  }
  return span;
}

function renderGroupedPurchaseRows(items: PurchaseOrderItem[], onEdit: (item: PurchaseOrderItem) => void, visibleColumns: PurchaseOrderTableColumn[], order: Partial<PurchaseOrder> = {}) {
  const groups: Array<{ category: string; items: PurchaseOrderItem[] }> = [];
  const groupMap = new Map<string, { category: string; items: PurchaseOrderItem[] }>();
  items.forEach((item) => {
    const category = item.category.trim() || '미분류';
    const key = category.toLocaleLowerCase('ko-KR');
    let group = groupMap.get(key);
    if (!group) {
      group = { category, items: [] };
      groupMap.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  });

  return groups.map((group) => (
    <Fragment key={`${group.category}-${group.items[0]?.id}`}>
      {group.items.map((item, index) => (
        <tr key={`summary-${item.id}`} onDoubleClick={() => onEdit(item)} className="cursor-pointer hover:bg-[#fff8e8]">
          {visibleColumns.map((column) => {
            if (column === 'category') {
              if (index > 0) return null;
              return (
                <td key={`${item.id}-${column}`} rowSpan={group.items.length} className="break-words border border-[#171512] px-3 py-2 text-center font-semibold">
                  {group.category}
                </td>
              );
            }
            const rowSpan = purchaseOrderColumnRowSpan(group.items, index, column);
            if (rowSpan === 0) return null;
            return (
              <td key={`${item.id}-${column}`} rowSpan={rowSpan > 1 ? rowSpan : undefined} className={purchaseOrderCellClass(column, order)}>
                {renderPurchaseOrderCell(item, column)}
              </td>
            );
          })}
        </tr>
      ))}
    </Fragment>
  ));
}

function clonePurchaseOrders(orders: PurchaseOrder[]) {
  return orders.map((order, orderIndex) => ({
    ...order,
    id: `purchase-${Date.now()}-${orderIndex}-${Math.random().toString(16).slice(2)}`,
    columnLabels: getPurchaseOrderLabels(order),
    visibleColumns: getPurchaseOrderVisibleColumns(order),
    columnWidths: { ...purchaseOrderColumnWidthValues, ...(order.columnWidths || {}) },
    cellAlignments: { ...purchaseOrderDefaultCellAlignments, ...(order.cellAlignments || {}) },
    mergeSameCategory: Boolean(order.mergeSameCategory),
    items: order.items.map((item, itemIndex) => ({
      ...item,
      id: `po-item-${Date.now()}-${orderIndex}-${itemIndex}-${Math.random().toString(16).slice(2)}`,
    })),
  }));
}

function hydratePurchaseOrders(orders: Partial<PurchaseOrder>[]) {
  const next = orders.map((order, orderIndex) => {
    const templateKey = order.templateKey && purchaseOrderTemplates[order.templateKey] ? order.templateKey : 'modelSpec';
    return {
      ...emptyPurchaseOrder(order.title || `발주서 ${orderIndex + 1}`),
      ...order,
      id: order.id || `purchase-${Date.now()}-${orderIndex}-${Math.random().toString(16).slice(2)}`,
      templateKey,
      columnLabels: getPurchaseOrderLabels({ ...order, templateKey }),
      visibleColumns: getPurchaseOrderVisibleColumns({ ...order, templateKey }),
      columnWidths: { ...purchaseOrderColumnWidthValues, ...(order.columnWidths || {}) },
      cellAlignments: { ...purchaseOrderDefaultCellAlignments, ...(order.cellAlignments || {}) },
      mergeSameCategory: order.mergeSameCategory ?? templateKey === 'subType',
      doorModelName: String(order.doorModelName || ''),
      doorFinish: String(order.doorFinish || (templateKey === 'doorSet' ? '필름' : '')),
      doorBrand: String(order.doorBrand || ''),
      items: Array.isArray(order.items) && order.items.length
        ? order.items
            .filter((item) => item.category || item.modelName || item.spec || item.note || Number(item.quantity || 0) || Number(item.unitPrice || 0))
            .map((item, itemIndex) => ({
              ...emptyPurchaseOrderItem(),
              ...item,
              id: item.id || `po-item-${Date.now()}-${orderIndex}-${itemIndex}-${Math.random().toString(16).slice(2)}`,
              quantity: Number(item.quantity || 0),
              unitPrice: Number(item.unitPrice || 0),
            }))
        : [],
    };
  });
  return next.length ? next : [emptyPurchaseOrder()];
}

function hydratePurchaseOrderTemplatePresets(presets: Partial<PurchaseOrderTemplatePreset>[]) {
  const input = Array.isArray(presets) ? presets : [];
  const hydrated = input
    .map((preset, index) => {
      const templateKey = preset.templateKey && purchaseOrderTemplates[preset.templateKey] ? preset.templateKey : 'custom';
      const orderLike = {
        templateKey,
        columnLabels: preset.columnLabels,
        visibleColumns: preset.visibleColumns,
        columnWidths: preset.columnWidths,
        cellAlignments: preset.cellAlignments,
        mergeSameCategory: preset.mergeSameCategory,
        headerMergeLabel: preset.headerMergeLabel,
        headerMergeColumns: preset.headerMergeColumns,
      };
      const visibleColumns = getPurchaseOrderVisibleColumns(orderLike);
      return {
        id: String(preset.id || `purchase-template-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`),
        name: String(preset.name || `템플릿 ${index + 1}`).trim(),
        templateKey,
        columnLabels: getPurchaseOrderLabels(orderLike),
        visibleColumns,
        columnWidths: { ...purchaseOrderColumnWidthValues, ...(preset.columnWidths || {}) },
        cellAlignments: { ...purchaseOrderDefaultCellAlignments, ...(preset.cellAlignments || {}) },
        mergeSameCategory: Boolean(preset.mergeSameCategory),
        headerMergeLabel: String(preset.headerMergeLabel || '').trim(),
        headerMergeColumns: Array.isArray(preset.headerMergeColumns)
          ? preset.headerMergeColumns.filter((column): column is PurchaseOrderTableColumn => purchaseOrderColumnKeys.includes(column as PurchaseOrderTableColumn) && visibleColumns.includes(column as PurchaseOrderTableColumn))
          : [],
      };
    })
    .filter((preset) => preset.name);

  const merged = [...defaultPurchaseOrderTemplatePresets];
  hydrated.forEach((preset) => {
    const existingIndex = merged.findIndex((item) => item.id === preset.id);
    if (existingIndex >= 0) merged[existingIndex] = preset;
    else merged.push(preset);
  });
  return merged.length ? merged : defaultPurchaseOrderTemplatePresets;
}

function cloneExtraItems(items: ExtraItem[]) {
  return items.map((item, index) => ({
    ...item,
    id: `extra-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
  }));
}

function hydrateExtraItems(items: Partial<ExtraItem>[]) {
  const next = items
    .filter((item) => item.name || item.spec || item.note || Number(item.quantity || 0) || Number(item.unitPrice || 0))
    .map((item, index) => ({
      ...emptyExtraItem(),
      ...item,
      id: item.id || `extra-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
    }));
  return next;
}

function estimateLineToWorkLine(line: EstimateLine): WorkLine {
  const quantity = Number(line.quantity || 0);
  const executionUnitPrice = Number(line.executionUnitPrice || 0);
  const expense = quantity * executionUnitPrice;
  return {
    id: `work-${Date.now()}-${line.id}-${Math.random().toString(16).slice(2)}`,
    sourceLineId: line.id,
    date: todayKey(),
    space: line.space,
    category: line.category,
    process: line.process,
    name: line.name,
    spec: line.spec,
    unit: line.unit,
    quantity,
    executionUnitPrice,
    income: 0,
    expense,
    payment: 0,
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

function workLineGroupKey(line: WorkLine, groupBy: 'space' | 'category') {
  return (groupBy === 'space' ? line.space : line.category || line.process) || '미분류';
}

function uniqueLineValues(lines: EstimateLine[], getValue: (line: EstimateLine) => string) {
  return Array.from(new Set(lines.map((line) => getValue(line).trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko-KR'));
}

// Each 공사's lines together, in the order the 공사 first appear, with the 기본견적 공사 first.
function arrangeEstimateLines(lines: EstimateLine[]) {
  return pinBaseGroupFirst(orderTemplateLinesByGroup(lines), isBaseEstimateLine);
}

function isBaseEstimateLine(line: EstimateLine) {
  return [line.name, line.note, line.category, line.process].some((value) => String(value || '').replace(/\s/g, '').includes('기본견적'));
}

function sortWorkLines(lines: WorkLine[], groupBy: 'space' | 'category') {
  return [...lines].sort((a, b) => {
    const groupDiff = workLineGroupKey(a, groupBy).localeCompare(workLineGroupKey(b, groupBy), 'ko-KR');
    if (groupDiff !== 0) return groupDiff;
    return (a.process || a.name).localeCompare(b.process || b.name, 'ko-KR');
  });
}

function workLineExpense(line: Partial<WorkLine>) {
  const explicitExpense = Number(line.expense || 0);
  if (explicitExpense) return explicitExpense;
  return Number(line.quantity || 0) * Number(line.executionUnitPrice || 0);
}

function isMeaningfulWorkLine(line: Partial<WorkLine>) {
  return Boolean(
    line.date ||
      line.process ||
      line.name ||
      line.category ||
      line.income ||
      line.expense ||
      line.payment ||
      line.note,
  );
}

function hydrateWorkLines(lines: Partial<WorkLine>[]) {
  return lines.map((line, index) => ({
    id: String(line.id || `work-${Date.now()}-${index}`),
    sourceLineId: String(line.sourceLineId || ''),
    date: String(line.date || todayKey()),
    space: String(line.space || ''),
    category: String(line.category || ''),
    process: String(line.process || line.category || line.name || ''),
    name: String(line.name || ''),
    spec: String(line.spec || ''),
    unit: String(line.unit || ''),
    quantity: Number(line.quantity || 0),
    executionUnitPrice: Number(line.executionUnitPrice || 0),
    income: Number(line.income || 0),
    expense: workLineExpense(line),
    payment: Number(line.payment || 0),
    vendor: String(line.vendor || ''),
    status: String(line.status || '예정'),
    note: String(line.note || ''),
  })).filter(isMeaningfulWorkLine);
}

function cloneLegacyWorkSites(sites: LegacyWorkSite[]) {
  return sites.map((site) => ({
    ...site,
    rows: site.rows.map((row) => ({ ...row, id: `work-${Date.now()}-${Math.random().toString(16).slice(2)}` })),
  }));
}

function hydrateLegacyWorkSites(sites: Partial<LegacyWorkSite>[]) {
  return sites
    .map((site, index) => ({
      id: String(site.id || `legacy-${Date.now()}-${index}`),
      siteName: String(site.siteName || `과거 현장 ${index + 1}`),
      rows: hydrateWorkLines(Array.isArray(site.rows) ? site.rows : []),
    }))
    .filter((site) => site.siteName || site.rows.length);
}

function mergeLegacyWorkSites(current: LegacyWorkSite[], imported: LegacyWorkSite[]) {
  const map = new Map(current.map((site) => [site.siteName, site]));
  imported.forEach((site) => map.set(site.siteName, site));
  return Array.from(map.values());
}

function workLineToExcelRow(line: WorkLine) {
  return {
    날짜: line.date || '',
    공종: line.process || '',
    수입: Number(line.income || 0),
    지출: Number(workLineExpense(line) || 0),
    결제: Number(line.payment || 0),
    비고: line.note || '',
  };
}

function parseLegacyWorkSheet(rows: Array<Array<string | number | Date>>) {
  const headerIndex = rows.findIndex((row) => {
    const labels = row.map((cell) => normalizeHeaderLabel(cell));
    return labels.includes('날짜') && labels.includes('공종') && (labels.includes('수입') || labels.includes('지출'));
  });
  if (headerIndex < 0) return [];
  const headers = rows[headerIndex].map((cell) => normalizeHeaderLabel(cell));
  const indexOf = (label: string) => headers.indexOf(label);
  const dateIndex = indexOf('날짜');
  const processIndex = indexOf('공종');
  const incomeIndex = indexOf('수입');
  const expenseIndex = indexOf('지출');
  const paymentIndex = indexOf('결제');
  const noteIndex = indexOf('비고');

  return rows
    .slice(headerIndex + 1)
    .map((row, index) => ({
      ...emptyWorkLine(),
      id: `legacy-work-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
      date: parseExcelDate(row[dateIndex]) || todayKey(),
      process: String(row[processIndex] || '').trim(),
      income: Number(parseMoneyCell(row[incomeIndex]) || 0),
      expense: Number(parseMoneyCell(row[expenseIndex]) || 0),
      payment: Number(parseMoneyCell(row[paymentIndex]) || 0),
      note: String(row[noteIndex] || '').trim(),
    }))
    .filter(isMeaningfulWorkLine);
}

function normalizeHeaderLabel(value: unknown) {
  return String(value || '').replace(/\s+/g, '').trim();
}

function parseMoneyCell(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return Number(String(value || '').replace(/[^0-9.-]/g, '')) || 0;
}

function parseExcelDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return dateKey(value);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return dateKey(new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }
  const text = String(value || '').trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  if (/^\d{4}[./]\d{1,2}[./]\d{1,2}$/.test(text)) {
    const [year, month, day] = text.split(/[./]/).map(Number);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return '';
}

function sheetSafeName(value: string) {
  const cleaned = String(value || 'Sheet').replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim() || 'Sheet';
  return cleaned.slice(0, 31);
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
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

// Groups lines with the same 품명 together (in first-appearance order) so the detail sheet can merge their 품명 cells.
function clusterLinesByName(lines: EstimateLine[]) {
  const clusters = new Map<string, EstimateLine[]>();
  lines.forEach((line) => {
    const key = line.name.trim();
    clusters.set(key, [...(clusters.get(key) || []), line]);
  });
  return Array.from(clusters.values());
}

function buildEstimateDetailPrintPages(lines: EstimateLine[], totalAmount: number): DetailPrintRow[][] {
  const visibleLines = lines.filter((line) => line.name);
  const grouped = groupLinesByCategory(visibleLines);
  const pages: DetailPrintRow[][] = [];
  let currentPage: DetailPrintRow[] = [];

  const pushPage = () => {
    if (!currentPage.length) return;
    pages.push(currentPage);
    currentPage = [];
  };

  const appendRow = (row: DetailPrintRow) => {
    if (currentPage.length >= DETAIL_PRINT_ROWS_PER_PAGE) pushPage();
    currentPage.push(row);
  };

  grouped.forEach((group, groupIndex) => {
    const nameClusters = clusterLinesByName(group.lines);
    // A 품명 with several lines (e.g. 거실 욕실, 안방 욕실) gets its own 소계 when the category holds more than one 품명.
    const hasNameSubtotal = (clusterLines: EstimateLine[]) => nameClusters.length > 1 && clusterLines.length > 1;
    const groupRows: DetailPrintRow[] = [
      { type: 'group', key: `detail-group-${group.category}-${groupIndex}`, groupIndex, category: group.category },
      ...nameClusters.flatMap((clusterLines, clusterIndex): DetailPrintRow[] => {
        const lineRows = clusterLines.map((line): DetailPrintRow => ({ type: 'line', key: `detail-line-${line.id}`, line }));
        if (!hasNameSubtotal(clusterLines)) return lineRows;
        return [
          ...lineRows,
          {
            type: 'nameSubtotal',
            key: `detail-name-subtotal-${groupIndex}-${clusterIndex}`,
            amount: clusterLines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.customerUnitPrice || 0), 0),
          },
        ];
      }),
      {
        type: 'subtotal',
        key: `detail-subtotal-${group.category}-${groupIndex}`,
        amount: group.customerAmount,
        hasNameSubtotals: nameClusters.some(hasNameSubtotal),
      },
    ];

    groupRows.forEach((row, rowIndex) => {
      if (rowIndex === 0 && currentPage.length > DETAIL_PRINT_ROWS_PER_PAGE - Math.min(groupRows.length, 4)) pushPage();
      appendRow(row);
    });
  });

  appendRow({ type: 'total', key: 'detail-total', amount: totalAmount });
  pushPage();

  return pages.length ? pages : [[{ type: 'total', key: 'detail-total-empty', amount: totalAmount }]];
}

function calculateTotals(lines: EstimateLine[], workLines: WorkLine[] = [], extraItems: ExtraItem[] = []) {
  const customerEstimateTotal = Math.round(lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.customerUnitPrice || 0), 0));
  const estimateExecutionCostTotal = Math.round(lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.executionUnitPrice || 0), 0));
  const hasWorkLines = workLines.some(isMeaningfulWorkLine);
  const actualExecutionCostTotal = hasWorkLines
    ? Math.round(workLines.reduce((sum, line) => sum + Number(workLineExpense(line) || 0), 0))
    : 0;
  const additionalCostTotal = Math.round(extraItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0));
  const estimatedMarginAmount = customerEstimateTotal - estimateExecutionCostTotal;
  const actualMarginAmount = hasWorkLines ? customerEstimateTotal - actualExecutionCostTotal - additionalCostTotal : 0;
  const estimatedMarginRate = customerEstimateTotal > 0 ? Math.round((estimatedMarginAmount / customerEstimateTotal) * 1000) / 10 : 0;
  const actualMarginRate = customerEstimateTotal > 0 && hasWorkLines ? Math.round((actualMarginAmount / customerEstimateTotal) * 1000) / 10 : 0;
  return {
    customerEstimateTotal,
    estimateExecutionCostTotal,
    actualExecutionCostTotal,
    executionCostTotal: actualExecutionCostTotal,
    additionalCostTotal,
    estimatedMarginAmount,
    estimatedMarginRate,
    actualMarginAmount,
    actualMarginRate,
    marginAmount: actualMarginAmount,
    marginRate: actualMarginRate,
    hasWorkLines,
  };
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
      label: String(date.getDate()),
      isCurrentMonth: date.getMonth() === month - 1,
    };
  });
}

// Six weeks starting at weekStart (a Monday); days before the construction start are shown muted.
function buildWeekCalendarDays(weekStart: string, startDate: string) {
  return Array.from({ length: 42 }).map((_, index) => {
    const key = addDays(weekStart, index);
    const date = parseDateKey(key);
    return {
      key,
      date: key,
      day: date.getDate(),
      label: index === 0 || date.getDate() === 1 ? `${date.getMonth() + 1}/${date.getDate()}` : String(date.getDate()),
      isCurrentMonth: key >= startDate,
    };
  });
}

function mondayOfWeek(dateKeyValue: string) {
  const date = parseDateKey(dateKeyValue);
  return addDays(dateKeyValue, -((date.getDay() + 6) % 7));
}

function earliestTaskStartDate(tasks: ScheduleTask[]) {
  return tasks
    .filter((task) => task.name.trim() && task.startDate)
    .map((task) => task.startDate)
    .sort()[0] || '';
}

function formatMonthDay(dateKeyValue: string) {
  const date = parseDateKey(dateKeyValue);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
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

function uniqueInOrder(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

// Saved order first; materials added after the last reorder keep the server's default order at the end.
function applyMaterialOrder(materials: Material[], order: string[]) {
  if (!order.length) return materials;
  const rank = new Map(order.map((id, index) => [id, index]));
  return materials
    .map((material, index) => ({ material, index, rank: rank.get(material._id || '') }))
    .sort((a, b) => (a.rank ?? order.length + a.index) - (b.rank ?? order.length + b.index))
    .map((entry) => entry.material);
}

// Dropping onto a lower row places the item after it; onto a higher row, before it.
function moveIdInOrder(order: string[], fromId: string, toId: string) {
  const from = order.indexOf(fromId);
  const to = order.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, fromId);
  return next;
}

function colorForName(name: string) {
  const colors = favoriteScheduleColors.map((color) => color.value);
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

function normalizeNumberInputText(value: string) {
  const cleaned = value.replace(/,/g, '').replace(/[^0-9.-]/g, '');
  const sign = cleaned.startsWith('-') ? '-' : '';
  const unsigned = cleaned.replace(/-/g, '');
  const [integer = '', ...decimalParts] = unsigned.split('.');
  if (cleaned.includes('.')) return `${sign}${integer}.${decimalParts.join('')}`;
  return `${sign}${integer}`;
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

function formatCompactMoney(value: number) {
  const amount = Math.round(Number(value || 0));
  const sign = amount < 0 ? '-' : '';
  const absolute = Math.abs(amount);
  if (absolute >= 100000000) {
    const billion = Math.floor(absolute / 100000000);
    const tenMillion = Math.floor((absolute % 100000000) / 10000000);
    const million = Math.floor((absolute % 10000000) / 1000000);
    return `${sign}${billion}억${tenMillion ? `${tenMillion}천` : ''}${million ? `${million}백` : ''}만원`;
  }
  if (absolute >= 10000000) {
    const tenMillion = Math.floor(absolute / 10000000);
    const million = Math.floor((absolute % 10000000) / 1000000);
    return `${sign}${tenMillion}천${million ? `${million}백` : ''}만원`;
  }
  if (absolute >= 1000000) return `${sign}${Math.round(absolute / 1000000)}백만원`;
  return `${sign}${absolute.toLocaleString('ko-KR')}원`;
}
