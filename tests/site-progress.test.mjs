import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCustomerProgressView,
  canNotify,
  fillProgressTemplate,
  phoneLast4,
  pickScheduleEstimate,
  summarizeSchedule,
  todayInSeoul,
} from '../app/lib/site-progress.ts';

test('todayInSeoul uses Korea time', () => {
  assert.equal(todayInSeoul(Date.UTC(2026, 9, 16, 15, 30)), '2026-10-17'); // KST 00:30
  assert.equal(todayInSeoul(Date.UTC(2026, 9, 17, 14, 59)), '2026-10-17');
});

test('phoneLast4 keeps digits only', () => {
  for (const value of ['010-1234-5678', '01012345678', '+82 10-1234-5678', ' 010 1234 5678 ']) assert.equal(phoneLast4(value), '5678');
  assert.equal(phoneLast4('12'), '');
  assert.equal(phoneLast4(undefined), '');
});

test('pickScheduleEstimate prefers the newest final version', () => {
  const picked = pickScheduleEstimate([
    { _id: 'a', versionType: 'revision', updatedAt: '2026-10-10' },
    { _id: 'b', versionType: 'final', updatedAt: '2026-10-01' },
    { _id: 'c', versionType: 'final', updatedAt: '2026-10-05' },
  ]);
  assert.equal(picked._id, 'c');
  assert.equal(pickScheduleEstimate([{ _id: 'x', updatedAt: '2026-10-01' }, { _id: 'y', updatedAt: '2026-10-02' }])._id, 'y');
  assert.equal(pickScheduleEstimate([]), null);
});

test('summarizeSchedule states, weighted percent and next task', () => {
  const tasks = [
    { id: '1', name: '철거', startDate: '2026-10-01', endDate: '2026-10-02', durationDays: 2, progress: 0 },
    { id: '2', name: '목공', startDate: '2026-10-03', endDate: '2026-10-08', durationDays: 6, progress: 0 },
    { id: '3', name: '타일', startDate: '2026-10-09', endDate: '2026-10-10', durationDays: 2, progress: 0 },
  ];
  const s = summarizeSchedule(tasks, '2026-10-05');
  assert.deepEqual(s.tasks.map((t) => t.state), ['done', 'active', 'upcoming']);
  assert.equal(s.percent, 50); // (2*100 + 6*50 + 2*0) / 10
  assert.equal(s.current[0].name, '목공');
  assert.equal(s.next.name, '타일');
  assert.equal(s.startDate, '2026-10-01');
  assert.equal(s.endDate, '2026-10-10');
});

test('summarizeSchedule uses a positive progress value and 100 means done', () => {
  const s = summarizeSchedule([{ id: '1', name: '도배', startDate: '2026-10-20', endDate: '2026-10-21', durationDays: 2, progress: 100 }], '2026-10-05');
  assert.equal(s.tasks[0].state, 'done');
  assert.equal(s.percent, 100);
});

test('summarizeSchedule ignores broken tasks and never returns NaN', () => {
  const s = summarizeSchedule([
    { id: '1', name: '', startDate: '', endDate: '', durationDays: 0, progress: 0 },
    { id: '2', name: '전기', startDate: '2026-10-09', endDate: '2026-10-03', durationDays: 0, progress: 0 },
  ], '2026-10-05');
  assert.ok(s === null || Number.isFinite(s.percent));
  assert.equal(summarizeSchedule([], '2026-10-05'), null);
});

