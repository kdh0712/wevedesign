// 현장 기록·할 일 (spec docs/superpowers/specs/2026-10-21-staff-app-notes-schedule-estimate-design.md §2).
// Pure rules shared by /api/manager/site-notes, the phone overview and Node tests. One Firestore document per note or
// todo, so two people writing at once never overwrite each other.
import { isOfficeRecordId } from './mobile-overview.ts';

export const SITE_NOTE_MAX = 1000;
export const SITE_NOTES_COLLECTION = 'siteNotes';

export type SiteNoteKind = 'note' | 'todo';

export type SiteNote = {
  id: string;
  siteId: string;
  kind: SiteNoteKind;
  text: string;
  createdAt: string;
  createdBy: string;
  createdByName: string;
  done: boolean;
  doneAt?: string;
  doneByName?: string;
};

// Who acts, always taken from the signed session, never from the request body.
export type SiteNoteAuthor = { loginId: string; name: string; role: string };

export type SiteNoteAction =
  | { ok: true; action: 'add'; siteId: string; kind: SiteNoteKind; text: string }
  | { ok: true; action: 'setDone'; id: string; done: boolean }
  | { ok: true; action: 'delete'; id: string }
  | { ok: false; error: string };

export const isSiteNoteId = (value: unknown): value is string => typeof value === 'string' && /^sn-[0-9a-f]{24}$/.test(value);

const isKind = (value: unknown): value is SiteNoteKind => value === 'note' || value === 'todo';
const str = (value: unknown) => (typeof value === 'string' ? value : '');
const authorName = (author: SiteNoteAuthor) => (author.name || author.loginId).slice(0, 80);

export function parseSiteNoteAction(body: unknown): SiteNoteAction {
  if (typeof body !== 'object' || body === null) return { ok: false, error: '알 수 없는 요청입니다.' };
  const input = body as Record<string, unknown>;

  if (input.action === 'add') {
    if (!isOfficeRecordId(input.siteId)) return { ok: false, error: '현장을 선택해 주세요.' };
    if (!isKind(input.kind)) return { ok: false, error: '알 수 없는 요청입니다.' };
    const text = str(input.text).trim();
    if (!text) return { ok: false, error: '내용을 써 주세요.' };
    if (text.length > SITE_NOTE_MAX) return { ok: false, error: `내용은 ${SITE_NOTE_MAX}자까지 쓸 수 있어요.` };
    return { ok: true, action: 'add', siteId: input.siteId, kind: input.kind, text };
  }
  if (input.action === 'setDone' || input.action === 'delete') {
    if (!isSiteNoteId(input.id)) return { ok: false, error: '기록을 선택해 주세요.' };
    if (input.action === 'delete') return { ok: true, action: 'delete', id: input.id };
    if (typeof input.done !== 'boolean') return { ok: false, error: '알 수 없는 요청입니다.' };
    return { ok: true, action: 'setDone', id: input.id, done: input.done };
  }
  return { ok: false, error: '알 수 없는 요청입니다.' };
}

// todoState is a string so "open todos" can be read with a plain equality query (no composite index): 'open' or 'done'
// for a todo, '' for a note or a deleted document.
export function newSiteNoteRecord(
  input: { id: string; siteId: string; kind: SiteNoteKind; text: string },
  author: SiteNoteAuthor,
  nowIso: string,
): Record<string, unknown> {
  return {
    _id: input.id,
    siteId: input.siteId,
    kind: input.kind,
    text: input.text,
    createdAt: nowIso,
    createdBy: author.loginId,
    createdByName: authorName(author),
    todoState: input.kind === 'todo' ? 'open' : '',
  };
}

export function doneFields(done: boolean, author: SiteNoteAuthor, nowIso: string): Record<string, unknown> {
  return done
    ? { todoState: 'done', doneAt: nowIso, doneBy: author.loginId, doneByName: authorName(author) }
    : { todoState: 'open', doneAt: '', doneBy: '', doneByName: '' };
}

export function deletedFields(author: SiteNoteAuthor, nowIso: string): Record<string, unknown> {
  return { deletedAt: nowIso, deletedBy: authorName(author), todoState: '' };
}

// What a browser receives: no deletedBy, doneBy (login ids of others) or todoState.
export function toSiteNoteView(record: Record<string, unknown>): SiteNote | null {
  if (record.deletedAt || !isSiteNoteId(record._id) || !isOfficeRecordId(record.siteId) || !isKind(record.kind)) return null;
  const done = record.kind === 'todo' && record.todoState === 'done';
  return {
    id: record._id,
    siteId: record.siteId,
    kind: record.kind,
    text: str(record.text),
    createdAt: str(record.createdAt),
    createdBy: str(record.createdBy),
    createdByName: str(record.createdByName),
    done,
    ...(done ? { doneAt: str(record.doneAt), doneByName: str(record.doneByName) } : {}),
  };
}

// Open first, then newest.
export function sortSiteNotes(notes: SiteNote[]): SiteNote[] {
  return [...notes].sort((a, b) => Number(a.done) - Number(b.done) || (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export const canDeleteSiteNote = (note: { createdBy: string }, author: SiteNoteAuthor) =>
  author.role === 'admin' || (note.createdBy !== '' && note.createdBy === author.loginId);

export const siteAcceptsNotes = (site: Record<string, unknown> | null) => Boolean(site && !site.deletedAt);

export function countOpenTodos(records: Array<Record<string, unknown>>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    if (record.todoState !== 'open' || record.deletedAt || typeof record.siteId !== 'string' || !record.siteId) continue;
    counts[record.siteId] = (counts[record.siteId] || 0) + 1;
  }
  return counts;
}

// "10/21" in Korea time.
export function shortSeoulDate(iso: string): string {
  const ms = Date.parse(iso);
  if (!iso || Number.isNaN(ms)) return '';
  const seoul = new Date(ms + 9 * 3600000);
  return `${seoul.getUTCMonth() + 1}/${seoul.getUTCDate()}`;
}
