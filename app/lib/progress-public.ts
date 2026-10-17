// Values shared by the public customer progress page, its verify API and the photo gallery.
// Plain constants and pure helpers only (no Next.js imports), so Node tests can load this file directly.

export const PROGRESS_CONTACT_PHONE = '031-381-0489';

// Same text on the page and in the verify API, so neither one tells a visitor whether a code exists.
export const PROGRESS_LINK_OFF_MESSAGE = `링크가 꺼져 있습니다. 위브디자인(${PROGRESS_CONTACT_PHONE})으로 문의해 주세요.`;

export const PROGRESS_WRONG_LAST4_MESSAGE = '번호가 맞지 않습니다.';

export const PROGRESS_NO_PHONE_MESSAGE = `등록된 고객 번호가 없어 확인할 수 없습니다. 위브디자인(${PROGRESS_CONTACT_PHONE})으로 문의해 주세요.`;

export const PROGRESS_UNAVAILABLE_MESSAGE = `지금은 확인할 수 없습니다. 잠시 후 다시 시도하거나 위브디자인(${PROGRESS_CONTACT_PHONE})으로 문의해 주세요.`;

export function progressLockedMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `확인 시도가 너무 많습니다. ${minutes}분 뒤에 다시 시도해 주세요.`;
}

// Link codes are base64url (letters, digits, "-" and "_"). Anything else cannot be a code, so it is never looked up.
export function isProgressCodeShape(code: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(code);
}

// Sanity's image CDN resizes with query parameters: list thumbnails use w=800, the enlarged view w=1600.
export function progressPhotoUrl(url: string, width: number): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}w=${width}&auto=format`;
}
