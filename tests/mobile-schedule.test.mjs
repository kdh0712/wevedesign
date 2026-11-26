import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, buildMonthSchedule, buildWeekSchedule, monthLabel, monthOf, mondayOf, weekLabel } from '../app/lib/mobile-schedule.ts';

const task = (id, name, startDate, endDate, extra = {}) => ({ id, name, state: 'upcoming', percent: 0, startDate, endDate, ...extra });
const site = (id, title, tasks) => ({ id, title, address: '', status: '시공중', customerName: '', schedule: { percent: 0, startDate: '', endDate: '', tasks } });
const day = (days, date) => days.find((item) => item.date === date);

test('weeks start on Monday, also across the new year', () => {
  assert.equal(mondayOf('2026-10-21'), '2026-10-19');
  assert.equal(mondayOf('2026-10-19'), '2026-10-19');
  assert.equal(mondayOf('2026-10-25'), '2026-10-19');
  assert.equal(mondayOf('2027-01-01'), '2026-12-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-10-19', -7), '2026-10-12');
});

test('week labels', () => {
  assert.equal(weekLabel('2026-10-19'), '10월 19일 ~ 25일');
  assert.equal(weekLabel('2026-10-26'), '10월 26일 ~ 11월 1일');
});

test('a task appears on every day it covers, with start, end and day n of m', () => {
  const days = buildWeekSchedule([site('s1', '위브 24평', [task('t1', '목공', '2026-10-20', '2026-10-22', { vendorName: '한빛목공' })])], '2026-10-19', '2026-10-21');
  assert.equal(day(days, '2026-10-19').entries.length, 0);
  assert.deepEqual(day(days, '2026-10-20').entries[0], {
    siteId: 's1',
    siteTitle: '위브 24평',
    taskId: 't1',
    taskName: '목공',
    vendorName: '한빛목공',
    dayIndex: 1,
    dayCount: 3,
    starts: true,
    ends: false,
    delayed: false,
  });
  const middle = day(days, '2026-10-21').entries[0];
  assert.deepEqual([middle.dayIndex, middle.starts, middle.ends], [2, false, false]);
  const last = day(days, '2026-10-22').entries[0];
  assert.deepEqual([last.dayIndex, last.ends], [3, true]);
  assert.equal(day(days, '2026-10-23').entries.length, 0);
  assert.ok(!('vendorName' in buildWeekSchedule([site('s1', 'A', [task('t1', '목공', '2026-10-20', '2026-10-20')])], '2026-10-19', '2026-10-21')[1].entries[0]));
});

test('skips tasks with missing or reversed dates', () => {
  const days = buildWeekSchedule(
    [site('s1', 'A', [task('a', '빈 시작', '', '2026-10-22'), task('b', '빈 끝', '2026-10-20', ''), task('c', '거꾸로', '2026-10-22', '2026-10-20'), task('d', '이상한 날', '10/20', '10/22')])],
    '2026-10-19',
    '2026-10-21',
  );
  assert.equal(days.flatMap((item) => item.entries).length, 0);
});

test('delayed first, then site title, then task start', () => {
  const days = buildWeekSchedule(
    [
      site('n', '나', [task('1', '도배', '2026-10-21', '2026-10-21')]),
      site('g', '가', [task('2', '타일', '2026-10-21', '2026-10-23'), task('3', '철거', '2026-10-20', '2026-10-21')]),
      site('d', '다', [task('4', '전기', '2026-10-19', '2026-10-21', { state: 'delayed' })]),
    ],
    '2026-10-19',
    '2026-10-21',
  );
  assert.deepEqual(day(days, '2026-10-21').entries.map((entry) => entry.taskName), ['전기', '철거', '타일', '도배']);
  assert.equal(day(days, '2026-10-21').entries[0].delayed, true);
});

