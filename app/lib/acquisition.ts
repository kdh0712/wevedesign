// Rules for the "how did you first find us" survey (유입 경로) on the customer progress link: the option list staff edit,
// the answer a verified customer or a staff member gives, how an answer is shown, and the per-channel stats. Pure, with only
// relative .ts imports, so the customer API, the manager API and the screens share one set of rules and tests load it directly.

import { countsAsRevenue } from './dashboard-rules.ts';
import { todayInSeoul } from './site-progress.ts';

export const OTHER_OPTION_ID = 'other';
export const OTHER_OPTION_LABEL = '기타';

const LABEL_MAX = 12;
const OTHER_TEXT_MAX = 40;
const OPTIONS_MAX = 20;
const ID_PATTERN = /^[a-z0-9-]{1,40}$/;

export type AcquisitionOption = { id: string; label: string; hidden?: boolean };

// Stored on the site (officeSites/<id>.acquisition). Written only by the server.
export type SiteAcquisition = {
  status: 'answered' | 'skipped';
  optionId?: string;
  // The option's label when it was answered, shown if the option later leaves the list.
  label?: string;
  other?: string;
  by: 'customer' | 'staff';
  staffId?: string;
  at: string;
};

export type AcquisitionChoice = { optionId: string; label: string; other?: string };

// Where the company advertises, then the ways people come without an advert. Used until staff save their own list.
export const DEFAULT_ACQUISITION_OPTIONS: readonly AcquisitionOption[] = [
  { id: 'naver-place', label: '네이버 플레이스' },
  { id: 'homepage', label: '홈페이지·검색' },
  { id: 'blog', label: '블로그' },
  { id: 'instagram', label: '인스타그램' },
  { id: 'youtube', label: '유튜브' },
  { id: 'daangn', label: '당근마켓' },
  { id: 'zipdoc', label: '집닥' },
  { id: 'kakaotalk', label: '카카오톡' },
  { id: 'friend', label: '지인 소개' },
  { id: 'returning', label: '예전 고객' },
  { id: 'walk-in', label: '지나가다 봤어요' },
];

export const ACQUISITION_PICK_MESSAGE = '보기를 다시 골라 주세요.';
export const ACQUISITION_OTHER_EMPTY_MESSAGE = "'기타' 내용을 적어 주세요.";
export const ACQUISITION_OTHER_TOO_LONG_MESSAGE = "'기타' 내용은 40자 이내로 적어 주세요.";

const OPTIONS_FORMAT_MESSAGE = '보기 목록 형식이 올바르지 않습니다.';
const LABEL_LENGTH_MESSAGE = '보기 이름은 1-12자로 적어 주세요.';
const OTHER_RESERVED_MESSAGE = "'기타'는 따로 둘 수 없어요. 맨 아래에 항상 있어요.";
const OPTIONS_COUNT_MESSAGE = '보기는 최대 20개까지 둘 수 있어요.';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const charCount = (text: string) => Array.from(text).length;
// Two labels are the same option when they differ only in spaces or letter case.
const labelKey = (label: string) => label.replace(/\s/g, '').toLowerCase();

// Checks the list staff save. A missing, malformed or repeated id gets a new one from makeId (the server's).
export function normalizeAcquisitionOptions(
  input: unknown,
  makeId: () => string,
): { ok: true; options: AcquisitionOption[] } | { ok: false; error: string } {
  if (!Array.isArray(input) || !input.every(isRecord)) return { ok: false, error: OPTIONS_FORMAT_MESSAGE };
  if (input.length > OPTIONS_MAX) return { ok: false, error: OPTIONS_COUNT_MESSAGE };

  const options: AcquisitionOption[] = [];
  const usedIds = new Set<string>();
  const usedLabels = new Set<string>();
  for (const item of input) {
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    if (charCount(label) < 1 || charCount(label) > LABEL_MAX) return { ok: false, error: LABEL_LENGTH_MESSAGE };
    if (item.id === OTHER_OPTION_ID || labelKey(label) === labelKey(OTHER_OPTION_LABEL)) return { ok: false, error: OTHER_RESERVED_MESSAGE };
    if (usedLabels.has(labelKey(label))) return { ok: false, error: `'${label}' 보기가 이미 있어요.` };
    usedLabels.add(labelKey(label));

    const id = typeof item.id === 'string' && ID_PATTERN.test(item.id) && !usedIds.has(item.id) ? item.id : makeId();
    usedIds.add(id);
    options.push(item.hidden === true ? { id, label, hidden: true } : { id, label });
  }
  return { ok: true, options };
}

