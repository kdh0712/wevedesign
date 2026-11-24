'use client';

// The 현장 폴더 list (전체 · 진행중 · 미체결 · 완료 · 지역별) shared by the 고객·현장 tab and the 견적 작업 site picker.
// Spec: docs/superpowers/specs/2026-11-24-site-folders-design.md
import { SITE_STAGES, regionFolder, type SiteFolder, type SiteFolderCounts } from '../lib/site-folders';

// The 현장 폴더 (spec 2026-11-24-site-folders): 전체, 진행중 · 미체결 · 완료, then 지역별. A column beside the list on wider
// screens, a row of buttons above it on narrow ones. A chosen region stays in view while 지역별 is folded.
export function SiteFolderNav({
  counts,
  folder,
  onChange,
  regionsOpen,
  onToggleRegions,
}: {
  counts: SiteFolderCounts;
  folder: SiteFolder;
  onChange: (folder: SiteFolder) => void;
  regionsOpen: boolean;
  onToggleRegions: () => void;
}) {
  const item = (value: SiteFolder, label: string, count: number, nested = false) => {
    const active = folder === value;
    return (
      <button
        key={value || 'all'}
        type="button"
        onClick={() => onChange(value)}
        aria-pressed={active}
        className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm md:border-transparent ${nested ? 'md:pl-5' : ''} ${
          active ? 'border-[#273541] bg-[#273541] font-semibold text-white md:border-[#273541]' : 'border-[#d5dde2] bg-white text-[#273541] hover:bg-[#f7fafb]'
        }`}
      >
        <span className="truncate">{label}</span>
        <span className={`text-xs tabular-nums ${active ? 'text-white/80' : 'text-[#87949c]'}`}>{count}</span>
      </button>
    );
  };
  const regions = regionsOpen ? counts.regions : counts.regions.filter((region) => regionFolder(region.name) === folder);
  return (
    <nav aria-label="현장 폴더" className="flex flex-wrap gap-1 md:flex-col md:flex-nowrap md:rounded-lg md:border md:border-[#e3e8eb] md:bg-[#fbfcfc] md:p-1.5">
      {item('', '전체', counts.all)}
      {SITE_STAGES.map((stage) => item(stage, stage, counts.stages[stage]))}
      {counts.regions.length > 0 && (
        <>
          <button
            type="button"
            onClick={onToggleRegions}
            aria-expanded={regionsOpen}
            className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-left text-xs font-semibold text-[#60717d] hover:bg-[#f7fafb] md:mt-1 md:border-t md:border-[#e3e8eb] md:pt-2"
          >
            지역별 <span aria-hidden="true">{regionsOpen ? '▾' : '▸'}</span>
          </button>
          {regions.map((region) => item(regionFolder(region.name), region.name, region.count, true))}
        </>
      )}
    </nav>
  );
}
