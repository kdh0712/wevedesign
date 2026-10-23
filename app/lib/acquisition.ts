// Rules for the "how did you first find us" survey (유입 경로) on the customer progress link: the option list staff edit,
// the answer a verified customer or a staff member gives, and how an answer is shown. Pure, with no imports, so the
// customer API, the manager API and the screens share one set of rules and tests load it directly.

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
