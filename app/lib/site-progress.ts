// Progress calculations for the customer construction progress page. Pure functions only (no Next.js or network),
// so API routes, the server-rendered customer page and the manager screen all share the same rules.

export type ProgressScheduleTask = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  progress: number;
};

export type ProgressTaskView = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  // 'delayed': past its end date while staff set a progress below 100.
  state: 'done' | 'active' | 'upcoming' | 'delayed';
  percent: number;
};

export type ScheduleSummary = {
  percent: number;
  startDate: string;
  endDate: string;
  current: ProgressTaskView[];
  next: ProgressTaskView | null;
  tasks: ProgressTaskView[];
};

// A progress photo as stored in Firestore: where it sits in the private Firebase Storage bucket, never a URL. The browser sees
// a pathname only once, in the upload answer, so the staff screen can send it back with the record.
export type StoredProgressPhoto = { id: string; pathname: string; width: number; height: number };

// A progress photo as a browser receives it: a short-lived signed URL the server made after checking who is asking.
// An empty url means the URL could not be made (see photosUnavailable).
export type ProgressPhotoView = { id: string; url: string; width: number; height: number };

export type NotifyLogEntry = { sentAt: string; ok: boolean; error?: string; by: string };

export type ProgressUpdate = {
  _id: string;
  siteId: string;
  reportDate: string;
  designer: string;
  workDetail: string;
  photos: StoredProgressPhoto[];
  createdAt: string;
  createdBy?: string;
  notifyLog?: NotifyLogEntry[];
};

// A progress record as the manager screen receives it: the same record with signed photo URLs instead of pathnames.
export type ProgressUpdateView = Omit<ProgressUpdate, 'photos'> & { photos: ProgressPhotoView[] };

