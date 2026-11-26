'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { MobileOverview } from '../../lib/mobile-overview';
import { addDays, buildMonthSchedule, buildWeekSchedule, mondayOf, monthLabel, monthOf, weekLabel, type ScheduleEntry } from '../../lib/mobile-schedule';
import { CALENDAR_WEEKDAYS, isWeekendColumn, shiftMonthKey } from '../../lib/schedule-calendar';

// 일정: every listed site's schedule, as a month calendar (the default) or one week at a time by day (spec 2026-10-21
// §3). Both read the overview the phone already has. A row opens that site.

type ScheduleView = 'calendar' | 'list';

// Which view was last used, remembered per phone.
const VIEW_STORAGE_KEY = 'weve-m-schedule-view';

// A colour per site, by its place in the overview list, so a site's bar has the same colour every day. Orange stays for
// delays (spec §6), so it is not among them.
const SITE_COLORS = ['#8f6f43', '#2f7f86', '#3b6fb6', '#4f8a4b', '#8a4f8a', '#5b6b7a', '#9a8a2e', '#b0566b'];

function readStoredView(): ScheduleView {
  if (typeof window === 'undefined') return 'calendar';
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'list' ? 'list' : 'calendar';
  } catch {
    return 'calendar';
  }
}

export function ScheduleTab({ overview, onOpenSite }: { overview: MobileOverview; onOpenSite: (siteId: string) => void }) {
  const [view, setView] = useState<ScheduleView>(readStoredView);
  const colorOf = useMemo(() => {
    const order = new Map(overview.sites.map((site, index) => [site.id, index]));
    return (siteId: string) => SITE_COLORS[(order.get(siteId) ?? 0) % SITE_COLORS.length];
  }, [overview.sites]);

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      // Not remembered this time.
    }
  }, [view]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[22px] font-bold text-[#171512]">일정</h1>
        <div role="group" aria-label="일정 보기" className="flex rounded-full border border-[#d8d1c5] bg-white p-0.5">
          {(
            [
              ['calendar', '달력'],
              ['list', '목록'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => setView(key)}
              className={`h-8 rounded-full px-4 text-sm font-semibold ${view === key ? 'bg-[#171512] text-white' : 'text-[#625d54]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {view === 'calendar' ? (
        <MonthCalendar overview={overview} colorOf={colorOf} onOpenSite={onOpenSite} />
      ) : (
        <WeekList overview={overview} colorOf={colorOf} onOpenSite={onOpenSite} />
      )}
    </div>
  );
}

// A month of Sunday-first weeks (토·일 in red). Each day shows a coloured bar per site with work that day (three at most, then +N);
// tapping a day lists its work under the calendar, the way the week list shows a day.
function MonthCalendar({
  overview,
  colorOf,
  onOpenSite,
}: {
  overview: MobileOverview;
  colorOf: (siteId: string) => string;
  onOpenSite: (siteId: string) => void;
}) {
  const thisMonth = monthOf(overview.today);
  const [month, setMonth] = useState(thisMonth);
  const [selected, setSelected] = useState(overview.today);
  const weeks = useMemo(() => buildMonthSchedule(overview.sites, month, overview.today), [month, overview.sites, overview.today]);
  const selectedDay = weeks.flat().find((item) => item.date === selected) ?? null;
  // Moving to a month selects its first day, or today in this month.
  const showMonth = (next: string) => {
    setMonth(next);
    setSelected(next === thisMonth ? overview.today : `${next}-01`);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => showMonth(shiftMonthKey(month, -1))}
          aria-label="지난달"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d8d1c5] bg-white text-[#514c43]"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <p className="flex-1 text-center text-sm font-bold text-[#171512]">{monthLabel(month)}</p>
        <button
          type="button"
          onClick={() => showMonth(shiftMonthKey(month, 1))}
          aria-label="다음 달"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d8d1c5] bg-white text-[#514c43]"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      {month !== thisMonth && (
        <button type="button" onClick={() => showMonth(thisMonth)} className="h-9 w-full rounded-xl bg-[#f1ebe0] text-sm font-semibold text-[#514c43]">
          이번 달로
        </button>
      )}

      <div className="overflow-hidden rounded-2xl border border-[#eadfcd] bg-white">
        <div className="grid grid-cols-7 border-b border-[#f1ebe0] text-center text-[11px] font-semibold text-[#8a8378]">
          {CALENDAR_WEEKDAYS.map((weekday, index) => (
            <span key={weekday} className={`py-1.5 ${isWeekendColumn(index) ? 'text-[#d92d20]' : ''}`}>
              {weekday}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0].date} className="grid grid-cols-7 border-b border-[#f6f1e8] last:border-b-0">
            {week.map((item, index) => {
              const isSelected = item.date === selected;
              const count = item.entries.length;
              return (
                <button
                  key={item.date}
                  type="button"
                  onClick={() => setSelected(item.date)}
                  aria-pressed={isSelected}
                  aria-label={`${Number(item.date.slice(5, 7))}월 ${Number(item.date.slice(8))}일${item.isToday ? ' 오늘' : ''}, 일정 ${count}건`}
                  className={`flex min-h-[64px] flex-col items-stretch gap-[3px] px-[3px] pb-1.5 pt-1 text-left ${isSelected ? 'bg-[#f6efe3]' : 'active:bg-[#faf6ef]'}`}
                >
                  <span
                    className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      item.isToday
                        ? 'bg-[#171512] text-white'
                        : isWeekendColumn(index)
                          ? item.inMonth
                            ? 'text-[#d92d20]'
                            : 'text-[#f0a49c]'
                          : item.inMonth
                            ? 'text-[#171512]'
                            : 'text-[#c4bcae]'
                    }`}
                  >
                    {Number(item.date.slice(8))}
                  </span>
                  {item.bars.map((siteId) => (
                    <span
                      key={siteId}
                      aria-hidden="true"
                      className={`block h-1.5 rounded-full ${item.inMonth ? '' : 'opacity-40'}`}
                      style={{ backgroundColor: colorOf(siteId) }}
                    />
                  ))}
                  {item.more > 0 && <span className="text-center text-[10px] font-semibold leading-none text-[#8a8378]">+{item.more}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {selectedDay && (
        <section className={`rounded-2xl border bg-white px-4 py-3 ${selectedDay.isToday ? 'border-[#8f6f43]' : 'border-[#eadfcd]'}`}>
          <h2 className={`text-sm font-bold ${selectedDay.isToday ? 'text-[#8f6f43]' : 'text-[#171512]'}`}>
            {Number(selectedDay.date.slice(5, 7))}월 {Number(selectedDay.date.slice(8))}일 ({selectedDay.weekday}){selectedDay.isToday ? ' · 오늘' : ''}
          </h2>
          <DayEntries entries={selectedDay.entries} colorOf={colorOf} onOpenSite={onOpenSite} />
        </section>
      )}
    </>
  );
}

function WeekList({
  overview,
  colorOf,
  onOpenSite,
}: {
  overview: MobileOverview;
  colorOf: (siteId: string) => string;
  onOpenSite: (siteId: string) => void;
}) {
  const thisWeek = mondayOf(overview.today);
  const [weekStart, setWeekStart] = useState(thisWeek);
  const days = buildWeekSchedule(overview.sites, weekStart, overview.today);

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setWeekStart(addDays(weekStart, -7))}
          aria-label="지난주"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d8d1c5] bg-white text-[#514c43]"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <p className="flex-1 text-center text-sm font-bold text-[#171512]">{weekLabel(weekStart)}</p>
        <button
          type="button"
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          aria-label="다음 주"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d8d1c5] bg-white text-[#514c43]"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      {weekStart !== thisWeek && (
        <button type="button" onClick={() => setWeekStart(thisWeek)} className="h-9 w-full rounded-xl bg-[#f1ebe0] text-sm font-semibold text-[#514c43]">
          이번 주로
        </button>
      )}

      {days.map((day) => (
        <section key={day.date} className={`rounded-2xl border bg-white px-4 py-3 ${day.isToday ? 'border-[#8f6f43]' : 'border-[#eadfcd]'}`}>
          <h2 className={`text-sm font-bold ${day.isToday ? 'text-[#8f6f43]' : 'text-[#171512]'}`}>
            {Number(day.date.slice(8))}일 ({day.weekday}){day.isToday ? ' · 오늘' : ''}
          </h2>
          <DayEntries entries={day.entries} colorOf={colorOf} onOpenSite={onOpenSite} />
        </section>
      ))}
    </>
  );
}

