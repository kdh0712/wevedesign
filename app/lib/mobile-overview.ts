// What the staff phone app shows (spec docs/superpowers/specs/2026-10-20-staff-mobile-app-design.md §4–6).
// Pure functions only, shared by GET /api/manager/mobile/overview, the consultation API and the phone screens.
import { pickScheduleEstimate, summarizeSchedule, type ProgressScheduleTask } from './site-progress.ts';

export type MobileTab = 'today' | 'sites' | 'report' | 'consultations';

export type MobileTask = {
  id: string;
  name: string;
  state: 'done' | 'active' | 'upcoming' | 'delayed';
  percent: number;
  startDate: string;
  endDate: string;
  vendorName?: string;
  vendorPhone?: string;
};

export type MobileSite = {
  id: string;
  title: string;
  address: string;
  status: string;
  customerName: string;
  customerPhone?: string;
  schedule: { percent: number; startDate: string; endDate: string; tasks: MobileTask[] } | null;
};

export type MobileConsultation = {
  id: string;
  name: string;
  phone?: string;
  createdAt: string;
  status: string;
  siteType: string;
  areaRange: string;
  reason: string;
  timeline: string;
  region: string;
  message: string;
  memo: string;
};

export type MobileTomorrowTask = { siteId: string; siteTitle: string; taskName: string; vendorName?: string };

export type MobileOverview = {
  today: string;
  sites: MobileSite[];
  activeSiteIds: string[];
  tomorrow: MobileTomorrowTask[];
  consultations?: MobileConsultation[];
};

export const CONSULTATION_STATUSES = ['신규', '상담중', '견적', '계약', '완료'] as const;
export const CONSULTATION_MEMO_MAX = 2000;

const HIDDEN_SITE_STATUSES = new Set(['완료', '보류']);
const FINISHED_CONSULTATION_STATUSES = new Set(['계약', '완료']);
const FINISHED_CONSULTATION_DAYS = 30;
const DAY_MS = 86400000;

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function visibleMobileTabs(perms: { sites: boolean; dashboard: boolean; consultations: boolean }): MobileTab[] {
  const tabs: MobileTab[] = [];
  if (perms.sites) tabs.push('today', 'sites');
  // Posting a progress record needs 'dashboard' as well, the same rule as the PC screen (POST_NEEDS_DASHBOARD).
  if (perms.sites && perms.dashboard) tabs.push('report');
  if (perms.consultations) tabs.push('consultations');
  return tabs;
}

export function listedSites<T extends { status?: unknown; deletedAt?: unknown }>(sites: T[]): T[] {
  return sites.filter((site) => !site.deletedAt && !HIDDEN_SITE_STATUSES.has(str(site.status)));
}

// Like the customer page's reader, but the staff app may also see the task's vendor.
function parseScheduleWithVendors(scheduleJson: unknown): Array<ProgressScheduleTask & { vendorName: string; vendorPhone: string }> {
  if (typeof scheduleJson !== 'string' || !scheduleJson.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(scheduleJson);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item, index) => ({
      id: String(item.id ?? index),
      name: typeof item.name === 'string' ? item.name : '',
      startDate: typeof item.startDate === 'string' ? item.startDate : '',
      endDate: typeof item.endDate === 'string' ? item.endDate : '',
      durationDays: Number(item.durationDays) || 0,
      progress: Number(item.progress) || 0,
      vendorName: str(item.vendorName),
      vendorPhone: str(item.vendorPhone),
    }));
}

