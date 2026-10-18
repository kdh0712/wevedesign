// Values shared by the public customer progress page, its verify API and the photo gallery.
// Plain constants and pure helpers only (no Next.js imports), so Node tests can load this file directly.

export const PROGRESS_CONTACT_PHONE = '031-381-0489';

// Same text on the page and in the verify API, so neither one tells a visitor whether a code exists.
export const PROGRESS_LINK_OFF_MESSAGE = `링크가 꺼져 있습니다. 위브디자인(${PROGRESS_CONTACT_PHONE})으로 문의해 주세요.`;

export const PROGRESS_WRONG_LAST4_MESSAGE = '번호가 맞지 않습니다.';

export const PROGRESS_NO_PHONE_MESSAGE = `등록된 고객 번호가 없어 확인할 수 없습니다. 위브디자인(${PROGRESS_CONTACT_PHONE})으로 문의해 주세요.`;

export const PROGRESS_UNAVAILABLE_MESSAGE = `지금은 확인할 수 없습니다. 잠시 후 다시 시도하거나 위브디자인(${PROGRESS_CONTACT_PHONE})으로 문의해 주세요.`;

// A check that could not be recorded (another check or a staff edit got there first, or the store failed). The same answer
// for a right and a wrong number, so it tells a visitor nothing.
export const PROGRESS_RETRY_MESSAGE = '잠시 후 다시 시도해 주세요.';

// The wait, rounded up to whole minutes: "15분" under an hour, "1시간 30분" or "24시간" from an hour on (locks reach 24 hours).
export function progressLockedMessage(retryAfterSeconds: number): string {
  const totalMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const wait = hours === 0 ? `${minutes}분` : minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
  return `확인 시도가 너무 많습니다. ${wait} 뒤에 다시 시도해 주세요.`;
}

// Link codes are base64url (letters, digits, "-" and "_"). Anything else cannot be a code, so it is never looked up.
export function isProgressCodeShape(code: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(code);
}

// Shown above the records when the server could not make the photo URLs (the records show without photos).
export const PROGRESS_PHOTOS_UNAVAILABLE_MESSAGE = '사진을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';
