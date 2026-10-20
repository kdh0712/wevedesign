'use client';

import { ArrowLeft, Camera, ChevronRight, MapPin, Phone, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { sortSitesForList, type MobileOverview, type MobileSite } from '../../lib/mobile-overview';
import type { ProgressUpdateView } from '../../lib/site-progress';
import { errorText, formatReportDay, memoPreview } from '../progress-manager';
import { ActionTile, CallButton, Card, EmptyText, Notice, ProgressBar, SectionTitle, StatePill } from './mobile-ui';

const mapHref = (address: string) => `https://map.kakao.com/link/search/${encodeURIComponent(address)}`;
const shortDate = (date: string) => date.slice(5).replace('-', '/');

export function SitesTab({
  overview,
  selectedId,
  onSelect,
  onOpenReport,
  loadReports,
}: {
  overview: MobileOverview;
  selectedId: string | null;
  onSelect: (siteId: string | null) => void;
  onOpenReport?: (siteId: string) => void;
  loadReports: (siteId: string) => Promise<ProgressUpdateView[]>;
}) {
  const selected = selectedId ? overview.sites.find((site) => site.id === selectedId) : undefined;
  if (selected) return <SiteDetail site={selected} onBack={() => onSelect(null)} onOpenReport={onOpenReport} loadReports={loadReports} />;
  return <SiteList sites={overview.sites} onSelect={onSelect} />;
}

function SiteList({ sites, onSelect }: { sites: MobileSite[]; onSelect: (siteId: string) => void }) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (site: MobileSite) => {
      const text = `${site.title} ${site.customerName} ${site.address} ${site.status}`.toLowerCase();
      return words.every((word) => text.includes(word));
    };
    return sortSitesForList(sites.filter(matches));
  }, [sites, query]);

  return (
    <div className="space-y-3">
      <h1 className="text-[22px] font-bold text-[#171512]">현장</h1>
      <label className="flex h-11 items-center gap-2 rounded-xl border border-[#d8d1c5] bg-white px-3">
        <Search className="h-4 w-4 text-[#8b8276]" aria-hidden="true" />
        <span className="sr-only">현장 검색</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="현장, 고객, 주소"
          className="min-w-0 flex-1 bg-transparent text-base text-[#171512] outline-none placeholder:text-[#a59d90]"
        />
      </label>
      {shown.length === 0 ? (
        <EmptyText>{query ? '찾는 현장이 없어요.' : '진행 중인 현장이 없어요.'}</EmptyText>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#eadfcd] bg-white">
          {shown.map((site, index) => (
            <button
              key={site.id}
              type="button"
              onClick={() => onSelect(site.id)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left active:bg-[#faf6ef] ${index > 0 ? 'border-t border-[#f1ebe0]' : ''}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-[#171512]">{site.title}</span>
                <span className="block truncate text-xs text-[#625d54]">
                  {[site.status, site.customerName, site.schedule ? `${site.schedule.percent}%` : ''].filter(Boolean).join(' · ')}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#a59d90]" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SiteDetail({
  site,
  onBack,
  onOpenReport,
  loadReports,
}: {
  site: MobileSite;
  onBack: () => void;
  onOpenReport?: (siteId: string) => void;
  loadReports: (siteId: string) => Promise<ProgressUpdateView[]>;
}) {
  const [reports, setReports] = useState<ProgressUpdateView[] | null>(null);
  const [reportError, setReportError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setReports(null);
    setReportError('');
    loadReports(site.id)
      .then((updates) => alive && setReports(updates))
      .catch((error) => alive && setReportError(errorText(error, '최근 보고를 불러오지 못했습니다.')));
    return () => {
      alive = false;
    };
  }, [site.id, loadReports, attempt]);

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="-ml-1 flex h-10 items-center gap-1 pr-3 text-sm text-[#625d54]">
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        현장 목록
      </button>
      <div>
        <h1 className="text-[22px] font-bold leading-tight text-[#171512]">{site.title}</h1>
        <p className="mt-0.5 text-sm text-[#625d54]">{[site.address, site.status].filter(Boolean).join(' · ')}</p>
        {site.customerName && <p className="text-sm text-[#625d54]">고객 {site.customerName}</p>}
      </div>

      <div className="flex gap-2">
        {site.customerPhone && (
          <ActionTile icon={<Phone className="h-5 w-5" aria-hidden="true" />} label="고객 전화" href={`tel:${site.customerPhone.replace(/[^\d+]/g, '')}`} />
        )}
        {site.address && <ActionTile icon={<MapPin className="h-5 w-5" aria-hidden="true" />} label="길 안내" href={mapHref(site.address)} />}
        {onOpenReport && <ActionTile icon={<Camera className="h-5 w-5" aria-hidden="true" />} label="보고 쓰기" onClick={() => onOpenReport(site.id)} />}
      </div>

      {site.schedule ? (
        <>
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-bold text-[#171512]">전체 진행</span>
              <span className="font-bold text-[#171512]">{site.schedule.percent}%</span>
            </div>
            <ProgressBar percent={site.schedule.percent} />
            <p className="mt-2 text-xs text-[#625d54]">
              {shortDate(site.schedule.startDate)} ~ {shortDate(site.schedule.endDate)}
            </p>
          </Card>
          <SectionTitle>공정표</SectionTitle>
          <div className="overflow-hidden rounded-2xl border border-[#eadfcd] bg-white">
            {site.schedule.tasks.map((task, index) => (
              <div key={task.id} className={`flex min-h-[52px] items-center gap-3 px-4 py-2 ${index > 0 ? 'border-t border-[#f1ebe0]' : ''}`}>
                <StatePill state={task.state} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[#171512]">
                    {task.name}
                    {task.state === 'delayed' || task.state === 'active' ? ` · ${task.percent}%` : ''}
                  </span>
                  <span className="block truncate text-xs text-[#8b8276]">
                    {shortDate(task.startDate)}~{shortDate(task.endDate)}
                    {task.vendorName ? ` · ${task.vendorName}` : ''}
                  </span>
                </span>
                <CallButton phone={task.vendorPhone} label={`${task.vendorName || '거래처'} 전화`} small />
              </div>
            ))}
          </div>
        </>
      ) : (
        <EmptyText>견적에 공정표가 없어요.</EmptyText>
      )}

      <SectionTitle>최근 보고</SectionTitle>
      {reportError ? (
        <Notice onRetry={() => setAttempt((value) => value + 1)}>{reportError}</Notice>
      ) : reports === null ? (
        <p className="px-1 text-sm text-[#8b8276]">불러오는 중…</p>
      ) : reports.length === 0 ? (
        <EmptyText>아직 올린 보고가 없어요.</EmptyText>
      ) : (
        reports.slice(0, 3).map((report) => {
          const photo = report.photos.find((item) => item.url);
          return (
            <Card key={report._id}>
              <div className="flex gap-3">
                {photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" loading="lazy" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[#8b8276]">
                    {formatReportDay(report.reportDate)}
                    {report.designer ? ` · ${report.designer}` : ''}
                    {report.photos.length > 0 ? ` · 사진 ${report.photos.length}` : ''}
                  </p>
                  <p className="mt-0.5 text-sm text-[#171512]">{memoPreview(report.workDetail, 60) || '내용 없음'}</p>
                </div>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
