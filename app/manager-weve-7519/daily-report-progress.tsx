'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Send, Trash2, UploadCloud } from 'lucide-react';
import { jpegFileName, resizeImageFile } from '../lib/resize-image';
import type { ProgressUpdate } from '../lib/site-progress';
import {
  LINK_REASON_MESSAGES,
  NOTIFY_STATUS_LABEL,
  canPostAgain,
  createProgressApi,
  defaultPostToCustomer,
  errorText,
  formatReportDay,
  lastNotifyError,
  memoPreview,
  notifyBlockedReason,
  notifyStatus,
  photoFailureMessages,
  photoProgressLabel,
  postResultMessages,
  postSignature,
  predictLinkOnUpload,
  shrinkAndUploadPhotos,
  type Notice,
  type NotifyStatus,
  type ProgressManagerState,
} from './progress-manager';

type DailyReportPhoto = { id: string; name: string; file: File };

// Asked when the daily report window is closed while a request from this section is still running.
export const PROGRESS_BUSY_CLOSE_CONFIRM =
  '고객 진행 현황에 보내는 중입니다.\n지금 닫아도 요청은 멈추지 않고 결과만 볼 수 없습니다. 다시 열면 기록 목록에서 결과를 먼저 확인해 주세요.\n창을 닫을까요?';

const NOTICE_CLASS: Record<Notice['tone'], string> = {
  ok: 'border-[#bfe3c8] bg-[#f0faf2] text-[#26853f]',
  warn: 'border-[#f0dca8] bg-[#fff8e6] text-[#8b6420]',
  error: 'border-red-200 bg-red-50 text-red-700',
};

const STATUS_CLASS: Record<NotifyStatus, string> = {
  sent: 'bg-[#e6f6ea] text-[#26853f]',
  failed: 'bg-red-50 text-red-600',
  none: 'bg-[#eef1f3] text-[#60717d]',
};

function NoticeBox({ notice }: { notice: Notice }) {
  return (
    <div role={notice.tone === 'error' ? 'alert' : 'status'} className={`mt-3 grid gap-1 rounded-md border px-3 py-2.5 text-sm font-semibold ${NOTICE_CLASS[notice.tone]}`}>
      {notice.lines.map((line, index) => (
        <p key={index}>{line}</p>
      ))}
    </div>
  );
}

