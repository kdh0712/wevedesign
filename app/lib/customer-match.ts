// Rules behind the merged 고객·현장 tab: finding an existing customer while registering a site, grouping sites by customer,
// which sites follow a customer edit, and when a customer may not be deleted. Pure; its only import is a relative .ts
// module, so Node tests can load this file directly. Spec: docs/superpowers/specs/2026-11-21-customer-site-merge-design.md
import { normalizeKoreanMobile } from './alert-phones.ts';

export type MatchCustomer = { _id: string; name?: string; phone?: string; createdAt?: string };
export type MatchSite = {
  _id: string;
  title?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  address?: string;
  status?: string;
  createdAt?: string;
  deletedAt?: unknown;
};

// Below this many digits a number (a placeholder, a typo, a partial entry) is not enough to say two customers are one.
export const MIN_MATCH_PHONE_DIGITS = 9;
// A query needs this many digits before it is also looked for inside phone numbers.
const MIN_QUERY_DIGITS = 4;
const DEFAULT_SUGGESTIONS = 8;

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const normalize = (value: unknown) => text(value).toLowerCase().replace(/\s+/g, '');
const digitsOf = (value: unknown) => text(value).replace(/\D/g, '');
const isTrashed = (site: MatchSite) => Boolean(site.deletedAt);

// One key per number: a Korean mobile in its 010… form (so +82 10…, spaces and hyphens agree), anything else as its digits.
export function phoneKey(value: unknown): string {
  const raw = text(value);
  return normalizeKoreanMobile(raw) || digitsOf(raw);
}

// The digits of a query, as a mobile key when the query is a whole mobile number.
const queryDigits = (query: string) => {
  const digits = phoneKey(query);
  return digits.length >= MIN_QUERY_DIGITS ? digits : '';
};

export function findSamePhoneCustomers<C extends MatchCustomer>(phone: unknown, customers: readonly C[], excludeId?: string): C[] {
  const key = phoneKey(phone);
  if (key.length < MIN_MATCH_PHONE_DIGITS) return [];
  return customers.filter((customer) => customer._id !== excludeId && phoneKey(customer.phone) === key);
}

export function countSitesByCustomer(sites: readonly MatchSite[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const site of sites) {
    const customerId = text(site.customerId);
    if (!customerId || isTrashed(site)) continue;
    counts.set(customerId, (counts.get(customerId) || 0) + 1);
  }
  return counts;
}

// Ranks: 0 the same whole number, 1 a name that starts with the query, 2 a name that contains it, 3 the query's digits inside
// the number. Equal ranks keep the input order.
export function suggestCustomers<C extends MatchCustomer>(query: string, customers: readonly C[], limit = DEFAULT_SUGGESTIONS): C[] {
  const q = normalize(query);
  if (!q) return [];
  const wholeNumber = phoneKey(query);
  const digits = queryDigits(query);

  const rankOf = (customer: C): number | null => {
    const number = phoneKey(customer.phone);
    if (wholeNumber.length >= MIN_MATCH_PHONE_DIGITS && number === wholeNumber) return 0;
    const name = normalize(customer.name);
    if (name.startsWith(q)) return 1;
    if (name.includes(q)) return 2;
    if (digits && number.includes(digits)) return 3;
    return null;
  };

  return customers
    .map((customer, index) => ({ customer, index, rank: rankOf(customer) }))
    .filter((entry): entry is { customer: C; index: number; rank: number } => entry.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.customer);
}

export function siteMatchesQuery(site: MatchSite, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  if ([site.title, site.customerName, site.address].some((value) => normalize(value).includes(q))) return true;
  const digits = queryDigits(query);
  return Boolean(digits) && phoneKey(site.customerPhone).includes(digits);
}

function customerMatchesQuery(customer: MatchCustomer, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  if (normalize(customer.name).includes(q)) return true;
  const digits = queryDigits(query);
  return Boolean(digits) && phoneKey(customer.phone).includes(digits);
}

export type CustomerGroup<C, S> = { customer: C | null; sites: S[] };

const newestFirst = (a: { createdAt?: string }, b: { createdAt?: string }) => text(b.createdAt).localeCompare(text(a.createdAt));

