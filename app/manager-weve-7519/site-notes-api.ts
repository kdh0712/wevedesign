// Browser side of /api/manager/site-notes, shared by the PC site screen and the phone site detail. Each caller brings its
// own request function: the PC adds its session headers, the phone uses its authedFetch (refresh and one retry on 401).
import type { SiteNote, SiteNoteKind } from '../lib/site-notes';

export type SiteNotesRequest = (url: string, init?: RequestInit) => Promise<Record<string, unknown>>;

const URL_BASE = '/api/manager/site-notes';

export function createSiteNotesApi(request: SiteNotesRequest) {
  const post = (body: Record<string, unknown>) =>
    request(URL_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  return {
    async list(siteId: string): Promise<SiteNote[]> {
      const data = await request(`${URL_BASE}?siteId=${encodeURIComponent(siteId)}`);
      return Array.isArray(data.notes) ? (data.notes as SiteNote[]) : [];
    },
    async add(siteId: string, kind: SiteNoteKind, text: string): Promise<SiteNote> {
      return (await post({ action: 'add', siteId, kind, text })).note as SiteNote;
    },
    async setDone(id: string, done: boolean): Promise<SiteNote> {
      return (await post({ action: 'setDone', id, done })).note as SiteNote;
    },
    async remove(id: string): Promise<void> {
      await post({ action: 'delete', id });
    },
  };
}

export type SiteNotesApi = ReturnType<typeof createSiteNotesApi>;

// The PC's request function: its session headers, JSON both ways, the server's message on failure.
export function fetchWithHeaders(authHeaders: () => Record<string, string>): SiteNotesRequest {
  return async (url, init = {}) => {
    let response: Response;
    try {
      response = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), ...authHeaders() } });
    } catch {
      throw new Error('연결이 불안정합니다. 다시 시도해 주세요.');
    }
    const data = ((await response.json().catch(() => ({}))) || {}) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof data.error === 'string' && data.error ? data.error : '요청을 처리하지 못했어요.');
    return data;
  };
}