// One day's work: site and task (delays in orange), then day n of m, start, end and the vendor.
function DayEntries({ entries, colorOf, onOpenSite }: { entries: ScheduleEntry[]; colorOf: (siteId: string) => string; onOpenSite: (siteId: string) => void }) {
  if (entries.length === 0) return <p className="mt-1 text-xs text-[#a59d90]">일정 없음</p>;
  return (
    <ul className="mt-1 divide-y divide-[#f1ebe0]">
      {entries.map((entry) => (
        <li key={`${entry.siteId}/${entry.taskId}`}>
          <button type="button" onClick={() => onOpenSite(entry.siteId)} className="flex w-full items-start gap-2 py-2 text-left active:bg-[#faf6ef]">
            <span aria-hidden="true" className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorOf(entry.siteId) }} />
            <span className="min-w-0">
              <span className={`block text-sm font-semibold ${entry.delayed ? 'text-[#c2410c]' : 'text-[#171512]'}`}>
                {entry.siteTitle} · {entry.taskName}
                {entry.delayed ? ' (지연)' : ''}
              </span>
              <span className="block text-xs text-[#625d54]">
                {[`${entry.dayIndex}/${entry.dayCount}일`, entry.starts ? '시작' : '', entry.ends ? '마감' : '', entry.vendorName || ''].filter(Boolean).join(' · ')}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
