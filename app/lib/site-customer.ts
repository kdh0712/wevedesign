// Which customer record belongs to a site, for the manager screens that show or send to "the site's customer" (the
// dashboard's 알림톡 button, the daily report window). Pure, with no imports, so tests can load it directly.
//
// The site's own link (customerId) decides whenever that customer is loaded. One person often has several customer records
// (the 고객 tab and 상담 → 고객 always create a new one), and different people share names, so phone and name only stand
// in when the link cannot be followed, and only when exactly one customer fits: a second record of the same person or a
// namesake is never picked over the linked customer, and several candidates are never guessed between.

type SiteLink = { customerId?: string; customerName?: string; customerPhone?: string };
type CustomerCandidate = { _id: string; name?: string; phone?: string };

const digits = (value: unknown) => (typeof value === 'string' ? value.replace(/\D/g, '') : '');
const trimmed = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

// A number short of 9 digits (a placeholder, a typo) is not enough to tell customers apart.
const MIN_PHONE_DIGITS = 9;

const onlyOne = <C>(matches: C[]): C | undefined => (matches.length === 1 ? matches[0] : undefined);

export function findSiteCustomer<C extends CustomerCandidate>(site: SiteLink, customers: readonly C[]): C | undefined {
  const customerId = trimmed(site.customerId);
  if (customerId) {
    const linked = customers.find((customer) => customer._id === customerId);
    if (linked) return linked;
  }

  // A site with a number is matched by that number only: a customer with the same name but another number is someone else.
  const phone = digits(site.customerPhone);
  if (phone.length >= MIN_PHONE_DIGITS) return onlyOne(customers.filter((customer) => digits(customer.phone) === phone));

  const name = trimmed(site.customerName);
  if (!name) return undefined;
  return onlyOne(customers.filter((customer) => trimmed(customer.name) === name));
}
