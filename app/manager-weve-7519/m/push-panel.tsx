'use client';

import { Bell, BellOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { isIosUserAgent, PUSH_PANEL_TEXT, pushPanelState, urlBase64ToBytes, type PushEnv } from './push-state';

// 새 상담 알림 on this phone (spec 2026-10-21 staff push §3). The browser subscription is saved on the server only after
// every step worked, so the panel never says 켜짐 when it is not.

export const SERVICE_WORKER_URL = '/manager-weve-7519/m/sw.js';
export const SERVICE_WORKER_SCOPE = '/manager-weve-7519/m';

type Request = (url: string, init?: RequestInit) => Promise<Record<string, unknown>>;
type Credentials = { deviceId: string; deviceToken: string };

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

// Each browser step fails with its own Korean line; the browser's own (English) error text is never shown.
const step = async <T,>(task: () => Promise<T>, failure: string): Promise<T> => {
  try {
    return await task();
  } catch {
    throw new Error(failure);
  }
};

async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: SERVICE_WORKER_SCOPE });
  // ready never settles if the worker cannot control this page, so it is given 10 seconds.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
  ]);
}

export function PushPanel({ request, credentials }: { request: Request; credentials: () => Credentials | null }) {
  const [env, setEnv] = useState<PushEnv | null>(null);
  const [publicKey, setPublicKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const busyRef = useRef(false);
  const requestRef = useRef(request);
  requestRef.current = request;

  const post = (body: Record<string, unknown>) => {
    const device = credentials();
    if (!device) throw new Error('이 휴대폰 로그인을 확인하지 못했어요. 다시 로그인해 주세요.');
    return requestRef.current('/api/manager/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, ...device }),
    });
  };

  useEffect(() => {
    let alive = true;
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const base = {
      supported,
      isIos: isIosUserAgent(navigator.userAgent),
      standalone,
      permission: (supported ? Notification.permission : 'default') as PushEnv['permission'],
    };
    (async () => {
      try {
        const config = await requestRef.current('/api/manager/push');
        const configured = Boolean(config.configured) && typeof config.publicKey === 'string' && config.publicKey !== '';
        let subscribed = false;
        if (configured && supported && credentials()) {
          // Both sides must agree: the server has this phone, and the browser still has its subscription.
          const [status, registration] = await Promise.all([post({ action: 'status' }), navigator.serviceWorker.getRegistration(SERVICE_WORKER_SCOPE)]);
          const browserSubscription = registration ? await registration.pushManager.getSubscription() : null;
          subscribed = Boolean(status.subscribed) && Boolean(browserSubscription);
        }
        if (!alive) return;
        setPublicKey(configured ? String(config.publicKey) : '');
        setEnv({ ...base, configured, subscribed });
      } catch (error) {
        if (!alive) return;
        setEnv({ ...base, configured: true, subscribed: false });
        setMessage({ tone: 'error', text: errorText(error, '알림 상태를 확인하지 못했어요.') });
      }
    })();
    return () => {
      alive = false;
    };
    // credentials reads storage each time; the panel checks once when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (task: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await task();
    } catch (error) {
      setMessage({ tone: 'error', text: errorText(error, '알림 설정을 바꾸지 못했어요.') });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const turnOn = () =>
    run(async () => {
      const permission = await step(() => Notification.requestPermission(), '알림 허용을 물어보지 못했어요. 다시 눌러 주세요.');
      setEnv((current) => (current ? { ...current, permission } : current));
      // 'denied' shows the settings hint as the panel text; a closed prompt leaves it 'default'.
      if (permission === 'default') throw new Error('알림 허용 창이 닫혔어요. [알림 켜기]를 다시 눌러 [허용]을 골라 주세요.');
      if (permission !== 'granted') return;
      const registration = await step(readyRegistration, '알림을 받을 준비를 하지 못했어요. 앱을 닫았다가 다시 열어 주세요.');
      const subscription = await step(
        async () =>
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(publicKey) as BufferSource })),
        '이 휴대폰에서 알림을 등록하지 못했어요. 잠시 후 다시 시도해 주세요.',
      );
      // Server answers (and connection problems) already come as Korean messages.
      await post({ action: 'subscribe', subscription: subscription.toJSON() });
      setEnv((current) => (current ? { ...current, subscribed: true } : current));
      setMessage({ tone: 'ok', text: '알림을 켰어요. [시험 알림]으로 확인해 보세요.' });
    });

  const turnOff = () =>
    run(async () => {
      await post({ action: 'unsubscribe' });
      const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_SCOPE);
      await (await registration?.pushManager.getSubscription())?.unsubscribe().catch(() => undefined);
      setEnv((current) => (current ? { ...current, subscribed: false } : current));
      setMessage({ tone: 'ok', text: '이 휴대폰의 새 상담 알림을 껐어요.' });
    });

  const sendTest = () =>
    run(async () => {
      const result = (await post({ action: 'test' })).result;
      setMessage(
        result === 'sent'
          ? { tone: 'ok', text: '시험 알림을 보냈어요. 잠시 뒤 휴대폰 알림을 확인해 주세요.' }
          : { tone: 'error', text: '시험 알림을 보내지 못했어요. 알림을 껐다가 다시 켜 주세요.' },
      );
    });

  if (!env || !credentials()) return null;
  const state = pushPanelState(env);
  const on = state === 'on';

  return (
    <div className="rounded-2xl border border-[#eadfcd] bg-white px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-bold text-[#171512]">
        {on ? <Bell className="h-4 w-4 text-[#8f6f43]" aria-hidden="true" /> : <BellOff className="h-4 w-4 text-[#8b8276]" aria-hidden="true" />}
        새 상담 알림 {on ? '켜짐' : '꺼짐'}
      </p>
      <p className="mt-1 text-sm text-[#625d54]">{PUSH_PANEL_TEXT[state]}</p>
      {(state === 'off' || state === 'on') && (
        <div className="mt-2 flex gap-2">
          {state === 'off' ? (
            <button
              type="button"
              onClick={() => void turnOn()}
              disabled={busy}
              className="h-10 flex-1 rounded-xl bg-[#171512] text-sm font-bold text-[#fffdf8] disabled:opacity-50"
            >
              {busy ? '켜는 중…' : '알림 켜기'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void sendTest()}
                disabled={busy}
                className="h-10 flex-1 rounded-xl border border-[#171512] text-sm font-bold text-[#171512] disabled:opacity-50"
              >
                시험 알림
              </button>
              <button
                type="button"
                onClick={() => void turnOff()}
                disabled={busy}
                className="h-10 flex-1 rounded-xl border border-[#d8d1c5] text-sm text-[#514c43] disabled:opacity-50"
              >
                끄기
              </button>
            </>
          )}
        </div>
      )}
      {message && (
        <p className={`mt-2 text-xs ${message.tone === 'ok' ? 'text-[#24502d]' : 'text-[#8a1f17]'}`} role={message.tone === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
    </div>
  );
}
