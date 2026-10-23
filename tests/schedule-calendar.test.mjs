import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  clampMonthKey,
  layoutCalendarWeek,
  mondayOf,
  monthKeysBetween,
  monthWeekStarts,
  scheduleSpan,
  scheduleTaskEnd,
  shiftMonthKey,
  weekPages,
} from '../app/lib/schedule-calendar.ts';

const task = (id, startDate, endDate) => ({ id, startDate, endDate });
const lanesOf = (layout) => Object.fromEntries(layout.bars.map((bar) => [bar.task.id, bar.lane]));

test('date helpers work on YYYY-MM-DD keys across months and years', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(mondayOf('2026-10-23'), '2026-10-19'); // Friday
  assert.equal(mondayOf('2026-10-19'), '2026-10-19'); // Monday
  assert.equal(mondayOf('2026-10-25'), '2026-10-19'); // Sunday belongs to the week that started on Monday
  assert.equal(shiftMonthKey('2026-12', 1), '2027-01');
  assert.equal(shiftMonthKey('2026-01', -1), '2025-12');
});

test('scheduleTaskEnd counts the days from the start and moves past holidays like the manager calendar', () => {
  assert.equal(scheduleTaskEnd({ startDate: '2026-10-21', endDate: '2026-10-27', durationDays: 7 }, []), '2026-10-27');
  // One holiday inside the task pushes the end one day; a holiday reached by that push pushes it again.
  assert.equal(scheduleTaskEnd({ startDate: '2026-10-21', endDate: '2026-10-27', durationDays: 7 }, ['2026-10-24']), '2026-10-28');
  assert.equal(scheduleTaskEnd({ startDate: '2026-10-21', endDate: '2026-10-27', durationDays: 7 }, ['2026-10-24', '2026-10-28']), '2026-10-29');
  assert.equal(scheduleTaskEnd({ startDate: '2026-10-21', endDate: '2026-10-27', durationDays: 7 }, ['2026-10-20', '2026-11-30']), '2026-10-27', 'holidays outside the task do not count');
  // Without a duration the saved end date is used; without a start, there is no end.
  assert.equal(scheduleTaskEnd({ startDate: '2026-10-21', endDate: '2026-10-23', durationDays: 0 }, []), '2026-10-23');
  assert.equal(scheduleTaskEnd({ startDate: '', endDate: '', durationDays: 3 }, []), '');
  assert.equal(scheduleTaskEnd({ startDate: 'not a date', endDate: '', durationDays: 3 }, []), '');
});

test('layoutCalendarWeek puts the longest task on top and keeps each task on one lane in the week', () => {
  // The screenshot case: a two-day 욕실 and a one-day 욕실 on the same Friday.
  const short = task('short', '2026-10-16', '2026-10-16');
  const long = task('long', '2026-10-16', '2026-10-17');
  const layout = layoutCalendarWeek([short, long], '2026-10-12');
  assert.deepEqual(lanesOf(layout), { long: 0, short: 1 });
  assert.equal(layout.laneCount, 2);
  const longBar = layout.bars.find((bar) => bar.task.id === 'long');
  assert.deepEqual([longBar.startCol, longBar.endCol, longBar.startsHere, longBar.endsHere], [4, 5, true, true]);
  assert.equal(layout.bars[0].task.id, 'long', 'bars come out top lane first');
});

test('layoutCalendarWeek packs tasks that do not overlap into the same lane', () => {
  const layout = layoutCalendarWeek(
    [task('tile', '2026-10-26', '2026-10-28'), task('paint', '2026-10-29', '2026-10-30'), task('electric', '2026-10-21', '2026-10-27')],
    '2026-10-26',
  );
  // 전기 is the longest (7 days) so it is on top even though only two of its days are in this week.
  assert.deepEqual(lanesOf(layout), { electric: 0, tile: 1, paint: 0 });
  assert.equal(layout.laneCount, 2);
  const electric = layout.bars.find((bar) => bar.task.id === 'electric');
  assert.deepEqual([electric.startCol, electric.endCol, electric.startsHere, electric.endsHere], [0, 1, false, true]);
});

test('layoutCalendarWeek breaks ties by the earlier start, then by the given order', () => {
  const layout = layoutCalendarWeek(
    [task('b', '2026-10-21', '2026-10-22'), task('a', '2026-10-20', '2026-10-21'), task('c', '2026-10-21', '2026-10-22')],
    '2026-10-19',
  );
  assert.deepEqual(layout.bars.map((bar) => bar.task.id), ['a', 'b', 'c']);
  assert.deepEqual(lanesOf(layout), { a: 0, b: 1, c: 2 });
});

test('layoutCalendarWeek clips tasks that cross the week and skips tasks outside it or with broken dates', () => {
  const layout = layoutCalendarWeek(
    [
      task('across', '2026-10-15', '2026-10-28'),
      task('before', '2026-10-01', '2026-10-18'),
      task('after', '2026-10-26', '2026-10-27'),
      task('broken', '2026-10-22', '2026-10-20'),
      task('empty', '', ''),
    ],
    '2026-10-19',
  );
  assert.deepEqual(layout.bars.map((bar) => bar.task.id), ['across']);
  const across = layout.bars[0];
  assert.deepEqual([across.startCol, across.endCol, across.startsHere, across.endsHere], [0, 6, false, false]);
  assert.deepEqual(layoutCalendarWeek([], '2026-10-19'), { bars: [], laneCount: 0 });
});

test('monthWeekStarts lists the Mondays of the weeks that hold the month', () => {
  assert.deepEqual(monthWeekStarts('2026-10'), ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
  assert.deepEqual(monthWeekStarts('2027-02'), ['2027-02-01', '2027-02-08', '2027-02-15', '2027-02-22']); // 28 days from a Monday
  assert.equal(monthWeekStarts('2026-08').length, 6); // Saturday the 1st to Monday the 31st
});

test('scheduleSpan finds the first start and the last end; monthKeysBetween lists months up to a limit', () => {
  assert.deepEqual(scheduleSpan([task('a', '2026-10-16', '2026-10-17'), task('b', '2026-11-02', '2026-11-09'), task('x', '', '')]), {
    start: '2026-10-16',
    end: '2026-11-09',
  });
  assert.equal(scheduleSpan([task('x', '', '')]), null);
  assert.deepEqual(monthKeysBetween('2026-11', '2027-01'), ['2026-11', '2026-12', '2027-01']);
  assert.deepEqual(monthKeysBetween('2026-11', '2026-10'), ['2026-11'], 'a reversed range gives the first month');
  assert.equal(monthKeysBetween('2026-01', '2027-12').length, 12, 'never more than a year of pages');
  assert.equal(clampMonthKey('2026-09', '2026-10', '2026-11'), '2026-10');
  assert.equal(clampMonthKey('2026-12', '2026-10', '2026-11'), '2026-11');
  assert.equal(clampMonthKey('2026-10', '2026-10', '2026-11'), '2026-10');
});

test('weekPages splits the weeks from the start week to the last week into pages', () => {
  assert.deepEqual(weekPages('2026-10-19', '2026-11-09', 5), [['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09']]);
  const pages = weekPages('2026-10-21', '2026-12-01', 5);
  assert.deepEqual(pages.map((page) => page.length), [5, 2]);
  assert.equal(pages[0][0], '2026-10-19', 'the first page starts on the Monday of the start week');
  assert.equal(pages[1][1], '2026-11-30');
  assert.deepEqual(weekPages('2026-10-21', '2026-10-01', 5), [['2026-10-19']], 'an end before the start gives the start week');
});
