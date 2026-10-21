'use client';

import { LogOut, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import { visibleMobileTabs, type MobileConsultation, type MobileOverview, type MobileTab } from '../../lib/mobile-overview';
import type { CustomerEstimateView } from '../../lib/mobile-estimate';
import type { ProgressUpdateView } from '../../lib/site-progress';
import { createProgressApi } from '../progress-manager';
import { createSiteNotesApi } from '../site-notes-api';
import { ConsultationsTab, type ConsultationChange } from './consultations-tab';
import { LoginScreen } from './login-screen';
import {
  createBackGuard,
  freshScreen,
  LEAVE_REPORT_CONFIRM,
  openSiteFrom,
  REPORT_BUSY_NOTICE,
  reportLeaveDecision,
  selectSite,
} from './mobile-screen';
import {
  createMobileSession,
  MobileSessionError,
  sameSessionUser,
  sendWithSession,
  type ActiveSession,
  type KeyValueStorage,
  type MobileSession,
} from './mobile-session';
import { Notice, TabBar } from './mobile-ui';
import { ReportTab } from './report-tab';
import { ScheduleTab } from './schedule-tab';
import { SitesTab, type SiteView } from './sites-tab';
import { TodayTab } from './today-tab';

// The staff phone app (specs 2026-10-20-staff-mobile-app and 2026-10-21-staff-app-notes-schedule-estimate). One page, five tabs; the data
// comes from GET /api/manager/mobile/overview and is read again when the app comes back after 5 minutes or on pull-down.

const RELOAD_AFTER_MS = 5 * 60 * 1000;
const PULL_TRIGGER_PX = 70;
const NETWORK_ERROR = '연결이 불안정합니다.';
const SIGNED_OUT_NOTICE = '로그인이 끝났어요. 다시 로그인해 주세요.';

// localStorage can throw (private mode, blocked storage); the app then simply asks for a login each time.
const safeLocalStorage = (): KeyValueStorage => ({
  getItem: (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Not kept: the next app start asks for a login again.
    }
  },
  removeItem: (key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing stored to remove.
    }
  },
});

type Phase = 'starting' | 'login' | 'ready' | 'offline';

const newestFirst = (a: ProgressUpdateView, b: ProgressUpdateView) =>
  a.reportDate < b.reportDate ? 1 : a.reportDate > b.reportDate ? -1 : a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;