export type CustomerProgressView = {
  siteTitle: string;
  customerName: string;
  schedule: ScheduleSummary | null;
  updates: Array<{ id: string; reportDate: string; designer: string; workDetail: string; photos: ProgressPhotoView[] }>;
  contactPhone: '031-381-0489';
  // Set when the photo URLs could not be made: the records are shown without photos and with a short notice.
  photosUnavailable?: boolean;
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const STATE_DEFAULT_PERCENT = { done: 100, active: 50, upcoming: 0, delayed: 50 } as const;

export function todayInSeoul(nowMs: number = Date.now()): string {
  return new Date(nowMs + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function phoneLast4(phone: string | undefined): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length < 4 ? '' : digits.slice(-4);
}

function timeOf(value: string | undefined): number {
  const time = Date.parse(value ?? '');
  return Number.isNaN(time) ? 0 : time;
}

// Base estimate for the schedule: the newest 'final' version, otherwise the newest version of any kind.
export function pickScheduleEstimate<T extends { versionType?: string; updatedAt?: string; createdAt?: string; scheduleJson?: string }>(
  estimates: T[],
): T | null {
  const newest = (list: T[]) =>
    list.reduce<T | null>((best, item) => {
      if (!best) return item;
      return timeOf(item.updatedAt || item.createdAt) > timeOf(best.updatedAt || best.createdAt) ? item : best;
    }, null);
  const finals = estimates.filter((estimate) => estimate.versionType === 'final');
  return newest(finals.length > 0 ? finals : estimates);
}

// A date counts only when it is a real calendar day written as YYYY-MM-DD.
function dayNumber(value: string): number | null {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const ms = Date.parse(`${text}T00:00:00Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== text) return null;
  return Math.round(ms / DAY_MS);
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function summarizeSchedule(tasks: ProgressScheduleTask[], today: string): ScheduleSummary | null {
  const views: ProgressTaskView[] = [];
  let weightedTotal = 0;
  let weightSum = 0;

  for (const task of tasks) {
    const name = String(task?.name ?? '').trim();
    const startDate = String(task?.startDate ?? '').trim();
    const endDate = String(task?.endDate ?? '').trim();
    const start = dayNumber(startDate);
    const end = dayNumber(endDate);
    if (!name || start === null || end === null || start > end) continue;

    const progress = Number(task.progress);
    // Past its end date a task counts as done, unless staff entered a progress of 1-99: then it is late, not done.
    // A task whose progress was never entered (0) keeps the date rule, since most tasks never get one.
    const pastEnd = endDate < today;
    const enteredUnfinished = progress > 0 && progress < 100;
    const state: ProgressTaskView['state'] =
      progress >= 100 ? 'done' : pastEnd ? (enteredUnfinished ? 'delayed' : 'done') : startDate <= today ? 'active' : 'upcoming';
    const percent = Math.round(progress > 0 ? clampPercent(progress) : STATE_DEFAULT_PERCENT[state]);

    const duration = Number(task.durationDays);
    const weight = Math.max(Number.isFinite(duration) ? duration : 0, end - start + 1, 1);
    weightedTotal += percent * weight;
    weightSum += weight;

    views.push({ id: String(task.id ?? ''), name, startDate, endDate, state, percent });
  }

  if (views.length === 0) return null;

  // The estimate editor may store tasks out of order; the customer sees them by start date (stable, so ties keep input order).
  views.sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));

  return {
    percent: Math.round(weightedTotal / weightSum),
    startDate: views[0].startDate,
    endDate: views.reduce((max, view) => (view.endDate > max ? view.endDate : max), views[0].endDate),
    current: views.filter((view) => view.state === 'active' || view.state === 'delayed'),
    next: views.find((view) => view.state === 'upcoming') ?? null,
    tasks: views,
  };
}

// scheduleJson comes from the manager's estimate editor; anything unreadable simply means "no schedule".
function parseScheduleTasks(scheduleJson: unknown): ProgressScheduleTask[] {
  if (typeof scheduleJson !== 'string' || !scheduleJson.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(scheduleJson);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  // Copy only the fields the customer may see; vendors, memos and the rest never leave this function.
  return parsed
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item, index) => ({
      id: String(item.id ?? index),
      name: typeof item.name === 'string' ? item.name : '',
      startDate: typeof item.startDate === 'string' ? item.startDate : '',
      endDate: typeof item.endDate === 'string' ? item.endDate : '',
      durationDays: Number(item.durationDays) || 0,
      progress: Number(item.progress) || 0,
    }));
}

function compareDescending(a: string, b: string): number {
  return a < b ? 1 : a > b ? -1 : 0;
}

// Takes the records with their photos already signed (signProgressUpdatePhotos). A photo without a URL (signing failed)
// is left out, so the page never shows a broken image; photosUnavailable tells it to say so instead.
export function buildCustomerProgressView(input: {
  site: { title?: string; customerName?: string; [key: string]: unknown };
  updates: ProgressUpdateView[];
  estimates: Array<Record<string, unknown>>;
  today: string;
  photosUnavailable?: boolean;
}): CustomerProgressView {
  const { site, updates, estimates, today, photosUnavailable } = input;
  // Only the title and the customer name are read from the site; every other field stays on the server.
  const picked = pickScheduleEstimate(estimates);
  const schedule = picked ? summarizeSchedule(parseScheduleTasks(picked.scheduleJson), today) : null;

  return {
    siteTitle: typeof site.title === 'string' ? site.title : '',
    customerName: typeof site.customerName === 'string' ? site.customerName : '',
    schedule,
    updates: [...updates]
      .sort((a, b) => compareDescending(a.reportDate, b.reportDate) || compareDescending(a.createdAt, b.createdAt))
      .map((update) => ({
        id: update._id,
        reportDate: update.reportDate,
        designer: update.designer,
        workDetail: update.workDetail,
        photos: (update.photos ?? [])
          .filter((photo) => typeof photo.url === 'string' && photo.url !== '')
          .map((photo) => ({ id: photo.id, url: photo.url, width: photo.width, height: photo.height })),
      })),
    contactPhone: '031-381-0489',
    ...(photosUnavailable ? { photosUnavailable: true } : {}),
  };
}

// One pass over the template so a value that happens to contain a placeholder is never substituted again.
export function fillProgressTemplate(template: string, values: { customerName: string; siteTitle: string; date: string; code: string }): string {
  const byPlaceholder: Record<string, string> = {
    고객명: values.customerName,
    현장명: values.siteTitle,
    날짜: values.date,
    코드: values.code,
  };
  return template.replace(/#\{(고객명|현장명|날짜|코드)\}/g, (_match, key: string) => byPlaceholder[key]);
}

// A successful send blocks a second one unless the manager explicitly asks to resend.
export function canNotify(update: Pick<ProgressUpdate, 'notifyLog'>, resend: boolean): boolean {
  return resend || !(update.notifyLog ?? []).some((entry) => entry.ok);
}
