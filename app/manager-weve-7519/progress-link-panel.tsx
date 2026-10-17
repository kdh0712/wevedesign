'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Copy, Eye, Link2, Loader2, Power, RefreshCw } from 'lucide-react';
import { ProgressView } from '../lib/progress-view';
import type { CustomerProgressView } from '../lib/site-progress';
import {
  LINK_REASON_MESSAGES,
  ROTATE_CONFIRM_MESSAGE,
  createProgressApi,
  errorText,
  formatReportDay,
  formatSeoulDateTime,
  notifyHistory,
  type LinkMode,
  type ProgressManagerState,
} from './progress-manager';

const LINK_CHANGED_MESSAGE: Record<LinkMode, string> = {
  enable: '링크를 켰습니다. 고객이 링크로 진행 현황을 볼 수 있습니다.',
  disable: '링크를 껐습니다. 고객이 진행 현황을 볼 수 없습니다.',
  rotate: '새 링크로 바꿨습니다. 이전 링크는 더 이상 열리지 않습니다.',
};

// The customer's view of the site exactly as the customer page builds it, without the phone check.
function ProgressPreviewModal({ view, linkEnabled, onClose }: { view: CustomerProgressView; linkEnabled: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#17212b]/60 px-4 py-6" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="고객 화면 미리보기"
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-[#eef3f5] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          // The photo viewer inside the preview handles its own Escape; only close here when focus is in this dialog itself.
          if (event.key === 'Escape' && (event.target as Element).closest('[role="dialog"]') === dialogRef.current) onClose();
        }}
      >
        <header className="flex items-center justify-between gap-3 bg-[#171512] px-4 py-3 text-white">
          <div>
            <p className="text-sm font-semibold">고객 화면 미리보기</p>
            <p className="mt-0.5 text-xs text-white/70">뒷자리 확인 없이 관리자 화면에서만 보는 화면입니다.</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="rounded-full border border-white/20 px-3 py-1.5 text-sm font-bold">
            닫기
          </button>
        </header>
        {!linkEnabled && <p className="bg-[#fff5d9] px-4 py-2 text-xs font-semibold text-[#8b6420]">링크가 꺼져 있어 지금은 고객에게 보이지 않습니다.</p>}
        <div className="overflow-y-auto px-4 pb-8 pt-6">
          <ProgressView view={view} />
        </div>
      </div>
    </div>
  );
}

