import { NextResponse } from 'next/server';
import { normalizeKoreanMobile } from '../../../lib/alert-phones';
import {
  buildCustomerProgressView,
  canNotify,
  fillProgressTemplate,
  phoneLast4,
  todayInSeoul,
  type NotifyLogEntry,
  type ProgressUpdate,
} from '../../../lib/site-progress';
import { readProgressAlimtalkConfig, sendAlimtalk, type ProgressAlimtalkConfig } from '../_aligo';
import { decideLinkOnUpload } from '../_progress-link-rules';
import { checkPhotoUpload, parseCreateUpdate } from '../_progress-request';
import {
  deleteProgressUpdate,
  generateProgressCode,
  getProgressUpdate,
  getSiteForProgress,
  isProgressStoreReady,
  listProgressUpdates,
  listSiteEstimates,
  resolveCustomerPhone,
  saveProgressUpdate,
  saveSiteProgressFields,
  type ProgressSite,
  type ProgressSiteFields,
} from '../_progress-store';
import { requireManager } from '../_session';
import { managerClient } from '../_utils';

export const runtime = 'nodejs';
export const maxDuration = 60;

const STORE_MISSING = '진행 현황 기능은 Firestore 설정이 필요합니다.';
const SITE_NOT_FOUND = '현장을 찾을 수 없습니다.';
const BAD_REQUEST = '요청 형식이 올바르지 않습니다.';
const TEMPLATE_MISSING = '알림톡 템플릿 설정이 필요합니다';

// Progress data is per customer and changes often, so nothing here may be cached.
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const fail = (error: string, status: number) => json({ error }, status);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

function siteCode(site: ProgressSite) {
  return typeof site.progressCode === 'string' ? site.progressCode : '';
}

function linkOf(site: ProgressSite) {
  const code = siteCode(site);
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.wevedesign.co.kr').replace(/\/+$/, '');
  return {
    enabled: Boolean(site.progressEnabled) && Boolean(code),
    code,
    url: code ? `${base}/progress/${code}` : '',
    createdAt: typeof site.progressCodeCreatedAt === 'string' ? site.progressCodeCreatedAt : '',
  };
}

// A new code makes every earlier link and customer cookie invalid, and the failed-attempt record starts over.
function freshCodeFields() {
  return {
    progressCode: generateProgressCode(),
    progressCodeCreatedAt: new Date().toISOString(),
    progressAccess: { failedCount: 0, lockedUntil: '' },
  };
}

export async function GET(request: Request) {
  const access = requireManager(request, { anyOf: ['sites'] });
  if (access.error) return access.error;
  if (!isProgressStoreReady()) return fail(STORE_MISSING, 503);

  try {
    const params = new URL(request.url).searchParams;
    const siteId = text(params.get('siteId'));
    if (!siteId) return fail('현장을 선택해주세요.', 400);
    const site = await getSiteForProgress(siteId);
    if (!site) return fail(SITE_NOT_FOUND, 404);

    // The preview is the customer's own view of the data, without the phone check.
    if (params.get('preview') === '1') {
      const [updates, estimates] = await Promise.all([listProgressUpdates(siteId), listSiteEstimates(siteId)]);
      return json(buildCustomerProgressView({ site, updates, estimates, today: todayInSeoul() }));
    }

    const [updates, phone] = await Promise.all([listProgressUpdates(siteId), resolveCustomerPhone(site)]);
    return json({
      link: linkOf(site),
      hasCustomerPhone: phoneLast4(phone) !== '',
      notifyConfigured: readProgressAlimtalkConfig() !== null,
      updates,
    });
  } catch (error) {
    console.error('Progress load failed:', error);
    return fail(error instanceof Error ? error.message : '진행 현황을 불러오지 못했습니다.', 500);
  }
}

export async function POST(request: Request) {
  const access = requireManager(request, { anyOf: ['sites'] });
  if (access.error) return access.error;
  if (!isProgressStoreReady()) return fail(STORE_MISSING, 503);

  try {
    // Photos come one per multipart request (Vercel caps a request near 4.5MB); everything else is JSON.
    if ((request.headers.get('content-type') || '').includes('multipart/form-data')) return await uploadPhoto(request);

    const body = await request.json().catch(() => null);
    if (!isRecord(body)) return fail(BAD_REQUEST, 400);

    switch (body.action) {
      case 'createUpdate':
        return await createUpdate(body, access.session.loginId);
      case 'deleteUpdate':
        return await deleteUpdate(body);
      case 'setLink':
        return await setLink(body);
      case 'notify':
        return await notifyUpdate(body, access.session.loginId);
      default:
        return fail('알 수 없는 요청입니다.', 400);
    }
  } catch (error) {
    console.error('Progress request failed:', error);
    return fail(error instanceof Error ? error.message : '진행 현황 요청을 처리하지 못했습니다.', 500);
  }
}

