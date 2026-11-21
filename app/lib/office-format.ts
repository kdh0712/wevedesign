// Formatting and wording shared by the manager screens (customer and site forms, the alimtalk window). Pure, no imports,
// so Node tests can load this file directly.

// Formats a phone number as it is typed or pasted. A Korean mobile written in international form (+82 10…, 82 10…, which
// Kakao account numbers use) becomes its 010… number first; cutting it to 11 digits as it is would turn it into a
// different, valid-looking number.
export function formatPhoneNumber(value: string) {
  const typed = value.replace(/\D/g, '');
  const rawDigits = /^821/.test(typed) ? `0${typed.slice(2)}` : typed;
  const maxLength = rawDigits.startsWith('050') ? 12 : 11;
  const digits = rawDigits.slice(0, maxLength);

  if (digits.startsWith('02')) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 10) return `${digits.slice(0, 2)}-${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`;
  }

  if (digits.startsWith('050')) {
    if (digits.length <= 4) return digits;
    if (digits.length <= 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
  }

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

// "11/2" for an ISO time in Seoul, '' when there is none.
export function shortDate(value?: string) {
  if (!value) return '';
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' })
    .format(time)
    .replace(/\.\s?/g, '/')
    .replace(/\/$/, '');
}

// What to ask before the 계약 완료 안내 alimtalk goes out: a resend for this site, or a send over an old per-customer record
// (which, for a customer with one site, was almost certainly this site's). Neither blocks sending. null: send at once.
export function contractSendConfirmText(siteSentAt: string, legacySentAt: string): string | null {
  if (siteSentAt) return '이미 계약 완료 알림톡을 보낸 현장입니다. 고객에게 다시 보낼까요?';
  if (legacySentAt) return `이 고객에게 ${shortDate(legacySentAt)}에 고객 단위로 보낸 계약 완료 안내 기록이 있습니다. 이 현장 안내로 보낼까요?`;
  return null;
}

// After a site registered from a consultation is saved: whether the consultation could be marked 완료 too.
export function registrationNotice(consultationDone: boolean): { tone: 'status' | 'error'; text: string } {
  return consultationDone
    ? { tone: 'status', text: '고객과 현장을 등록하고 상담을 완료했습니다.' }
    : { tone: 'error', text: '현장은 저장했지만 상담을 완료하지 못했습니다. 상담 요청에서 완료로 바꿔 주세요.' };
}
