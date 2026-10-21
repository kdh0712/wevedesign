import { NextResponse } from 'next/server';
import { isOfficeRecordId } from '../../../lib/mobile-overview';
import {
  canDeleteSiteNote,
  deletedFields,
  doneFields,
  parseSiteNoteAction,
  siteAcceptsNotes,
  toSiteNoteView,
  type SiteNoteAuthor,
} from '../../../lib/site-notes';
import { MOBILE_STORE_MISSING } from '../_mobile-devices';
import { isProgressStoreReady } from '../_progress-store';
import { requireManager } from '../_session';
import { createSiteNote, getSiteNoteRecord, listSiteNotes, updateSiteNote } from '../_site-notes';
import { getFirestoreDocument, isFirestoreConflictError, officeFirestoreCollections } from '../firestore';

export const runtime = 'nodejs';

// 현장 기록·할 일 for the PC site screen and the phone site detail (spec 2026-10-21 §2). Anyone who can see sites reads,
// writes and ticks; only the writer or an admin deletes. The writer always comes from the signed session.
const SITE_NOT_FOUND = '현장을 찾을 수 없습니다.';
const NOTE_NOT_FOUND = '기록을 찾을 수 없습니다.';
const LOAD_FAILED = '기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
const SAVE_FAILED = '기록을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request) {
  const access = requireManager(request, { anyOf: ['sites'] });
  if (access.error) return access.error;
  if (!isProgressStoreReady()) return json({ error: MOBILE_STORE_MISSING }, 503);

  const siteId = new URL(request.url).searchParams.get('siteId');
  if (!isOfficeRecordId(siteId)) return json({ error: '현장을 선택해 주세요.' }, 400);
  try {
    return json({ notes: await listSiteNotes(siteId) });
  } catch (error) {
    console.error('Site notes load failed:', error);
    return json({ error: LOAD_FAILED }, 500);
  }
}

export async function POST(request: Request) {
  const access = requireManager(request, { anyOf: ['sites'] });
  if (access.error) return access.error;
  if (!isProgressStoreReady()) return json({ error: MOBILE_STORE_MISSING }, 503);

  const parsed = parseSiteNoteAction(await request.json().catch(() => null));
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const { session } = access;
  const author: SiteNoteAuthor = { loginId: session.loginId, name: session.name, role: session.role };
  const nowIso = new Date().toISOString();
  try {
    if (parsed.action === 'add') {
      const site = await getFirestoreDocument<Record<string, unknown>>(officeFirestoreCollections.site, parsed.siteId);
      if (!siteAcceptsNotes(site)) return json({ error: SITE_NOT_FOUND }, 404);
      return json({ note: await createSiteNote({ siteId: parsed.siteId, kind: parsed.kind, text: parsed.text }, author, nowIso) });
    }

    const record = await getSiteNoteRecord(parsed.id);
    const note = record ? toSiteNoteView(record) : null;
    if (!note) return json({ error: NOTE_NOT_FOUND }, 404);

    if (parsed.action === 'setDone') {
      if (note.kind !== 'todo') return json({ error: '할 일만 체크할 수 있어요.' }, 400);
      const saved = await updateSiteNote(note.id, doneFields(parsed.done, author, nowIso));
      if (!saved) return json({ error: NOTE_NOT_FOUND }, 404);
      return json({ note: saved });
    }

    if (!canDeleteSiteNote(note, author)) return json({ error: '쓴 사람이나 총괄 관리자만 지울 수 있어요.' }, 403);
    await updateSiteNote(note.id, deletedFields(author, nowIso));
    return json({ ok: true });
  } catch (error) {
    // exists:true failed: the note was removed between the read and the write.
    if (isFirestoreConflictError(error)) return json({ error: NOTE_NOT_FOUND }, 404);
    console.error(`Site note ${parsed.action} failed:`, error);
    return json({ error: SAVE_FAILED }, 500);
  }
}
