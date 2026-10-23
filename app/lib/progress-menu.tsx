'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Menu, X } from 'lucide-react';

export type ProgressMenuSection = { key: string; label: string; count?: number; content: ReactNode };

// The customer page shows one section at a time; the ☰ button at the top lists the sections (the first one is the home view).
// On the public page (syncHash) the chosen section is kept in the address (#photos), so the phone's back button returns to
// the previous section; the manager's preview switches sections without touching its own address.
export function ProgressMenu({ header, sections, footer, syncHash = false }: { header: ReactNode; sections: ProgressMenuSection[]; footer: ReactNode; syncHash?: boolean }) {
  const [active, setActive] = useState(sections[0]?.key ?? '');
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const current = sections.find((section) => section.key === active) ?? sections[0];
  const keys = sections.map((section) => section.key).join(' ');

  // Read the address after the first render (the server cannot see #photos), and again on back / forward.
  useEffect(() => {
    if (!syncHash) return;
    const known = keys.split(' ');
    const fromHash = () => {
      const key = window.location.hash.slice(1);
      setActive(known.includes(key) ? key : known[0]);
    };
    fromHash();
    window.addEventListener('popstate', fromHash);
    return () => window.removeEventListener('popstate', fromHash);
  }, [keys, syncHash]);

  useEffect(() => {
    if (!isOpen) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [isOpen]);

  const choose = (key: string) => {
    setIsOpen(false);
    if (key === active) return;
    setActive(key);
    if (syncHash) {
      const { pathname, search } = window.location;
      window.history.pushState(null, '', key === sections[0]?.key ? `${pathname}${search}` : `${pathname}${search}#${key}`);
    }
    rootRef.current?.scrollIntoView({ block: 'start' });
  };

  return (
    <>
      <div ref={rootRef} className="relative">
        {header}
        <div className="absolute right-0 top-0">
          <button
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            aria-expanded={isOpen}
            aria-haspopup="menu"
            aria-label="메뉴"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#d5dde2] bg-white text-[#171512] shadow-sm hover:bg-[#f3f6f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171512]"
          >
            {isOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
          {isOpen && (
            <div role="menu" className="absolute right-0 top-12 z-20 w-52 rounded-lg border border-[#d5dde2] bg-white py-1.5 shadow-lg">
              {sections.map((section) => {
                const isCurrent = section.key === current?.key;
                return (
                  <button
                    key={section.key}
                    type="button"
                    role="menuitem"
                    aria-current={isCurrent ? 'page' : undefined}
                    onClick={() => choose(section.key)}
                    className={`flex w-full items-center gap-2 px-4 py-3 text-left text-[15px] font-bold ${isCurrent ? 'bg-[#eaf6f8] text-[#1f6f7f]' : 'text-[#171512] hover:bg-[#f3f6f8]'}`}
                  >
                    <span className="flex-1">{section.label}</span>
                    {section.count !== undefined && section.count > 0 && <span className="text-xs font-semibold text-[#60717d]">{section.count}</span>}
                    {isCurrent && <Check size={16} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {current?.content}
      {footer}
    </>
  );
}
