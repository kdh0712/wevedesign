// 일정 tab (spec docs/superpowers/specs/2026-10-21-staff-app-notes-schedule-estimate-design.md §3): every listed site's
// schedule tasks, one week (Monday to Sunday) by day. Built from the overview the phone already has; no extra reads.
import type { MobileSite } from './mobile-overview.ts';

export type ScheduleEntry = {
  siteId: string;
  siteTitle: string;
  taskId: string;
  taskName: string;
  vendorName?: string;
  dayIndex: number;
  dayCount: number;
  starts: boolean;
  ends: boolean;
  delayed: boolean;
};

export type ScheduleDay = { date: string; weekday: string; isToday: boolean; entries: ScheduleEntry[] };

const DAY_MS = 86400000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Dates are YYYY-MM-DD strings counted at UTC midnight, so no time zone or daylight saving shifts a day.
const toMs = (date: string) => (ISO_DATE.test(date) ? Date.parse(`${date}T00:00:00Z`) : Number.NaN);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  const ms = toMs(date);
  return Number.isNaN(ms) ? '' : fromMs(ms + days * DAY_MS);
}

export function mondayOf(date: string): string {
  const ms = toMs(date);
  if (Number.isNaN(ms)) return '';
  const weekday = new Date(ms).getUTCDay(); // 0 = Sunday
  return fromMs(ms - ((weekday + 6) % 7) * DAY_MS);
}

// "10월 19일 ~ 25일", or "10월 26일 ~ 11월 1일" across a month.
export function weekLabel(weekStart: string): string {
  const start = new Date(toMs(weekStart));
  const end = new Date(toMs(addDays(weekStart, 6)));
  if (Number.isNaN(start.getTime())) return '';
  const startText = `${start.getUTCMonth() + 1}월 ${start.getUTCDate()}일`;
  const endText = start.getUTCMonth() === end.getUTCMonth() ? `${end.getUTCDate()}일` : `${end.getUTCMonth() + 1}월 ${end.getUTCDate()}일`;
  return `${startText} ~ ${endText}`;
}

type DatedEntry = ScheduleEntry & { startMs: number };

export function buildWeekSchedule(sites: MobileSite[], weekStart: string, today: string): ScheduleDay[] {
  const tasks = sites.flatMap((site) =>
    (site.schedule?.tasks || []).flatMap((task) => {
      const startMs = toMs(task.startDate);
      const endMs = toMs(task.endDate);
      if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return [];
      return [{ site, task, startMs, endMs }];
    }),
  );

  return Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(weekStart, offset);
    const dayMs = toMs(date);
    const entries: DatedEntry[] = tasks
      .filter(({ startMs, endMs }) => startMs <= dayMs && dayMs <= endMs)
      .map(({ site, task, startMs, endMs }) => ({
        siteId: site.id,
        siteTitle: site.title,
        taskId: task.id,
        taskName: task.name,
        ...(task.vendorName ? { vendorName: task.vendorName } : {}),
        dayIndex: Math.round((dayMs - startMs) / DAY_MS) + 1,
        dayCount: Math.round((endMs - startMs) / DAY_MS) + 1,
        starts: dayMs === startMs,
        ends: dayMs === endMs,
        delayed: task.state === 'delayed',
        startMs,
      }));
    entries.sort(
      (a, b) =>
        Number(b.delayed) - Number(a.delayed) ||
        a.siteTitle.localeCompare(b.siteTitle, 'ko') ||
        a.startMs - b.startMs,
    );
    return {
      date,
      weekday: WEEKDAYS[new Date(dayMs).getUTCDay()],
      isToday: date === today,
      entries: entries.map(({ startMs: _startMs, ...entry }) => entry),
    };
  });
}
