'use client';

import { useEffect, useState } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';
import { MANAGER_MANUALS, manualDownloadErrorMessage, type ManualBook } from '../lib/manager-manuals';

// '사용 설명서' in the manager and estimate headers (spec 2026-10-23 §2.1). A failure is shown right under the button
// (the office page's own message box sits at the bottom of long tabs, out of sight). The button never navigates or ends
// the session, so unsaved estimate edits stay on the page.
export function ManualDownloadButton({ book, authHeaders }: { book: ManualBook; authHeaders: () => Record<string, string> }) {
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 8000);
    return () => clearTimeout(timer);
  }, [message]);

  const download = async () => {
    setDownloading(true);
    setMessage('');
    try {
      const response = await fetch(`/api/manager/manual?book=${book}`, { headers: authHeaders() });
      if (!response.ok) {
        setMessage(manualDownloadErrorMessage(response.status));
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = MANAGER_MANUALS[book].downloadName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Some browsers start reading the file only after the click returns.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setMessage(manualDownloadErrorMessage(0));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => void download()}
        disabled={downloading}
        className="inline-flex items-center gap-1.5 rounded-md border border-[#d5dde2] bg-white px-3 py-1.5 text-sm font-semibold text-[#171512] transition hover:bg-[#f7fafb] disabled:opacity-60"
      >
        {downloading ? <Loader2 className="animate-spin text-[#38a9bd]" size={15} /> : <BookOpen size={15} />}
        {downloading ? '받는 중…' : '사용 설명서'}
      </button>
      {message && (
        <span role="alert" className="absolute right-0 top-full z-30 mt-1 w-64 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-600 shadow-lg">
          {message}
        </span>
      )}
    </span>
  );
}
