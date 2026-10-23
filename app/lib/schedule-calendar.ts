// Calendar rules for the construction schedule (공정 일정). Pure functions only, so the manager calendar, its printed
// 공정표 and the customer progress page draw the same bars from the same dates.
// Dates are YYYY-MM-DD keys and months YYYY-MM keys; the math runs in UTC so the time zone never shifts a day.

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(key: string): number | null {
  const text = String(key ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const ms = Date.parse(`${text}T00:00:00Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== text) return null;
  return Math.round(ms / DAY_MS);
}

function keyOf(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function isDateKey(value: string): boolean {
  return dayNumber(value) !== null;
}

export function addDays(key: string, days: number): string {
  const day = dayNumber(key);
  return day === null ? '' : keyOf(day + days);
}

// The Monday of the week that holds the date (weeks run Monday to Sunday).
export function mondayOf(key: string): string {
  const day = dayNumber(key);
  if (day === null) return '';
  const weekday = new Date(day * DAY_MS).getUTCDay();
  return keyOf(day - ((weekday + 6) % 7));
}

export function shiftMonthKey(monthKey: string, offset: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

export function clampMonthKey(monthKey: string, from: string, to: string): string {
  return monthKey < from ? from : monthKey > to ? to : monthKey;
}

// Every month from `from` to `to`, at most `limit` of them (a reversed range gives `from` alone).
export function monthKeysBetween(from: string, to: string, limit = 12): string[] {
  const months = [from];
  while (months.length < limit && months[months.length - 1] < to) months.push(shiftMonthKey(months[months.length - 1], 1));
  return months;
}

// The Mondays of the weeks that hold any day of the month (4 to 6 weeks).
export function monthWeekStarts(monthKey: string): string[] {
  const first = `${monthKey}-01`;
  const last = addDays(`${shiftMonthKey(monthKey, 1)}-01`, -1);
  const weeks: string[] = [];
  for (let week = mondayOf(first); week && week <= last; week = addDays(week, 7)) weeks.push(week);
  return weeks;
}

// The weeks from the week of `from` to the week of `to`, split into pages of `weeksPerPage` weeks.
export function weekPages(from: string, to: string, weeksPerPage = 5): string[][] {
  const first = mondayOf(from);
  if (!first) return [];
  const last = mondayOf(to > from ? to : from);
  const pages: string[][] = [];
  for (let week = first; week <= last; week = addDays(week, 7)) {
    if (pages.length === 0 || pages[pages.length - 1].length >= weeksPerPage) pages.push([]);
    pages[pages.length - 1].push(week);
  }
  return pages;
}

// The last day of a task, as the manager calendar shows it: durationDays days from the start, moved one day later for every
// holiday that falls inside (and again for a holiday that the move reaches). Without a duration the saved end date is used.
export function scheduleTaskEnd(task: { startDate?: string; endDate?: string; durationDays?: number }, holidays: Iterable<string>): string {
  const start = task.startDate || task.endDate || '';
  if (!isDateKey(start)) return '';
  const duration = Number(task.durationDays);
  const rawEnd = duration ? addDays(start, Math.max(1, Math.round(duration)) - 1) : task.endDate || start;
  if (!isDateKey(rawEnd)) return '';
  const holidayList = Array.from(holidays);
  let end = rawEnd;
  let previous = '';
  while (end !== previous) {
    previous = end;
    const count = holidayList.filter((date) => date >= start && date <= end).length;
    end = addDays(rawEnd, count);
  }
  return end;
}

// The first start and the last end of the tasks that have real dates.
export function scheduleSpan(tasks: ReadonlyArray<{ startDate: string; endDate: string }>): { start: string; end: string } | null {
  const dated = tasks.filter((task) => isDateKey(task.startDate) && isDateKey(task.endDate) && task.startDate <= task.endDate);
  if (dated.length === 0) return null;
  return {
    start: dated.reduce((min, task) => (task.startDate < min ? task.startDate : min), dated[0].startDate),
    end: dated.reduce((max, task) => (task.endDate > max ? task.endDate : max), dated[0].endDate),
  };
}

export type CalendarBar<T> = {
  task: T;
  // Columns 0 (Monday) to 6 (Sunday) that the bar covers in this week.
  startCol: number;
  endCol: number;
  lane: number;
  // false when the task began in an earlier week / goes on into a later week.
  startsHere: boolean;
  endsHere: boolean;
};

// Bars for one week (weekStart is a Monday). endDate must already be the shown last day (see scheduleTaskEnd).
// The longest task takes the top lane, then the earlier start, then the given order; each task takes the first lane that is
// free for all of its days, so tasks that do not overlap share a lane.
export function layoutCalendarWeek<T extends { startDate: string; endDate: string }>(
  tasks: readonly T[],
  weekStart: string,
): { bars: CalendarBar<T>[]; laneCount: number } {
  const weekFirst = dayNumber(weekStart);
  if (weekFirst === null) return { bars: [], laneCount: 0 };
  const weekLast = weekFirst + 6;

  const inWeek = tasks
    .map((task) => ({ task, start: dayNumber(task.startDate), end: dayNumber(task.endDate) }))
    .filter((item): item is { task: T; start: number; end: number } => item.start !== null && item.end !== null && item.start <= item.end)
    .filter((item) => item.start <= weekLast && item.end >= weekFirst)
    .sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);

  const lanes: Array<Array<[number, number]>> = [];
  const bars = inWeek.map(({ task, start, end }) => {
    const startCol = Math.max(start, weekFirst) - weekFirst;
    const endCol = Math.min(end, weekLast) - weekFirst;
    let lane = lanes.findIndex((used) => used.every(([from, to]) => endCol < from || startCol > to));
    if (lane < 0) {
      lane = lanes.length;
      lanes.push([]);
    }
    lanes[lane].push([startCol, endCol]);
    return { task, startCol, endCol, lane, startsHere: start >= weekFirst, endsHere: end <= weekLast };
  });

  bars.sort((a, b) => a.lane - b.lane || a.startCol - b.startCol);
  return { bars, laneCount: lanes.length };
}