// The 고객별 보기 list. Customers with sites come first, by their newest site; customers without sites follow, by when they
// were registered; sites whose customer is not loaded (no link, or a link to a missing or trashed customer) come last.
// status '' (or none) means every status; include (a 현장 폴더) narrows the sites the same way. A customer that matches the
// query keeps all its sites (status and include still apply); otherwise only its sites that match the query stay. With a
// status or an include, a group without such a site is hidden.
export function groupSitesByCustomer<C extends MatchCustomer, S extends MatchSite>(input: {
  customers: readonly C[];
  sites: readonly S[];
  query: string;
  status?: string;
  include?: (site: S) => boolean;
}): CustomerGroup<C, S>[] {
  const { customers, query, status, include } = input;
  const live = input.sites.filter((site) => !isTrashed(site));
  const known = new Set(customers.map((customer) => customer._id));
  const narrowed = Boolean(status) || Boolean(include);
  const statusOk = (site: S) => (!status || site.status === status) && (!include || include(site));

  const withSites: CustomerGroup<C, S>[] = [];
  const withoutSites: CustomerGroup<C, S>[] = [];
  for (const customer of customers) {
    const own = live.filter((site) => site.customerId === customer._id);
    const customerHit = customerMatchesQuery(customer, query);
    const shown = own.filter((site) => statusOk(site) && (customerHit || siteMatchesQuery(site, query))).sort(newestFirst);
    if (!customerHit && shown.length === 0) continue;
    if (narrowed && shown.length === 0) continue;
    (shown.length > 0 ? withSites : withoutSites).push({ customer, sites: shown });
  }

  withSites.sort((a, b) => newestFirst(a.sites[0], b.sites[0]));
  withoutSites.sort((a, b) => newestFirst(a.customer ?? {}, b.customer ?? {}));

  const unlinked = live
    .filter((site) => !site.customerId || !known.has(site.customerId))
    .filter((site) => statusOk(site) && siteMatchesQuery(site, query))
    .sort(newestFirst);

  return [...withSites, ...withoutSites, ...(unlinked.length > 0 ? [{ customer: null, sites: unlinked }] : [])];
}

// A site keeps its own number only when it has one and it is not the customer's.
export function isSeparatePhone(sitePhone: unknown, customerPhone: unknown): boolean {
  const own = phoneKey(sitePhone);
  return own !== '' && own !== phoneKey(customerPhone);
}

// The customer's other sites that follow a customer edit: linked, not trashed, and carrying the customer's previous number
// or no number at all. A site with any other number (its own, or someone else's from an old wrong link) is left alone.
export function pickSitesToSync<S extends MatchSite>(sites: readonly S[], customerId: string, previousPhone: unknown): S[] {
  const previous = phoneKey(previousPhone);
  return sites.filter((site) => {
    if (site.customerId !== customerId || isTrashed(site)) return false;
    const own = phoneKey(site.customerPhone);
    return own === '' || (previous !== '' && own === previous);
  });
}

// The customer to offer a site that has no loaded customer: the one customer with the site's own number. A site without a
// number, or several customers with it, gets no suggestion; a customer who only shares the name is never offered (linking
// a namesake would hand the site, and its progress page and alimtalk, that person's number).
export function suggestLinkForUnlinkedSite<C extends MatchCustomer>(site: MatchSite, customers: readonly C[]): C | undefined {
  const matches = findSamePhoneCustomers(site.customerPhone, customers);
  return matches.length === 1 ? matches[0] : undefined;
}

export type SiteSelection = { mode: 'new'; key: number } | { mode: 'edit'; siteId: string };

// Moving the tab's form to another site or a new one. Reopening the site already open changes nothing (asking would wrongly
// promise to discard the edits, and answering yes would hide that they are still unsaved); otherwise a dirty form asks.
export function selectionChange(current: SiteSelection, next: SiteSelection, dirty: boolean): 'stay' | 'confirm' | 'go' {
  if (current.mode === 'edit' && next.mode === 'edit' && current.siteId === next.siteId) return 'stay';
  return dirty ? 'confirm' : 'go';
}

// Whether a site keeps its own number after another customer is picked for it: never for a new customer (customerPhone
// null), whose number the site takes over; for an existing one, when the site's number is its own (isSeparatePhone).
export function separatePhoneAfterPick(sitePhone: unknown, customerPhone: string | null): boolean {
  return customerPhone === null ? false : isSeparatePhone(sitePhone, customerPhone);
}

// A customer edit also rewrites the open site's copy only when that site is saved with this customer, not while another
// customer is picked but not saved yet.
export function customerEditTouchesOpenSite(savedCustomerId: string, editedCustomerId: string): boolean {
  return savedCustomerId !== '' && savedCustomerId === editedCustomerId;
}

export function customerDeleteBlockedMessage(total: number, trashed: number): string | null {
  if (total <= 0) return null;
  const trashNote = trashed > 0 ? `(휴지통 ${trashed}곳 포함)` : '';
  return `현장 ${total}곳${trashNote}이 연결돼 있어 삭제할 수 없습니다.`;
}

export type SiteFormValues = {
  title: string;
  siteType: string;
  address: string;
  status: string;
  memo: string;
  customerId: string;
  separatePhone: boolean;
  sitePhone: string;
};

export function isSiteFormDirty(initial: SiteFormValues, current: SiteFormValues): boolean {
  return (Object.keys(initial) as Array<keyof SiteFormValues>).some((key) => {
    const before = initial[key];
    const after = current[key];
    return typeof before === 'string' && typeof after === 'string' ? before.trim() !== after.trim() : before !== after;
  });
}
