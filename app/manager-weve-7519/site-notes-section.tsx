'use client';

import { useEffect, useRef, useState } from 'react';
import { SITE_NOTE_MAX, shortSeoulDate, sortSiteNotes, type SiteNote, type SiteNoteKind } from '../lib/site-notes';
import type { SiteNotesApi } from './site-notes-api';

// 할 일 and 현장 기록 for one site (spec 2026-10-21 §2), the same block on the PC site screen and the phone site detail.
// Staff only: never shown on the customer progress page.

const NOTES_SHOWN = 5;

const errorOf = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

export function SiteNotesSection({
  siteId,
  api,
  viewer,
  onOpenTodoCountChange,
}: {
  siteId: string;
  api: SiteNotesApi;
  viewer: { loginId: string; role: string };
  onOpenTodoCountChange?: (siteId: string, count: number) => void;
}) {
  const [notes, setNotes] = useState<SiteNote[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [todoDraft, setTodoDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [saving, setSaving] = useState<SiteNoteKind | ''>('');
  const [showDone, setShowDone] = useState(false);
  const [showAllNotes, setShowAllNotes] = useState(false);
  const busyRef = useRef(false);
  // The PC builds api on every render; only a new site (or 다시 시도) reloads the list.
  const apiRef = useRef(api);
  apiRef.current = api;

  useEffect(() => {
    let alive = true;
    setNotes(null);
    setLoadError('');
    apiRef.current
      .list(siteId)
      .then((list) => alive && setNotes(list))
      .catch((loadFailure) => alive && setLoadError(errorOf(loadFailure, '할 일과 기록을 불러오지 못했어요.')));
    return () => {
      alive = false;
    };
  }, [siteId, attempt]);

  const openCount = (notes || []).filter((note) => note.kind === 'todo' && !note.done).length;
  useEffect(() => {
    if (notes) onOpenTodoCountChange?.(siteId, openCount);
  }, [notes, openCount, siteId, onOpenTodoCountChange]);

  const replace = (saved: SiteNote) => setNotes((current) => sortSiteNotes((current || []).map((note) => (note.id === saved.id ? saved : note))));

  const add = async (kind: SiteNoteKind) => {
    const text = (kind === 'todo' ? todoDraft : noteDraft).trim();
    if (!text || busyRef.current) return;
    busyRef.current = true;
    setSaving(kind);
    setError('');
    try {
      const saved = await api.add(siteId, kind, text);
      setNotes((current) => sortSiteNotes([saved, ...(current || [])]));
      if (kind === 'todo') setTodoDraft('');
      else setNoteDraft('');
    } catch (saveError) {
      // The text stays in the box for another try.
      setError(errorOf(saveError, '저장하지 못했어요.'));
    } finally {
      busyRef.current = false;
      setSaving('');
    }
  };

  // The tick shows at once and is undone if the server refuses it.
  const toggle = async (note: SiteNote) => {
    setError('');
    replace({ ...note, done: !note.done });
    try {
      replace(await api.setDone(note.id, !note.done));
    } catch (saveError) {
      replace(note);
      setError(errorOf(saveError, '체크하지 못했어요.'));
    }
  };

  const remove = async (note: SiteNote) => {
    if (!window.confirm('이 글을 지울까요?')) return;
    setError('');
    try {
      await api.remove(note.id);
      setNotes((current) => (current || []).filter((item) => item.id !== note.id));
    } catch (removeError) {
      setError(errorOf(removeError, '지우지 못했어요.'));
    }
  };

  const canDelete = (note: SiteNote) => viewer.role === 'admin' || note.createdBy === viewer.loginId;

  if (loadError) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-[#f1c0bd] bg-[#fdf1f0] px-4 py-3 text-sm text-[#8a1f17]" role="alert">
        <span className="flex-1">{loadError}</span>
        <button type="button" onClick={() => setAttempt((value) => value + 1)} className="rounded-full border border-current px-3 py-1 text-xs font-semibold">
          다시 시도
        </button>
      </div>
    );
  }
  if (!notes) return <p className="px-1 text-sm text-[#8b8276]">할 일과 기록을 불러오는 중…</p>;

  const todos = notes.filter((note) => note.kind === 'todo');
  const openTodos = todos.filter((note) => !note.done);
  const doneTodos = todos.filter((note) => note.done);
  const records = notes.filter((note) => note.kind === 'note');
  const shownRecords = showAllNotes ? records : records.slice(0, NOTES_SHOWN);

  const meta = (note: SiteNote) => [note.createdByName, shortSeoulDate(note.createdAt)].filter(Boolean).join(' · ');
  const deleteButton = (note: SiteNote) =>
    canDelete(note) && (
      <button type="button" onClick={() => void remove(note)} className="shrink-0 px-1 text-xs text-[#8b8276] underline-offset-2 active:underline">
        지우기
      </button>
    );

  const todoRow = (note: SiteNote) => (
    <li key={note.id} className="flex items-start gap-3 py-2">
      <input
        type="checkbox"
        checked={note.done}
        onChange={() => void toggle(note)}
        aria-label={note.done ? '안 한 일로 되돌리기' : '끝낸 일로 체크'}
        className="mt-0.5 h-5 w-5 shrink-0 accent-[#171512]"
      />
      <span className="min-w-0 flex-1">
        <span className={`block whitespace-pre-wrap [overflow-wrap:anywhere] text-sm ${note.done ? 'text-[#8b8276] line-through' : 'text-[#171512]'}`}>{note.text}</span>
        <span className="block text-xs text-[#8b8276]">
          {meta(note)}
          {note.done && note.doneByName ? ` · 끝냄 ${note.doneByName} ${shortSeoulDate(note.doneAt || '')}` : ''}
        </span>
      </span>
      {deleteButton(note)}
    </li>
  );

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-[#f1c0bd] bg-[#fdf1f0] px-3 py-2 text-sm text-[#8a1f17]" role="alert">
          {error}
        </p>
      )}

      <section className="rounded-2xl border border-[#eadfcd] bg-white px-4 py-3">
        <h3 className="text-sm font-bold text-[#171512]">할 일 {openTodos.length > 0 ? openTodos.length : ''}</h3>
        {openTodos.length === 0 && <p className="py-2 text-sm text-[#8b8276]">남은 할 일이 없어요.</p>}
        <ul className="divide-y divide-[#f1ebe0]">{openTodos.map(todoRow)}</ul>
        {doneTodos.length > 0 && (
          <>
            <button type="button" onClick={() => setShowDone((open) => !open)} className="h-9 text-xs font-semibold text-[#8f6f43]">
              끝낸 일 {doneTodos.length}개 {showDone ? '접기' : '보기'}
            </button>
            {showDone && <ul className="divide-y divide-[#f1ebe0]">{doneTodos.map(todoRow)}</ul>}
          </>
        )}
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void add('todo');
          }}
        >
          <input
            value={todoDraft}
            onChange={(event) => setTodoDraft(event.target.value)}
            maxLength={SITE_NOTE_MAX}
            placeholder="할 일 추가"
            className="h-11 min-w-0 flex-1 rounded-xl border border-[#d8d1c5] bg-white px-3 text-base text-[#171512] outline-none focus:border-[#8f6f43]"
          />
          <button
            type="submit"
            disabled={saving !== '' || !todoDraft.trim()}
            className="h-11 shrink-0 rounded-xl bg-[#171512] px-4 text-sm font-bold text-[#fffdf8] disabled:opacity-40"
          >
            {saving === 'todo' ? '추가 중…' : '추가'}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-[#eadfcd] bg-white px-4 py-3">
        <h3 className="text-sm font-bold text-[#171512]">현장 기록</h3>
        {records.length === 0 && <p className="py-2 text-sm text-[#8b8276]">아직 남긴 기록이 없어요.</p>}
        <ul className="divide-y divide-[#f1ebe0]">
          {shownRecords.map((note) => (
            <li key={note.id} className="flex items-start gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block whitespace-pre-wrap [overflow-wrap:anywhere] text-sm text-[#171512]">{note.text}</span>
                <span className="block text-xs text-[#8b8276]">{meta(note)}</span>
              </span>
              {deleteButton(note)}
            </li>
          ))}
        </ul>
        {records.length > NOTES_SHOWN && (
          <button type="button" onClick={() => setShowAllNotes((open) => !open)} className="h-9 text-xs font-semibold text-[#8f6f43]">
            {showAllNotes ? '접기' : `더 보기 (${records.length - NOTES_SHOWN}개)`}
          </button>
        )}
        <div className="mt-2 space-y-2">
          <textarea
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            maxLength={SITE_NOTE_MAX}
            rows={2}
            placeholder="현장 기록 남기기 (직원만 봐요)"
            className="w-full rounded-xl border border-[#d8d1c5] bg-white px-3 py-2 text-base text-[#171512] outline-none focus:border-[#8f6f43]"
          />
          <button
            type="button"
            onClick={() => void add('note')}
            disabled={saving !== '' || !noteDraft.trim()}
            className="h-10 w-full rounded-xl border border-[#171512] text-sm font-bold text-[#171512] disabled:border-[#d8d1c5] disabled:text-[#a59d90]"
          >
            {saving === 'note' ? '남기는 중…' : '남기기'}
          </button>
        </div>
      </section>
    </div>
  );
}
