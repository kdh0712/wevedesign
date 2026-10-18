'use client';

import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { ProgressPhotoView } from './site-progress';

const SWIPE_MIN_PX = 50;

// Photo grid for one progress record. Tapping a photo opens it large; swipe, arrow keys or the arrows move between photos.
// Each photo is one stored size (long edge up to 1600px) behind a signed URL from the server, used as given for both the
// thumbnail and the large view. Thumbnails load lazily. buildCustomerProgressView already left out any photo without a URL.
export function ProgressPhotoGallery({ photos, label }: { photos: ProgressPhotoView[]; label: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const isOpen = openIndex !== null;
  const count = photos.length;

  const close = useCallback(() => setOpenIndex(null), []);
  const move = useCallback(
    (delta: number) => setOpenIndex((index) => (index === null ? index : Math.min(count - 1, Math.max(0, index + delta)))),
    [count],
  );

  // While open: lock the page behind it, take focus, and give focus back to the tapped photo on close.
  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      else if (event.key === 'ArrowLeft') move(-1);
      else if (event.key === 'ArrowRight') move(1);
      else if (event.key === 'Tab') {
        // Keep Tab inside the dialog while it is open.
        const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        if (buttons.length === 0) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        const active = document.activeElement;
        if (!dialogRef.current?.contains(active)) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, close, move]);

  // Load the neighbours of the open photo ahead of time so swiping does not wait on the network.
  useEffect(() => {
    if (openIndex === null) return;
    for (const neighbour of [photos[openIndex - 1], photos[openIndex + 1]]) {
      if (neighbour) new Image().src = neighbour.url;
    }
  }, [openIndex, photos]);

  if (count === 0) return null;

  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const onTouchEnd = (event: TouchEvent) => {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = null;
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1);
  };

  const gridClass = count === 1 ? 'grid-cols-1' : count === 2 ? 'grid-cols-2' : 'grid-cols-3';
  const thumbClass = count === 1 ? 'aspect-[4/3]' : 'aspect-square';
  const current = openIndex !== null ? photos[openIndex] : null;

  return (
    <>
      <ul className={`grid gap-1.5 ${gridClass}`}>
        {photos.map((photo, index) => (
          <li key={`${photo.id}-${index}`}>
            <button
              type="button"
              onClick={() => setOpenIndex(index)}
              aria-label={`${label} 사진 ${index + 1} 크게 보기`}
              className="block w-full overflow-hidden rounded-md bg-[#eef3f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#38a9bd]"
            >
              <img
                src={photo.url}
                alt={`${label} 공사 사진 ${index + 1}`}
                width={photo.width || undefined}
                height={photo.height || undefined}
                loading="lazy"
                decoding="async"
                className={`${thumbClass} w-full object-cover`}
              />
            </button>
          </li>
        ))}
      </ul>

      {current && openIndex !== null && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${label} 공사 사진`}
          className="fixed inset-0 z-50 flex flex-col bg-black/90"
          onClick={close}
        >
          <div className="flex items-center justify-between px-4 py-3 text-white" onClick={(event) => event.stopPropagation()}>
            <span className="text-sm font-semibold" aria-live="polite">
              {openIndex + 1} / {count}
            </span>
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              aria-label="닫기"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
            >
              <X size={22} aria-hidden="true" />
            </button>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-6" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            {/* The wrapper closes on a tap outside the photo; a tap on the photo itself keeps it open. */}
            <img
              key={current.url}
              src={current.url}
              alt={`${label} 공사 사진 ${openIndex + 1}`}
              draggable={false}
              onClick={(event) => event.stopPropagation()}
              className="max-h-full max-w-full select-none object-contain"
            />
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                move(-1);
              }}
              disabled={openIndex === 0}
              aria-label="이전 사진"
              className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-white disabled:opacity-30"
            >
              <ChevronLeft size={26} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                move(1);
              }}
              disabled={openIndex === count - 1}
              aria-label="다음 사진"
              className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-white disabled:opacity-30"
            >
              <ChevronRight size={26} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