export function buildMobileSites(input: {
  sites: Array<Record<string, unknown>>;
  estimates: Array<Record<string, unknown>>;
  today: string;
  showVendors: boolean;
}): MobileSite[] {
  const estimatesBySite = new Map<string, Array<Record<string, unknown>>>();
  for (const estimate of input.estimates) {
    const siteId = str(estimate.siteId);
    if (!siteId || estimate.deletedAt) continue;
    estimatesBySite.set(siteId, [...(estimatesBySite.get(siteId) || []), estimate]);
  }

  return listedSites(input.sites).map((site) => {
    const id = str(site._id);
    const picked = pickScheduleEstimate(estimatesBySite.get(id) || []);
    const rawTasks = picked ? parseScheduleWithVendors(picked.scheduleJson) : [];
    const summary = summarizeSchedule(rawTasks, input.today);
    const vendorsById = new Map(rawTasks.map((task) => [task.id, task]));
    const customerPhone = str(site.customerPhone);

    return {
      id,
      title: str(site.title) || '이름 없는 현장',
      address: str(site.address),
      status: str(site.status),
      customerName: str(site.customerName),
      ...(customerPhone ? { customerPhone } : {}),
      schedule: summary
        ? {
            percent: summary.percent,
            startDate: summary.startDate,
            endDate: summary.endDate,
            tasks: summary.tasks.map((view) => {
              const raw = vendorsById.get(view.id);
              const vendor =
                input.showVendors && raw
                  ? { ...(raw.vendorName ? { vendorName: raw.vendorName } : {}), ...(raw.vendorPhone ? { vendorPhone: raw.vendorPhone } : {}) }
                  : {};
              return { ...view, ...vendor };
            }),
          }
        : null,
    };
  });
}

const hasWorkToday = (site: MobileSite) => Boolean(site.schedule?.tasks.some((task) => task.state === 'active' || task.state === 'delayed'));
const hasDelay = (site: MobileSite) => Boolean(site.schedule?.tasks.some((task) => task.state === 'delayed'));

// Today's sites: under construction, or with work scheduled today. Delayed sites first, then by start date (none last).
export function pickActiveSiteIds(sites: MobileSite[]): string[] {
  return sites
    .filter((site) => site.status === '시공중' || hasWorkToday(site))
    .map((site, index) => ({ site, index }))
    .sort((a, b) => {
      const delay = Number(hasDelay(b.site)) - Number(hasDelay(a.site));
      if (delay !== 0) return delay;
      const aStart = a.site.schedule?.startDate || '￿';
      const bStart = b.site.schedule?.startDate || '￿';
      return aStart < bStart ? -1 : aStart > bStart ? 1 : a.index - b.index;
    })
    .map(({ site }) => site.id);
}

export function nextDay(date: string): string {
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(ms) ? '' : new Date(ms + DAY_MS).toISOString().slice(0, 10);
}

export function tomorrowTasks(sites: MobileSite[], activeIds: string[], tomorrow: string): MobileTomorrowTask[] {
  const active = new Set(activeIds);
  return sites
    .filter((site) => active.has(site.id))
    .flatMap((site) =>
      (site.schedule?.tasks || [])
        .filter((task) => task.startDate === tomorrow)
        .map((task) => ({ siteId: site.id, siteTitle: site.title, taskName: task.name, ...(task.vendorName ? { vendorName: task.vendorName } : {}) })),
    );
}