export default function StaffAppPage() {
  const [mobile, setMobile] = useState<MobileSession | null>(null);
  const [phase, setPhase] = useState<Phase>('starting');
  const [loginNotice, setLoginNotice] = useState('');
  const [startError, setStartError] = useState('');
  const [user, setUser] = useState<ActiveSession['user'] | null>(null);
  const [overview, setOverview] = useState<MobileOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(() => freshScreen().loadError);
  const [tab, setTab] = useState<MobileTab>(() => freshScreen().tab);
  const [siteId, setSiteId] = useState<string | null>(() => freshScreen().siteId);
  const [reportSiteId, setReportSiteId] = useState<string | null>(() => freshScreen().reportSiteId);
  const [reportDirty, setReportDirty] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [menuOpen, setMenuOpen] = useState(false);
  const [pull, setPull] = useState(0);
  const loadedAtRef = useRef(0);
  // The tab a site detail was opened from (오늘 or 일정), where the back button returns.
  const siteOriginRef = useRef<MobileTab | null>(null);
  const pullStartRef = useRef<number | null>(null);

  useEffect(() => setMobile(createMobileSession({ storage: safeLocalStorage() })), []);

  const signedOut = useCallback((notice = SIGNED_OUT_NOTICE) => {
    const screen = freshScreen();
    setUser(null);
    setOverview(null);
    setTab(screen.tab);
    setSiteId(screen.siteId);
    setReportSiteId(screen.reportSiteId);
    setLoadError(screen.loadError);
    setReportDirty(false);
    setReportBusy(false);
    siteOriginRef.current = null;
    setMenuOpen(false);
    setLoginNotice(notice);
    setPhase('login');
  }, []);

  // A refresh re-reads the account, so new or removed permissions reach the tabs without restarting the app.
  const applySession = useCallback((session: ActiveSession) => {
    setUser((current) => (sameSessionUser(current, session.user) ? current : session.user));
  }, []);

  // A fresh session for every request; null means the phone has to log in again.
  const ensureSession = useCallback(async () => {
    if (!mobile) throw new MobileSessionError(NETWORK_ERROR, 0);
    const session = await mobile.current();
    if (!session) {
      signedOut();
      throw new MobileSessionError(SIGNED_OUT_NOTICE, 401);
    }
    applySession(session);
    return session;
  }, [mobile, signedOut, applySession]);

  // A 401 gets one forced refresh and a second try; refused again, the phone is logged out (its device ended too).
  const authedFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      if (!mobile) throw new MobileSessionError(NETWORK_ERROR, 0);
      const send = async (session: ActiveSession) => {
        try {
          return await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${session.token}` } });
        } catch {
          throw new MobileSessionError(NETWORK_ERROR, 0);
        }
      };
      const response = await sendWithSession(mobile, send, applySession);
      if (!response) {
        signedOut();
        throw new MobileSessionError(SIGNED_OUT_NOTICE, 401);
      }
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        throw new MobileSessionError(typeof data.error === 'string' ? data.error : `요청을 처리하지 못했습니다. (HTTP ${response.status})`, response.status);
      }
      return data;
    },
    [mobile, signedOut, applySession],
  );

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await authedFetch('/api/manager/mobile/overview')) as unknown as MobileOverview;
      setOverview(data);
      setLoadError('');
      loadedAtRef.current = Date.now();
      setNowMs(Date.now());
    } catch (error) {
      // The last screen stays; only a banner says the refresh failed.
      if (!(error instanceof MobileSessionError && error.status === 401)) {
        setLoadError(error instanceof Error ? error.message : NETWORK_ERROR);
      }
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  const start = useCallback(async () => {
    if (!mobile) return;
    if (!mobile.hasDevice()) {
      setPhase('login');
      return;
    }
    setPhase('starting');
    try {
      const session = await mobile.current();
      if (!session) {
        signedOut();
        return;
      }
      setUser(session.user);
      setPhase('ready');
    } catch (error) {
      // A server answer (e.g. the account could not be checked) is shown as written; no answer at all is a connection problem.
      setStartError(error instanceof MobileSessionError && error.status > 0 ? error.message : `${NETWORK_ERROR} 인터넷 연결을 확인해 주세요.`);
      setPhase('offline');
    }
  }, [mobile, signedOut]);

  useEffect(() => {
    void start();
  }, [start]);

  useEffect(() => {
    if (phase === 'ready') void loadOverview();
  }, [phase, loadOverview]);

  useEffect(() => {
    if (phase !== 'ready') return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setNowMs(Date.now());
      if (Date.now() - loadedAtRef.current >= RELOAD_AFTER_MS) void loadOverview();
    };
    document.addEventListener('visibilitychange', onVisible);
    const clock = window.setInterval(() => setNowMs(Date.now()), 60000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(clock);
    };
  }, [phase, loadOverview]);

  const tabs = useMemo(() => {
    const permissions = user?.permissions || [];
    return visibleMobileTabs({
      sites: permissions.includes('sites'),
      dashboard: permissions.includes('dashboard'),
      consultations: permissions.includes('consultations'),
    });
  }, [user]);

  useEffect(() => {
    if (tabs.length > 0 && !tabs.includes(tab)) setTab(tabs[0]);
  }, [tabs, tab]);

  // The estimate is a level on top of the site detail; another site always opens on its detail.
  const [siteView, setSiteView] = useState<SiteView>('detail');
  const [siteViewFor, setSiteViewFor] = useState(siteId);
  if (siteViewFor !== siteId) {
    setSiteViewFor(siteId);
    setSiteView('detail');
  }
  const siteViewRef = useRef(siteView);
  siteViewRef.current = siteView;

  // The Android back button closes the top level (estimate, then site detail) instead of the app (see createBackGuard). A
  // detail opened from 오늘 or 일정 goes back to that tab; the on-screen "현장 목록" button still goes to the site list.
  const detailOpen = phase === 'ready' && tab === 'sites' && Boolean(siteId && overview?.sites.some((site) => site.id === siteId));
  const backDepth = detailOpen ? (siteView === 'estimate' && overview?.canViewEstimates ? 2 : 1) : 0;
  const backGuardRef = useRef<ReturnType<typeof createBackGuard> | null>(null);
  useEffect(() => {
    const guard = createBackGuard(window.history);
    backGuardRef.current = guard;
    const onPopState = () => {
      if (!guard.onPopState()) return;
      if (siteViewRef.current === 'estimate') {
        setSiteView('detail');
        return;
      }
      const origin = siteOriginRef.current;
      siteOriginRef.current = null;
      setSiteId(null);
      if (origin === 'today' || origin === 'schedule') setTab(origin);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  useEffect(() => {
    backGuardRef.current?.sync(backDepth);
  }, [backDepth]);

  const progressApi = useMemo(() => createProgressApi(() => mobile?.authHeaders() || {}), [mobile]);
  const loadReports = useCallback(
    async (id: string) => {
      await ensureSession();
      const state = await progressApi.load(id);
      return [...state.updates].sort(newestFirst);
    },
    [ensureSession, progressApi],
  );

  // Leaving the report tab drops its photos and text, so it asks first; while photos go up it does not leave at all.
  const leaveReportOk = () => {
    const decision = reportLeaveDecision({ tab, reportDirty, reportBusy });
    if (decision === 'blocked') window.alert(REPORT_BUSY_NOTICE);
    return decision === 'go' || (decision === 'ask' && window.confirm(LEAVE_REPORT_CONFIRM));
  };

  const changeTab = (next: MobileTab) => {
    setMenuOpen(false);
    if (next !== tab && !leaveReportOk()) return;
    if (next === tab && next === 'sites') setSiteId(null);
    siteOriginRef.current = null;
    setSiteView('detail');
    if (next === 'report' && next !== tab) setReportSiteId(null);
    setTab(next);
    window.scrollTo({ top: 0 });
  };

  const openSite = (id: string, from: MobileTab | null = null) => {
    siteOriginRef.current = openSiteFrom(id, from).origin;
    setSiteId(id);
    setTab('sites');
    window.scrollTo({ top: 0 });
  };

  const openReport = (id: string) => {
    setReportSiteId(id);
    setTab('report');
    window.scrollTo({ top: 0 });
  };

  const onReportPosted = useCallback(() => void loadOverview(), [loadOverview]);

  // 할 일·현장 기록 go through authedFetch, so they get the same refresh and one retry on 401.
  const notesApi = useMemo(() => createSiteNotesApi(authedFetch), [authedFetch]);
  const loadEstimate = useCallback(
    async (id: string) =>
      ((await authedFetch(`/api/manager/mobile/estimate?siteId=${encodeURIComponent(id)}`)).estimate as CustomerEstimateView | null) ?? null,
    [authedFetch],
  );
  // A tick or a new 할 일 updates the count on 오늘 at once, without reloading the overview.
  const onOpenTodoCountChange = useCallback((id: string, count: number) => {
    setOverview((current) => {
      if (!current || (current.openTodoCounts?.[id] || 0) === count) return current;
      const openTodoCounts = { ...current.openTodoCounts };
      if (count > 0) openTodoCounts[id] = count;
      else delete openTodoCounts[id];
      return { ...current, openTodoCounts };
    });
  }, []);

  const saveConsultation = async (id: string, change: ConsultationChange) => {
    const data = (await authedFetch('/api/manager/mobile/consultation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...change }),
    })) as { consultation: MobileConsultation };
    setOverview((current) =>
      current?.consultations
        ? { ...current, consultations: current.consultations.map((item) => (item.id === id ? data.consultation : item)) }
        : current,
    );
  };

  const login = async (loginId: string, password: string) => {
    if (!mobile) return;
    const session = await mobile.login(loginId, password);
    setUser(session.user);
    setLoginNotice('');
    setPhase('ready');
  };

  const logout = async () => {
    if (!mobile) return;
    if (reportBusy) {
      setMenuOpen(false);
      window.alert(REPORT_BUSY_NOTICE);
      return;
    }
    if (!window.confirm('이 휴대폰에서 로그아웃할까요?')) return;
    setMenuOpen(false);
    await mobile.logout();
    signedOut('');
  };

  const onTouchStart = (event: TouchEvent) => {
    pullStartRef.current = window.scrollY <= 0 ? event.touches[0].clientY : null;
  };
  const onTouchMove = (event: TouchEvent) => {
    if (pullStartRef.current === null) return;
    setPull(Math.max(0, Math.min(110, event.touches[0].clientY - pullStartRef.current)));
  };
  const onTouchEnd = () => {
    if (pull >= PULL_TRIGGER_PX && !loading) void loadOverview();
    pullStartRef.current = null;
    setPull(0);
  };

  if (phase === 'starting' || !mobile) {
    return <main className="flex min-h-[100dvh] items-center justify-center text-sm text-[#8b8276]">불러오는 중…</main>;
  }
  if (phase === 'login') return <LoginScreen onLogin={login} notice={loginNotice} />;
  if (phase === 'offline') {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-6">
        <Notice onRetry={() => void start()}>{startError || NETWORK_ERROR}</Notice>
      </main>
    );
  }

  const newCount = (overview?.consultations || []).filter((item) => item.status === '신규').length;

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} className="min-h-[100dvh]">
      <header
        className="sticky top-0 z-10 flex items-center justify-between border-b border-[#f1ebe0] bg-[#fffdf8]/95 px-4 backdrop-blur"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <span className="flex h-12 items-center text-sm font-bold tracking-wide text-[#8f6f43]">위브 업무</span>
        <div className="relative">
          <button type="button" onClick={() => setMenuOpen((open) => !open)} className="flex h-10 items-center gap-1 rounded-full px-3 text-sm text-[#514c43]" aria-expanded={menuOpen}>
            {user?.name}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-11 w-40 overflow-hidden rounded-xl border border-[#eadfcd] bg-white text-sm shadow-lg">
              <button type="button" onClick={() => { setMenuOpen(false); void loadOverview(); }} className="flex h-11 w-full items-center gap-2 px-4 text-left">
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> 새로고침
              </button>
              <button type="button" onClick={() => void logout()} className="flex h-11 w-full items-center gap-2 border-t border-[#f1ebe0] px-4 text-left text-[#8a1f17]">
                <LogOut className="h-4 w-4" aria-hidden="true" /> 로그아웃
              </button>
            </div>
          )}
        </div>
      </header>

      {(pull > 0 || loading) && (
        <div className="flex justify-center text-xs text-[#8b8276]" style={{ height: loading ? 28 : pull / 2 }}>
          <span className="flex items-center gap-1">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            {loading ? '새로 불러오는 중' : pull >= PULL_TRIGGER_PX ? '놓으면 새로고침' : '당겨서 새로고침'}
          </span>
        </div>
      )}

      <main className="mx-auto max-w-md space-y-3 px-4 pt-3" style={{ paddingBottom: 'calc(88px + env(safe-area-inset-bottom))' }}>
        {loadError && (
          <Notice onRetry={() => void loadOverview()}>
            <p>{loadError === NETWORK_ERROR ? NETWORK_ERROR : loadError}</p>
          </Notice>
        )}
        {tabs.length === 0 ? (
          <Notice tone="warn">휴대폰에서 볼 수 있는 권한이 없습니다. 관리자에게 권한을 요청해 주세요.</Notice>
        ) : !overview ? (
          !loadError && <p className="py-10 text-center text-sm text-[#8b8276]">불러오는 중…</p>
        ) : (
          <>
            {tab === 'today' && (
              <TodayTab
                overview={overview}
                userName={user?.name || ''}
                nowMs={nowMs}
                onOpenSite={(id) => openSite(id, 'today')}
                onOpenConsultations={tabs.includes('consultations') ? () => changeTab('consultations') : undefined}
              />
            )}
            {tab === 'schedule' && <ScheduleTab overview={overview} onOpenSite={(id) => openSite(id, 'schedule')} />}
            {tab === 'sites' && (
              <SitesTab
                overview={overview}
                selectedId={siteId}
                onSelect={(id) => {
                  // Chosen in the 현장 tab itself (or "현장 목록"): back goes to the site list from now on.
                  siteOriginRef.current = selectSite(id).origin;
                  setSiteId(id);
                }}
                onOpenReport={tabs.includes('report') ? openReport : undefined}
                loadReports={loadReports}
                notesApi={notesApi}
                viewer={user || { loginId: '', role: 'staff' }}
                onOpenTodoCountChange={onOpenTodoCountChange}
                view={siteView}
                onViewChange={setSiteView}
                loadEstimate={loadEstimate}
              />
            )}
            {tab === 'report' && (
              <ReportTab
                sites={overview.sites}
                initialSiteId={reportSiteId}
                today={overview.today}
                designer={user?.name || ''}
                api={progressApi}
                ensureSession={ensureSession}
                onDirtyChange={setReportDirty}
                onBusyChange={setReportBusy}
                onPosted={onReportPosted}
              />
            )}
            {tab === 'consultations' && (
              <ConsultationsTab consultations={overview.consultations || []} nowMs={nowMs} onSave={saveConsultation} />
            )}
          </>
        )}
      </main>

      {tabs.length > 0 && <TabBar tabs={tabs} active={tab} onChange={changeTab} badges={{ consultations: newCount }} />}
    </div>
  );
}
