// Shared by the manager's customer progress screens (the daily report section and the site link panel): the API client,
// the response shapes of /api/manager/progress, and the small rules that decide what staff see. No React and no Next.js
// imports, so Node tests load this file directly.
import { decideLinkOnUpload, type AutoLinkDecision } from '../api/manager/_progress-link-rules.ts';
import type { CustomerProgressView, NotifyLogEntry, ProgressUpdate, ProgressUpdateView, StoredProgressPhoto } from '../lib/site-progress.ts';

export type ProgressLink = { enabled: boolean; code: string; url: string; createdAt: string };

// Every answer that carries records carries their photos as signed URLs. When the server could not make them, each photo
// has an empty url and photosUnavailable is true (the record and its photo count are still right).
export type ProgressManagerState = {
  link: ProgressLink;
  // Only means some number with four or more digits exists; a landline still cannot get an alimtalk.
  hasCustomerPhone: boolean;
  notifyConfigured: boolean;
  updates: ProgressUpdateView[];
  photosUnavailable?: boolean;
};

export type LinkReason = 'no-customer-phone' | 'link-off' | 'site-done';
export type UploadLinkNotice = { enabled: boolean; created: boolean; url: string; reason?: LinkReason | string };
export type NotifyResult = { ok: boolean; error?: string };
export type CreateUpdateResponse = { update: ProgressUpdateView; notify?: NotifyResult; link: UploadLinkNotice; photosUnavailable?: boolean };
export type NotifyResponse = { update: ProgressUpdateView; notify: NotifyResult; photosUnavailable?: boolean };
export type PhotoSize = { width: number; height: number };
export type LinkMode = 'enable' | 'disable' | 'rotate';
export type Notice = { tone: 'ok' | 'warn' | 'error'; lines: string[] };

export const LINK_CREATED_MESSAGE = '고객 링크를 만들었습니다';
export const LINK_REASON_MESSAGES: Record<LinkReason, string> = {
  'no-customer-phone': '고객 연락처가 없어 링크를 켤 수 없습니다',
  'link-off': '링크가 꺼져 있어 고객에게 보이지 않습니다',
  'site-done': '완료된 현장이라 링크가 자동으로 열리지 않습니다',
};
export const NOTIFY_TEMPLATE_MISSING = '알림톡 템플릿 설정이 필요합니다';
export const NETWORK_ERROR_MESSAGE = '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
export const ROTATE_CONFIRM_MESSAGE = '이전 링크와 고객 확인 기록이 모두 무효가 됩니다. 계속할까요?';

const isLinkReason = (value: unknown): value is LinkReason => typeof value === 'string' && Object.prototype.hasOwnProperty.call(LINK_REASON_MESSAGES, value);

export const errorText = (error: unknown, fallback = '요청을 처리하지 못했습니다.') =>
  error instanceof Error && error.message ? error.message : fallback;

// What the next upload will do to the link: the same rule the server applies in createUpdate.
export function predictLinkOnUpload(state: Pick<ProgressManagerState, 'link' | 'hasCustomerPhone'>, siteStatus?: string): AutoLinkDecision {
  return decideLinkOnUpload({ progressCode: state.link.code, progressEnabled: state.link.enabled, status: siteStatus }, state.hasCustomerPhone);
}

// "고객 진행 현황에 올리기" starts checked unless the site's link was switched off (by staff, or closed by 완료).
export function defaultPostToCustomer(link: ProgressLink): boolean {
  return !(link.code && !link.enabled);
}

// After an upload: whether this upload created the link, and why the link is not on.
export function uploadLinkMessages(link: UploadLinkNotice): string[] {
  const messages: string[] = [];
  if (link.created) messages.push(LINK_CREATED_MESSAGE);
  if (isLinkReason(link.reason)) messages.push(LINK_REASON_MESSAGES[link.reason]);
  return messages;
}

export function postResultMessages(response: CreateUpdateResponse, notifyRequested: boolean, photoCount: number): Notice {
  const lines = [`진행 기록을 올렸습니다 (사진 ${photoCount}장).`, ...uploadLinkMessages(response.link)];
  let warn = isLinkReason(response.link.reason);
  if (notifyRequested) {
    if (response.notify?.ok) {
      lines.push('알림톡을 보냈습니다.');
    } else {
      warn = true;
      lines.push(`알림톡을 보내지 못했습니다: ${response.notify?.error || '알 수 없는 오류'}`, '아래 기록 목록에서 다시 보낼 수 있습니다.');
    }
  }
  return { tone: warn ? 'warn' : 'ok', lines };
}

export type PostInput = { reportDate: string; designer: string; workDetail: string; photoIds: readonly string[] };

// Everything one post sends, as one comparable value. Trimmed like the server trims, so spaces alone are not a new report.
export function postSignature(input: PostInput): string {
  return JSON.stringify([input.reportDate.trim(), input.designer.trim(), input.workDetail.trim(), [...input.photoIds]]);
}

