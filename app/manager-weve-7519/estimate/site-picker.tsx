'use client';

// The 견적 작업 site picker: a button with the current site that opens the 현장 폴더 list (전체 · 진행중 · 미체결 · 완료 ·
// 지역별) and a search, instead of one long dropdown where finished sites mix with running ones. It opens on 진행중 the
// first time; the folder and whether 지역별 is open are remembered per browser.
import { ChevronDown, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { siteMatchesQuery } from '../../lib/customer-match';
import { countSiteFolders, resolveSiteFolder, siteInFolder, type SiteFolder } from '../../lib/site-folders';
import { statusBadgeClass } from '../office-ui';
import { SiteFolderNav } from '../site-folder-nav';

export type PickerSite = { _id: string; title?: string; customerName?: string; customerPhone?: string; address?: string; status?: string };

const STORAGE_KEY = 'weve-estimate-site-picker';

function readStored(): { folder: SiteFolder; regionsOpen: boolean } {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') as { folder?: unknown; regionsOpen?: unknown };
    return {
      folder: typeof stored.folder === 'string' ? stored.folder : '진행중',
      regionsOpen: typeof stored.regionsOpen === 'boolean' ? stored.regionsOpen : true,
    };
  } catch {
    return { folder: '진행중', regionsOpen: true };
  }
}

export function EstimateSitePicker({
  sites,
  selectedSiteId,
  disabled,
  onPick,
}: {
  sites: readonly PickerSite[];
  selectedSiteId: string;
  disabled: boolean;
  onPick: (siteId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [folder, setFolder] = useState<SiteFolder>('진행중');
  const [regionsOpen, setRegionsOpen] = useState(true);
  const [query, setQuery] = useState('');
  const loadedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = sites.find((site) => site._id === selectedSiteId);
  const counts = useMemo(() => countSiteFolders(sites), [sites]);
  const activeFolder = resolveSiteFolder(folder, counts, sites.length > 0);
  const shown = useMemo(
    () => sites.filter((site) => siteInFolder(site, activeFolder) && siteMatchesQuery(site, query)),
    [sites, activeFolder, query],
  );

  // The remembered folder is read when the picker first opens (the page renders in the browser after login).
  useEffect(() => {
    if (!open) return;
    if (!loadedRef.current) {
      loadedRef.current = true;
      const stored = readStored();
      setFolder(stored.folder);
      setRegionsOpen(stored.regionsOpen);
    }
    searchRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ folder: activeFolder, regionsOpen }));
    } catch {
      // Storage may be blocked; the folder is just not remembered.
    }
  }, [activeFolder, regionsOpen]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex min-w-72 items-center justify-between gap-3 rounded-md border border-[#d5dde2] bg-white px-4 py-2.5 text-left font-semibold outline-none hover:bg-[#f7fafb] focus:border-[#38a9bd] disabled:opacity-60"
      >
        <span className="min-w-0 truncate">
          {selected ? `${selected.title || '현장명 없음'} · ${selected.customerName || '고객명 없음'}` : sites.length === 0 ? '등록 현장 없음' : '현장을 골라 주세요'}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[#38a9bd]">
          현장 바꾸기 <ChevronDown size={14} />
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="현장 고르기"
          className="absolute right-0 top-full z-50 mt-2 grid w-[min(760px,calc(100vw-32px))] gap-3 rounded-lg border border-[#d5dde2] bg-white p-3 text-left shadow-xl"
        >
          <label className="flex items-center gap-2 rounded-md border border-[#d5dde2] px-3 py-2 focus-within:border-[#38a9bd]">
            <Search size={15} className="text-[#60717d]" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="현장명·고객명·연락처·주소"
              aria-label="현장 찾기"
              className="min-w-0 flex-1 text-sm outline-none"
            />
          </label>
          <div className="grid gap-3 md:grid-cols-[150px_minmax(0,1fr)] md:items-start">
            <SiteFolderNav counts={counts} folder={activeFolder} onChange={setFolder} regionsOpen={regionsOpen} onToggleRegions={() => setRegionsOpen(!regionsOpen)} />
            <ul className="grid max-h-[60vh] gap-1.5 overflow-y-auto pr-1">
              {shown.length === 0 && (
                <li className="rounded-md border border-dashed border-[#d5dde2] px-3 py-6 text-center text-sm text-[#60717d]">
                  {sites.length === 0 ? '등록된 현장이 없습니다.' : '조건에 맞는 현장이 없습니다.'}
                </li>
              )}
              {shown.map((site) => {
                const isSelected = site._id === selectedSiteId;
                return (
                  <li key={site._id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        if (!isSelected) onPick(site._id);
                      }}
                      aria-current={isSelected ? 'true' : undefined}
                      className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left ${
                        isSelected ? 'border-[#273541] bg-[#f3f6f8]' : 'border-[#e3e8eb] bg-white hover:bg-[#f7fafb]'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-[#171512]">
                          {site.title || '현장명 없음'}
                          <span className="font-normal text-[#4d5d66]"> · {site.customerName || '고객명 없음'}</span>
                        </span>
                        <span className="block truncate text-xs text-[#60717d]">{site.address || '주소 없음'}</span>
                      </span>
                      <span className={`inline-flex shrink-0 justify-center rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClass(site.status || '상담중')}`}>
                        {site.status || '상담중'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
