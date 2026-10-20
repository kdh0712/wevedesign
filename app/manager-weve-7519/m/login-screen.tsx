'use client';

import { useState, type FormEvent } from 'react';
import { Notice } from './mobile-ui';

export function LoginScreen({ onLogin, notice }: { onLogin: (loginId: string, password: string) => Promise<void>; notice?: string }) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!loginId.trim() || !password) {
      setError('아이디와 비밀번호를 입력해 주세요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onLogin(loginId.trim(), password);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : '로그인하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-6 py-10" style={{ paddingTop: 'max(2.5rem, env(safe-area-inset-top))' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/staff-app/icon-192.png" alt="" className="mx-auto h-16 w-16 rounded-2xl border border-[#eadfcd]" />
      <h1 className="mt-4 text-center text-2xl font-bold text-[#171512]">위브 업무</h1>
      <p className="mt-1 text-center text-sm text-[#625d54]">위브디자인 직원용</p>

      <form onSubmit={submit} className="mt-8 space-y-3" noValidate>
        {notice && <Notice tone="warn">{notice}</Notice>}
        <label className="block">
          <span className="text-sm font-semibold text-[#514c43]">아이디 또는 이메일</span>
          <input
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            inputMode="email"
            className="mt-1 h-12 w-full rounded-xl border border-[#d8d1c5] bg-white px-4 text-base text-[#171512] outline-none focus:border-[#8f6f43]"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-[#514c43]">비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            className="mt-1 h-12 w-full rounded-xl border border-[#d8d1c5] bg-white px-4 text-base text-[#171512] outline-none focus:border-[#8f6f43]"
          />
        </label>
        {error && <Notice>{error}</Notice>}
        <button type="submit" disabled={busy} className="h-12 w-full rounded-xl bg-[#171512] text-base font-bold text-[#fffdf8] disabled:opacity-60">
          {busy ? '확인하는 중…' : '로그인'}
        </button>
        <p className="text-center text-xs text-[#8b8276]">한 번 로그인하면 이 휴대폰에서 30일 동안 유지돼요.</p>
      </form>
    </main>
  );
}
