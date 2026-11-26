'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  siteQuickEditCustomerChanged,
  siteQuickEditFields,
  siteQuickEditOtherSites,
  siteQuickEditPlan,
  type QuickEditCustomer,
  type QuickEditSite,
  type SiteQuickEditFields,
  type SiteQuickEditPlan,
} from '../../lib/site-quick-edit';
import { SITE_STATUSES, SITE_TYPES, formatPhoneNumber } from '../office-ui';

// 현장 정보 수정 (spec docs/superpowers/specs/2026-11-26-site-quick-edit-design.md): the selected site's fields and its
// customer's name and number, opened from the SITE box of 견적 작업.

const INPUT = 'w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-[#38a9bd] disabled:bg-[#f4f6f7] disabled:text-[#60717d]';
const tone = (changed: boolean) => (changed ? 'border-[#38a9bd] bg-[#f6fbfc]' : 'border-[#d5dde2] bg-white');
const LABEL = 'grid gap-1 text-xs font-semibold text-[#4d5d66]';

type CustomerState = { kind: 'none' } | { kind: 'loading' } | { kind: 'ready'; customer: QuickEditCustomer } | { kind: 'error'; message: string };
type LoadedSite = { site: QuickEditSite; customer: QuickEditCustomer | null; customerError: string };

