'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Megaphone } from 'lucide-react';
import {
  OTHER_OPTION_ID,
  OTHER_OPTION_LABEL,
  acquisitionAnswerText,
  cleanOtherText,
  readSiteAcquisition,
  type AcquisitionOption,
  type SiteAcquisition,
} from '../lib/acquisition';
import { createAcquisitionApi } from './acquisition-api';
import { errorText, formatSeoulDateTime } from './progress-manager';

const CLEAR_CONFIRM_MESSAGE = '지우면 고객이 다음에 링크를 열 때 다시 묻습니다. 지울까요?';

// "유입 경로" for one site, under the customer progress link: the customer's answer (or skip), or a staff entry. Staff may
// enter or fix it (hidden options included, so an old answer can stay) and clear it, which asks the customer again.
export function AcquisitionPanel({
  site,
  authHeaders,
  onChange,
}: {
  site: { _id: string; acquisition?: unknown };
  authHeaders: () => Record<string, string>;
  onChange: (acquisition: SiteAcquisition | null) => void;
}) {
  const api = createAcquisitionApi(authHeaders);
  const [options, setOptions] = useState<AcquisitionOption[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState<{ optionId: string; other: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const busyRef = useRef(false);
  const acquisition = readSiteAcquisition(site.acquisition);

  useEffect(() => {
    api
      .load()
      .then((loaded) => setOptions(loaded.options))
      .catch((error) => setLoadError(errorText(error, '유입 경로 보기를 불러오지 못했습니다.')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A different site closes the form and the last message.
  useEffect(() => {
    setEditing(null);
    setMessage(null);
  }, [site._id]);

  const run = async (task: () => Promise<string>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ tone: 'ok', text: await task() });
    } catch (error) {
      setMessage({ tone: 'error', text: errorText(error) });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const save = () => {
    if (!editing) return;
    const choice = editing.optionId === OTHER_OPTION_ID ? { optionId: OTHER_OPTION_ID, other: editing.other } : { optionId: editing.optionId };
    void run(async () => {
      const saved = await api.setSite(site._id, choice);
      onChange(saved);
      setEditing(null);
      return '유입 경로를 저장했습니다.';
    });
  };

  const clear = () => {
    if (!window.confirm(CLEAR_CONFIRM_MESSAGE)) return;
    void run(async () => {
      await api.clearSite(site._id);
      onChange(null);
      setEditing(null);
      return '유입 경로를 지웠습니다. 고객이 다음에 링크를 열 때 다시 묻습니다.';
    });
  };

  const startEditing = () => {
    const current = acquisition?.status === 'answered' ? acquisition : null;
    setEditing({ optionId: current?.optionId ?? options?.[0]?.id ?? OTHER_OPTION_ID, other: current?.other ?? '' });
    setMessage(null);
  };

  const canSave = Boolean(editing) && (editing?.optionId !== OTHER_OPTION_ID || cleanOtherText(editing.other) !== '');
  const smallButton = 'rounded-md border border-[#d5dde2] bg-white px-3 py-1.5 text-sm font-semibold text-[#273541] disabled:opacity-50';

  return (
    <section className="mt-4 rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-4" aria-labelledby={`acquisition-${site._id}`}>
      <h3 id={`acquisition-${site._id}`} className="flex items-center gap-2 text-base font-semibold">
        <Megaphone size={17} className="text-[#38a9bd]" />
        유입 경로
      </h3>

      {!options && !loadError && (
        <p className="mt-3 inline-flex items-center gap-2 text-sm text-[#60717d]">
          <Loader2 className="animate-spin" size={16} /> 불러오는 중
        </p>
      )}
      {loadError && <p className="mt-3 text-sm font-semibold text-red-600">{loadError}</p>}

      {options && !editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {acquisition ? (
            <>
              <strong className="text-base">{acquisitionAnswerText(acquisition, options)}</strong>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${acquisition.by === 'customer' ? 'bg-[#eaf6f8] text-[#1f6f7f]' : 'bg-[#fff4e0] text-[#8b6420]'}`}
              >
                {acquisition.by === 'customer' ? '고객 답변' : `직원 입력 · ${acquisition.staffId || '직원'}`}
              </span>
              <span className="text-xs text-[#60717d]">{formatSeoulDateTime(acquisition.at)}</span>
            </>
          ) : (
            <span className="text-sm text-[#60717d]">아직 답이 없어요. 고객이 링크에서 번호를 확인하면 한 번 묻습니다.</span>
          )}
          <span className="flex-1" />
          <button type="button" onClick={startEditing} disabled={busy} className={smallButton}>
            {acquisition?.status === 'answered' ? '고치기' : '직원이 입력'}
          </button>
          {acquisition && (
            <button type="button" onClick={clear} disabled={busy} className={`${smallButton} text-red-600`}>
              지우기
            </button>
          )}
        </div>
      )}

      {options && editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={editing.optionId}
            onChange={(event) => setEditing({ ...editing, optionId: event.target.value })}
            aria-label="유입 경로 보기"
            className="rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm outline-none focus:border-[#38a9bd]"
          >
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
                {option.hidden ? ' (숨김)' : ''}
              </option>
            ))}
            <option value={OTHER_OPTION_ID}>{OTHER_OPTION_LABEL} (직접 입력)</option>
          </select>
          {editing.optionId === OTHER_OPTION_ID && (
            <input
              value={editing.other}
              onChange={(event) => setEditing({ ...editing, other: event.target.value })}
              maxLength={40}
              aria-label="기타 내용"
              placeholder="어디서 알게 됐는지"
              className="min-w-0 flex-1 rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm outline-none focus:border-[#38a9bd]"
            />
          )}
          <button
            type="button"
            onClick={save}
            disabled={busy || !canSave}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#171512] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy && <Loader2 className="animate-spin" size={15} />}
            저장
          </button>
          <button type="button" onClick={() => setEditing(null)} disabled={busy} className={smallButton}>
            취소
          </button>
        </div>
      )}

      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={`mt-2 text-sm font-semibold ${message.tone === 'error' ? 'text-red-600' : 'text-[#1f6f7f]'}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