// "경기 안양시 동안구 평촌동 123" → "안양 평촌동": enough to tell consultations apart without the full address.
export function shortRegion(address: string): string {
  const words = String(address || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const cityWord = words.find((word) => word.length > 1 && /(특별자치시|특별시|광역시|시)$/.test(word));
  if (!cityWord) return words.slice(0, 2).join(' ');
  const city = cityWord.replace(/(특별자치시|특별시|광역시|시)$/, '');
  const dong = words.find((word) => /^[가-힣][가-힣0-9]*(동|읍|면)$/.test(word));
  return [city, dong].filter(Boolean).join(' ');
}

export function toMobileConsultation(record: Record<string, unknown>): MobileConsultation {
  const phone = str(record.phone);
  return {
    id: str(record._id),
    name: str(record.name) || '이름 없음',
    ...(phone ? { phone } : {}),
    createdAt: str(record.createdAt),
    status: str(record.status) || '신규',
    siteType: str(record.siteType) || str(record.propertyType),
    areaRange: str(record.areaRange),
    reason: str(record.reason),
    timeline: str(record.timeline),
    region: shortRegion(str(record.fullAddress) || str(record.address)),
    message: str(record.message),
    memo: str(record.memo),
  };
}

// Open ones all, 계약·완료 only from the last 30 days (by their last change), newest first.
export function listedConsultations(records: Array<Record<string, unknown>>, nowMs: number): MobileConsultation[] {
  const cutoff = nowMs - FINISHED_CONSULTATION_DAYS * DAY_MS;
  return records
    .filter((record) => !record.deletedAt)
    .filter((record) => {
      if (!FINISHED_CONSULTATION_STATUSES.has(str(record.status))) return true;
      const changed = Date.parse(str(record.updatedAt) || str(record.createdAt));
      return Number.isFinite(changed) && changed >= cutoff;
    })
    .map(toMobileConsultation)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export type ConsultationPatch = { ok: true; id: string; fields: { status?: string; memo?: string } } | { ok: false; error: string };

export function parseConsultationPatch(body: unknown): ConsultationPatch {
  if (typeof body !== 'object' || body === null) return { ok: false, error: '잘못된 요청입니다.' };
  const input = body as Record<string, unknown>;
  const id = str(input.id);
  if (!id || id.includes('/')) return { ok: false, error: '상담을 선택해 주세요.' };

  const fields: { status?: string; memo?: string } = {};
  if (input.status !== undefined) {
    const status = str(input.status);
    if (!(CONSULTATION_STATUSES as readonly string[]).includes(status)) return { ok: false, error: '알 수 없는 상담 상태입니다.' };
    fields.status = status;
  }
  if (input.memo !== undefined) {
    if (typeof input.memo !== 'string') return { ok: false, error: '메모 형식이 올바르지 않습니다.' };
    const memo = input.memo.trim();
    if (memo.length > CONSULTATION_MEMO_MAX) return { ok: false, error: `메모는 ${CONSULTATION_MEMO_MAX}자까지 쓸 수 있습니다.` };
    fields.memo = memo;
  }
  if (fields.status === undefined && fields.memo === undefined) return { ok: false, error: '바꿀 내용이 없습니다.' };
  return { ok: true, id, fields };
}

// "14분 전", "2시간 전", "3일 전"; older than a week becomes the date ("9월 10일"), in Korea time.
export function timeAgo(iso: string, nowMs: number): string {
  const ms = Date.parse(iso);
  if (!iso || Number.isNaN(ms)) return '';
  const diff = Math.max(0, nowMs - ms);
  if (diff < 60000) return '방금';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
  if (diff < DAY_MS) return `${Math.floor(diff / 3600000)}시간 전`;
  if (diff < 7 * DAY_MS) return `${Math.floor(diff / DAY_MS)}일 전`;
  const seoul = new Date(ms + 9 * 3600000);
  return `${seoul.getUTCMonth() + 1}월 ${seoul.getUTCDate()}일`;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// "2026-10-20" → "10월 20일 화요일"
export function koreanDateLabel(date: string): string {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) return '';
  const day = new Date(ms);
  return `${day.getUTCMonth() + 1}월 ${day.getUTCDate()}일 ${WEEKDAYS[day.getUTCDay()]}요일`;
}

export type ConsultationGroup = 'new' | 'open' | 'done';

export function consultationGroup(status: string): ConsultationGroup {
  if (status === '상담중' || status === '견적') return 'open';
  if (FINISHED_CONSULTATION_STATUSES.has(status)) return 'done';
  return 'new';
}

// Sites under way first, then the earlier stages; unknown statuses last. Same status: by title.
const SITE_LIST_ORDER = ['시공중', '계약', '실측 예정', '견적', '상담완료', '상담중'];

export function sortSitesForList(sites: MobileSite[]): MobileSite[] {
  const rank = (status: string) => {
    const index = SITE_LIST_ORDER.indexOf(status);
    return index === -1 ? SITE_LIST_ORDER.length : index;
  };
  return [...sites].sort((a, b) => rank(a.status) - rank(b.status) || a.title.localeCompare(b.title, 'ko'));
}
