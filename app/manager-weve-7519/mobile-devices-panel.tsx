'use client';

import { useEffect, useState } from 'react';
import { Loader2, Smartphone, Unplug } from 'lucide-react';
import { formatSeoulDateTime } from './progress-manager';

type MobileDevice = {
  _id: string;
  userName: string;
  loginId: string;
  deviceLabel: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
};

const APP_PATH = '/manager-weve-7519/m';

// Admin-only list of the phones logged in to the staff app (spec §3). Revoking signs the phone out at its next
// session refresh, within an hour.
export function MobileDevicesPanel({ authHeaders }: { authHeaders: () => Record<string, string> }) {
  const [devices, setDevices] = useState<MobileDevice[] | null>(null);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);

  const request = async (init?: RequestInit) => {
    const response = await fetch('/api/manager/mobile/devices', { ...init, headers: { ...authHeaders(), ...(init?.headers || {}) } });
    const data = (await response.json().catch(() => ({}))) as { devices?: MobileDevice[]; error?: string };
    if (!response.ok) throw new Error(data.error || '휴대폰 로그인 기기를 처리하지 못했습니다.');
    return data;
  };

  const load = () =>
    request()
      .then((data) => setDevices(data.devices || []))
      .catch((caught) => setMessage({ tone: 'error', text: caught instanceof Error ? caught.message : '기기 목록을 불러오지 못했습니다.' }));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const revoke = async (device: MobileDevice) => {
    if (!window.confirm(`${device.userName}(${device.deviceLabel}) 기기는 늦어도 1시간 안에 로그아웃됩니다. 끊을까요?`)) return;
    setBusyId(device._id);
    setMessage(null);
    try {
      await request({ method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: device._id }) });
      setDevices((current) => (current || []).filter((item) => item._id !== device._id));
      setMessage({ tone: 'ok', text: `${device.userName}의 ${device.deviceLabel} 로그인을 끊었습니다.` });
    } catch (caught) {
      setMessage({ tone: 'error', text: caught instanceof Error ? caught.message : '기기 로그인을 끊지 못했습니다.' });
    } finally {
      setBusyId('');
    }
  };

  return (
    <section className="rounded-lg border border-[#d5dde2] bg-white p-4 shadow-sm">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
        <span className="h-2 w-2 rounded-full bg-[#38bcd4]" />
        휴대폰 로그인 기기
      </h2>
      <p className="mb-3 text-sm leading-6 text-[#60717d]">
        직원은 휴대폰에서 <b className="text-[#171512]">{APP_PATH}</b>에 들어가 로그인한 뒤 "홈 화면에 추가"로 앱처럼 씁니다. 로그인은 30일 동안
        유지되고, 아래에서 끊으면 1시간 안에 로그아웃됩니다.
      </p>
      {!devices && !message && (
        <p className="inline-flex items-center gap-2 text-sm text-[#60717d]">
          <Loader2 className="animate-spin" size={16} /> 불러오는 중
        </p>
      )}
      {devices && devices.length === 0 && <p className="text-sm text-[#87949c]">로그인한 휴대폰이 없습니다.</p>}
      {devices && devices.length > 0 && (
        <ul className="grid gap-2">
          {devices.map((device) => (
            <li key={device._id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#d5dde2] bg-[#f7fafb] px-3 py-2">
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-semibold">
                  <Smartphone size={16} className="text-[#38a9bd]" />
                  {device.userName} <span className="font-normal text-[#60717d]">({device.loginId})</span>
                </span>
                <span className="block text-xs leading-5 text-[#60717d]">
                  {device.deviceLabel} · 로그인 {formatSeoulDateTime(device.createdAt)} · 마지막 사용 {formatSeoulDateTime(device.lastUsedAt)} · 만료{' '}
                  {formatSeoulDateTime(device.expiresAt)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void revoke(device)}
                disabled={busyId !== ''}
                className="inline-flex items-center gap-1 rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 disabled:opacity-50"
              >
                {busyId === device._id ? <Loader2 className="animate-spin" size={14} /> : <Unplug size={14} />} 로그인 끊기
              </button>
            </li>
          ))}
        </ul>
      )}
      {message && <p className={`mt-3 text-sm font-semibold ${message.tone === 'ok' ? 'text-[#1f6f7f]' : 'text-red-600'}`}>{message.text}</p>}
    </section>
  );
}
