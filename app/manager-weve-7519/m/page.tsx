'use client';

import { LogOut, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import { visibleMobileTabs, type MobileOverview, type MobileTab } from '../../lib/mobile-overview';
import type { ProgressUpdateView } from '../../lib/site-progress';
import { createProgressApi } from '../progress-manager';
import { LoginScreen } from './login-screen';
import { createMobileSession, MobileSessionError, type ActiveSession, type KeyValueStorage, type MobileSession } from './mobile-session';
import { Notice, TabBar } from './mobile-ui';
import { SitesTab } from './sites-tab';
import { TodayTab } from './today-tab';

// The staff phone app (spec docs/superpowers/specs/2026-10-20-staff-mobile-app-design.md). One page with four tabs; the data
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
  const [user, setUser] = useState<ActiveSession['user'] | null>(null);
  const [overview, setOverview] = useState<MobileOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<MobileTab>('today');
  const [siteId, setSiteId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [menuOpen, setMenuOpen] = useState(false);
  const [pull, setPull] = useState(0);
  const loadedAtRef = useRef(0);
  const pullStartRef = useRef<number | null>(null);

  useEffect(() => setMobile(createMobileSession({ storage: safeLocalStorage() })), []);

  const signedOut = useCallback((notice = SIGNED_OUT_NOTICE) => {
    setUser(null);
    setOverview(null);
    setLoginNotice(notice);
    setPhase('login');
  }, []);

  // A fresh session for every request; null means the phone has to log in again.
  const ensureSession = useCallback(async () => {
    if (!mobile) throw new MobileSessionError(NETWORK_ERROR, 0);
    const session = await mobile.current();
    if (!session) {
      signedOut();
      throw new MobileSessionError(SIGNED_OUT_NOTICE, 401);
    }
    return session;
  }, [mobile, signedOut]);

  const authedFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const session = await ensureSession();
      let response: Response;
      try {
        response = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${session.token}` } });
      } catch {
        throw new MobileSessionError(NETWORK_ERROR, 0);
      }
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (response.status === 401) {
        signedOut();
        throw new MobileSessionError(SIGNED_OUT_NOTICE, 401);
      }
      if (!response.ok) {
        throw new MobileSessionError(typeof data.error === 'string' ? data.error : `요청을 처리하지 못했습니다. (HTTP ${response.status})`, response.status);
      }
      return data;
    },
    [ensureSession, signedOut],
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
    } catch {
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

  const progressApi = useMemo(() => createProgressApi(() => mobile?.authHeaders() || {}), [mobile]);
  const loadReports = useCallback(
    async (id: string) => {
      await ensureSession();
      const state = await progressApi.load(id);
      return [...state.updates].sort(newestFirst);
    },
    [ensureSession, progressApi],
  );

  const changeTab = (next: MobileTab) => {
    setMenuOpen(false);
    if (next === tab && next === 'sites') setSiteId(null);
    setTab(next);
    window.scrollTo({ top: 0 });
  };

  const openSite = (id: string) => {
    setSiteId(id);
    setTab('sites');
    window.scrollTo({ top: 0 });
  };

  const login = async (loginId: string, password: string) => {
    if (!mobile) return;
    const session = await mobile.login(loginId, password);
    setUser(session.user);
    setLoginNotice('');
    setPhase('ready');
  };

  const logout = async () => {
    if (!mobile || !window.confirm('이 휴대폰에서 로그아웃할까요?')) return;
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
        <Notice onRetry={() => void start()}>{NETWORK_ERROR} 인터넷 연결을 확인해 주세요.</Notice>
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
                onOpenSite={openSite}
                onOpenConsultations={tabs.includes('consultations') ? () => changeTab('consultations') : undefined}
              />
            )}
            {tab === 'sites' && <SitesTab overview={overview} selectedId={siteId} onSelect={setSiteId} loadReports={loadReports} />}
          </>
        )}
      </main>

      {tabs.length > 0 && <TabBar tabs={tabs} active={tab} onChange={changeTab} badges={{ consultations: newCount }} />}
    </div>
  );
}
