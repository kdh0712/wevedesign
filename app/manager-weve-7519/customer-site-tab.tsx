'use client';

// The merged 고객·현장 tab: the site list (by site or by customer) on the right, the new-site / site form on the left.
// Spec: docs/superpowers/specs/2026-11-21-customer-site-merge-design.md
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { countSitesByCustomer, customerDeleteBlockedMessage, groupSitesByCustomer, pickSitesToSync, siteMatchesQuery } from '../lib/customer-match';
import { CustomerEditDialog } from './customer-edit-dialog';
import type { NewCustomerFields } from './customer-picker';
import { CustomerSiteForm, type SaveOfficeRecord, type SiteFormPrefill } from './customer-site-form';
import type { Customer, Site } from './office-types';
import { Panel, SITE_STATUSES, statusBadgeClass } from './office-ui';

export type ConsultationDraft = { consultationId: string; name: string; phone: string; siteType: string; address: string; memo: string };

type Selection = { mode: 'new'; key: number } | { mode: 'edit'; siteId: string };
type ListView = 'sites' | 'customers';

const VIEW_STORAGE_KEY = 'weve-customer-site-view';
const LEAVE_CONFIRM = '저장하지 않은 변경이 있습니다. 버리고 넘어갈까요?';

const chip = (active: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-semibold ${active ? 'border-[#273541] bg-[#273541] text-white' : 'border-[#d5dde2] bg-white text-[#4d5d66] hover:bg-[#f7fafb]'}`;
const secondaryButton = 'rounded-md border border-[#d5dde2] bg-white px-3 py-1 text-xs font-semibold text-[#273541] hover:bg-[#f7fafb] disabled:opacity-50';

function RowMenu({ open, onToggle, onDelete, label }: { open: boolean; onToggle: () => void; onDelete: () => void; label: string }) {
  return (
    <span className="relative">
      <button type="button" onClick={onToggle} aria-label={`${label} 메뉴`} aria-expanded={open} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#d5dde2] bg-white text-[#4d5d66] hover:bg-[#f7fafb]">
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <span className="absolute right-0 top-8 z-10 grid min-w-28 rounded-md border border-[#d5dde2] bg-white p-1 shadow-lg">
          <button type="button" onClick={onDelete} className="rounded px-3 py-1.5 text-left text-xs font-semibold text-[#b42318] hover:bg-[#fdf2f2]">
            삭제
          </button>
        </span>
      )}
    </span>
  );
}

export function CustomerSiteTab({
  customers,
  sites,
  canSeeSiteExtras,
  saving,
  saveOfficeRecord,
  deleteOfficeRecord,
  syncCustomerToSites,
  renderSiteExtras,
  onOpenContractAlimtalk,
  onOpenEstimate,
  consultationDraft,
  onConsultationDraftUsed,
  onConsultationRegistered,
  setStatus,
  setError,
}: {
  customers: Customer[];
  sites: Site[];
  canSeeSiteExtras: boolean;
  saving: boolean;
  saveOfficeRecord: SaveOfficeRecord;
  deleteOfficeRecord: (id: string, type: 'customer' | 'site') => Promise<void>;
  syncCustomerToSites: (customerId: string, previousPhone: string) => Promise<number | null>;
  renderSiteExtras: (siteId: string) => ReactNode;
  onOpenContractAlimtalk: (site: Site) => void;
  onOpenEstimate?: (siteId: string) => void;
  consultationDraft: ConsultationDraft | null;
  onConsultationDraftUsed: () => void;
  onConsultationRegistered: (consultationId: string) => Promise<void>;
  setStatus: (text: string) => void;
  setError: (text: string) => void;
}) {
  const [view, setView] = useState<ListView>('sites');
  const [status, setStatusFilter] = useState('');
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<Selection>({ mode: 'new', key: 0 });
  const [prefill, setPrefill] = useState<SiteFormPrefill | null>(null);
  const [lastSaved, setLastSaved] = useState<{ siteId: string; title: string } | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<{ customer: Customer; openSite?: { site: Site; separatePhone: boolean } } | null>(null);
  const [openMenu, setOpenMenu] = useState('');
  const dirtyRef = useRef(false);
  const onDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  // The list view and the status chip are remembered per browser; the page works the same without them.
  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(VIEW_STORAGE_KEY) || '{}') as { view?: unknown; status?: unknown };
      if (stored.view === 'sites' || stored.view === 'customers') setView(stored.view);
      if (typeof stored.status === 'string' && (stored.status === '' || SITE_STATUSES.includes(stored.status))) setStatusFilter(stored.status);
    } catch {
      // No stored view.
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify({ view, status }));
    } catch {
      // Storage may be blocked; the choice just is not remembered.
    }
  }, [view, status]);

  const siteCounts = useMemo(() => countSitesByCustomer(sites), [sites]);
  const selectedSite = selection.mode === 'edit' ? sites.find((site) => site._id === selection.siteId) : undefined;

  const requestSelect = (next: Selection) => {
    if (dirtyRef.current && !window.confirm(LEAVE_CONFIRM)) return false;
    dirtyRef.current = false;
    setSelection(next);
    setLastSaved(null);
    setOpenMenu('');
    return true;
  };
  const startNew = (nextPrefill: SiteFormPrefill | null = null) => {
    if (requestSelect({ mode: 'new', key: Date.now() })) setPrefill(nextPrefill);
  };
  const openSite = (siteId: string) => {
    if (requestSelect({ mode: 'edit', siteId })) setPrefill(null);
  };

  // A consultation sent here ("고객·현장 등록") opens a new-site form filled from it.
  useEffect(() => {
    if (!consultationDraft) return;
    onConsultationDraftUsed();
    startNew(buildConsultationPrefill(consultationDraft, customers));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultationDraft]);

  // A site that left the list (deleted, or moved past the loaded 200) closes its form.
  useEffect(() => {
    if (selection.mode === 'edit' && !selectedSite) setSelection({ mode: 'new', key: Date.now() });
  }, [selection, selectedSite]);

  const onSaved = async (saved: { siteId: string; title: string; mode: 'new' | 'edit'; consultationId?: string }) => {
    dirtyRef.current = false;
    if (saved.consultationId) {
      await onConsultationRegistered(saved.consultationId);
      setStatus('고객과 현장을 등록하고 상담을 완료했습니다.');
    } else {
      setStatus(saved.mode === 'new' ? '현장을 저장했습니다.' : '현장 정보를 저장했습니다.');
    }
    if (saved.mode === 'new') {
      setPrefill(null);
      setSelection({ mode: 'new', key: Date.now() });
      setLastSaved({ siteId: saved.siteId, title: saved.title });
    }
  };

  const saveCustomer = async (fields: NewCustomerFields) => {
    if (!editingCustomer || saving) return;
    const { customer, openSite: open } = editingCustomer;
    const previousPhone = customer.phone || '';
    const saved = await saveOfficeRecord('customer', fields, customer._id);
    if (!saved) return;
    // The open site follows the customer (its own number stays when it has one).
    if (open) {
      const siteSaved = await saveOfficeRecord('site', { customerName: fields.name, ...(open.separatePhone ? {} : { customerPhone: fields.phone }) }, open.site._id);
      if (!siteSaved) return;
    }
    setEditingCustomer(null);
    const others = pickSitesToSync(sites, customer._id, previousPhone).filter((site) => site._id !== open?.site._id);
    if (others.length > 0 && window.confirm(`${fields.name}님의 다른 현장 ${others.length}곳에도 바꿀까요?`)) {
      const updated = await syncCustomerToSites(customer._id, previousPhone);
      if (updated !== null) setStatus(`고객 정보를 저장하고 다른 현장 ${updated}곳에도 반영했습니다.`);
      return;
    }
    setStatus('고객 정보를 저장했습니다.');
  };

  const deleteCustomer = (customer: Customer) => {
    setOpenMenu('');
    const blocked = customerDeleteBlockedMessage(siteCounts.get(customer._id) || 0, 0);
    if (blocked) {
      setError(blocked);
      return;
    }
    void deleteOfficeRecord(customer._id, 'customer');
  };
  const deleteSite = (site: Site) => {
    setOpenMenu('');
    void deleteOfficeRecord(site._id, 'site');
  };

  const filteredSites = useMemo(() => sites.filter((site) => (!status || site.status === status) && siteMatchesQuery(site, query)), [sites, status, query]);
  const groups = useMemo(() => groupSitesByCustomer({ customers, sites, query, status }), [customers, sites, query, status]);

  const siteRow = (site: Site, showCustomer: boolean) => {
    const selected = selection.mode === 'edit' && selection.siteId === site._id;
    return (
      <li key={site._id} className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 ${selected ? 'border-[#273541] bg-[#f3f6f8]' : 'border-[#e3e8eb] bg-white'}`}>
        <button type="button" onClick={() => openSite(site._id)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-semibold text-[#171512]">
            {site.title || '현장명 없음'}
            {showCustomer && <span className="font-normal text-[#4d5d66]"> · {site.customerName || '고객명 없음'} · {site.customerPhone || '연락처 없음'}</span>}
          </span>
          <span className="mt-0.5 block truncate text-xs text-[#60717d]">{[site.siteType, site.address].filter(Boolean).join(' · ') || '주소 없음'}</span>
        </button>
        <span className="flex shrink-0 items-center gap-2">
          <span className={`inline-flex min-w-16 justify-center rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClass(site.status || '상담중')}`}>{site.status || '상담중'}</span>
          <button type="button" onClick={() => openSite(site._id)} className={secondaryButton}>
            수정
          </button>
          <RowMenu label={site.title || '현장'} open={openMenu === site._id} onToggle={() => setOpenMenu(openMenu === site._id ? '' : site._id)} onDelete={() => deleteSite(site)} />
        </span>
      </li>
    );
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr] xl:items-start">
      <Panel title={selection.mode === 'edit' ? '현장 보기·수정' : '새 현장 등록'}>
        {lastSaved && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#b7dfc6] bg-[#eef8f1] px-3 py-2 text-sm text-[#1f5f36]">
            <span>‘{lastSaved.title}’ 현장을 저장했습니다.</span>
            <span className="flex gap-2">
              {onOpenEstimate && (
                <button type="button" onClick={() => onOpenEstimate(lastSaved.siteId)} className="rounded-md bg-[#273541] px-3 py-1 text-xs font-semibold text-white">
                  견적 작성하기
                </button>
              )}
              <button type="button" onClick={() => openSite(lastSaved.siteId)} className={secondaryButton}>
                현장 열기
              </button>
            </span>
          </div>
        )}
        <CustomerSiteForm
          key={selection.mode === 'edit' ? `edit-${selection.siteId}` : `new-${selection.key}`}
          mode={selection.mode === 'edit' && selectedSite ? 'edit' : 'new'}
          site={selectedSite}
          customers={customers}
          sites={sites}
          siteCounts={siteCounts}
          saving={saving}
          canSeeSiteExtras={canSeeSiteExtras}
          prefill={selection.mode === 'new' ? prefill : null}
          saveOfficeRecord={saveOfficeRecord}
          renderSiteExtras={renderSiteExtras}
          onOpenContractAlimtalk={onOpenContractAlimtalk}
          onEditCustomer={(customer, open) => setEditingCustomer({ customer, openSite: open })}
          onSelectSite={openSite}
          onDirtyChange={onDirtyChange}
          onSaved={(saved) => void onSaved(saved)}
          setError={setError}
        />
      </Panel>

      <Panel title="현장 목록">
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="현장명·고객명·연락처·주소"
              aria-label="현장 검색"
              className="min-w-48 flex-1 rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm outline-none focus:border-[#273541]"
            />
            <span className="inline-flex overflow-hidden rounded-md border border-[#d5dde2]" role="group" aria-label="보기 방식">
              {(['sites', 'customers'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView(key)}
                  aria-pressed={view === key}
                  className={`px-3 py-2 text-xs font-semibold ${view === key ? 'bg-[#273541] text-white' : 'bg-white text-[#4d5d66] hover:bg-[#f7fafb]'}`}
                >
                  {key === 'sites' ? '현장별' : '고객별'}
                </button>
              ))}
            </span>
            <button type="button" onClick={() => startNew()} className="rounded-md bg-[#273541] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1d2833]">
              + 새 현장
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="상태">
            {['', ...SITE_STATUSES].map((value) => (
              <button key={value || 'all'} type="button" onClick={() => setStatusFilter(value)} aria-pressed={status === value} className={chip(status === value)}>
                {value || '전체'}
              </button>
            ))}
          </div>

          {view === 'sites' ? (
            filteredSites.length === 0 ? (
              <p className="rounded-md border border-dashed border-[#d5dde2] px-3 py-6 text-center text-sm text-[#60717d]">
                {sites.length === 0 ? '등록된 현장이 없습니다.' : '조건에 맞는 현장이 없습니다.'}
              </p>
            ) : (
              <ul className="grid gap-2">{filteredSites.map((site) => siteRow(site, true))}</ul>
            )
          ) : groups.length === 0 ? (
            <p className="rounded-md border border-dashed border-[#d5dde2] px-3 py-6 text-center text-sm text-[#60717d]">조건에 맞는 고객이 없습니다.</p>
          ) : (
            <ul className="grid gap-3">
              {groups.map((group) => (
                <li key={group.customer?._id || 'unlinked'} className="grid gap-2 rounded-lg border border-[#d5dde2] p-3">
                  {group.customer ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm">
                        <span className="font-semibold text-[#171512]">{group.customer.name || '이름 없음'}</span>
                        <span className="text-[#60717d]">
                          {' '}
                          · {group.customer.phone || '연락처 없음'} · {(siteCounts.get(group.customer._id) || 0) > 0 ? `현장 ${siteCounts.get(group.customer._id)}곳` : '현장 없음'}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        {group.customer.chatRoomUrl && (
                          <a href={group.customer.chatRoomUrl} target="_blank" rel="noreferrer" className={secondaryButton}>
                            채팅방
                          </a>
                        )}
                        <button type="button" onClick={() => group.customer && setEditingCustomer({ customer: group.customer })} className={secondaryButton}>
                          고객 정보 고치기
                        </button>
                        <RowMenu
                          label={group.customer.name || '고객'}
                          open={openMenu === `customer-${group.customer._id}`}
                          onToggle={() => setOpenMenu(openMenu === `customer-${group.customer?._id}` ? '' : `customer-${group.customer?._id}`)}
                          onDelete={() => group.customer && deleteCustomer(group.customer)}
                        />
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-[#4d5d66]">고객 연결 없음</p>
                  )}
                  {group.sites.length > 0 && <ul className="grid gap-2">{group.sites.map((site) => siteRow(site, false))}</ul>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      {editingCustomer && (
        <CustomerEditDialog customer={editingCustomer.customer} saving={saving} onClose={() => setEditingCustomer(null)} onSave={(fields) => void saveCustomer(fields)} />
      )}
    </div>
  );
}

// Task 7 fills this in; until then a draft opens an empty new-site form.
function buildConsultationPrefill(draft: ConsultationDraft, customers: readonly Customer[]): SiteFormPrefill | null {
  void draft;
  void customers;
  return null;
}