test('buildCustomerProgressView drops prices, vendors and memos', () => {
  const view = buildCustomerProgressView({
    site: { title: '용호마을 24평', customerName: '홍길동', customerPhone: '010-1111-2222' },
    updates: [{ _id: 'u1', siteId: 's', reportDate: '2026-10-05', designer: '김동호 실장', workDetail: '철거 완료', photos: [], createdAt: 'x', notifyLog: [] }],
    estimates: [{ versionType: 'final', updatedAt: '2026-10-01', linesJson: '[{"customerUnitPrice":900000}]',
      scheduleJson: JSON.stringify([{ id: '1', name: '철거', startDate: '2026-10-01', endDate: '2026-10-02', durationDays: 2, progress: 0, vendorName: '거래처', vendorPhone: '010-9999-9999', memo: '내부 메모' }]) }],
    today: '2026-10-05',
  });
  const text = JSON.stringify(view);
  for (const banned of ['900000', '거래처', '010-9999-9999', '내부 메모', '010-1111-2222', 'customerUnitPrice']) assert.ok(!text.includes(banned), banned);
  assert.equal(view.contactPhone, '031-381-0489');
  assert.equal(view.updates[0].workDetail, '철거 완료');
});

test('fillProgressTemplate and canNotify', () => {
  assert.equal(fillProgressTemplate('#{고객명}/#{현장명}/#{날짜}/#{코드}', { customerName: '홍길동', siteTitle: 'A', date: '2026-10-05', code: 'abc' }), '홍길동/A/2026-10-05/abc');
  assert.equal(canNotify({ notifyLog: [] }, false), true);
  assert.equal(canNotify({ notifyLog: [{ sentAt: 'x', ok: false, by: 'a' }] }, false), true);
  assert.equal(canNotify({ notifyLog: [{ sentAt: 'x', ok: true, by: 'a' }] }, false), false);
  assert.equal(canNotify({ notifyLog: [{ sentAt: 'x', ok: true, by: 'a' }] }, true), true);
});

test('buildCustomerProgressView sorts updates newest first and survives a broken schedule', () => {
  const update = (_id, reportDate, createdAt) => ({ _id, siteId: 's', reportDate, designer: '실장', workDetail: _id, photos: [], createdAt });
  const view = buildCustomerProgressView({
    site: { title: '현장', customerName: '고객' },
    updates: [update('old', '2026-10-01', '2026-10-01T09:00:00Z'), update('late', '2026-10-05', '2026-10-05T18:00:00Z'), update('early', '2026-10-05', '2026-10-05T09:00:00Z')],
    estimates: [{ versionType: 'final', updatedAt: '2026-10-01', scheduleJson: '{not json' }],
    today: '2026-10-05',
  });
  assert.deepEqual(view.updates.map((u) => u.id), ['late', 'early', 'old']);
  assert.equal(view.schedule, null);
  assert.equal(buildCustomerProgressView({ site: {}, updates: [], estimates: [], today: '2026-10-05' }).schedule, null);
});

test('fillProgressTemplate inserts values literally', () => {
  assert.equal(
    fillProgressTemplate('#{고객명} #{코드}', { customerName: '$& #{코드}', siteTitle: '', date: '', code: 'z' }),
    '$& #{코드} z',
  );
});

test('summarizeSchedule lists tasks in start date order and keeps input order for equal dates', () => {
  const tasks = [
    { id: '1', name: '타일', startDate: '2026-10-09', endDate: '2026-10-10', durationDays: 2, progress: 0 },
    { id: '2', name: '목공', startDate: '2026-10-03', endDate: '2026-10-08', durationDays: 6, progress: 0 },
    { id: '3', name: '전기', startDate: '2026-10-03', endDate: '2026-10-04', durationDays: 2, progress: 0 },
    { id: '4', name: '철거', startDate: '2026-10-01', endDate: '2026-10-02', durationDays: 2, progress: 0 },
  ];
  const s = summarizeSchedule(tasks, '2026-10-04');
  assert.deepEqual(s.tasks.map((t) => t.name), ['철거', '목공', '전기', '타일']);
  assert.deepEqual(s.current.map((t) => t.name), ['목공', '전기']);
  assert.equal(s.next.name, '타일');
  assert.equal(s.startDate, '2026-10-01');
  assert.equal(s.endDate, '2026-10-10');
});