test('today is marked and weekdays are Korean', () => {
  const days = buildWeekSchedule([], '2026-10-19', '2026-10-21');
  assert.equal(days.length, 7);
  assert.deepEqual(days.map((item) => item.weekday), ['월', '화', '수', '목', '금', '토', '일']);
  assert.deepEqual(days.map((item) => item.isToday), [false, false, true, false, false, false, false]);
  assert.equal(days[6].date, '2026-10-25');
});

test('sites without a schedule are skipped', () => {
  const noSchedule = { ...site('s1', 'A', []), schedule: null };
  assert.equal(buildWeekSchedule([noSchedule], '2026-10-19', '2026-10-21').flatMap((item) => item.entries).length, 0);
});

// 일정 달력 (the phone's month view): the same entries as the week list, laid out as a month of Monday-first weeks.

test('month calendar: Sunday-first weeks covering the whole month, the days around it marked', () => {
  const weeks = buildMonthSchedule([], '2026-11', '2026-11-24');
  // Weeks run Sunday to Saturday. 1 November 2026 is a Sunday and the 30th a Monday: five weeks, 1 November to 5 December.
  assert.equal(weeks.length, 5);
  assert.ok(weeks.every((week) => week.length === 7));
  assert.deepEqual([weeks[0][0].date, weeks[0][0].inMonth, weeks[0][0].weekday], ['2026-11-01', true, '일']);
  assert.deepEqual([weeks[0][6].date, weeks[0][6].weekday], ['2026-11-07', '토']);
  assert.deepEqual([weeks[4][0].date, weeks[4][0].inMonth], ['2026-11-29', true]);
  assert.deepEqual([weeks[4][6].date, weeks[4][6].inMonth], ['2026-12-05', false]);
  assert.deepEqual(weeks.flat().filter((item) => item.isToday).map((item) => item.date), ['2026-11-24']);
});

test('month calendar: one bar per site a day, in the overview order, three at most and the rest as +N', () => {
  const sites = [
    site('a', '가 현장', [task('t1', '목공', '2026-11-09', '2026-11-11'), task('t2', '전기', '2026-11-10', '2026-11-10')]),
    site('b', '나 현장', [task('t3', '타일', '2026-11-10', '2026-11-10')]),
    site('c', '다 현장', [task('t4', '도장', '2026-11-10', '2026-11-12', { state: 'delayed' })]),
    site('d', '라 현장', [task('t5', '도배', '2026-11-10', '2026-11-10')]),
    site('e', '마 현장', [task('t6', '청소', '2026-11-10', '2026-11-10')]),
  ];
  const days = buildMonthSchedule(sites, '2026-11', '2026-11-24').flat();
  const tenth = day(days, '2026-11-10');
  assert.deepEqual(tenth.bars, ['a', 'b', 'c']);
  assert.equal(tenth.more, 2);
  // The day's list keeps every task, as the week list orders them (delays first).
  assert.equal(tenth.entries.length, 6);
  assert.equal(tenth.entries[0].taskId, 't4');
  assert.deepEqual([day(days, '2026-11-11').bars, day(days, '2026-11-11').more], [['a', 'c'], 0]);
  assert.deepEqual(day(days, '2026-11-13').bars, []);
});

test('month calendar: tasks reach into the days shown from the months around it', () => {
  // December 2026 starts on a Tuesday, so its first week shows 29 and 30 November.
  const sites = [site('a', '가 현장', [task('t1', '철거', '2026-11-27', '2026-12-02')])];
  const days = buildMonthSchedule(sites, '2026-12', '2026-12-01').flat();
  assert.deepEqual(day(days, '2026-11-29').bars, ['a']);
  assert.deepEqual(day(days, '2026-12-02').bars, ['a']);
});

test('month keys and labels', () => {
  assert.equal(monthOf('2026-11-24'), '2026-11');
  assert.equal(monthOf('bad'), '');
  assert.equal(monthLabel('2026-11'), '2026년 11월');
  assert.equal(monthLabel('2027-01'), '2027년 1월');
});
