// Which number belongs to the customer of a site. The same answer feeds the progress check (its last four digits), the
// customer cookie (all its digits) and the progress alimtalk (a mobile only), so the three always agree.
// Pure; its only import is a relative .ts module, so tests can load this file directly.
import { normalizeKoreanMobile } from '../../lib/alert-phones.ts';

const asText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

// The site's own number when it is a mobile, otherwise the linked customer's record may have one.
export function needsCustomerRecordPhone(sitePhone: unknown): boolean {
  return !normalizeKoreanMobile(asText(sitePhone));
}

// A mobile wins, so a site saved with a landline still reaches the customer's phone:
// 1. the site's own number, if it is a Korean mobile; 2. the linked customer's number, if it is a mobile;
// 3. the site's own number, if it has any digit; 4. the customer's number, if it has any digit; 5. otherwise ''.
// A mobile is returned as normalized digits (01012345678); another number as stored, trimmed.
export function pickCustomerPhone(sitePhone: unknown, customerPhone: unknown): string {
  const site = asText(sitePhone);
  const customer = asText(customerPhone);
  return (
    normalizeKoreanMobile(site) ||
    normalizeKoreanMobile(customer) ||
    (/\d/.test(site) ? site : '') ||
    (/\d/.test(customer) ? customer : '')
  );
}