export function SiteEditDialog({
  site,
  sites,
  loadSite,
  onSave,
  onClose,
}: {
  // The page's copy of the site, shown until the stored one is read (and used if that read fails).
  site: QuickEditSite;
  sites: QuickEditSite[];
  // The site as stored now and its customer; throws with the message to show when the site cannot be read.
  loadSite: (siteId: string) => Promise<LoadedSite>;
  // '' when every save went through; otherwise the error to show (the popup stays open). stored: the site the popup
  // started from.
  onSave: (plan: SiteQuickEditPlan, otherSiteIds: string[], stored: QuickEditSite) => Promise<string>;
  onClose: () => void;
}) {
  const [customerState, setCustomerState] = useState<CustomerState>({ kind: 'loading' });
  // The site the popup started from: the stored one once read.
  const [base, setBase] = useState<QuickEditSite>(site);
  const [start, setStart] = useState(() => siteQuickEditFields(site, null));
  const [fields, setFields] = useState(start);
  const [syncOthers, setSyncOthers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pressedBackdrop = useRef(false);
  const customer = customerState.kind === 'ready' ? customerState.customer : null;
  const loading = customerState.kind === 'loading';
  const busy = saving || loading;

  // The fields wait for this read (they are disabled meanwhile), so nothing typed is replaced by it.
  useEffect(() => {
    let live = true;
    loadSite(site._id)
      .then((loaded) => {
        if (!live) return;
        const loadedFields = siteQuickEditFields(loaded.site, loaded.customer);
        setBase(loaded.site);
        setStart(loadedFields);
        setFields(loadedFields);
        setCustomerState(
          loaded.customer
            ? { kind: 'ready', customer: loaded.customer }
            : loaded.site.customerId
              ? { kind: 'error', message: loaded.customerError || '고객 정보를 불러오지 못했습니다.' }
              : { kind: 'none' },
        );
      })
      .catch((caught) => {
        // Only the changed fields are saved, so the page's copy is a safe start for the site part.
        if (live) setCustomerState({ kind: 'error', message: caught instanceof Error ? caught.message : '현장 정보를 불러오지 못했습니다.' });
      });
    return () => {
      live = false;
    };
    // Read once, when the popup opens for this site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose, saving]);

  const close = () => {
    if (!saving) onClose();
  };
  const set = (patch: Partial<SiteQuickEditFields>) => {
    setFields((current) => ({ ...current, ...patch }));
    setError('');
  };
  const changed = (key: keyof SiteQuickEditFields) => fields[key] !== start[key];
  const customerChanged = siteQuickEditCustomerChanged(customer, fields);
  const others = customer ? siteQuickEditOtherSites(sites, base, customer) : [];

  const submit = async () => {
    if (saving) return;
    const plan = siteQuickEditPlan(base, customer, start, fields, { syncOthers, otherCount: others.length });
    if ('error' in plan) {
      setError(plan.error);
      return;
    }
    setSaving(true);
    const problem = await onSave(plan, others.map((item) => item._id), base);
    setSaving(false);
    if (problem) setError(problem);
  };

  const textField = (key: 'title' | 'address' | 'customerName', label: string, extra: { placeholder?: string; disabled?: boolean } = {}) => (
    <label className={LABEL}>
      {label}
      <input
        value={fields[key]}
        onChange={(event) => set({ [key]: event.target.value })}
        placeholder={extra.placeholder}
        disabled={busy || extra.disabled}
        className={`${INPUT} ${tone(changed(key))}`}
      />
    </label>
  );
  const phoneField = (key: 'customerPhone' | 'sitePhone', label: string) => (
    <label className={LABEL}>
      {label}
      <input
        value={fields[key]}
        // No inputMode: on Windows it switches the Korean IME to English for the next fields too (tests/estimate-ime).
        onChange={(event) => set({ [key]: formatPhoneNumber(event.target.value) })}
        disabled={busy}
        className={`${INPUT} ${tone(changed(key))}`}
      />
    </label>
  );
  const selectField = (key: 'siteType' | 'status', label: string, options: string[]) => (
    <label className={LABEL}>
      {label}
      <select value={fields[key]} onChange={(event) => set({ [key]: event.target.value })} disabled={busy} className={`${INPUT} ${tone(changed(key))}`}>
        {(options.includes(fields[key]) ? options : [...options, fields[key]]).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );

  const shownCustomer = [base.customerName, base.customerPhone].filter(Boolean).join(' · ') || '없음';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="현장 정보 수정"
      // Closes only on a press that also started on the backdrop, so a text drag ending there keeps the popup.
      onMouseDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressedBackdrop.current && event.target === event.currentTarget) close();
        pressedBackdrop.current = false;
      }}
      className="no-print fixed inset-0 z-[80] flex items-center justify-center bg-[#171512]/50 p-4"
    >
      <section className="max-h-[calc(100vh-32px)] w-full max-w-[580px] overflow-y-auto rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">현장 정보 수정</h2>
          <button type="button" onClick={close} disabled={saving} aria-label="닫기" className="rounded-full border border-[#d5dde2] p-1.5 text-[#60717d] disabled:opacity-40">
            <X size={16} />
          </button>
        </div>

        <section className="mt-4 grid gap-2.5" aria-label="고객">
          <p className="text-sm font-bold text-[#273541]">고객</p>
          {customerState.kind === 'ready' ? (
            <>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {textField('customerName', '고객 이름')}
                {phoneField('customerPhone', '전화번호')}
              </div>
              <label className="flex items-center gap-2 text-sm text-[#273541]">
                <input type="checkbox" checked={fields.separatePhone} onChange={(event) => set({ separatePhone: event.target.checked })} disabled={busy} />
                이 현장은 다른 번호로 연락
              </label>
              {fields.separatePhone && phoneField('sitePhone', '이 현장 연락처')}
              {customerChanged && others.length > 0 && (
                <label className="flex items-start gap-2 rounded-lg border border-[#e7c37a] bg-[#fff8e8] px-3 py-2 text-xs font-semibold text-[#8b6420]">
                  <input type="checkbox" checked={syncOthers} onChange={(event) => setSyncOthers(event.target.checked)} disabled={busy} className="mt-0.5" />
                  <span>
                    이 고객의 다른 현장 {others.length}곳({others.map((item) => item.title || '현장명 없음').join(', ')})에도 바꾸기
                  </span>
                </label>
              )}
              <p className="text-xs text-[#60717d]">고객 이름·전화번호는 고객 정보예요. 이 고객의 다른 현장에도 같이 쓰여요.</p>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-[#d5dde2] px-3 py-2.5 text-sm text-[#4d5d66]">
              {customerState.kind === 'loading' ? (
                '현장·고객 정보를 불러오는 중…'
              ) : (
                <>
                  <p>
                    <span className="font-semibold text-[#171512]">{customerState.kind === 'none' ? '연결된 고객 없음' : '고객 정보를 불러오지 못했어요'}</span>
                    {' · '}지금 보이는 값: {shownCustomer}
                  </p>
                  <p className="mt-1 text-xs text-[#60717d]">
                    {customerState.kind === 'none' ? '고객 연결은 관리자 현장 목록에서 해 주세요.' : `${customerState.message} 현장 정보는 저장할 수 있어요.`}
                  </p>
                </>
              )}
            </div>
          )}
        </section>

        <section className="mt-5 grid gap-2.5" aria-label="현장">
          <p className="text-sm font-bold text-[#273541]">현장</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {textField('title', '현장명 *', { placeholder: '예: 평촌 어바인퍼스트 101동' })}
            {selectField('siteType', '현장 종류', SITE_TYPES)}
          </div>
          {textField('address', '주소')}
          {selectField('status', '상태', SITE_STATUSES)}
          <label className={LABEL}>
            메모
            <textarea
              value={fields.memo}
              onChange={(event) => set({ memo: event.target.value })}
              disabled={busy}
              className={`${INPUT} min-h-20 ${tone(changed('memo'))}`}
            />
          </label>
        </section>

        {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[#60717d]">고객 바꾸기·알림톡은 관리자 현장 목록에서</p>
          <div className="flex gap-2">
            <button type="button" onClick={close} disabled={saving} className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40">
              취소
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? '저장하는 중…' : '저장'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
