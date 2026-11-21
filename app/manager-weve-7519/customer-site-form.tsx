'use client';

// The left side of the 고객·현장 tab: a new site, or one site being edited. A site is saved with the customer it is linked to;
// saving never looks the customer up again by name or number (spec 2026-11-21-customer-site-merge-design.md §4.2–4.3).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  customerEditTouchesOpenSite,
  isSeparatePhone,
  isSiteFormDirty,
  separatePhoneAfterPick,
  suggestLinkForUnlinkedSite,
  type SiteFormValues,
} from '../lib/customer-match';
import { CustomerPicker, unconfirmedSamePhone, type PickedCustomer } from './customer-picker';
import type { Customer, Site } from './office-types';
import { SITE_STATUSES, SITE_TYPES, formatPhoneNumber, shortDate, statusBadgeClass } from './office-ui';

export type SaveOfficeRecord = (type: 'customer' | 'site', data: Record<string, unknown>, id?: string) => Promise<{ _id?: string } | null>;

type SiteFields = Omit<SiteFormValues, 'customerId'>;

const input = 'w-full rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm outline-none focus:border-[#273541]';
const label = 'grid gap-1 text-xs font-semibold text-[#4d5d66]';
const secondaryButton = 'rounded-md border border-[#d5dde2] bg-white px-3 py-1.5 text-xs font-semibold text-[#273541] hover:bg-[#f7fafb] disabled:opacity-50';

const NEW_CUSTOMER_ID = '__new__';
const customerIdOf = (picked: PickedCustomer | null) => (picked?.kind === 'existing' ? picked.customer._id : picked?.kind === 'new' ? NEW_CUSTOMER_ID : '');

function initialFields(site: Site | undefined, linked: Customer | undefined): SiteFields {
  return {
    title: site?.title || '',
    siteType: site?.siteType || '아파트',
    address: site?.address || '',
    status: site?.status || '상담중',
    memo: site?.memo || '',
    separatePhone: site && linked ? isSeparatePhone(site.customerPhone, linked.phone) : false,
    sitePhone: site?.customerPhone || '',
  };
}

export type SiteFormPrefill = { picked: PickedCustomer | null; fields: Partial<SiteFields>; notice?: string; consultationId?: string };