// The browser sends width and height only from its own resizing, so the size stored with a photo comes from Sanity.
function assetSize(asset: { _id: string; metadata?: { dimensions?: { width?: number; height?: number } } }) {
  const width = Number(asset.metadata?.dimensions?.width);
  const height = Number(asset.metadata?.dimensions?.height);
  if (width > 0 && height > 0) return { width, height };
  // Sanity asset ids end with the pixel size: image-<hash>-<width>x<height>-<format>.
  const match = /-(\d+)x(\d+)-[a-z0-9]+$/i.exec(asset._id);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

async function uploadPhoto(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(BAD_REQUEST, 400);
  }
  if (form.get('action') !== 'uploadPhoto') return fail('알 수 없는 요청입니다.', 400);

  const siteId = text(form.get('siteId'));
  const file = form.get('file');
  if (!siteId) return fail('현장을 선택해주세요.', 400);
  if (!(file instanceof File)) return fail('사진 파일이 없습니다.', 400);

  const check = checkPhotoUpload(file.type, file.size);
  if (!check.ok) return fail(check.error, check.status);
  if (!process.env.SANITY_WRITE_TOKEN) return fail('사진 저장 설정(SANITY_WRITE_TOKEN)이 필요합니다.', 500);

  // Looked up before the upload so a wrong site never leaves a stray image behind.
  if (!(await getSiteForProgress(siteId))) return fail(SITE_NOT_FOUND, 404);

  const bytes = Buffer.from(await file.arrayBuffer());
  const asset = await managerClient.assets.upload('image', bytes, { filename: file.name || 'progress-photo', contentType: file.type });
  const size = assetSize(asset);
  if (!size || !asset.url) return fail('사진 정보를 확인하지 못했습니다. 다시 올려주세요.', 500);

  return json({ photo: { assetId: asset._id, url: asset.url, width: size.width, height: size.height } });
}

type NotifyResult = { ok: boolean; error?: string };

const koreanDate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return `${year}년 ${month}월 ${day}일`;
};

type PreparedNotification =
  | { ok: true; config: ProgressAlimtalkConfig; receiver: string; code: string }
  | { ok: false; error: string };

// Everything a send needs: the approved template, a link that works and a mobile number to send it to.
async function prepareNotification(site: ProgressSite): Promise<PreparedNotification> {
  const config = readProgressAlimtalkConfig();
  if (!config) return { ok: false, error: TEMPLATE_MISSING };

  const code = siteCode(site);
  if (!site.progressEnabled || !code) return { ok: false, error: '고객 진행 현황 링크가 꺼져 있어 알림톡을 보낼 수 없습니다.' };

  const receiver = normalizeKoreanMobile(await resolveCustomerPhone(site));
  if (!receiver) return { ok: false, error: '고객 휴대폰 번호가 없어 알림톡을 보낼 수 없습니다.' };

  return { ok: true, config, receiver, code };
}

// The result is logged on the record whether or not the send worked, and a failed log write never hides the send result.
async function logNotification(update: ProgressUpdate, entry: NotifyLogEntry): Promise<ProgressUpdate> {
  const next: ProgressUpdate = { ...update, notifyLog: [...(update.notifyLog ?? []), entry] };
  try {
    return await saveProgressUpdate(next);
  } catch (error) {
    console.error('Progress notify log save failed:', error);
    return next;
  }
}

async function sendNotification(
  site: ProgressSite,
  update: ProgressUpdate,
  prepared: Extract<PreparedNotification, { ok: true }>,
  by: string,
): Promise<{ result: NotifyResult; update: ProgressUpdate }> {
  const customerName = text(site.customerName) || '고객';
  const message = fillProgressTemplate(prepared.config.messageTemplate, {
    customerName,
    siteTitle: text(site.title),
    date: koreanDate(update.reportDate),
    code: prepared.code,
  });
  const result = await sendAlimtalk({
    templateCode: prepared.config.templateCode,
    receiver: prepared.receiver,
    receiverName: customerName,
    subject: prepared.config.subject,
    message,
    buttonJson: prepared.config.buttonJson.replaceAll('#{코드}', prepared.code),
  });
  const logged = await logNotification(update, { sentAt: new Date().toISOString(), ok: result.ok, ...(result.error ? { error: result.error } : {}), by });
  return { result, update: logged };
}

type LinkNotice = { enabled: boolean; created: boolean; url: string; reason?: 'no-customer-phone' | 'link-off' | 'site-done' };

