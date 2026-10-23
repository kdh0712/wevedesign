'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, clampMonthKey, layoutCalendarWeek, monthWeekStarts, shiftMonthKey } from './schedule-calendar';
import type { CustomerSchedule } from './site-progress';

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

// The manager calendar's bar color: the task color at 72%, gold when there is none.
function barColor(color: string): string {
  const hex = /^#[0-9a-fA-F]{6}$/.test(color) ? color.slice(1) : 'f1c76a';
  return `rgba(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}, 0.72)`;
}

// One month of the construction schedule as bars, laid out like the manager calendar (longest task on top, name in the
// middle). It opens on the month of today (or the nearest month of the construction period) and pages within that period.
export function ProgressScheduleCalendar({ schedule }: { schedule: CustomerSchedule }) {
  const firstMonth = schedule.startDate.slice(0, 7);
  const lastMonth = schedule.endDate.slice(0, 7);
  const [month, setMonth] = useState(() => clampMonthKey(schedule.today.slice(0, 7), firstMonth, lastMonth));
  const [year, monthNumber] = month.split('-').map(Number);
  const holidays = new Set(schedule.holidays);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth(shiftMonthKey(month, -1))}
          disabled={month <= firstMonth}
          aria-label="이전 달"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#d5dde2] bg-white disabled:opacity-30"
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <p className="text-base font-bold" aria-live="polite">
          {year}년 {monthNumber}월
        </p>
        <button
          type="button"
          onClick={() => setMonth(shiftMonthKey(month, 1))}
          disabled={month >= lastMonth}
          aria-label="다음 달"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#d5dde2] bg-white disabled:opacity-30"
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-[#e3e9ec]">
        <div className="grid grid-cols-7 bg-[#f7f9fa] text-center text-[11px] font-bold text-[#60717d]">
          {WEEKDAYS.map((day) => (
            <div key={day} className="border-b border-[#e3e9ec] py-1.5">
              {day}
            </div>
          ))}
        </div>
        {monthWeekStarts(month).map((weekStart) => {
          const { bars, laneCount } = layoutCalendarWeek(schedule.tasks, weekStart);
          return (
            <div
              key={weekStart}
              className="grid min-h-14 grid-cols-7 border-b border-[#e3e9ec] last:border-b-0"
              style={{ gridTemplateRows: `22px repeat(${laneCount}, auto) 1fr` }}
            >
              {Array.from({ length: 7 }, (_, index) => {
                const date = addDays(weekStart, index);
                const inMonth = date.startsWith(month);
                const isToday = date === schedule.today;
                return (
                  <div
                    key={date}
                    style={{ gridColumn: index + 1, gridRow: '1 / -1' }}
                    className={`border-r border-[#e3e9ec] px-1 pt-1 last:border-r-0 ${inMonth ? 'bg-white' : 'bg-[#f7f9fa]'}`}
                  >
                    <span
                      className={`inline-block rounded-full px-1 text-[11px] font-bold leading-4 ${
                        isToday ? 'bg-[#38a9bd] text-white' : !inMonth ? 'text-[#b4bec4]' : holidays.has(date) ? 'text-red-600' : 'text-[#171512]'
                      }`}
                    >
                      {Number(date.slice(8))}
                    </span>
                  </div>
                );
              })}
              {bars.map((bar) => (
                <div
                  key={bar.task.id}
                  style={{ gridColumn: `${bar.startCol + 1} / ${bar.endCol + 2}`, gridRow: bar.lane + 2, backgroundColor: barColor(bar.task.color) }}
                  className={`relative z-[1] my-px flex h-[18px] min-w-0 items-center justify-center px-1 text-[10.5px] font-bold text-[#171512] ${
                    bar.startsHere ? 'ml-0.5 rounded-l-full' : ''
                  } ${bar.endsHere ? 'mr-0.5 rounded-r-full' : ''}`}
                >
                  <span className="truncate">{bar.task.name}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <p className="mt-2 flex gap-3 text-[11px] text-[#60717d]">
        <span className="flex items-center gap-1">
          <span className="inline-block rounded-full bg-[#38a9bd] px-1 font-bold leading-4 text-white">{Number(schedule.today.slice(8))}</span>
          오늘
        </span>
        {schedule.holidays.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="font-bold text-red-600">빨간 날짜</span>
            쉬는 날
          </span>
        )}
      </p>
    </div>
  );
}
