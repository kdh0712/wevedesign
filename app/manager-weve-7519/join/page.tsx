'use client';

// The staff sign-up page. The link's token is after '#', so it stays in the browser: the page sends it to
// /api/staff-signup in a POST body only. This page loads none of the manager screen's code.
// Spec: docs/superpowers/specs/2026-11-21-staff-signup-approval-design.md §3.2, §5.2
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { UNUSABLE_LINK_MESSAGE, loginIdError, normalizeLoginId, validateSignupInput } from '../../lib/staff-signup-rules';

type Phase = { kind: 'checking' } | { kind: 'unusable' } | { kind: 'problem'; text: string } | { kind: 'form' } | { kind: 'done' };
type Answer = { ok?: boolean; error?: string };

const field = 'mt-1 h-12 w-full rounded-lg border border-[#d5dde2] bg-white px-4 text-base text-[#171512] outline-none focus:border-[#273541]';
const labelText = 'text-sm font-semibold text-[#4d5d66]';

async function ask(body: Record<string, unknown>): Promise<{ status: number; data: Answer }> {
  const response = await fetch('/api/staff-signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = (await response.json().catch(() => ({}))) as Answer;
  return { status: response.status, data };
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-[100dvh] bg-[#eef3f5] px-4 py-8 text-[#171512]" style={{ paddingTop: 'max(2rem, env(safe-area-inset-top))' }}>
      <div className="mx-auto w-full max-w-md rounded-lg border border-[#d5dde2] bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#60717d]">WEVE DESIGN</p>
        <h1 className="mt-1 text-xl font-bold text-[#171512]">위브디자인 직원 가입</h1>
        <div className="mt-5">{children}</div>
      </div>
    </main>
  );
}

const loginLink = (
  <Link href="/manager-weve-7519" className="mt-5 inline-flex h-11 items-center justify-center rounded-lg border border-[#d5dde2] bg-white px-4 text-sm font-semibold text-[#273541]">
    로그인 화면으로
  </Link>
);

export default function StaffJoinPage() {
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });
  const tokenRef = useRef('');
  const startedAtRef = useRef(0);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [website, setWebsite] = useState('');
  const [loginIdNote, setLoginIdNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = window.location.hash.replace(/^#/, '');
    tokenRef.current = token;
    if (!token) {
      setPhase({ kind: 'unusable' });
      return;
    }
    ask({ action: 'check', token })
      .then(({ status, data }) => {
        if (status === 200 && data.ok) {
          startedAtRef.current = Date.now();
          setPhase({ kind: 'form' });
        } else if (status === 200) setPhase({ kind: 'unusable' });
        else setPhase({ kind: 'problem', text: data.error || '지금은 링크를 확인할 수 없습니다. 잠시 후 다시 열어 주세요.' });
      })
      .catch(() => setPhase({ kind: 'problem', text: '연결이 불안정합니다. 잠시 후 다시 열어 주세요.' }));
  }, []);

  // Tells right away when the id cannot be used; the link is not used up by this.
  const checkLoginId = async () => {
    const value = normalizeLoginId(loginId);
    if (!value) {
      setLoginIdNote('');
      return;
    }
    const problem = loginIdError(value);
    if (problem) {
      setLoginIdNote(problem);
      return;
    }
    try {
      const { status, data } = await ask({ action: 'checkLoginId', token: tokenRef.current, loginId: value });
      if (status === 404) setPhase({ kind: 'unusable' });
      else setLoginIdNote(data.ok ? '' : data.error || '');
    } catch {
      setLoginIdNote('');
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const checked = validateSignupInput({ name, phone, loginId, password });
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    if (password.trim() !== confirm.trim()) {
      setError('비밀번호가 서로 다릅니다.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const { status, data } = await ask({
        action: 'submit',
        token: tokenRef.current,
        name,
        phone,
        loginId,
        password,
        website,
        // Measured with the phone's clock only; the server compares it with nothing on its own clock.
        elapsedMs: Date.now() - startedAtRef.current,
      });
      if (status === 200 && data.ok) setPhase({ kind: 'done' });
      else if (status === 404) setPhase({ kind: 'unusable' });
      else {
        if (status === 409) setLoginIdNote(data.error || '');
        setError(data.error || '가입 요청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
    } catch {
      setError('연결이 불안정합니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  if (phase.kind === 'checking') {
    return (
      <Shell>
        <p className="text-sm text-[#60717d]">링크를 확인하는 중입니다.</p>
      </Shell>
    );
  }
  if (phase.kind === 'unusable' || phase.kind === 'problem') {
    return (
      <Shell>
        <p className="rounded-lg bg-[#fff8e6] px-4 py-3 text-sm leading-6 text-[#5c4614]">{phase.kind === 'unusable' ? UNUSABLE_LINK_MESSAGE : phase.text}</p>
      </Shell>
    );
  }
  if (phase.kind === 'done') {
    return (
      <Shell>
        <p className="rounded-lg bg-[#eef6f1] px-4 py-3 text-sm leading-6 text-[#1f6b3a]">
          가입 요청을 보냈습니다. 총괄 관리자가 승인하면 이 아이디로 로그인할 수 있습니다.
        </p>
        {loginLink}
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <label className="block">
          <span className={labelText}>이름</span>
          <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={30} className={field} />
        </label>
        <label className="block">
          <span className={labelText}>휴대폰</span>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="010-0000-0000"
            className={field}
          />
        </label>
        <label className="block">
          <span className={labelText}>아이디</span>
          <input
            value={loginId}
            onChange={(event) => {
              setLoginId(event.target.value);
              setLoginIdNote('');
            }}
            onBlur={() => void checkLoginId()}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={20}
            className={field}
          />
          <span className={`mt-1 block text-xs ${loginIdNote ? 'text-[#b42318]' : 'text-[#60717d]'}`}>
            {loginIdNote || '영문 소문자·숫자와 . _ - 로 4~20자'}
          </span>
        </label>
        <label className="block">
          <span className={labelText}>비밀번호</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className={field} />
          <span className="mt-1 block text-xs text-[#60717d]">8자 이상</span>
        </label>
        <label className="block">
          <span className={labelText}>비밀번호 확인</span>
          <input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" className={field} />
        </label>
        {/* Left empty by people; a filled value marks an automated submission (answered as success, nothing stored). */}
        <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
          <label>
            웹사이트
            <input value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <div className="space-y-1 text-xs leading-5 text-[#60717d]">
          <p>이름·휴대폰은 직원 계정 확인과 업무 연락에만 씁니다.</p>
          <p>승인되지 않은 요청은 30일 뒤 지워집니다.</p>
        </div>
        {error && <p className="rounded-lg bg-[#fdecea] px-4 py-3 text-sm text-[#b42318]">{error}</p>}
        <button type="submit" disabled={busy} className="h-12 w-full rounded-lg bg-[#273541] text-base font-bold text-white disabled:opacity-60">
          {busy ? '보내는 중…' : '가입 요청'}
        </button>
      </form>
    </Shell>
  );
}
