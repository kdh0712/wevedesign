'use client';

// 계정 권한 tab, for the 총괄 관리자: staff sign-up requests to approve or reject, and the sign-up links that bring them.
// Spec: docs/superpowers/specs/2026-11-21-staff-signup-approval-design.md §3.1, §3.3
import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Link2, Loader2, UserPlus } from 'lucide-react';
import { formatKoreanMobile } from '../lib/alert-phones';
import { MANAGER_PERMISSIONS, type ManagerPermission } from '../lib/manager-permissions';
import { DEFAULT_LINK_DAYS, LINK_DAYS, PERMISSION_PRESETS, approvalError } from '../lib/staff-signup-rules';

type SignupLink = { id: string; memo: string; createdByName: string; expiresAt: string };
type SignupRequest = { id: string; name: string; phone: string; loginId: string; linkMemo: string; createdAt: string };
type Decision = { role: 'admin' | 'staff'; permissions: ManagerPermission[] };
type Message = { tone: 'error' | 'ok'; text: string };

// Account management comes only with the 총괄 관리자 role, so it is not offered as a checkbox.
const GRANTABLE = MANAGER_PERMISSIONS.filter((permission) => permission !== 'accounts');
const NEW_DECISION: Decision = { role: 'staff', permissions: [] };

const input = 'w-full rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm outline-none focus:border-[#273541]';
const primaryButton =
  'inline-flex items-center justify-center gap-1.5 rounded-md bg-[#273541] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d2833] disabled:opacity-50';
