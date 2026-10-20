'use client';

import { AlertTriangle, CalendarDays, ChevronRight, MessageCircle } from 'lucide-react';
import { koreanDateLabel, timeAgo, type MobileOverview, type MobileSite } from '../../lib/mobile-overview';
import { Card, EmptyText, InstallGuide, ProgressBar, SectionTitle } from './mobile-ui';

const todayWork = (site: MobileSite) =>
  (site.schedule?.tasks || []).filter((task) => task.state === 'active' || task.state === 'delayed').map((task) => task.name);

export function TodayTab({
  overview,
  userName,
  nowMs,
  onOpenSite,
  onOpenConsultations,
}: {
  overview: MobileOverview;
  userName: string;
  nowMs: number;
  onOpenSite: (siteId: string) => void;
  onOpenConsultations?: () => void;
}) {
  const byId = new Map(overview.sites.map((site) => [site.id, site]));
  const activeSites = overview.activeSiteIds.map((id) => byId.get(id)).filter((site): site is MobileSite => Boolean(site));
  const delayed = activeSites.flatMap((site) =>
    (site.schedule?.tasks || []).filter((task) => task.state === 'delayed').map((task) => ({ site, task })),
  );
  const newConsultations = (overview.consultations || []).filter((item) => item.status === '신규');
  const latest = newConsultations[0];

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm text-[#625d54]">{koreanDateLabel(overview.today)}</p>
        <h1 className="text-[22px] font-bold leading-tight text-[#171512]">
          {userName}님, 오늘 현장 {activeSites.length}곳
        </h1>
      </div>

      <InstallGuide />

      {onOpenConsultations && newConsultations.length > 0 && (
        <button
          type="button"
          onClick={onOpenConsultations}
          className="flex w-full items-center gap-3 rounded-2xl bg-[#171512] px-4 py-3 text-left text-[#fffdf8] active:opacity-90"
        >
          <MessageCircle className="h-5 w-5 shrink-0 text-[#f1c76a]" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block font-bold">새 상담 {newConsultations.length}건</span>
            {latest && (
              <span className="block truncate text-xs text-[#d8d1c5]">
                가장 최근 {timeAgo(latest.createdAt, nowMs)}
                {latest.region ? ` · ${latest.region}` : ''}
              </span>
            )}
          </span>
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      )}

      {delayed.length > 0 && (
        <div className="rounded-2xl border border-[#f3c9a6] bg-[#fff4ea] px-4 py-3 text-[#7c2d12]">
          <p className="flex items-center gap-2 font-bold">
            <AlertTriangle className="h-4 w-4 text-[#c2410c]" aria-hidden="true" />
            지연 {delayed.length}건
          </p>
          <ul className="mt-1 space-y-1 text-sm">
            {delayed.map(({ site, task }) => (
              <li key={`${site.id}-${task.id}`}>
                <button type="button" onClick={() => onOpenSite(site.id)} className="text-left underline-offset-2 active:underline">
                  {site.title} · {task.name} ({task.percent}%)
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <SectionTitle>진행 중 현장</SectionTitle>
      {activeSites.length === 0 ? (
        <EmptyText>오늘 진행 중인 현장이 없어요.</EmptyText>
      ) : (
        activeSites.map((site) => {
          const work = todayWork(site);
          return (
            <Card key={site.id} onClick={() => onOpenSite(site.id)}>
              <span className="flex items-center justify-between gap-3">
                <span className="truncate font-bold text-[#171512]">{site.title}</span>
                {site.schedule && <span className="shrink-0 text-sm text-[#625d54]">{site.schedule.percent}%</span>}
              </span>
              <span className="mb-2 mt-0.5 block truncate text-sm text-[#625d54]">
                {work.length > 0 ? `오늘: ${work.join(' · ')}` : site.schedule ? '오늘 예정된 공정 없음' : '공정표 없음'}
              </span>
              {site.schedule && <ProgressBar percent={site.schedule.percent} />}
            </Card>
          );
        })
      )}

      {overview.tomorrow.length > 0 && (
        <div className="space-y-1 px-1 text-sm text-[#625d54]">
          {overview.tomorrow.map((item) => (
            <p key={`${item.siteId}-${item.taskName}`} className="flex items-start gap-2">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                내일 시작: {item.taskName} ({item.siteTitle}){item.vendorName ? ` · ${item.vendorName}` : ''}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