// The first progress update for a site creates its customer link and switches it on, unless the site is already 완료. A link that
// already exists keeps the state staff gave it: one switched off, by hand or by 완료, is never turned back on by an upload.
// Returns the site as it is afterwards.
async function ensureLinkOnUpload(siteId: string, site: ProgressSite): Promise<{ site: ProgressSite; link: LinkNotice }> {
  const status = typeof site.status === 'string' ? site.status : undefined;
  const decision = decideLinkOnUpload(
    { progressCode: site.progressCode, progressEnabled: site.progressEnabled, status },
    phoneLast4(await resolveCustomerPhone(site)) !== '',
  );
  const created = decision.action === 'create';
  const current = created ? await saveSiteProgressFields(siteId, { ...freshCodeFields(), progressEnabled: true }) : site;
  const { enabled, url } = linkOf(current);
  return { site: current, link: { enabled, created, url, ...('reason' in decision ? { reason: decision.reason } : {}) } };
}

async function createUpdate(body: Record<string, unknown>, by: string) {
  const parsed = parseCreateUpdate(body);
  if (!parsed.ok) return fail(parsed.error, 400);
  const { siteId, reportDate, designer, workDetail, photos, notify } = parsed.value;

  const found = await getSiteForProgress(siteId);
  if (!found) return fail(SITE_NOT_FOUND, 404);

  // Before the update is saved (a failure here leaves nothing behind, so a retry cannot post it twice) and before notify,
  // which must see the link as it is after this step.
  const { site, link } = await ensureLinkOnUpload(siteId, found);

  const saved = await saveProgressUpdate({ siteId, reportDate, designer, workDetail, photos, createdAt: new Date().toISOString(), createdBy: by, notifyLog: [] });
  if (!notify) return json({ update: saved, link });

  // The record is already saved, so nothing below may turn this into an error response (the browser would retry and post it twice).
  // A send that cannot start is logged like a send that failed.
  try {
    const prepared = await prepareNotification(site);
    if (!prepared.ok) {
      const logged = await logNotification(saved, { sentAt: new Date().toISOString(), ok: false, error: prepared.error, by });
      return json({ update: logged, notify: { ok: false, error: prepared.error }, link });
    }
    const sent = await sendNotification(site, saved, prepared, by);
    return json({ update: sent.update, notify: sent.result, link });
  } catch (error) {
    console.error('Progress notify failed after the update was saved:', error);
    return json({ update: saved, notify: { ok: false, error: error instanceof Error ? error.message : '알림톡을 보내지 못했습니다.' }, link });
  }
}

async function deleteUpdate(body: Record<string, unknown>) {
  const id = text(body.id);
  if (!id) return fail('삭제할 기록을 선택해주세요.', 400);
  if (!(await getProgressUpdate(id))) return fail('진행 기록을 찾을 수 없습니다.', 404);

  // Only the record goes; the Sanity photos stay (they may be used elsewhere and this keeps a way back).
  await deleteProgressUpdate(id);
  return json({ ok: true });
}

async function setLink(body: Record<string, unknown>) {
  const siteId = text(body.siteId);
  const mode = body.mode;
  if (!siteId) return fail('현장을 선택해주세요.', 400);
  if (mode !== 'enable' && mode !== 'disable' && mode !== 'rotate') return fail('링크 설정 요청이 올바르지 않습니다.', 400);

  const site = await getSiteForProgress(siteId);
  if (!site) return fail(SITE_NOT_FOUND, 404);

  let fields: ProgressSiteFields;
  if (mode === 'disable') {
    fields = { progressEnabled: false };
  } else {
    // The customer proves who they are with the last four digits of this number, so a link without one cannot work.
    if (phoneLast4(await resolveCustomerPhone(site)) === '') return fail('고객 연락처가 없어 링크를 켤 수 없습니다.', 400);
    if (mode === 'rotate') fields = freshCodeFields();
    else fields = siteCode(site) ? { progressEnabled: true } : { ...freshCodeFields(), progressEnabled: true };
  }

  const saved = await saveSiteProgressFields(siteId, fields);
  return json({ link: linkOf(saved) });
}

async function notifyUpdate(body: Record<string, unknown>, by: string) {
  const updateId = text(body.updateId);
  if (!updateId) return fail('알림톡을 보낼 기록을 선택해주세요.', 400);

  const update = await getProgressUpdate(updateId);
  if (!update) return fail('진행 기록을 찾을 수 없습니다.', 404);
  const site = await getSiteForProgress(update.siteId);
  if (!site) return fail(SITE_NOT_FOUND, 404);

  if (!canNotify(update, body.resend === true)) return fail('이미 알림톡을 보낸 기록입니다. 다시 보내려면 다시 보내기를 선택해주세요.', 409);

  const prepared = await prepareNotification(site);
  if (!prepared.ok) return fail(prepared.error, 400);

  const sent = await sendNotification(site, update, prepared, by);
  return json({ update: sent.update, notify: sent.result });
}
