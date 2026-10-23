'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { OTHER_OPTION_ID, cleanOtherText } from '../../lib/acquisition';
import { PROGRESS_UNAVAILABLE_MESSAGE } from '../../lib/progress-public';
import { ProgressBrand, ProgressShell } from '../../lib/progress-view';

// "How did you first find us", asked once after the phone check while the site has no answer. Answering or skipping saves
// on the server, then the page reloads and the server shows the progress view. A 401 means the phone check has to be done
// again (the link changed or the cookie ran out): the reload brings the phone check back. When saving fails, the customer
// can still go on to the progress view (?later=1 skips the question for that visit).
export function AcquisitionSurvey({ code, options }: { code: string; options: Array<{ id: string; label: string }> }) {
  const [picked, setPicked] = useState('');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState<'' | 'answer' | 'skip'>('');
  const [error, setError] = useState('');
  const isOther = picked === OTHER_OPTION_ID;
  const canAnswer = Boolean(picked) && (!isOther || cleanOtherText(other) !== '') && !busy;

  const send = async (payload: Record<string, unknown>, kind: 'answer' | 'skip') => {
    if (busy) return;
    setBusy(kind);
    setError('');
    try {
      const response = await fetch(`/progress/${encodeURIComponent(code)}/acquisition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok || response.status === 401) {
        // Stay busy: the page is about to be replaced.
        window.location.reload();
        return;
      }
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setError(data.error || PROGRESS_UNAVAILABLE_MESSAGE);
    } catch {
      setError('네트워크 연결을 확인하고 다시 시도해 주세요.');
    }
    setBusy('');
  };

  return (
    <ProgressShell>
      <ProgressBrand />
      <section className="rounded-lg border border-[#d5dde2] bg-white p-5 shadow-sm" aria-labelledby="acquisition-title">
        <p className="text-sm font-bold text-[#38a9bd]">공사를 맡겨 주셔서 감사합니다</p>
        <h1 id="acquisition-title" className="mt-1 text-xl font-extrabold leading-snug">
          위브디자인을 처음 어떻게 알게 되셨나요?
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[#60717d]">더 좋은 서비스를 위해 한 가지만 여쭤볼게요. 답하지 않으셔도 괜찮아요.</p>

        <div role="group" aria-labelledby="acquisition-title" className="mt-4 grid grid-cols-2 gap-2">
          {options.map((option) => {
            const isPicked = picked === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={isPicked}
                onClick={() => setPicked(option.id)}
                className={`flex min-h-[46px] items-center justify-center rounded-lg border px-2 py-2 text-center text-[15px] font-bold leading-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171512] ${
                  isPicked ? 'border-[#38a9bd] bg-[#38a9bd] text-white' : 'border-[#d5dde2] bg-white text-[#171512] hover:bg-[#f3f6f8]'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {isOther && (
          <input
            value={other}
            onChange={(event) => setOther(event.target.value)}
            maxLength={40}
            autoFocus
            aria-label="기타 내용"
            placeholder="어디서 알게 되셨는지 적어 주세요"
            className="mt-2 h-12 w-full rounded-lg border border-[#38a9bd] bg-white px-3 text-[15px] outline-none focus:ring-2 focus:ring-[#38a9bd]/30"
          />
        )}

        {error && (
          <div className="mt-3">
            <p role="alert" className="text-sm font-semibold text-[#c0392b]">
              {error}
            </p>
            <a href={`/progress/${encodeURIComponent(code)}?later=1`} className="mt-1 inline-block text-sm font-semibold text-[#1f6f7f] underline">
              공사 현황 먼저 보기
            </a>
          </div>
        )}

        <button
          type="button"
          disabled={!canAnswer}
          onClick={() => void send({ answer: isOther ? { optionId: picked, other } : { optionId: picked } }, 'answer')}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#38a9bd] text-base font-bold text-white hover:bg-[#2f94a7] disabled:cursor-not-allowed disabled:bg-[#b9c6cd]"
        >
          {busy === 'answer' && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
          답하고 공사 현황 보기
        </button>
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void send({ skip: true }, 'skip')}
          className="mx-auto mt-3 flex items-center gap-1 px-3 py-1 text-sm text-[#60717d] underline disabled:opacity-50"
        >
          {busy === 'skip' && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
          건너뛰기
        </button>
      </section>
    </ProgressShell>
  );
}
