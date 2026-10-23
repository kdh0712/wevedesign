'use client';

import { useEffect, useRef, useState } from 'react';

// A toolbar button that opens a short list of actions (e.g. 템플릿 ▾), so rarely used actions do not each need a button.

export type ToolbarMenuItem = { label: string; onClick: () => void; disabled?: boolean; dividerBefore?: boolean };

export function ToolbarMenu({ label, items, className }: { label: string; items: ToolbarMenuItem[]; className: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)} className={className}>
        {label} ▾
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-[#d5dde2] bg-white py-1 text-sm shadow-lg">
          {items.map((item) => (
            <div key={item.label}>
              {item.dividerBefore && <hr className="my-1 border-[#edf2f5]" />}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className="block w-full px-3 py-1.5 text-left hover:bg-[#f2f6f8] disabled:opacity-40"
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
