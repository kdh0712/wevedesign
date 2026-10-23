'use client';

import { useState } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';
import { MANAGER_MANUALS, manualDownloadErrorMessage, type ManualBook } from '../lib/manager-manuals';

// '사용 설명서' in the manager and estimate headers (spec 2026-10-23 §2.1). A failure is only reported through onError:
// the button never navigates or ends the session, so unsaved estimate edits stay on the page.
export function ManualDownloadButton({
  book,
  authHeaders,
  onError,
}: {
  book: ManualBook;
  authHeaders: () => Record<string, string>;
  onError: (message: string) => void;
}) {
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      const response = await fetch(`/api/manager/manual?book=${book}`, { headers: authHeaders() });
      if (!response.ok) {
        onError(manualDownloadErrorMessage(response.status));
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
      onError(manualDownloadErrorMessage(0));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void download()}
      disabled={downloading}
      className="inline-flex items-center gap-1.5 rounded-md border border-[#d5dde2] bg-white px-3 py-1.5 text-sm font-semibold text-[#171512] transition hover:bg-[#f7fafb] disabled:opacity-60"
    >
      {downloading ? <Loader2 className="animate-spin text-[#38a9bd]" size={15} /> : <BookOpen size={15} />}
      {downloading ? '받는 중…' : '사용 설명서'}
    </button>
  );
}
