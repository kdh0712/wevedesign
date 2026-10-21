'use client';

import { Building2, CalendarDays, Camera, Home, MessageCircle, Phone, Share, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { MobileTab, MobileTask } from '../../lib/mobile-overview';

// Shared pieces of the staff phone app. Colors follow the spec (§6): ivory page, ink text, bronze progress,
// orange only for delays, and one filled ink button per screen.

export function Card({ children, onClick, className = '' }: { children: ReactNode; onClick?: () => void; className?: string }) {
  const base = `block w-full rounded-2xl border border-[#eadfcd] bg-white px-4 py-3 text-left ${className}`;
  if (!onClick) return <div className={base}>{children}</div>;
  return (
    <button type="button" onClick={onClick} className={`${base} active:bg-[#faf6ef]`}>
      {children}
    </button>
  );
}

export function ProgressBar({ percent }: { percent: number }) {
  const width = Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[#efe8dc]" role="progressbar" aria-valuenow={width} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-[#8f6f43]" style={{ width: `${width}%` }} />
    </div>
  );
}

const STATE_STYLE: Record<MobileTask['state'], { label: string; className: string }> = {
  done: { label: '완료', className: 'bg-[#eef0ee] text-[#4b5048]' },
  active: { label: '진행', className: 'bg-[#f6efe3] text-[#6b5230]' },
  delayed: { label: '지연', className: 'bg-[#fff4ea] text-[#9a3412]' },
  upcoming: { label: '예정', className: 'border border-[#d8d1c5] text-[#625d54]' },
};

export function StatePill({ state }: { state: MobileTask['state'] }) {
  const style = STATE_STYLE[state];
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.className}`}>{style.label}</span>;
}

export function Pill({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${dark ? 'bg-[#171512] text-[#f1c76a]' : 'bg-[#f6efe3] text-[#6b5230]'}`}>
      {children}
    </span>
  );
}

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

// Nothing at all without a number: an empty tel: link would open the dialer with nothing in it.
export function CallButton({ phone, label, filled = false, small = false }: { phone?: string; label: string; filled?: boolean; small?: boolean }) {
  if (!phone) return null;
  const size = small ? 'h-9 w-9' : 'h-11 w-11';
  return (
    <a
      href={telHref(phone)}
      aria-label={label}
      className={`flex ${size} shrink-0 items-center justify-center rounded-full border ${
        filled ? 'border-[#171512] bg-[#171512] text-[#fffdf8]' : 'border-[#d8d1c5] bg-white text-[#171512]'
      }`}
    >
      <Phone className={small ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden="true" />
    </a>
  );
}

export function ActionTile({ icon, label, href, onClick }: { icon: ReactNode; label: string; href?: string; onClick?: () => void }) {
  const className = 'flex min-h-[64px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl border border-[#eadfcd] bg-white text-xs font-semibold text-[#171512] active:bg-[#faf6ef]';
  if (href) {
    return (
      <a href={href} className={className} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
        {icon}
        {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {icon}
      {label}
    </button>
  );
}

export function Notice({ tone = 'error', children, onRetry }: { tone?: 'error' | 'ok' | 'warn'; children: ReactNode; onRetry?: () => void }) {
  const style =
    tone === 'ok'
      ? 'border-[#cfe3d3] bg-[#f1f8f2] text-[#24502d]'
      : tone === 'warn'
        ? 'border-[#f3c9a6] bg-[#fff4ea] text-[#7c2d12]'
        : 'border-[#f1c0bd] bg-[#fdf1f0] text-[#8a1f17]';
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${style}`} role={tone === 'error' ? 'alert' : 'status'}>
      <div className="min-w-0 flex-1 space-y-1">{children}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 rounded-full border border-current px-3 py-1 text-xs font-semibold">
          다시 시도
        </button>
      )}
    </div>
  );
}

const TAB_INFO: Record<MobileTab, { label: string; icon: typeof Home }> = {
  today: { label: '오늘', icon: Home },
  sites: { label: '현장', icon: Building2 },
  schedule: { label: '일정', icon: CalendarDays },
  report: { label: '보고', icon: Camera },
  consultations: { label: '상담', icon: MessageCircle },
};

export function TabBar({ tabs, active, onChange, badges = {} }: { tabs: MobileTab[]; active: MobileTab; onChange: (tab: MobileTab) => void; badges?: Partial<Record<MobileTab, number>> }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-[#eadfcd] bg-white/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="화면 이동"
    >
      {tabs.map((tab) => {
        const { label, icon: Icon } = TAB_INFO[tab];
        const isActive = tab === active;
        const badge = badges[tab] || 0;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            aria-current={isActive ? 'page' : undefined}
            className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${
              isActive ? 'font-bold text-[#171512]' : 'text-[#8b8276]'
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {label}
            {badge > 0 && (
              <span className="absolute right-[calc(50%-20px)] top-1.5 min-w-[18px] rounded-full bg-[#171512] px-1 text-[10px] font-bold leading-[18px] text-[#f1c76a]">
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

const INSTALL_GUIDE_KEY = 'weve-mobile-install-guide-closed';

function readFlag(key: string) {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

// How to add the app to the home screen. Hidden once the app runs from the home screen, or after it is closed.
export function InstallGuide() {
  const [visible, setVisible] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsIos(/iPhone|iPad|iPod/.test(navigator.userAgent));
    setVisible(!standalone && !readFlag(INSTALL_GUIDE_KEY));
  }, []);

  if (!visible) return null;
  const close = () => {
    try {
      window.localStorage.setItem(INSTALL_GUIDE_KEY, '1');
    } catch {
      // Private mode: the guide simply shows again next time.
    }
    setVisible(false);
  };

  return (
    <div className="relative rounded-2xl border border-[#eadfcd] bg-[#faf6ef] px-4 py-3 pr-10 text-sm text-[#514c43]">
      <p className="font-semibold text-[#171512]">홈 화면에 추가하면 앱처럼 쓸 수 있어요</p>
      {isIos ? (
        <p className="mt-1">
          사파리 아래쪽 <Share className="inline h-4 w-4 align-[-2px]" aria-label="공유" /> 버튼 → <b>홈 화면에 추가</b>
        </p>
      ) : (
        <p className="mt-1">
          크롬 오른쪽 위 <b>⋮</b> 메뉴 → <b>홈 화면에 추가</b> 또는 <b>앱 설치</b>
        </p>
      )}
      <button type="button" onClick={close} aria-label="안내 닫기" className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-[#8b8276]">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mt-2 flex items-baseline justify-between">
      <h2 className="text-[15px] font-bold text-[#171512]">{children}</h2>
      {aside && <span className="text-xs text-[#625d54]">{aside}</span>}
    </div>
  );
}

export function EmptyText({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-[#d8d1c5] px-4 py-6 text-center text-sm text-[#8b8276]">{children}</p>;
}
