'use client';

import { useEffect, useState } from 'react';
import { Loader2, Phone, Plus, Trash2 } from 'lucide-react';
import { MAX_ALERT_PHONES, formatKoreanMobile, normalizeKoreanMobile, type AlertPhoneSource } from '../lib/alert-phones';

type AlertPhoneState = { phones: string[]; source: AlertPhoneSource; envMasked: string[]; storeReady: boolean };

// Admin-only list of the phones that get the consultation alimtalk. Every add or delete is saved right away.
export function AlertPhonesPanel({ authHeaders }: { authHeaders: () => Record<string, string> }) {
  const [state, setState] = useState<AlertPhoneState | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);

  const request = async (init?: RequestInit) => {
    const response = await fetch('/api/manager/alert-phones', { ...init, headers: { ...authHeaders(), ...(init?.headers || {}) } });
    const data = (await response.json().catch(() => ({}))) as Partial<AlertPhoneState> & { error?: string };
    if (!response.ok) throw new Error(data.error || '알림 번호를 처리하지 못했습니다.');
    return data as AlertPhoneState;
  };

  useEffect(() => {
    request()
      .then(setState)
      .catch((caught) => setMessage({ tone: 'error', text: caught instanceof Error ? caught.message : '알림 번호를 불러오지 못했습니다.' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (phones: string[], okText: string) => {
    setBusy(true);
    setMessage(null);
    try {
      setState(await request({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phones }) }));
      setMessage({ tone: 'ok', text: okText });
      return true;
    } catch (caught) {
      setMessage({ tone: 'error', text: caught instanceof Error ? caught.message : '알림 번호를 저장하지 못했습니다.' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addPhone = async () => {
    if (!state) return;
    const normalized = normalizeKoreanMobile(draft);
    if (!normalized) {
      setMessage({ tone: 'error', text: '010으로 시작하는 휴대폰 번호를 입력해 주세요.' });
      return;
    }
    if (await save([...state.phones, normalized], `${formatKoreanMobile(normalized)} 번호를 추가했습니다.`)) setDraft('');
  };

  const removePhone = async (phone: string) => {
    if (!state) return;
    const isLast = state.phones.length === 1;
    const fallback = state.envMasked.length ? `Vercel 설정 번호(${state.envMasked.join(', ')})로` : '아무에게도';
    const confirmText = isLast
      ? `${phone} 번호를 삭제할까요? 목록이 비면 상담 알림이 ${fallback} 갑니다.`
      : `${phone} 번호를 삭제할까요?`;
    if (!window.confirm(confirmText)) return;
    await save(state.phones.filter((item) => item !== phone), `${phone} 번호를 삭제했습니다.`);
  };

  const sourceText = !state
    ? ''
    : state.source === 'manager'
      ? '아래 번호로 상담 알림톡이 발송됩니다.'
      : state.source === 'env'
        ? `등록된 번호가 없어 Vercel 설정 번호(${state.envMasked.join(', ')})로 발송 중입니다. 번호를 추가하면 그 번호로 바뀝니다.`
        : '등록된 번호가 없어 상담 알림톡이 발송되지 않습니다.';

  return (
    <section className="rounded-lg border border-[#d5dde2] bg-white p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <span className="h-2 w-2 rounded-full bg-[#38bcd4]" />
        상담 알림 받을 번호
      </h2>
      {!state && !message && (
        <p className="inline-flex items-center gap-2 text-sm text-[#60717d]">
          <Loader2 className="animate-spin" size={16} /> 불러오는 중
        </p>
      )}
      {state && (
        <div className="grid gap-3">
          <p className="text-sm leading-6 text-[#60717d]">{sourceText}</p>
          {state.phones.length > 0 && (
            <ul className="grid gap-2">
              {state.phones.map((phone) => (
                <li key={phone} className="flex items-center justify-between gap-3 rounded-md border border-[#d5dde2] bg-[#f7fafb] px-3 py-2">
                  <span className="inline-flex items-center gap-2 font-semibold">
                    <Phone size={16} className="text-[#38a9bd]" />
                    {phone}
                  </span>
                  <button
                    type="button"
                    onClick={() => void removePhone(phone)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 disabled:opacity-50"
                  >
                    <Trash2 size={14} /> 삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
          {state.storeReady ? (
            state.phones.length < MAX_ALERT_PHONES && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void addPhone();
                }}
                className="flex flex-col gap-2 sm:flex-row"
              >
                <input
                  type="tel"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="010-0000-0000"
                  className="flex-1 rounded-md border border-[#d5dde2] bg-[#f7fafb] px-4 py-2 outline-none focus:border-[#38a9bd]"
                />
                <button
                  type="submit"
                  disabled={busy || !draft.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                  번호 추가
                </button>
              </form>
            )
          ) : (
            <p className="text-sm font-semibold text-red-600">번호를 저장하려면 Firebase 서비스 계정 설정이 필요합니다.</p>
          )}
          <p className="text-xs leading-5 text-[#87949c]">
            카카오톡을 쓰는 휴대폰 번호만 받을 수 있고, 받는 번호 수만큼 알림톡 비용이 듭니다. 최대 {MAX_ALERT_PHONES}개까지 등록할 수 있습니다.
          </p>
        </div>
      )}
      {message && (
        <p className={`mt-3 text-sm font-semibold ${message.tone === 'error' ? 'text-red-600' : 'text-[#26853f]'}`}>{message.text}</p>
      )}
    </section>
  );
}