// The report that was just posted cannot be posted again (a second click would create a second record and, with 알림톡
// checked, a second alimtalk, since the new record's log is empty). Changing the photos, memo, date or designer makes it new.
export function canPostAgain(lastPosted: string | null, current: string): boolean {
  return lastPosted !== current;
}

export type NotifyStatus = 'sent' | 'failed' | 'none';
export const NOTIFY_STATUS_LABEL: Record<NotifyStatus, string> = { sent: '보냄', failed: '실패', none: '안 보냄' };

// 보냄 once any send worked (the server then needs resend to send again), 실패 when every send failed, 안 보냄 without one.
export function notifyStatus(update: Pick<ProgressUpdate, 'notifyLog'>): NotifyStatus {
  const log = update.notifyLog ?? [];
  if (log.some((entry) => entry.ok)) return 'sent';
  return log.length > 0 ? 'failed' : 'none';
}

export function lastNotifyError(update: Pick<ProgressUpdate, 'notifyLog'>): string {
  const failed = (update.notifyLog ?? []).filter((entry) => !entry.ok);
  return failed[failed.length - 1]?.error || '';
}

// Why a send would be refused, from what the screen already knows; null when it may go. The server still decides
// (a landline counts as a number here but is refused there).
export function notifyBlockedReason(input: { notifyConfigured: boolean; hasCustomerPhone: boolean; linkEnabled: boolean }): string | null {
  if (!input.notifyConfigured) return NOTIFY_TEMPLATE_MISSING;
  if (!input.hasCustomerPhone) return '고객 휴대폰 번호가 없어 알림톡을 보낼 수 없습니다.';
  if (!input.linkEnabled) return '고객 진행 현황 링크가 꺼져 있어 알림톡을 보낼 수 없습니다.';
  return null;
}

// The memo on one line, cut after `max` characters (code points, so an emoji is never split).
export function memoPreview(text: string, max = 40): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const chars = Array.from(flat);
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : flat;
}

export type NotifyHistoryEntry = NotifyLogEntry & { updateId: string; reportDate: string };

export function notifyHistory(updates: Array<Pick<ProgressUpdate, '_id' | 'reportDate' | 'notifyLog'>>): NotifyHistoryEntry[] {
  return updates
    .flatMap((update) => (update.notifyLog ?? []).map((entry) => ({ ...entry, updateId: update._id, reportDate: update.reportDate })))
    .sort((a, b) => (a.sentAt < b.sentAt ? 1 : a.sentAt > b.sentAt ? -1 : 0));
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// "2026-10-17T05:30:00.000Z" -> "2026.10.17 14:30" in Korean time (Korea has no daylight saving time).
export function formatSeoulDateTime(iso: string): string {
  const time = Date.parse(iso);
  if (!iso || Number.isNaN(time)) return '';
  const local = new Date(time + KST_OFFSET_MS).toISOString();
  return `${local.slice(0, 10).replaceAll('-', '.')} ${local.slice(11, 16)}`;
}

// "2026-10-17" -> "2026.10.17 (토)"; anything else is shown as written.
export function formatReportDay(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const weekday = WEEKDAYS[new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay()];
  return `${match[1]}.${match[2]}.${match[3]} (${weekday})`;
}

export function photoProgressLabel(stage: 'resize' | 'upload', done: number, total: number): string {
  return stage === 'resize' ? `사진 ${done}/${total} 줄이는 중` : `사진 ${done}/${total} 올리는 중`;
}

export type PhotoFailure = { name: string; error: string };
export type PhotoPipelineFailure = { ok: false; stage: 'resize' | 'upload'; failed: PhotoFailure[] };
export type PhotoPipelineResult = { ok: true; photos: StoredProgressPhoto[] } | PhotoPipelineFailure;

// Every photo is shrunk first, so one the browser cannot open stops the post before anything is sent, and all such photos
// are named at once. Then the photos go up one per request, in order (Vercel caps a request near 4.5MB). The first failed
// upload stops the rest. Either way the caller creates no record.
export async function shrinkAndUploadPhotos<T extends { name: string }, R>(
  photos: readonly T[],
  steps: {
    shrink: (photo: T) => Promise<R>;
    upload: (shrunk: R, photo: T) => Promise<StoredProgressPhoto>;
    onProgress?: (stage: 'resize' | 'upload', done: number, total: number) => void;
  },
): Promise<PhotoPipelineResult> {
  const total = photos.length;
  const shrunk: R[] = [];
  const failed: PhotoFailure[] = [];
  for (let index = 0; index < total; index += 1) {
    steps.onProgress?.('resize', index + 1, total);
    try {
      shrunk.push(await steps.shrink(photos[index]));
    } catch (error) {
      failed.push({ name: photos[index].name, error: errorText(error, '사진을 열 수 없습니다.') });
    }
  }
  if (failed.length > 0) return { ok: false, stage: 'resize', failed };

  const uploaded: StoredProgressPhoto[] = [];
  for (let index = 0; index < total; index += 1) {
    steps.onProgress?.('upload', index + 1, total);
    try {
      uploaded.push(await steps.upload(shrunk[index], photos[index]));
    } catch (error) {
      return { ok: false, stage: 'upload', failed: [{ name: photos[index].name, error: errorText(error, '사진을 올리지 못했습니다.') }] };
    }
  }
  return { ok: true, photos: uploaded };
}

export function photoFailureMessages(result: PhotoPipelineFailure): string[] {
  if (result.stage === 'resize') {
    return [
      ...result.failed.map((item) => (item.error.includes(item.name) ? item.error : `${item.error} (${item.name})`)),
      'JPG나 PNG 사진으로 바꿔서 다시 올려 주세요. 진행 기록은 만들지 않았습니다.',
    ];
  }
  return [...result.failed.map((item) => `사진을 올리지 못했습니다: ${item.name} (${item.error})`), '진행 기록은 만들지 않았습니다. 다시 시도해 주세요.'];
}

export class ProgressRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ProgressRequestError';
    this.status = status;
  }
}

