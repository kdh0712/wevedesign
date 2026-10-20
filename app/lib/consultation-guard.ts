// Rules that keep the public consultation form from being abused: every submission saves a record and sends a paid
// alimtalk to every admin phone plus an email. No imports, so node tests load this file directly.

export const CONSULTATION_FIELD_LIMITS: Record<string, number> = {
  name: 40,
  phone: 20,
  propertyType: 40,
  areaRange: 40,
  homeStatus: 40,
  reason: 80,
  budget: 40,
  timeline: 40,
  postcode: 10,
  address: 200,
  detailAddress: 120,
  message: 2000,
};

export const CONSULTATION_FIELD_LABELS: Record<string, string> = {
  name: '이름',
  phone: '연락처',
  propertyType: '공간 종류',
  areaRange: '평수',
  homeStatus: '현재 상태',
  reason: '인테리어 이유',
  budget: '예산',
  timeline: '희망 시작일',
  postcode: '우편번호',
  address: '주소',
  detailAddress: '상세 주소',
  message: '요청사항',
};

export function phoneDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '');
}

// Korean mobile, landline and 050x numbers: 0 followed by 8 to 10 more digits.
export function isValidKoreanPhone(value: unknown) {
  return /^0\d{8,10}$/.test(phoneDigits(value));
}

// '' when the fields are acceptable, otherwise the message to show.
export function consultationFieldError(fields: Record<string, string>) {
  for (const [key, limit] of Object.entries(CONSULTATION_FIELD_LIMITS)) {
    if ((fields[key] || '').length > limit) return `${CONSULTATION_FIELD_LABELS[key] || key}은(는) ${limit}자 이내로 입력해 주세요.`;
  }
  if (!isValidKoreanPhone(fields.phone)) return '연락처를 정확히 입력해 주세요. (예: 010-1234-5678)';
  return '';
}

// A person needs a few seconds to fill the multi-step form; a filled hidden field or an instant submit is a bot.
// A page that sends no start time (opened before this check shipped) is not judged by time.
export const MIN_CONSULTATION_FILL_MS = 3000;

export function looksAutomated(input: { honeypot?: unknown; startedAt?: unknown; now: number }) {
  if (String(input.honeypot ?? '').trim()) return true;
  const startedAt = Number(input.startedAt);
  if (!Number.isFinite(startedAt) || startedAt <= 0) return false;
  return input.now - startedAt < MIN_CONSULTATION_FILL_MS;
}

export const DUPLICATE_CONSULTATION_WINDOW_MS = 10 * 60 * 1000;
export const CONSULTATION_IP_WINDOW_MS = 60 * 60 * 1000;
export const CONSULTATION_IP_LIMIT = 5;

export type RecentConsultation = { phoneDigits?: unknown; phone?: unknown; ipHash?: unknown; createdAt?: unknown };

// 'duplicate': the same number already applied within 10 minutes (a double click or a resend), so nothing new is
// saved or sent. 'too-many': the same connection sent 5 or more within an hour.
export function consultationRateDecision(
  recent: readonly RecentConsultation[],
  current: { phoneDigits: string; ipHash: string; now: number },
): 'ok' | 'duplicate' | 'too-many' {
  const ageOf = (record: RecentConsultation) => current.now - Date.parse(String(record.createdAt || ''));
  const within = (record: RecentConsultation, windowMs: number) => {
    const age = ageOf(record);
    return Number.isFinite(age) && age >= 0 && age < windowMs;
  };
  const samePhone = recent.some((record) => {
    const digits = phoneDigits(record.phoneDigits || record.phone);
    return Boolean(current.phoneDigits) && digits === current.phoneDigits && within(record, DUPLICATE_CONSULTATION_WINDOW_MS);
  });
  if (samePhone) return 'duplicate';
  const fromSameConnection = current.ipHash
    ? recent.filter((record) => record.ipHash === current.ipHash && within(record, CONSULTATION_IP_WINDOW_MS)).length
    : 0;
  return fromSameConnection >= CONSULTATION_IP_LIMIT ? 'too-many' : 'ok';
}

// The first address in x-forwarded-for (the client as Vercel saw it), else x-real-ip.
export function clientAddress(headers: { get(name: string): string | null }) {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip')?.trim() || '';
}