// The daily report window's part for the customer progress page: posts this report's memo and photos to the site's
// customer page (optionally with an alimtalk) and lists what is already posted. The report image tools above stay as they are.
export function DailyReportProgress({
  siteId,
  siteStatus,
  reportDate,
  designer,
  workDetail,
  photos,
  authHeaders,
  onBusyChange,
}: {
  siteId: string;
  siteStatus?: string;
  reportDate: string;
  designer: string;
  workDetail: string;
  photos: DailyReportPhoto[];
  authHeaders: () => Record<string, string>;
  // Told whenever a post, alimtalk or delete starts or ends, so the window can guard its close.
  onBusyChange?: (busy: boolean) => void;
}) {
  const api = createProgressApi(authHeaders);
  const [state, setState] = useState<ProgressManagerState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [postToCustomer, setPostToCustomer] = useState(true);
  const [sendNotify, setSendNotify] = useState(false);
  const [posting, setPosting] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const [postNotice, setPostNotice] = useState<Notice | null>(null);
  const [rowBusyId, setRowBusyId] = useState('');
  const [listNotice, setListNotice] = useState<Notice | null>(null);
  // postSignature of the last report saved from this window; the same report cannot be posted again.
  const [postedSignature, setPostedSignature] = useState<string | null>(null);
  const postedRef = useRef<string | null>(null);
  // One request at a time from this section. The ref also stops a fast double click before the disabled state renders.
  const busyRef = useRef(false);
  const defaultsApplied = useRef(false);

  const load = async () => {
    try {
      const next = await api.load(siteId);
      setState(next);
      setLoadError('');
      if (!defaultsApplied.current) {
        defaultsApplied.current = true;
        setPostToCustomer(defaultPostToCustomer(next.link));
      }
    } catch (error) {
      setLoadError(errorText(error, '진행 현황을 불러오지 못했습니다.'));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  const decision = state ? predictLinkOnUpload(state, siteStatus) : null;
  const linkOnAfterUpload = decision?.action === 'create' || decision?.action === 'keep-on';
  const notifyBlocked = state
    ? notifyBlockedReason({ notifyConfigured: state.notifyConfigured, hasCustomerPhone: state.hasCustomerPhone, linkEnabled: linkOnAfterUpload })
    : null;
  const rowNotifyBlocked = state
    ? notifyBlockedReason({ notifyConfigured: state.notifyConfigured, hasCustomerPhone: state.hasCustomerPhone, linkEnabled: state.link.enabled })
    : null;
  const busy = posting || rowBusyId !== '';
  const signature = postSignature({ reportDate, designer, workDetail, photoIds: photos.map((photo) => photo.id) });
  const alreadyPosted = !canPostAgain(postedSignature, signature);

  // The window asks before closing while a request runs: closing would hide the result but not stop the upload or alimtalk.
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  const linkHint = !decision
    ? null
    : decision.action === 'create'
      ? { warn: false, text: '처음 올리면 고객 링크가 자동으로 만들어집니다.' }
      : decision.action === 'keep-on'
        ? { warn: false, text: '링크가 켜져 있어 올리면 고객에게 바로 보입니다.' }
        : {
            warn: true,
            text:
              decision.reason === 'no-customer-phone'
                ? `${LINK_REASON_MESSAGES[decision.reason]}. 현장 정보에 고객 연락처를 넣으면 다음 기록부터 링크가 만들어집니다.`
                : `${LINK_REASON_MESSAGES[decision.reason]}. 현장 정보의 "고객 진행 현황 링크"에서 켤 수 있습니다.`,
          };

  const post = async () => {
    if (busyRef.current || !state || !postToCustomer || !canPostAgain(postedRef.current, signature)) return;
    if (!workDetail.trim()) {
      setPostNotice({ tone: 'error', lines: ['상세 작업 내역을 입력해주세요.'] });
      return;
    }
    if (photos.length === 0) {
      setPostNotice({ tone: 'error', lines: ['현장 사진을 첨부해주세요.'] });
      return;
    }

    busyRef.current = true;
    setPosting(true);
    setPostNotice(null);
    const selected = [...photos];
    const notify = sendNotify && !notifyBlocked;
    try {
      const uploaded = await shrinkAndUploadPhotos(selected, {
        shrink: (photo) => resizeImageFile(photo.file),
        upload: async (shrunk, photo) => {
          const result = await api.uploadPhoto(siteId, shrunk.blob, jpegFileName(photo.name));
          if (!result.photo) throw new Error('사진 정보를 받지 못했습니다.');
          return result.photo;
        },
        onProgress: (stage, done, total) => setProgressLabel(photoProgressLabel(stage, done, total)),
      });
      if (!uploaded.ok) {
        setPostNotice({ tone: 'error', lines: photoFailureMessages(uploaded) });
        return;
      }

      setProgressLabel(notify ? '진행 기록 저장하고 알림톡 보내는 중' : '진행 기록 저장 중');
      try {
        const saved = await api.createUpdate({ siteId, reportDate, designer, workDetail, photos: uploaded.photos, notify });
        // Saved: this exact report (and its alimtalk) must not go out a second time.
        postedRef.current = signature;
        setPostedSignature(signature);
        setPostNotice(postResultMessages(saved, notify, uploaded.photos.length));
      } catch (error) {
        setPostNotice({ tone: 'error', lines: [errorText(error, '진행 기록을 저장하지 못했습니다.'), '아래 기록 목록에 없으면 다시 올려 주세요.'] });
      }
      await load();
    } finally {
      busyRef.current = false;
      setPosting(false);
      setProgressLabel('');
    }
  };

  const replaceUpdate = (update: ProgressUpdate) =>
    setState((current) => (current ? { ...current, updates: current.updates.map((item) => (item._id === update._id ? update : item)) } : current));

  const sendAlimtalk = async (update: ProgressUpdate) => {
    if (busyRef.current) return;
    const status = notifyStatus(update);
    if (status === 'sent' && !window.confirm('이미 알림톡을 보낸 기록입니다. 고객에게 다시 보낼까요?')) return;
    busyRef.current = true;
    setRowBusyId(update._id);
    setListNotice(null);
    try {
      const sent = await api.notify(update._id, status === 'sent');
      if (sent.update?._id) replaceUpdate(sent.update);
      setListNotice(
        sent.notify?.ok
          ? { tone: 'ok', lines: [`${formatReportDay(update.reportDate)} 기록의 알림톡을 보냈습니다.`] }
          : { tone: 'error', lines: [`알림톡을 보내지 못했습니다: ${sent.notify?.error || '알 수 없는 오류'}`] },
      );
    } catch (error) {
      setListNotice({ tone: 'error', lines: [errorText(error, '알림톡을 보내지 못했습니다.')] });
    } finally {
      busyRef.current = false;
      setRowBusyId('');
    }
  };

  const removeUpdate = async (update: ProgressUpdate) => {
    if (busyRef.current) return;
    if (!window.confirm(`${formatReportDay(update.reportDate)} 진행 기록을 삭제할까요?\n고객 진행 현황에서 바로 사라집니다.`)) return;
    busyRef.current = true;
    setRowBusyId(update._id);
    setListNotice(null);
    try {
      await api.deleteUpdate(update._id);
      setState((current) => (current ? { ...current, updates: current.updates.filter((item) => item._id !== update._id) } : current));
      setListNotice({ tone: 'ok', lines: [`${formatReportDay(update.reportDate)} 진행 기록을 삭제했습니다.`] });
    } catch (error) {
      setListNotice({ tone: 'error', lines: [errorText(error, '진행 기록을 삭제하지 못했습니다.')] });
    } finally {
      busyRef.current = false;
      setRowBusyId('');
    }
  };

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm" aria-labelledby="daily-report-progress-title">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#38a9bd]">Customer Progress</p>
      <h3 id="daily-report-progress-title" className="mt-1 text-lg font-semibold">
        고객 진행 현황
      </h3>
      <p className="mt-1 text-sm leading-6 text-[#60717d]">위 날짜, 담당, 상세 작업 내역과 사진을 고객용 진행 현황 페이지에 올립니다.</p>

      {!state && !loadError && (
        <p className="mt-3 inline-flex items-center gap-2 text-sm text-[#60717d]">
          <Loader2 className="animate-spin" size={16} /> 불러오는 중
        </p>
      )}
      {loadError && <NoticeBox notice={{ tone: 'error', lines: [loadError] }} />}

      {state && (
        <>
          <div className="mt-4 grid gap-3 rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-4">
            <label className="flex items-start gap-2 text-sm font-bold text-[#273541]">
              <input
                type="checkbox"
                checked={postToCustomer}
                onChange={(event) => setPostToCustomer(event.target.checked)}
                disabled={posting}
                className="mt-0.5 h-4 w-4 accent-[#38a9bd]"
              />
              고객 진행 현황에 올리기
            </label>
            {linkHint && <p className={`-mt-1 pl-6 text-xs leading-5 ${linkHint.warn ? 'font-semibold text-[#8b6420]' : 'text-[#60717d]'}`}>{linkHint.text}</p>}
            <label className={`flex items-start gap-2 text-sm font-bold ${notifyBlocked || !postToCustomer ? 'text-[#9aa6ad]' : 'text-[#273541]'}`}>
              <input
                type="checkbox"
                checked={sendNotify && !notifyBlocked && postToCustomer}
                onChange={(event) => setSendNotify(event.target.checked)}
                disabled={posting || Boolean(notifyBlocked) || !postToCustomer}
                className="mt-0.5 h-4 w-4 accent-[#38a9bd]"
              />
              고객에게 알림톡 보내기
            </label>
            {notifyBlocked && <p className="-mt-1 pl-6 text-xs font-semibold leading-5 text-[#8b6420]">{notifyBlocked}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void post()}
                disabled={busy || !postToCustomer || alreadyPosted}
                className="inline-flex items-center gap-2 rounded-md bg-[#171512] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {posting ? <Loader2 className="animate-spin" size={16} /> : alreadyPosted ? <Check size={16} /> : <UploadCloud size={16} />}
                {alreadyPosted ? '올렸습니다' : '올리기'}
              </button>
              {alreadyPosted && !posting && (
                <span className="text-xs leading-5 text-[#60717d]">같은 내용은 다시 올릴 수 없습니다. 사진, 메모, 날짜를 바꾸면 새 기록으로 올릴 수 있습니다.</span>
              )}
              {progressLabel && (
                <span className="text-sm font-semibold text-[#267d8c]" aria-live="polite">
                  {progressLabel}
                </span>
              )}
            </div>
          </div>
          {postNotice && <NoticeBox notice={postNotice} />}

          <div className="mt-5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-[#273541]">이 현장의 진행 기록</h4>
              <span className="rounded-full bg-[#edf8fb] px-2.5 py-1 text-xs font-bold text-[#267d8c]">{state.updates.length}</span>
            </div>
            {rowNotifyBlocked && state.updates.length > 0 && <p className="mt-1 text-xs font-semibold text-[#8b6420]">{rowNotifyBlocked}</p>}
            {state.updates.length === 0 ? (
              <p className="mt-2 rounded-md bg-[#f7fafb] px-3 py-4 text-sm text-[#60717d]">아직 올린 진행 기록이 없습니다.</p>
            ) : (
              <ul className="mt-2 grid max-h-[420px] gap-2 overflow-y-auto pr-1">
                {state.updates.map((update) => {
                  const status = notifyStatus(update);
                  const failedReason = status === 'failed' ? lastNotifyError(update) : '';
                  const rowBusy = rowBusyId === update._id;
                  return (
                    <li
                      key={update._id}
                      className="grid gap-2 rounded-md border border-[#d5dde2] bg-[#fffdf8] px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#171512]">
                          {formatReportDay(update.reportDate)}
                          <span className="text-xs font-semibold text-[#60717d]">사진 {update.photos.length}장</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_CLASS[status]}`}>알림 {NOTIFY_STATUS_LABEL[status]}</span>
                        </p>
                        <p className="mt-1 truncate text-xs text-[#4d5d66]">{memoPreview(update.workDetail) || '메모 없음'}</p>
                        {failedReason && <p className="mt-1 text-xs text-red-600">{failedReason}</p>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void sendAlimtalk(update)}
                          disabled={busy || Boolean(rowNotifyBlocked)}
                          className="inline-flex items-center gap-1 rounded-md border border-[#bcdfe6] bg-white px-3 py-1.5 text-xs font-bold text-[#267d8c] disabled:opacity-50"
                        >
                          {rowBusy ? <Loader2 className="animate-spin" size={13} /> : <Send size={13} />}
                          {status === 'none' ? '알림톡 보내기' : '다시 보내기'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeUpdate(update)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-600 disabled:opacity-50"
                        >
                          <Trash2 size={13} /> 삭제
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {listNotice && <NoticeBox notice={listNotice} />}
          </div>
        </>
      )}
    </section>
  );
}
