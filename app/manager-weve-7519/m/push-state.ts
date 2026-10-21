// What the 새 상담 알림 panel shows (spec docs/superpowers/specs/2026-10-21-staff-push-android-design.md §3). Pure, so the
// order of the checks is tested in Node.

export type PushEnv = {
  configured: boolean;
  supported: boolean;
  isIos: boolean;
  standalone: boolean;
  permission: 'default' | 'granted' | 'denied';
  subscribed: boolean;
};

export type PushPanelState = 'unconfigured' | 'unsupported' | 'install-first' | 'denied' | 'off' | 'on';

// An iPhone outside the home screen app reports no push support at all, so the install hint comes before "unsupported".
export function pushPanelState(env: PushEnv): PushPanelState {
  if (!env.configured) return 'unconfigured';
  if (env.isIos && !env.standalone) return 'install-first';
  if (!env.supported) return 'unsupported';
  if (env.permission === 'denied') return 'denied';
  return env.subscribed && env.permission === 'granted' ? 'on' : 'off';
}

export const PUSH_PANEL_TEXT: Record<PushPanelState, string> = {
  unconfigured: '알림 기능이 아직 설정되지 않았어요.',
  unsupported: '이 휴대폰에서는 알림을 받을 수 없어요.',
  'install-first': '홈 화면에 추가한 앱에서만 알림을 켤 수 있어요. 공유 버튼 → 홈 화면에 추가 → 추가한 아이콘으로 열어 주세요.',
  denied: "휴대폰 설정에서 '위브 업무' 알림을 허용해 주세요.",
  off: '새 상담이 들어오면 이 휴대폰으로 알려 드려요.',
  on: '새 상담이 오면 알려 드려요.',
};

export const isIosUserAgent = (ua: string) => /iPhone|iPad|iPod/.test(ua);

// The VAPID public key (base64url) as the bytes PushManager.subscribe wants for applicationServerKey.
export function urlBase64ToBytes(value: string): Uint8Array {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