// fetch rejects only when no answer arrived at all (offline, a dropped connection), with the browser's own English text
// ("Failed to fetch", "Load failed", ...). Staff see NETWORK_ERROR_MESSAGE instead, through errorText like any other error.
export async function fetchOrNetworkError(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new ProgressRequestError(NETWORK_ERROR_MESSAGE, 0);
  }
}

// All calls carry the manager session (Authorization: Bearer). An error answer becomes a ProgressRequestError with the
// server's own message, so refusals ("알림톡 템플릿 설정이 필요합니다", a missing mobile number, ...) reach staff as written.
export function createProgressApi(authHeaders: () => Record<string, string>) {
  async function call<T>(query: string, init: RequestInit | undefined, fallback: string): Promise<T> {
    const response = await fetchOrNetworkError(`/api/manager/progress${query}`, {
      ...init,
      headers: { ...authHeaders(), ...((init?.headers as Record<string, string> | undefined) ?? {}) },
    });
    const data = (await response.json().catch(() => ({}))) as { error?: unknown };
    if (!response.ok) {
      const message = typeof data.error === 'string' && data.error ? data.error : `${fallback} (HTTP ${response.status})`;
      throw new ProgressRequestError(message, response.status);
    }
    return data as T;
  }

  const post = <T>(body: Record<string, unknown>, fallback: string) =>
    call<T>('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, fallback);
  const siteQuery = (siteId: string) => `?siteId=${encodeURIComponent(siteId)}`;

  return {
    load: (siteId: string) => call<ProgressManagerState>(siteQuery(siteId), undefined, '진행 현황을 불러오지 못했습니다.'),
    preview: (siteId: string) => call<CustomerProgressView>(`${siteQuery(siteId)}&preview=1`, undefined, '미리보기를 불러오지 못했습니다.'),
    // One photo per request, with its pixel size (the server does not read images). No Content-Type header: the browser
    // adds the multipart boundary itself. The answer is the one place a pathname reaches the browser; createUpdate sends
    // it back as it came.
    uploadPhoto: (siteId: string, blob: Blob, fileName: string, size: PhotoSize) => {
      const form = new FormData();
      form.append('action', 'uploadPhoto');
      form.append('siteId', siteId);
      form.append('width', String(size.width));
      form.append('height', String(size.height));
      form.append('file', blob, fileName);
      return call<{ photo: StoredProgressPhoto }>('', { method: 'POST', body: form }, '사진을 올리지 못했습니다.');
    },
    createUpdate: (input: { siteId: string; reportDate: string; designer: string; workDetail: string; photos: StoredProgressPhoto[]; notify: boolean }) =>
      post<CreateUpdateResponse>({ action: 'createUpdate', ...input }, '진행 기록을 저장하지 못했습니다.'),
    deleteUpdate: (id: string) => post<{ ok: boolean }>({ action: 'deleteUpdate', id }, '진행 기록을 삭제하지 못했습니다.'),
    setLink: (siteId: string, mode: LinkMode) => post<{ link: ProgressLink }>({ action: 'setLink', siteId, mode }, '링크 설정을 바꾸지 못했습니다.'),
    notify: (updateId: string, resend: boolean) => post<NotifyResponse>({ action: 'notify', updateId, resend }, '알림톡을 보내지 못했습니다.'),
  };
}

export type ProgressApi = ReturnType<typeof createProgressApi>;

// The upload step of the photo pipeline: the shrunk JPEG goes up with the size the browser measured while shrinking it
// (resizeImageFile either returns that size or throws, so a photo never goes up without one).
export async function uploadShrunkPhoto(
  api: Pick<ProgressApi, 'uploadPhoto'>,
  siteId: string,
  shrunk: { blob: Blob } & PhotoSize,
  fileName: string,
): Promise<StoredProgressPhoto> {
  const result = await api.uploadPhoto(siteId, shrunk.blob, fileName, { width: shrunk.width, height: shrunk.height });
  if (!result.photo) throw new Error('사진 정보를 받지 못했습니다.');
  return result.photo;
}
