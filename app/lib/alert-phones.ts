// Rules for the phone numbers that receive the consultation alimtalk, shared by the manager screen and the server.

export const MAX_ALERT_PHONES = 5;

export type AlertPhoneSource = 'manager' | 'env' | 'none';

export function normalizeKoreanMobile(value: string): string | null {
  const digits = String(value || '').replace(/\D/g, '').replace(/^82(?=1)/, '0');
  return /^01[016789]\d{7,8}$/.test(digits) ? digits : null;
}

export function formatKoreanMobile(digits: string) {
  return digits.length === 11
    ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
    : `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function maskPhone(digits: string) {
  const [head, middle, tail] = formatKoreanMobile(digits).split('-');
  return `${head}-${'*'.repeat(middle.length)}-${tail}`;
}

export function parseAlertPhoneList(value: unknown): { ok: true; phones: string[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) return { ok: false, error: '번호 목록 형식이 올바르지 않습니다.' };

  const phones: string[] = [];
  for (const item of value) {
    const normalized = normalizeKoreanMobile(String(item));
    if (!normalized) return { ok: false, error: `올바른 휴대폰 번호가 아닙니다: ${String(item).trim()}` };
    if (!phones.includes(normalized)) phones.push(normalized);
  }
  if (phones.length > MAX_ALERT_PHONES) return { ok: false, error: `번호는 최대 ${MAX_ALERT_PHONES}개까지 등록할 수 있습니다.` };
  return { ok: true, phones };
}

// The list saved in the manager wins; when it is empty the Vercel environment values keep working as before.
export function pickAlertPhones(saved: string[] | null | undefined, envPhones: string[]): { phones: string[]; source: AlertPhoneSource } {
  if (saved && saved.length > 0) return { phones: saved, source: 'manager' };
  if (envPhones.length > 0) return { phones: envPhones, source: 'env' };
  return { phones: [], source: 'none' };
}