export function CustomerSiteForm({
  mode,
  site,
  customers,
  sites,
  siteCounts,
  saving,
  canSeeSiteExtras,
  prefill,
  saveOfficeRecord,
  renderSiteExtras,
  onOpenContractAlimtalk,
  onEditCustomer,
  onSelectSite,
  onDirtyChange,
  onSaved,
  setError,
}: {
  mode: 'new' | 'edit';
  site?: Site;
  customers: Customer[];
  sites: Site[];
  siteCounts: ReadonlyMap<string, number>;
  saving: boolean;
  canSeeSiteExtras: boolean;
  prefill?: SiteFormPrefill | null;
  saveOfficeRecord: SaveOfficeRecord;
  renderSiteExtras: (siteId: string) => ReactNode;
  onOpenContractAlimtalk: (site: Site) => void;
  onEditCustomer: (customer: Customer, openSite?: { site: Site; separatePhone: boolean }) => void;
  onSelectSite: (siteId: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (saved: { siteId: string; title: string; mode: 'new' | 'edit'; consultationId?: string }) => void;
  setError: (text: string) => void;
}) {
  const linkedAtOpen = site?.customerId ? customers.find((customer) => customer._id === site.customerId) : undefined;
  const [picked, setPicked] = useState<PickedCustomer | null>(() =>
    mode === 'edit' ? (linkedAtOpen ? { kind: 'existing', customer: linkedAtOpen } : null) : prefill?.picked ?? null,
  );
  const [fields, setFields] = useState<SiteFields>(() => ({ ...initialFields(site, linkedAtOpen), ...(mode === 'new' ? prefill?.fields : {}) }));
  // What the form started from, to tell whether anything changed: the site as saved, or a new form with its prefill.
  const [baseline, setBaseline] = useState<SiteFormValues>(() =>
    mode === 'edit'
      ? { ...initialFields(site, linkedAtOpen), customerId: linkedAtOpen?._id || '' }
      : { ...initialFields(undefined, undefined), ...prefill?.fields, customerId: customerIdOf(prefill?.picked ?? null) },
  );
  const [choosingCustomer, setChoosingCustomer] = useState(false);
  const separateAtOpen = useRef(Boolean(site && linkedAtOpen && isSeparatePhone(site.customerPhone, linkedAtOpen.phone)));
  const savingRef = useRef(false);
  // The customer before "다른 고객으로 바꾸기", restored by [취소].
  const beforeChoosing = useRef<PickedCustomer | null>(null);
  const startChoosing = () => {
    beforeChoosing.current = picked;
    setPicked(null);
    setChoosingCustomer(true);
  };
  const cancelChoosing = () => {
    setPicked(beforeChoosing.current);
    setChoosingCustomer(false);
  };

  // The picked customer as it is now (a customer edit reloads the list).
  const customer = picked?.kind === 'existing' ? customers.find((item) => item._id === picked.customer._id) ?? picked.customer : undefined;
  const current: SiteFormValues = { ...fields, customerId: customerIdOf(picked) };
  // A form opened from a consultation holds an unsaved registration even before anything is typed.
  const dirty = isSiteFormDirty(baseline, current) || (mode === 'new' && Boolean(prefill?.consultationId));
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const otherSites = useMemo(
    // The office list holds no trashed sites.
    () => (customer && site ? sites.filter((item) => item.customerId === customer._id && item._id !== site._id) : []),
    [customer, site, sites],
  );
  const suggestion = mode === 'edit' && site && !picked ? suggestLinkForUnlinkedSite(site, customers) : undefined;

  const set = (patch: Partial<SiteFields>) => setFields((value) => ({ ...value, ...patch }));

  const pick = (value: PickedCustomer | null) => {
    setPicked(value);
    if (value?.kind === 'existing') setChoosingCustomer(false);
    // A site keeps its own number only when it has one and it is not the picked customer's; a new customer takes it over.
    if (site && value) {
      set({
        separatePhone: separatePhoneAfterPick(site.customerPhone, value.kind === 'existing' ? value.customer.phone || '' : null),
        sitePhone: site.customerPhone || '',
      });
    }
  };

  // A new customer is saved first; its id links the site. Returns null when it could not be saved (the page shows why).
  const resolveCustomer = async (): Promise<{ customer: Customer; created: boolean } | null> => {
    if (picked?.kind === 'existing') return { customer: customer ?? picked.customer, created: false };
    if (picked?.kind !== 'new') return null;
    const name = picked.name.trim();
    if (!name) {
      setError('새 고객의 이름을 입력해 주세요.');
      return null;
    }
    const samePhone = unconfirmedSamePhone(picked, customers);
    if (samePhone.length > 0 && !window.confirm(`같은 번호의 고객 ${samePhone[0].name || '이름 없음'}님이 있습니다. 그래도 새 고객으로 등록할까요?`)) return null;
    const fieldsToSave = { name, phone: picked.phone.trim(), chatRoomUrl: picked.chatRoomUrl.trim(), memo: picked.memo.trim() };
    const saved = await saveOfficeRecord('customer', fieldsToSave);
    if (!saved?._id) return null;
    return { customer: { _id: saved._id, ...fieldsToSave }, created: true };
  };

  const submit = async () => {
    if (savingRef.current || saving) return;
    if (!fields.title.trim()) {
      setError('현장명을 입력해 주세요.');
      return;
    }
    if (mode === 'new' && !picked) {
      setError('고객을 고르거나 새 고객으로 등록해 주세요.');
      return;
    }

    savingRef.current = true;
    try {
      const resolved = picked ? await resolveCustomer() : null;
      if (picked && !resolved) return;
      const linked = resolved?.customer;

      const data: Record<string, unknown> = {
        title: fields.title.trim(),
        siteType: fields.siteType,
        address: fields.address.trim(),
        status: fields.status,
        memo: fields.memo.trim(),
      };
      if (linked) {
        data.customerId = linked._id;
        data.customerName = linked.name || '';
        data.customerPhone = mode === 'edit' && fields.separatePhone ? fields.sitePhone.trim() : linked.phone || '';
      }
      if (mode === 'new' && prefill?.consultationId) data.consultationId = prefill.consultationId;

      const saved = await saveOfficeRecord('site', data, mode === 'edit' ? site?._id : undefined);
      if (!saved?._id) {
        if (resolved?.created && linked) {
          // The customer exists now: keep it picked so saving again does not register them twice.
          setPicked({ kind: 'existing', customer: linked });
          setError(`현장을 저장하지 못했습니다. 고객 ${linked.name || ''}님은 등록됐으니 다시 저장해 주세요.`);
        }
        return;
      }

      if (linked) setPicked({ kind: 'existing', customer: linked });
      setChoosingCustomer(false);
      setBaseline({ ...fields, customerId: linked?._id || baseline.customerId });
      onSaved({ siteId: saved._id, title: fields.title.trim(), mode, consultationId: mode === 'new' ? prefill?.consultationId : undefined });
    } finally {
      savingRef.current = false;
    }
  };

  const busy = saving;

  return (
    <div className="grid gap-5">
      {mode === 'edit' && site && (
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-[#171512]">{site.title || '현장명 없음'}</h3>
          <span className={`inline-flex min-w-20 justify-center rounded-full px-3 py-1 text-xs font-bold ${statusBadgeClass(site.status || '상담중')}`}>
            {site.status || '상담중'}
          </span>
        </div>
      )}
      {mode === 'new' && prefill?.notice && <p className="rounded-md border border-[#e2c06d] bg-[#fff8e6] px-3 py-2 text-sm text-[#5c4614]">{prefill.notice}</p>}

      <section className="grid gap-3" aria-label="고객">
        <p className="text-sm font-bold text-[#273541]">고객</p>
        {mode === 'edit' && customer && !choosingCustomer ? (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#d5dde2] bg-[#f7fafb] px-3 py-2.5 text-sm">
              <span>
                <span className="font-semibold text-[#171512]">{customer.name || '이름 없음'}</span>
                <span className="text-[#60717d]"> · {customer.phone || '연락처 없음'}</span>
              </span>
              <span className="flex flex-wrap gap-2">
                {customer.chatRoomUrl && (
                  <a href={customer.chatRoomUrl} target="_blank" rel="noreferrer" className={secondaryButton}>
                    채팅방
                  </a>
                )}
                <button
                  type="button"
                  onClick={() =>
                    onEditCustomer(
                      customer,
                      // The open site follows only when it is saved with this customer (not a customer picked but unsaved).
                      site && customerEditTouchesOpenSite(baseline.customerId, customer._id) ? { site, separatePhone: fields.separatePhone } : undefined,
                    )
                  }
                  disabled={busy}
                  className={secondaryButton}
                >
                  고객 정보 고치기
                </button>
              </span>
            </div>
            {otherSites.length > 0 && (
              <p className="text-sm text-[#60717d]">
                이 고객의 다른 현장:{' '}
                {otherSites.map((item, index) => (
                  <span key={item._id}>
                    {index > 0 && ', '}
                    <button type="button" onClick={() => onSelectSite(item._id)} className="font-semibold text-[#273541] underline underline-offset-2">
                      {item.title || '현장명 없음'}
                    </button>
                    {item.status ? ` (${item.status})` : ''}
                  </span>
                ))}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={startChoosing} disabled={busy} className={secondaryButton}>
                다른 고객으로 바꾸기
              </button>
              {site && (
                <button type="button" onClick={() => onOpenContractAlimtalk(site)} disabled={busy} className="rounded-md border border-[#e2c06d] bg-[#fff8e6] px-3 py-1.5 text-xs font-semibold text-[#5c4614] disabled:opacity-50">
                  {site.contractAlimtalkSentAt ? `계약 완료 안내 ${shortDate(site.contractAlimtalkSentAt)} 전송 완료` : '계약 완료 안내 알림톡'}
                </button>
              )}
            </div>
          </div>
        ) : mode === 'edit' && !picked && !choosingCustomer ? (
          <div className="grid gap-2 rounded-md border border-dashed border-[#d5dde2] px-3 py-3 text-sm">
            <p className="font-semibold text-[#171512]">연결된 고객 없음</p>
            {suggestion && (
              <div className="flex flex-wrap items-center gap-2 text-[#4d5d66]">
                <span>
                  같은 번호의 고객 {suggestion.name || '이름 없음'}님과 연결할까요?
                </span>
                <button type="button" onClick={() => pick({ kind: 'existing', customer: suggestion })} disabled={busy} className={secondaryButton}>
                  연결
                </button>
              </div>
            )}
            <button type="button" onClick={startChoosing} disabled={busy} className={`${secondaryButton} justify-self-start`}>
              고객 고르기
            </button>
          </div>
        ) : (
          <CustomerPicker
            customers={customers}
            siteCounts={siteCounts}
            value={picked}
            onChange={pick}
            disabled={busy}
            onCancel={mode === 'edit' && choosingCustomer ? cancelChoosing : undefined}
          />
        )}
      </section>

      <section className="grid gap-3" aria-label="현장">
        <p className="text-sm font-bold text-[#273541]">현장</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            현장명 *
            <input className={input} value={fields.title} onChange={(event) => set({ title: event.target.value })} placeholder="예: 평촌 어바인퍼스트 101동" disabled={busy} />
          </label>
          <label className={label}>
            현장 종류
            <select className={input} value={fields.siteType} onChange={(event) => set({ siteType: event.target.value })} disabled={busy}>
              {(SITE_TYPES.includes(fields.siteType) ? SITE_TYPES : [...SITE_TYPES, fields.siteType]).map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={label}>
          주소
          <input className={input} value={fields.address} onChange={(event) => set({ address: event.target.value })} disabled={busy} />
        </label>
        <label className={label}>
          상태
          <select className={input} value={fields.status} onChange={(event) => set({ status: event.target.value })} disabled={busy}>
            {(SITE_STATUSES.includes(fields.status) ? SITE_STATUSES : [...SITE_STATUSES, fields.status]).map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          메모
          <textarea className={`${input} min-h-20`} value={fields.memo} onChange={(event) => set({ memo: event.target.value })} disabled={busy} />
        </label>
        {mode === 'edit' && customer && (
          <div className="grid gap-2">
            <label className="flex items-center gap-2 text-sm text-[#273541]">
              <input
                type="checkbox"
                checked={fields.separatePhone}
                onChange={(event) => set({ separatePhone: event.target.checked })}
                disabled={busy}
              />
              이 현장은 다른 번호로 연락
            </label>
            {fields.separatePhone && (
              <input
                className={input}
                inputMode="tel"
                aria-label="이 현장 연락처"
                value={fields.sitePhone}
                onChange={(event) => set({ sitePhone: formatPhoneNumber(event.target.value) })}
                disabled={busy}
              />
            )}
            {separateAtOpen.current && fields.separatePhone && picked?.kind === 'existing' && picked.customer._id === linkedAtOpen?._id && (
              <p className="flex flex-wrap items-center gap-2 text-xs text-[#4d5d66]">
                연결된 고객 {customer.name || '이름 없음'}({customer.phone || '연락처 없음'})과 번호가 다릅니다. 다른 사람이면
                <button type="button" onClick={startChoosing} disabled={busy} className={secondaryButton}>
                  다른 고객으로 바꾸기
                </button>
              </p>
            )}
            <p className="text-xs text-[#60717d]">고객 진행 현황의 본인 확인과 알림톡은 이 현장 번호를 먼저 씁니다.</p>
          </div>
        )}
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => void submit()} disabled={busy} className="rounded-md bg-[#273541] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1d2833] disabled:opacity-50">
          {mode === 'edit' ? '수정 저장' : '저장'}
        </button>
      </div>

      {mode === 'edit' && site && canSeeSiteExtras && renderSiteExtras(site._id)}
    </div>
  );
}
