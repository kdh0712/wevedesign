'use client';

// 현장 영수증함 on the PC 실행내역서 (spec docs/superpowers/specs/2026-11-24-site-receipts-design.md): the site's receipts,
// judged against the version on screen. [실행 항목으로] fills the 실행 항목 입력 row; staff pick the 공종 and add it, and the
// receipt counts as 정리됨 for this version once that line is there (saved: locked for everyone).
import { ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RECEIPT_MEMO_MAX, parseReceiptAmount, receiptVersionStatus, receiptWorkLineDraft, type SiteReceiptView } from '../../lib/site-receipts';
import type { ReceiptApi } from '../receipt-api';

export type ReceiptLineDraft = ReturnType<typeof receiptWorkLineDraft>;
type Editing = { id: string; siteId: string; amount: string; memo: string };

const won = (amount: number | null) => (amount === null ? '금액 없음' : `${amount.toLocaleString('ko-KR')}원`);
const smallButton = 'rounded-md border border-[#d5dde2] bg-white px-2.5 py-1 text-xs font-semibold text-[#273541] hover:bg-[#f7fafb] disabled:opacity-50';
const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

export function ReceiptPanel({
  siteId,
  api,
  openLines,
  openSavedJson,
  otherVersions,
  sites,
  onUseReceipt,
}: {
  siteId: string;
  api: ReceiptApi;
  openLines: ReadonlyArray<{ receiptId?: string }>;
  openSavedJson: string | undefined;
  otherVersions: ReadonlyArray<{ label: string; workLinesJson?: string }>;
  sites: ReadonlyArray<{ _id: string; title?: string }>;
  onUseReceipt: (draft: ReceiptLineDraft) => void;
}) {
  const [receipts, setReceipts] = useState<SiteReceiptView[] | null>(null);
  const [photosUnavailable, setPhotosUnavailable] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showFiled, setShowFiled] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [viewing, setViewing] = useState<{ photos: SiteReceiptView['photos']; index: number } | null>(null);

  // Only the latest load may fill the list: an answer for a site staff already left (or an older reload) is dropped, so
  // one site's receipts never show, and get filed, under another site.
  const loadRequestRef = useRef(0);
  const load = useCallback(async () => {
    if (!siteId) return;
    const request = ++loadRequestRef.current;
    setError('');
    try {
      const data = await api.ofSite(siteId);
      if (request !== loadRequestRef.current) return;
      setReceipts(data.receipts);
      setPhotosUnavailable(data.photosUnavailable);
    } catch (caught) {
      if (request !== loadRequestRef.current) return;
      setError(errorText(caught, '영수증을 불러오지 못했어요.'));
    }
  }, [api, siteId]);

  useEffect(() => {
    setReceipts(null);
    setEditing(null);
    void load();
  }, [load]);

  const rows = useMemo(
    () =>
      (receipts || []).map((receipt) => ({
        receipt,
        status: receiptVersionStatus({ receiptId: receipt.id, skipped: Boolean(receipt.skipped), openLines, openSavedJson, otherVersions }),
      })),
    [receipts, openLines, openSavedJson, otherVersions],
  );
  const open = rows.filter((row) => row.status.state === 'open');
  const filed = rows.filter((row) => row.status.state !== 'open');

  const replace = (receipt: SiteReceiptView) =>
    setReceipts((current) => (current ? current.map((item) => (item.id === receipt.id ? receipt : item)) : current)?.filter((item) => item.siteId === siteId) ?? null);

  const run = async (work: () => Promise<void>, fallback: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (caught) {
      setError(errorText(caught, fallback));
      void load();
    } finally {
      setBusy(false);
    }
  };

  const setSkipped = (receipt: SiteReceiptView, skipped: boolean) =>
    run(async () => replace(await api.setSkipped(receipt.id, skipped)), '영수증 상태를 바꾸지 못했어요.');

  const saveEdit = () => {
    if (!editing) return;
    const checked = parseReceiptAmount(editing.amount);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    void run(async () => {
      replace(await api.update(editing));
      setEditing(null);
    }, '영수증을 고치지 못했어요.');
  };

  const row = ({ receipt, status }: (typeof rows)[number]) => {
    const first = receipt.photos[0];
    const isEditing = editing?.id === receipt.id;
    return (
      <li key={receipt.id} className="rounded-md border border-[#e3e8eb] bg-white px-3 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => receipt.photos.length && setViewing({ photos: receipt.photos, index: 0 })}
            aria-label="영수증 사진 크게 보기"
            className="relative h-12 w-12 shrink-0 overflow-hidden rounded border border-[#e3e8eb] bg-[#f3f6f8] text-[10px] text-[#60717d]"
          >
            {first?.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL
              <img src={first.url} alt="" className="h-full w-full object-cover" />
            ) : (
              '사진 없음'
            )}
            {receipt.photos.length > 1 && <span className="absolute bottom-0 right-0 rounded-tl bg-black/60 px-1 text-[10px] text-white">{receipt.photos.length}</span>}
          </button>
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate">
              <span className="font-semibold text-[#171512]">{won(receipt.amount)}</span>
              <span className="text-[#60717d]"> · {receipt.memo || '메모 없음'}</span>
            </p>
            <p className="truncate text-xs text-[#60717d]">
              {receipt.receiptDate} · {receipt.createdByName || '올린 사람 없음'}
              {status.state === 'done' && <span className="ml-1 font-semibold text-[#1f5f36]">이 버전에 정리됨{status.unsaved ? ' (저장 전)' : ''}</span>}
              {status.state === 'skipped' && <span className="ml-1 font-semibold text-[#60717d]">정리 안 해도 됨 · {receipt.skipped?.byName}</span>}
              {status.state === 'open' && status.otherLabels.length > 0 && <span className="ml-1 text-[#8a5a00]">{status.otherLabels.join(', ')}에 있음</span>}
              {status.state === 'open' && status.unsaved && <span className="ml-1 text-[#8a5a00]">(이 버전에서 빼고 저장 전)</span>}
            </p>
          </div>
          <span className="flex flex-wrap items-center gap-1.5">
            {status.state === 'open' && (
              <>
                <button type="button" onClick={() => onUseReceipt(receiptWorkLineDraft(receipt))} disabled={busy} className="rounded-md bg-[#273541] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50">
                  실행 항목으로
                </button>
                <button type="button" onClick={() => void setSkipped(receipt, true)} disabled={busy} className={smallButton}>
                  정리 안 해도 됨
                </button>
              </>
            )}
            {status.state === 'skipped' && (
              <button type="button" onClick={() => void setSkipped(receipt, false)} disabled={busy} className={smallButton}>
                되돌리기
              </button>
            )}
            {!receipt.locked && !isEditing && (
              <button
                type="button"
                onClick={() => setEditing({ id: receipt.id, siteId: receipt.siteId, amount: receipt.amount === null ? '' : String(receipt.amount), memo: receipt.memo })}
                disabled={busy}
                className={smallButton}
              >
                고치기
              </button>
            )}
          </span>
        </div>
        {isEditing && editing && (
          <div className="mt-2 grid gap-2 border-t border-[#edf2f5] pt-2 md:grid-cols-[1fr_140px_1.4fr_auto]">
            <select value={editing.siteId} onChange={(event) => setEditing({ ...editing, siteId: event.target.value })} aria-label="현장 옮기기" className="rounded-md border border-[#d5dde2] px-2 py-1.5 text-sm">
              {sites.map((site) => (
                <option key={site._id} value={site._id}>
                  {site.title || '현장명 없음'}
                </option>
              ))}
            </select>
            <input value={editing.amount} onChange={(event) => setEditing({ ...editing, amount: event.target.value })} placeholder="금액" aria-label="금액" className="rounded-md border border-[#d5dde2] px-2 py-1.5 text-sm" />
            <input value={editing.memo} onChange={(event) => setEditing({ ...editing, memo: event.target.value })} maxLength={RECEIPT_MEMO_MAX} placeholder="메모" aria-label="메모" className="rounded-md border border-[#d5dde2] px-2 py-1.5 text-sm" />
            <span className="flex gap-1.5">
              <button type="button" onClick={saveEdit} disabled={busy} className="rounded-md bg-[#273541] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                저장
              </button>
              <button type="button" onClick={() => setEditing(null)} disabled={busy} className={smallButton}>
                취소
              </button>
            </span>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="mb-4 rounded-lg border border-[#e3e8eb] bg-[#fbfcfc] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          영수증
          {receipts && (
            <span className="ml-2 font-normal text-[#60717d]">
              정리 안 됨 {open.length} · 정리됨 {filed.length}
            </span>
          )}
        </h3>
        <span className="flex items-center gap-2">
          {filed.length > 0 && (
            <button type="button" onClick={() => setShowFiled(!showFiled)} aria-expanded={showFiled} className={smallButton}>
              정리됨 {showFiled ? '접기' : '보기'}
            </button>
          )}
          <button type="button" onClick={() => void load()} disabled={busy} aria-label="영수증 새로고침" className={smallButton}>
            <RefreshCw size={13} />
          </button>
        </span>
      </div>
      {error && <p className="mb-2 rounded-md border border-[#f1c0bd] bg-[#fdf1f0] px-3 py-2 text-xs text-[#8a1f17]">{error}</p>}
      {photosUnavailable && <p className="mb-2 text-xs text-[#8a5a00]">사진 주소를 만들지 못해 사진이 안 보여요. 잠시 후 새로고침해 주세요.</p>}
      {!receipts && !error && <p className="py-3 text-center text-xs text-[#60717d]">불러오는 중…</p>}
      {receipts && receipts.length === 0 && <p className="py-3 text-center text-xs text-[#60717d]">폰 앱에서 올린 영수증이 없어요.</p>}
      {open.length > 0 && <ul className="grid gap-1.5">{open.map(row)}</ul>}
      {receipts && receipts.length > 0 && open.length === 0 && <p className="py-2 text-center text-xs text-[#60717d]">이 버전에 정리할 영수증이 없어요.</p>}
      {showFiled && filed.length > 0 && <ul className="mt-2 grid gap-1.5 border-t border-[#edf2f5] pt-2">{filed.map(row)}</ul>}

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6" role="dialog" aria-modal="true" aria-label="영수증 사진">
          {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL */}
          <img src={viewing.photos[viewing.index]?.url} alt="영수증 사진" className="max-h-full max-w-full object-contain" />
          <button type="button" onClick={() => setViewing(null)} aria-label="사진 닫기" className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-[#171512]">
            <X size={18} />
          </button>
          {viewing.photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setViewing({ ...viewing, index: (viewing.index + viewing.photos.length - 1) % viewing.photos.length })}
                aria-label="이전 사진"
                className="absolute left-4 rounded-full bg-white/90 p-2 text-[#171512]"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => setViewing({ ...viewing, index: (viewing.index + 1) % viewing.photos.length })}
                aria-label="다음 사진"
                className="absolute right-4 rounded-full bg-white/90 p-2 text-[#171512]"
              >
                <ChevronRight size={18} />
              </button>
              <span className="absolute bottom-4 rounded-full bg-white/90 px-3 py-1 text-xs text-[#171512]">
                {viewing.index + 1} / {viewing.photos.length}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
