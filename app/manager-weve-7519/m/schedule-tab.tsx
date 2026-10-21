'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { MobileOverview } from '../../lib/mobile-overview';
import { addDays, buildWeekSchedule, mondayOf, weekLabel } from '../../lib/mobile-schedule';

// 일정: every listed site's schedule, one week at a time by day (spec 2026-10-21 §3). A row opens that site.
export function ScheduleTab({ overview, onOpenSite }: { overview: MobileOverview; onOpenSite: (siteId: string) => void }) {
  const thisWeek = mondayOf(overview.today);
  const [weekStart, setWeekStart] = useState(thisWeek);
  const days = buildWeekSchedule(overview.sites, weekStart, overview.today);

  return (
    <div className="space-y-3">
      <h1 className="text-[22px] font-bold text-[#171512]">일정</h1>
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
          {day.entries.length === 0 ? (
            <p className="mt-1 text-xs text-[#a59d90]">일정 없음</p>
          ) : (
            <ul className="mt-1 divide-y divide-[#f1ebe0]">
              {day.entries.map((entry) => (
                <li key={`${entry.siteId}/${entry.taskId}`}>
                  <button type="button" onClick={() => onOpenSite(entry.siteId)} className="w-full py-2 text-left active:bg-[#faf6ef]">
                    <span className={`block text-sm font-semibold ${entry.delayed ? 'text-[#c2410c]' : 'text-[#171512]'}`}>
                      {entry.siteTitle} · {entry.taskName}
                      {entry.delayed ? ' (지연)' : ''}
                    </span>
                    <span className="block text-xs text-[#625d54]">
                      {[
                        `${entry.dayIndex}/${entry.dayCount}일`,
                        entry.starts ? '시작' : '',
                        entry.ends ? '마감' : '',
                        entry.vendorName || '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
