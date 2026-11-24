// Browser side of /api/manager/receipts (현장 영수증함, spec 2026-11-24-site-receipts), shared by the phone receipt sheet
// and the PC 실행내역서 panel. Each caller brings its own request function, as with site-notes-api: the phone uses its
// authedFetch (refresh and one retry on 401), the PC fetchWithHeaders.
import type { StoredProgressPhoto } from '../lib/site-progress';
import type { SiteReceiptView } from '../lib/site-receipts';
import type { SiteNotesRequest } from './site-notes-api';

export type ReceiptSiteSummary = { id: string; title: string; address: string; status: string };

const URL_BASE = '/api/manager/receipts';

const receiptsOf = (data: Record<string, unknown>) => (Array.isArray(data.receipts) ? (data.receipts as SiteReceiptView[]) : []);

export function createReceiptApi(request: SiteNotesRequest) {
  const post = (body: Record<string, unknown>) =>
    request(URL_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  return {
    async mine(): Promise<{ receipts: SiteReceiptView[]; siteTitles: Record<string, string>; photosUnavailable: boolean }> {
      const data = await request(`${URL_BASE}?mine=1`);
      const titles = typeof data.siteTitles === 'object' && data.siteTitles !== null ? (data.siteTitles as Record<string, string>) : {};
      return { receipts: receiptsOf(data), siteTitles: titles, photosUnavailable: data.photosUnavailable === true };
    },
    async ofSite(siteId: string): Promise<{ receipts: SiteReceiptView[]; photosUnavailable: boolean }> {
      const data = await request(`${URL_BASE}?siteId=${encodeURIComponent(siteId)}`);
      return { receipts: receiptsOf(data), photosUnavailable: data.photosUnavailable === true };
    },
    async searchSites(): Promise<ReceiptSiteSummary[]> {
      const data = await request(`${URL_BASE}?sites=1`);
      return Array.isArray(data.sites) ? (data.sites as ReceiptSiteSummary[]) : [];
    },
    // One photo per request with the size the browser measured while shrinking it; no Content-Type header, so the
    // browser adds the multipart boundary. The answer is the one place a pathname reaches the browser.
    async uploadPhoto(siteId: string, blob: Blob, fileName: string, size: { width: number; height: number }): Promise<StoredProgressPhoto> {
      const form = new FormData();
      form.append('action', 'uploadPhoto');
      form.append('siteId', siteId);
      form.append('width', String(size.width));
      form.append('height', String(size.height));
      form.append('file', blob, fileName);
      const data = await request(URL_BASE, { method: 'POST', body: form });
      if (!data.photo) throw new Error('사진 정보를 받지 못했어요.');
      return data.photo as StoredProgressPhoto;
    },
    async create(input: { siteId: string; photos: StoredProgressPhoto[]; amount: string; memo: string }): Promise<SiteReceiptView> {
      return (await post({ action: 'create', ...input })).receipt as SiteReceiptView;
    },
    async update(input: { id: string; siteId: string; amount: string; memo: string }): Promise<SiteReceiptView> {
      return (await post({ action: 'update', ...input })).receipt as SiteReceiptView;
    },
    async setSkipped(id: string, skipped: boolean): Promise<SiteReceiptView> {
      return (await post({ action: 'setSkipped', id, skipped })).receipt as SiteReceiptView;
    },
    async remove(id: string): Promise<void> {
      await post({ action: 'delete', id });
    },
  };
}

export type ReceiptApi = ReturnType<typeof createReceiptApi>;
