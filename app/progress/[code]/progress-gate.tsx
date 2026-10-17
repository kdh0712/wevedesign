'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { PROGRESS_UNAVAILABLE_MESSAGE } from '../../lib/progress-public';
import { ProgressBrand, ProgressShell } from '../../lib/progress-view';

// Asks for the last 4 digits of the customer's phone. A correct answer sets the access cookie on the server,
// then the page is reloaded so the server renders the progress view.
export function ProgressGate({ code }: { code: string }) {
  const [last4, setLast4] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !/^\d{4}$/.test(last4)) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/progress/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, last4 }),
      });
      if (response.ok) {
        // Stay busy: the page is about to be replaced.
        window.location.reload();
        return;
      }
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setError(data.error || PROGRESS_UNAVAILABLE_MESSAGE);
      if (response.status === 401) setLast4('');
    } catch {
      setError('네트워크 연결을 확인하고 다시 시도해 주세요.');
    }
    setBusy(false);
    inputRef.current?.focus();
  };

  return (
    <ProgressShell>
      <ProgressBrand />
      <form onSubmit={submit} className="rounded-lg border border-[#d5dde2] bg-white p-5 shadow-sm">
        <h1 className="text-lg font-bold">공사 진행 현황</h1>
        <p className="mt-2 text-sm leading-relaxed text-[#38434b]">본인 확인을 위해 계약 시 남기신 휴대폰 번호의 뒷자리 4자리를 입력해 주세요.</p>

        <label htmlFor="progress-last4" className="mt-5 block text-sm font-semibold">
          휴대폰 번호 뒷자리 4자리
        </label>
        <input
          ref={inputRef}
          id="progress-last4"
          value={last4}
          onChange={(event) => setLast4(event.target.value.replace(/\D/g, '').slice(0, 4))}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          autoFocus
          placeholder="0000"
          aria-describedby={error ? 'progress-last4-error' : undefined}
          aria-invalid={error ? true : undefined}
          className="mt-2 h-14 w-full rounded-lg border border-[#d5dde2] bg-white px-4 text-center text-2xl font-bold tracking-[0.5em] outline-none focus:border-[#38a9bd] focus:ring-2 focus:ring-[#38a9bd]/30"
        />

        {error && (
          <p id="progress-last4-error" role="alert" className="mt-3 text-sm font-semibold text-[#c0392b]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || last4.length !== 4}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#38a9bd] text-base font-bold text-white hover:bg-[#2f94a7] disabled:cursor-not-allowed disabled:bg-[#b9c6cd]"
        >
          {busy && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
          확인
        </button>
      </form>
    </ProgressShell>
  );
}