// "고객 진행 현황 링크" for one site: switch the link on or off, copy it, replace it with a new one, preview the customer's
// page and see every alimtalk sent from this site's records. The first upload usually creates the link and 완료 closes it;
// these controls are for staff turning it back on or off by hand.
export function ProgressLinkPanel({ siteId, authHeaders }: { siteId: string; authHeaders: () => Record<string, string> }) {
  const api = createProgressApi(authHeaders);
  const [state, setState] = useState<ProgressManagerState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [pending, setPending] = useState<LinkMode | 'preview' | ''>('');
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const [preview, setPreview] = useState<CustomerProgressView | null>(null);
  const busyRef = useRef(false);
  const busy = pending !== '';
  const urlRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    api
      .load(siteId)
      .then((next) => {
        setState(next);
        setLoadError('');
      })
      .catch((error) => setLoadError(errorText(error, '진행 현황을 불러오지 못했습니다.')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  // One request at a time; the ref also stops a fast double click before the disabled state renders.
  const run = async (kind: LinkMode | 'preview', task: () => Promise<string>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setPending(kind);
    setMessage(null);
    try {
      const text = await task();
      setMessage(text ? { tone: 'ok', text } : null);
    } catch (error) {
      setMessage({ tone: 'error', text: errorText(error) });
    } finally {
      busyRef.current = false;
      setPending('');
    }
  };

  const changeLink = (mode: LinkMode) => {
    if (busyRef.current) return;
    if (mode === 'rotate' && !window.confirm(ROTATE_CONFIRM_MESSAGE)) return;
    void run(mode, async () => {
      const { link } = await api.setLink(siteId, mode);
      setState((current) => (current ? { ...current, link } : current));
      return LINK_CHANGED_MESSAGE[mode];
    });
  };

  const openPreview = () =>
    void run('preview', async () => {
      setPreview(await api.preview(siteId));
      return '';
    });

  const icon = (kind: LinkMode | 'preview', idle: ReactNode) => (pending === kind ? <Loader2 className="animate-spin" size={15} /> : idle);

  const copyLink = async () => {
    if (!state?.link.url) return;
    let copied = false;
    try {
      await navigator.clipboard.writeText(state.link.url);
      copied = true;
    } catch {
      // The Clipboard API can be refused (no permission, embedded frame); copying the selected address still works there.
      urlRef.current?.select();
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      }
    }
    setMessage(copied ? { tone: 'ok', text: '링크를 복사했습니다.' } : { tone: 'error', text: '복사하지 못했습니다. 선택된 주소를 직접 복사해 주세요.' });
  };

  const link = state?.link;
  const history = state ? notifyHistory(state.updates) : [];
  const badge = !link
    ? null
    : link.enabled
      ? { text: '켜짐', className: 'bg-[#e6f6ea] text-[#26853f]' }
      : link.code
        ? { text: '꺼짐', className: 'bg-[#eef1f3] text-[#60717d]' }
        : { text: '링크 없음', className: 'bg-[#eef1f3] text-[#60717d]' };

  return (
    <section className="mt-5 rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-4" aria-labelledby={`progress-link-${siteId}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={`progress-link-${siteId}`} className="flex items-center gap-2 text-base font-semibold">
          <Link2 size={17} className="text-[#38a9bd]" />
          고객 진행 현황 링크
        </h3>
        {badge && <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge.className}`}>{badge.text}</span>}
      </div>

      {!state && !loadError && (
        <p className="mt-3 inline-flex items-center gap-2 text-sm text-[#60717d]">
          <Loader2 className="animate-spin" size={16} /> 불러오는 중
        </p>
      )}
      {loadError && <p className="mt-3 text-sm font-semibold text-red-600">{loadError}</p>}

      {state && link && (
        <div className="mt-3 grid gap-3">
          <p className="text-sm leading-6 text-[#60717d]">
            {link.enabled
              ? '고객은 이 링크와 휴대폰 번호 뒷자리 4자리로 공사 진행 현황을 봅니다.'
              : link.code
                ? '링크가 꺼져 있어 고객이 진행 현황을 볼 수 없습니다. 기록을 올려도 다시 켜지지 않습니다.'
                : '아직 링크가 없습니다. 일일 보고서에서 첫 진행 기록을 올리면 자동으로 만들어집니다.'}
          </p>

          {link.code && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                ref={urlRef}
                value={link.url}
                readOnly
                aria-label="고객 진행 현황 링크 주소"
                onFocus={(event) => event.target.select()}
                className={`min-w-0 flex-1 rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm outline-none focus:border-[#38a9bd] ${link.enabled ? '' : 'text-[#9aa6ad] line-through'}`}
              />
              <button
                type="button"
                onClick={() => void copyLink()}
                disabled={!link.enabled}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold text-[#273541] disabled:opacity-50"
              >
                <Copy size={15} /> 링크 복사
              </button>
            </div>
          )}

          {!state.hasCustomerPhone && (
            <p role="alert" className="rounded-md border border-[#f0dca8] bg-[#fff8e6] px-3 py-2 text-sm font-semibold text-[#8b6420]">
              {LINK_REASON_MESSAGES['no-customer-phone']}. 위 연락처에 고객 휴대폰 번호를 넣고 저장해 주세요.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {link.enabled ? (
              <button
                type="button"
                onClick={() => changeLink('disable')}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 disabled:opacity-50"
              >
                {icon('disable', <Power size={15} />)} 링크 끄기
              </button>
            ) : (
              state.hasCustomerPhone && (
                <button
                  type="button"
                  onClick={() => changeLink('enable')}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#38a9bd] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {icon('enable', <Power size={15} />)} 링크 켜기
                </button>
              )
            )}
            {link.code && state.hasCustomerPhone && (
              <button
                type="button"
                onClick={() => changeLink('rotate')}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold text-[#273541] disabled:opacity-50"
              >
                {icon('rotate', <RefreshCw size={15} />)} 새 링크로 바꾸기
              </button>
            )}
            <button
              type="button"
              onClick={openPreview}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#171512] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {icon('preview', <Eye size={15} />)} 미리보기
            </button>
          </div>
          {link.createdAt && <p className="text-xs text-[#87949c]">지금 링크를 만든 때: {formatSeoulDateTime(link.createdAt)}</p>}

          <div className="border-t border-[#e3e8eb] pt-3">
            <p className="text-sm font-semibold text-[#273541]">알림톡 발송 기록</p>
            {!state.notifyConfigured && <p className="mt-1 text-xs font-semibold text-[#8b6420]">알림톡 템플릿 설정이 필요합니다</p>}
            {history.length === 0 ? (
              <p className="mt-1 text-xs text-[#60717d]">아직 보낸 알림톡이 없습니다.</p>
            ) : (
              <ul className="mt-2 grid max-h-60 gap-1.5 overflow-y-auto pr-1">
                {history.map((entry, index) => (
                  <li key={`${entry.updateId}-${entry.sentAt}-${index}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-[#e3e8eb] bg-white px-3 py-2 text-xs">
                    <span className="font-semibold text-[#273541]">{formatSeoulDateTime(entry.sentAt) || entry.sentAt}</span>
                    <span className="text-[#60717d]">{formatReportDay(entry.reportDate)} 기록</span>
                    <span className={`rounded-full px-2 py-0.5 font-bold ${entry.ok ? 'bg-[#e6f6ea] text-[#26853f]' : 'bg-red-50 text-red-600'}`}>{entry.ok ? '보냄' : '실패'}</span>
                    {entry.by && <span className="text-[#87949c]">{entry.by}</span>}
                    {!entry.ok && entry.error && <span className="basis-full text-red-600">{entry.error}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={`mt-3 text-sm font-semibold ${message.tone === 'error' ? 'text-red-600' : 'text-[#26853f]'}`}>
          {message.text}
        </p>
      )}

      {preview && <ProgressPreviewModal view={preview} linkEnabled={Boolean(link?.enabled)} onClose={() => setPreview(null)} />}
    </section>
  );
}