// What the customer sees: the options that are not hidden, in order, and 기타 last.
export function surveyOptions(options: readonly AcquisitionOption[]): Array<{ id: string; label: string }> {
  return [...options.filter((option) => !option.hidden).map(({ id, label }) => ({ id, label })), { id: OTHER_OPTION_ID, label: OTHER_OPTION_LABEL }];
}

// The stored value, or null when the site has none (or something unreadable, which counts as none).
export function readSiteAcquisition(value: unknown): SiteAcquisition | null {
  if (!isRecord(value)) return null;
  const { status, by, at } = value;
  if ((status !== 'answered' && status !== 'skipped') || (by !== 'customer' && by !== 'staff') || typeof at !== 'string' || !at) return null;
  if (status === 'skipped') return { status, by, at };
  if (typeof value.optionId !== 'string' || !value.optionId || typeof value.label !== 'string') return null;
  return {
    status,
    optionId: value.optionId,
    label: value.label,
    ...(typeof value.other === 'string' && value.other ? { other: value.other } : {}),
    by,
    ...(typeof value.staffId === 'string' && value.staffId ? { staffId: value.staffId } : {}),
    at,
  };
}

// A site is asked until it has an answer, a skip, or a staff entry.
export function needsAcquisitionSurvey(site: Record<string, unknown>): boolean {
  return readSiteAcquisition(site.acquisition) === null;
}

// The page asks unless the customer chose "공사 현황 먼저 보기" after saving failed (?later=1): the survey must never keep a
// verified customer from the progress view. Nothing is stored for that; the next visit asks again.
export function showAcquisitionSurvey(site: Record<string, unknown>, later: unknown): boolean {
  return later !== '1' && needsAcquisitionSurvey(site);
}

// The 기타 text as one line: whitespace runs become one space, control characters go.
export function cleanOtherText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').trim();
}

// The choice from a customer (allowHidden false) or a staff member (allowHidden true: an old answer can be kept).
export function parseAcquisitionChoice(
  input: unknown,
  options: readonly AcquisitionOption[],
  opts: { allowHidden: boolean },
): { ok: true; choice: AcquisitionChoice } | { ok: false; error: string } {
  if (!isRecord(input) || typeof input.optionId !== 'string') return { ok: false, error: ACQUISITION_PICK_MESSAGE };
  if (input.optionId === OTHER_OPTION_ID) {
    const other = cleanOtherText(input.other);
    if (!other) return { ok: false, error: ACQUISITION_OTHER_EMPTY_MESSAGE };
    if (charCount(other) > OTHER_TEXT_MAX) return { ok: false, error: ACQUISITION_OTHER_TOO_LONG_MESSAGE };
    return { ok: true, choice: { optionId: OTHER_OPTION_ID, label: OTHER_OPTION_LABEL, other } };
  }
  const option = options.find((item) => item.id === input.optionId);
  if (!option || (option.hidden && !opts.allowHidden)) return { ok: false, error: ACQUISITION_PICK_MESSAGE };
  return { ok: true, choice: { optionId: option.id, label: option.label } };
}

// How an answer reads on screen: the option's current name (renames apply to old answers), the stored name when the
// option left the list, '기타 · <text>' or '건너뜀'.
export function acquisitionAnswerText(acquisition: SiteAcquisition, options: readonly AcquisitionOption[]): string {
  if (acquisition.status === 'skipped') return '건너뜀';
  if (acquisition.optionId === OTHER_OPTION_ID) return acquisition.other ? `${OTHER_OPTION_LABEL} · ${acquisition.other}` : OTHER_OPTION_LABEL;
  return options.find((option) => option.id === acquisition.optionId)?.label ?? acquisition.label ?? '';
}

export type AcquisitionPeriod = 'month' | '3months' | 'year' | 'all';

// Seoul dates (YYYY-MM-DD) from the first day of the period to today; '3months' is this month and the two before it.
export function periodRange(period: AcquisitionPeriod, today: string): { from: string; to: string } | null {
  if (period === 'all') return null;
  const [year, month] = today.split('-').map(Number);
  if (period === 'year') return { from: `${year}-01-01`, to: today };
  const first = new Date(Date.UTC(year, month - 1 - (period === '3months' ? 2 : 0), 1));
  return { from: first.toISOString().slice(0, 10), to: today };
}

export type AcquisitionStatsRow = {
  // An option id, 'other', 'skipped' or 'none'.
  key: string;
  label: string;
  kind: 'option' | 'other' | 'skipped' | 'none';
  sites: Array<{ _id: string; title: string; customerName: string; answer: string; by: 'customer' | 'staff' | ''; at: string }>;
  siteCount: number;
  salesTotal: number;
  average: number;
};

