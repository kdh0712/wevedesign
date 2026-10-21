import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SITE_NOTE_MAX,
  canDeleteSiteNote,
  countOpenTodos,
  deletedFields,
  doneFields,
  isSiteNoteId,
  newSiteNoteRecord,
  parseSiteNoteAction,
  shortSeoulDate,
  siteAcceptsNotes,
  sortSiteNotes,
  toSiteNoteView,
} from '../app/lib/site-notes.ts';

const author = { loginId: 'staff1', name: '김직원', role: 'staff' };
const id = 'sn-0123456789abcdef01234567';
const now = '2026-10-21T01:00:00.000Z';

test('add needs a known kind, a well formed site id and 1 to 1000 characters', () => {
  assert.equal(SITE_NOTE_MAX, 1000);
  assert.deepEqual(parseSiteNoteAction({ action: 'add', siteId: 's1', kind: 'todo', text: '  타일 확인  ' }), {
    ok: true,
    action: 'add',
    siteId: 's1',
    kind: 'todo',
    text: '타일 확인',
  });
  assert.equal(parseSiteNoteAction({ action: 'add', siteId: 's1', kind: 'todo', text: '첫 줄\n둘째 줄' }).text, '첫 줄\n둘째 줄');
  for (const bad of [{ text: '   ' }, { text: 'x'.repeat(1001) }, { text: 42 }, { kind: 'memo' }, { siteId: '../x' }, { siteId: '' }]) {
    assert.equal(parseSiteNoteAction({ action: 'add', siteId: 's1', kind: 'note', text: '글', ...bad }).ok, false, JSON.stringify(bad));
  }
  assert.equal(parseSiteNoteAction({ action: 'add', siteId: 's1', kind: 'note', text: 'x'.repeat(1000) }).ok, true);
});

test('setDone and delete need a note id we issue', () => {
  assert.equal(isSiteNoteId(id), true);
  assert.deepEqual(parseSiteNoteAction({ action: 'setDone', id, done: true }), { ok: true, action: 'setDone', id, done: true });
  assert.deepEqual(parseSiteNoteAction({ action: 'delete', id }), { ok: true, action: 'delete', id });
  assert.equal(parseSiteNoteAction({ action: 'setDone', id, done: 'yes' }).ok, false);
  assert.equal(parseSiteNoteAction({ action: 'delete', id: 'sn-xyz' }).ok, false);
  assert.equal(parseSiteNoteAction({ action: 'delete', id: '../sn-0123456789abcdef01234567' }).ok, false);
  assert.equal(parseSiteNoteAction({ action: 'rename', id }).ok, false);
  assert.equal(parseSiteNoteAction(null).ok, false);
});

test('a new record takes its author from the session and a todo starts open', () => {
  const todo = newSiteNoteRecord({ id, siteId: 's1', kind: 'todo', text: '타일 확인' }, author, now);
  assert.deepEqual(todo, {
    _id: id,
    siteId: 's1',
    kind: 'todo',
    text: '타일 확인',
    createdAt: now,
    createdBy: 'staff1',
    createdByName: '김직원',
    todoState: 'open',
  });
  assert.equal(newSiteNoteRecord({ id, siteId: 's1', kind: 'note', text: '기록' }, author, now).todoState, '');
});

test('done and undone fields', () => {
  assert.deepEqual(doneFields(true, author, now), { todoState: 'done', doneAt: now, doneBy: 'staff1', doneByName: '김직원' });
  assert.deepEqual(doneFields(false, author, now), { todoState: 'open', doneAt: '', doneBy: '', doneByName: '' });
  assert.deepEqual(deletedFields(author, now), { deletedAt: now, deletedBy: '김직원', todoState: '' });
});

test('views drop deleted records and internal fields', () => {
  const record = { ...newSiteNoteRecord({ id, siteId: 's1', kind: 'todo', text: '타일' }, author, now), ...doneFields(true, author, now) };
  const view = toSiteNoteView(record);
  assert.deepEqual(view, {
    id,
    siteId: 's1',
    kind: 'todo',
    text: '타일',
    createdAt: now,
    createdBy: 'staff1',
    createdByName: '김직원',
    done: true,
    doneAt: now,
    doneByName: '김직원',
  });
  assert.equal(toSiteNoteView({ ...record, ...deletedFields(author, now) }), null);
  assert.equal(toSiteNoteView({ ...record, kind: 'memo' }), null);
  assert.equal(toSiteNoteView({ ...record, _id: 'x' }), null);
  const open = toSiteNoteView(newSiteNoteRecord({ id, siteId: 's1', kind: 'todo', text: '타일' }, author, now));
  assert.equal(open.done, false);
  assert.ok(!('doneAt' in open));
});

test('open todos first, then newest', () => {
  const note = (suffix, createdAt, done) => ({ id: `sn-${suffix.repeat(24)}`, siteId: 's1', kind: 'todo', text: suffix, createdAt, createdBy: 'a', createdByName: 'a', done });
  const sorted = sortSiteNotes([note('1', '2026-10-01', false), note('2', '2026-10-03', true), note('3', '2026-10-02', false)]);
  assert.deepEqual(sorted.map((item) => item.text), ['3', '1', '2']);
});

test('only the author or an admin deletes', () => {
  assert.equal(canDeleteSiteNote({ createdBy: 'staff1' }, author), true);
  assert.equal(canDeleteSiteNote({ createdBy: 'staff2' }, author), false);
  assert.equal(canDeleteSiteNote({ createdBy: 'staff2' }, { ...author, role: 'admin' }), true);
});

test('notes go only to a live site', () => {
  assert.equal(siteAcceptsNotes({ _id: 's1' }), true);
  assert.equal(siteAcceptsNotes({ _id: 's1', deletedAt: '2026-10-21T00:00:00Z' }), false);
  assert.equal(siteAcceptsNotes(null), false);
});

test('open todos are counted per site', () => {
  const records = [
    { siteId: 's1', todoState: 'open' },
    { siteId: 's1', todoState: 'open' },
    { siteId: 's1', todoState: 'done' },
    { siteId: 's1', todoState: 'open', deletedAt: now },
    { siteId: 's2', todoState: 'open' },
  ];
  assert.deepEqual(countOpenTodos(records), { s1: 2, s2: 1 });
});

test('shortSeoulDate', () => {
  assert.equal(shortSeoulDate('2026-10-20T16:30:00.000Z'), '10/21');
  assert.equal(shortSeoulDate('nope'), '');
});