const secondaryButton =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-[#d5dde2] bg-white px-3 py-1.5 text-sm font-semibold text-[#273541] hover:bg-[#f7fafb] disabled:opacity-50';

// "11/21 14:02" in Seoul time.
function seoulMonthDay(iso: string, withTime: boolean) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.month}/${parts.day}${withTime ? ` ${parts.hour}:${parts.minute}` : ''}`;
}

const phoneText = (digits: string) => (/^\d{10,11}$/.test(digits) ? formatKoreanMobile(digits) : digits);

export function SignupPanel({
  authHeaders,
  permissionLabels,
  onAccountsChanged,
  onPendingCountChange,
}: {
  authHeaders: () => Record<string, string>;
  permissionLabels: Record<ManagerPermission, string>;
  onAccountsChanged: () => Promise<void> | void;
  onPendingCountChange: (count: number) => void;
}) {
  const [links, setLinks] = useState<SignupLink[] | null>(null);
  const [requests, setRequests] = useState<SignupRequest[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [message, setMessage] = useState<Message | null>(null);
  const [unavailable, setUnavailable] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [creating, setCreating] = useState(false);
  const [memo, setMemo] = useState('');
  const [days, setDays] = useState(DEFAULT_LINK_DAYS);
  const [createdUrl, setCreatedUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const call = async (init?: RequestInit) => {
    const response = await fetch('/api/manager/signup', { ...init, headers: { ...authHeaders(), ...(init?.headers || {}) } });
    const data = (await response.json().catch(() => ({}))) as {
      links?: SignupLink[];
      requests?: SignupRequest[];
      url?: string;
      error?: string;
    };
    return { response, data };
  };

  const load = async () => {
    const { response, data } = await call();
    if (response.status === 503) {
      setUnavailable(data.error || '가입 링크 기능을 쓸 수 없습니다.');
      return;
    }
    if (!response.ok) throw new Error(data.error || '가입 요청을 불러오지 못했습니다.');
    setUnavailable('');
    setLinks(data.links || []);
    setRequests(data.requests || []);
    onPendingCountChange((data.requests || []).length);
  };

  useEffect(() => {
    load().catch((caught) => setMessage({ tone: 'error', text: caught instanceof Error ? caught.message : '가입 요청을 불러오지 못했습니다.' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One action at a time; a second click while one runs does nothing.
  const run = async (task: () => Promise<Message | null>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const done = await task();
      if (done) setMessage(done);
    } catch (caught) {
      setMessage({ tone: 'error', text: caught instanceof Error ? caught.message : '처리하지 못했습니다.' });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const post = async (body: Record<string, unknown>) => {
    const { response, data } = await call({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(data.error || '처리하지 못했습니다.');
    return data;
  };

  const decisionOf = (id: string) => decisions[id] || NEW_DECISION;
  const setDecision = (id: string, next: Decision) => setDecisions((current) => ({ ...current, [id]: next }));

  const approve = (request: SignupRequest) =>
    run(async () => {
      const decision = decisionOf(request.id);
      const problem = approvalError(decision);
      if (problem) return { tone: 'error', text: problem };
      try {
        await post({ action: 'approve', requestId: request.id, role: decision.role, permissions: decision.permissions });
      } finally {
        // Whatever happened (approved, or already handled elsewhere), show the list as it is now.
        await load().catch(() => undefined);
      }
      await onAccountsChanged();
      return { tone: 'ok', text: `${request.name}(${request.loginId}) 계정을 만들었습니다. 이제 이 아이디로 로그인할 수 있습니다.` };
    });

  const reject = (request: SignupRequest) => {
    if (!window.confirm(`${request.name}(${request.loginId})의 가입 요청을 거절할까요? 요청 정보는 지워집니다.`)) return;
    void run(async () => {
      try {
        await post({ action: 'reject', requestId: request.id });
      } finally {
        await load().catch(() => undefined);
      }
      return { tone: 'ok', text: `${request.name}의 가입 요청을 거절했습니다.` };
    });
  };

  const createLink = () =>
    run(async () => {
      const data = await post({ action: 'createLink', memo: memo.trim(), days });
      setCreatedUrl(data.url || '');
      setCopied(false);
      await load().catch(() => undefined);
      return null;
    });

  const revokeLink = (link: SignupLink) => {
    if (!window.confirm(`'${link.memo}' 링크를 취소할까요? 이 링크로는 더 이상 가입할 수 없습니다.`)) return;
    void run(async () => {
      try {
        await post({ action: 'revokeLink', id: link.id });
      } finally {
        await load().catch(() => undefined);
      }
      return { tone: 'ok', text: `'${link.memo}' 링크를 취소했습니다.` };
    });
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(createdUrl);
      setCopied(true);
    } catch {
      setMessage({ tone: 'error', text: '복사하지 못했습니다. 링크를 길게 눌러 직접 복사해 주세요.' });
    }
  };

  const closeCreate = () => {
    setCreating(false);
    setCreatedUrl('');
    setMemo('');
    setDays(DEFAULT_LINK_DAYS);
  };

  return (
    <section className="rounded-lg border border-[#d5dde2] bg-white p-4 shadow-sm">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
        <UserPlus size={18} className="text-[#273541]" />
        직원 가입
      </h2>
      <p className="mb-3 text-sm leading-6 text-[#60717d]">
        새 직원에게 가입 링크를 보내면, 직원이 이름·휴대폰·아이디·비밀번호를 직접 적어 요청합니다. 역할과 권한을 골라 승인하면 그 아이디로
        PC와 휴대폰 앱에 로그인할 수 있습니다.
      </p>

      {message && (
        <p className={`mb-3 rounded-md px-3 py-2 text-sm ${message.tone === 'error' ? 'bg-[#fdecea] text-[#b42318]' : 'bg-[#eef6f1] text-[#1f6b3a]'}`}>
          {message.text}
        </p>
      )}
      {unavailable && <p className="rounded-md bg-[#fff8e6] px-3 py-2 text-sm text-[#5c4614]">{unavailable}</p>}
      {!unavailable && !links && !message && (
        <p className="inline-flex items-center gap-2 text-sm text-[#60717d]">
          <Loader2 className="animate-spin" size={16} /> 불러오는 중
        </p>
      )}

      {!unavailable && links && (
        <div className="grid gap-5">
          {requests.length > 0 && (
            <div className="grid gap-3">
              <h3 className="font-semibold text-[#171512]">가입 요청 {requests.length}건</h3>
              {requests.map((request) => {
                const decision = decisionOf(request.id);
                return (
                  <article key={request.id} className="grid gap-3 rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-4">
                    <div>
                      <p className="font-semibold text-[#171512]">
                        {request.name} · {phoneText(request.phone)} · 아이디 {request.loginId}
                      </p>
                      <p className="mt-0.5 text-sm text-[#60717d]">
                        {seoulMonthDay(request.createdAt, true)} 요청{request.linkMemo ? ` · 링크: ${request.linkMemo}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <span className="font-semibold text-[#4d5d66]">역할</span>
                      {(['staff', 'admin'] as const).map((role) => (
                        <label key={role} className="inline-flex items-center gap-1.5">
                          <input
                            type="radio"
                            name={`role-${request.id}`}
                            checked={decision.role === role}
                            onChange={() => setDecision(request.id, { ...decision, role })}
                            disabled={busy}
                          />
                          {role === 'staff' ? '직원' : '총괄 관리자'}
                        </label>
                      ))}
                    </div>
                    {decision.role === 'staff' ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-semibold text-[#4d5d66]">빠른 선택</span>
                          {PERMISSION_PRESETS.map((preset) => (
                            <button
                              key={preset.key}
                              type="button"
                              className={secondaryButton}
                              onClick={() => setDecision(request.id, { ...decision, permissions: [...preset.permissions] })}
                              disabled={busy}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {GRANTABLE.map((permission) => (
                            <label key={permission} className="flex items-center gap-2 rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold">
                              <input
                                type="checkbox"
                                checked={decision.permissions.includes(permission)}
                                onChange={(event) =>
                                  setDecision(request.id, {
                                    ...decision,
                                    permissions: event.target.checked
                                      ? GRANTABLE.filter((item) => item === permission || decision.permissions.includes(item))
                                      : decision.permissions.filter((item) => item !== permission),
                                  })
                                }
                                disabled={busy}
                              />
                              {permissionLabels[permission]}
                            </label>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-[#60717d]">총괄 관리자는 계정 권한을 포함한 모든 메뉴를 씁니다.</p>
                    )}
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" className={secondaryButton} onClick={() => reject(request)} disabled={busy}>
                        거절
                      </button>
                      <button type="button" className={primaryButton} onClick={() => void approve(request)} disabled={busy}>
                        {busy ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                        승인
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-[#171512]">가입 링크</h3>
              {!creating && (
                <button type="button" className={secondaryButton} onClick={() => setCreating(true)} disabled={busy}>
                  <Link2 size={16} />
                  가입 링크 만들기
                </button>
              )}
            </div>

            {creating && (
              <div className="grid gap-3 rounded-lg border border-[#d5dde2] bg-[#f7fafb] p-4">
                {createdUrl ? (
                  <>
                    <p className="text-sm font-semibold text-[#171512]">가입 링크를 만들었습니다. 카톡 등으로 직원에게 보내 주세요.</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input className={input} value={createdUrl} readOnly onFocus={(event) => event.target.select()} aria-label="가입 링크" />
                      <button type="button" className={primaryButton} onClick={() => void copyUrl()}>
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                        {copied ? '복사함' : '복사'}
                      </button>
                    </div>
                    <p className="text-sm text-[#8a6215]">이 창을 닫으면 링크를 다시 볼 수 없습니다. 잃어버리면 취소하고 새로 만드세요.</p>
                    <div className="flex justify-end">
                      <button type="button" className={secondaryButton} onClick={closeCreate}>
                        닫기
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <label className="grid gap-1 text-sm font-semibold text-[#4d5d66]">
                      누구에게 (메모)
                      <input
                        className={input}
                        value={memo}
                        maxLength={30}
                        onChange={(event) => setMemo(event.target.value)}
                        placeholder="예: 현장팀 박OO"
                        disabled={busy}
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <span className="font-semibold text-[#4d5d66]">유효기간</span>
                      {LINK_DAYS.map((option) => (
                        <label key={option} className="inline-flex items-center gap-1.5">
                          <input type="radio" name="signup-link-days" checked={days === option} onChange={() => setDays(option)} disabled={busy} />
                          {option}일
                        </label>
                      ))}
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" className={secondaryButton} onClick={closeCreate} disabled={busy}>
                        닫기
                      </button>
                      <button type="button" className={primaryButton} onClick={() => void createLink()} disabled={busy || !memo.trim()}>
                        {busy && <Loader2 className="animate-spin" size={16} />}
                        만들기
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {links.length === 0 ? (
              <p className="text-sm text-[#60717d]">아직 쓰이지 않은 가입 링크가 없습니다.</p>
            ) : (
              <ul className="grid gap-2">
                {links.map((link) => (
                  <li key={link.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#d5dde2] px-3 py-2 text-sm">
                    <span>
                      <span className="font-semibold text-[#171512]">{link.memo}</span>
                      <span className="text-[#60717d]">
                        {' '}
                        · 만든 사람 {link.createdByName} · {seoulMonthDay(link.expiresAt, false)}까지
                      </span>
                    </span>
                    <button type="button" className={secondaryButton} onClick={() => revokeLink(link)} disabled={busy}>
                      취소
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