// Sites at these stages are counted even without an answer ('미응답'); earlier ones only once they have one, so sites still
// in consultation do not swell '미응답'.
const COUNTED_STATUSES = ['계약', '시공중', '완료'];
const TAIL_ORDER: Record<AcquisitionStatsRow['kind'], number> = { option: 0, other: 1, skipped: 2, none: 3 };
const str = (value: unknown) => (typeof value === 'string' ? value : '');

// Counted sites of the period (by the Seoul date they were registered), grouped by answer. Revenue is the sales recorded
// for those sites, whatever their payment date, without '견적' and '취소' (the dashboard's rule). Options sort by site
// count, then by list order (options that left the list after the listed ones); 기타, 건너뜀 and 미응답 always come last.
export function acquisitionStats(input: {
  sites: ReadonlyArray<Record<string, unknown>>;
  sales: ReadonlyArray<Record<string, unknown>>;
  options: readonly AcquisitionOption[];
  range: { from: string; to: string } | null;
}): AcquisitionStatsRow[] {
  const { sites, sales, options, range } = input;
  const revenueBySite = new Map<string, number>();
  for (const sale of sales) {
    if (sale.deletedAt || !countsAsRevenue(sale.status)) continue;
    const siteId = str(sale.siteId);
    if (siteId) revenueBySite.set(siteId, (revenueBySite.get(siteId) ?? 0) + (Number(sale.amount) || 0));
  }

  const rows = new Map<string, AcquisitionStatsRow>();
  const rowFor = (key: string, label: string, kind: AcquisitionStatsRow['kind']) => {
    if (!rows.has(key)) rows.set(key, { key, label, kind, sites: [], siteCount: 0, salesTotal: 0, average: 0 });
    return rows.get(key)!;
  };

  for (const site of sites) {
    if (site.deletedAt) continue;
    const acquisition = readSiteAcquisition(site.acquisition);
    if (!acquisition && !COUNTED_STATUSES.includes(str(site.status).trim())) continue;
    if (range) {
      const createdMs = Date.parse(str(site.createdAt));
      const day = Number.isNaN(createdMs) ? '' : todayInSeoul(createdMs);
      if (!day || day < range.from || day > range.to) continue;
    }

    const row = !acquisition
      ? rowFor('none', '미응답', 'none')
      : acquisition.status === 'skipped'
        ? rowFor('skipped', '건너뜀', 'skipped')
        : acquisition.optionId === OTHER_OPTION_ID
          ? rowFor(OTHER_OPTION_ID, OTHER_OPTION_LABEL, 'other')
          : rowFor(acquisition.optionId!, acquisitionAnswerText(acquisition, options), 'option');
    row.sites.push({
      _id: str(site._id),
      title: str(site.title),
      customerName: str(site.customerName),
      answer: acquisition ? acquisitionAnswerText(acquisition, options) : '',
      by: acquisition?.by ?? '',
      at: acquisition?.at ?? '',
    });
    row.siteCount += 1;
    row.salesTotal += revenueBySite.get(str(site._id)) ?? 0;
  }

  const listIndex = (key: string) => {
    const index = options.findIndex((option) => option.id === key);
    return index < 0 ? options.length : index;
  };
  return [...rows.values()]
    .map((row) => ({ ...row, average: Math.round(row.salesTotal / row.siteCount) }))
    .sort((a, b) =>
      a.kind !== 'option' || b.kind !== 'option'
        ? TAIL_ORDER[a.kind] - TAIL_ORDER[b.kind]
        : b.siteCount - a.siteCount || listIndex(a.key) - listIndex(b.key),
    );
}

// The manager screen receives the newest 200 sites that are not in the 휴지통 (app/api/manager/firestore.ts), and the stats
// count only those. True when that may leave out sites of the period: the list is full and does not reach back to its start.
export const MANAGER_SITE_LIST_LIMIT = 200;

export function statsMayMissSites(sites: ReadonlyArray<Record<string, unknown>>, range: { from: string; to: string } | null): boolean {
  if (sites.length < MANAGER_SITE_LIST_LIMIT) return false;
  if (!range) return true;
  const days = sites
    .map((site) => Date.parse(str(site.createdAt)))
    .filter((ms) => !Number.isNaN(ms))
    .map((ms) => todayInSeoul(ms));
  if (days.length === 0) return true;
  return days.reduce((min, day) => (day < min ? day : min), days[0]) > range.from;
}
