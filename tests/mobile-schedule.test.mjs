import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, buildWeekSchedule, mondayOf, weekLabel } from '../app/lib/mobile-schedule.ts';

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
