// 견적 작업의 '현장 정보 수정' 팝업 (spec docs/superpowers/specs/2026-11-26-site-quick-edit-design.md): a site's fields and its
// customer's name and number, saved the way the 고객·현장 tab saves them. Pure; its only import is a relative .ts module, so
// Node tests can load this file directly.
import { isSeparatePhone, pickSitesToSync, type MatchSite } from './customer-match.ts';

export type QuickEditSite = MatchSite & { siteType?: string; memo?: string };
export type QuickEditCustomer = { _id: string; name?: string; phone?: string };
export type SiteQuickEditFields = {
  title: string;
  siteType: string;
  address: string;
  status: string;
  memo: string;
  // The linked customer's name and number (an unlinked site: the name it carries, shown read-only).
  customerName: string;
  customerPhone: string;
  // '이 현장은 다른 번호로 연락' and that number.
  separatePhone: boolean;
  sitePhone: string;
};
export type SiteQuickEditPlan = {
  customer?: { id: string; data: { name: string; phone: string } };
  site: { id: string; data: Record<string, string> };
  sync?: { customerId: string; previousPhone: string };
};

const text = (value: unknown) => (typeof value === 'string' ? value : '');

// The site form's defaults for a site saved without 종류 or 상태 (customer-site-form.tsx).
export function siteQuickEditFields(site: QuickEditSite, customer: QuickEditCustomer | null): SiteQuickEditFields {
  return {
    title: text(site.title),
    siteType: text(site.siteType) || '아파트',
    address: text(site.address),
    status: text(site.status) || '상담중',
    memo: text(site.memo),
    customerName: customer ? text(customer.name) : text(site.customerName),
    customerPhone: customer ? text(customer.phone) : text(site.customerPhone),
    separatePhone: customer ? isSeparatePhone(site.customerPhone, customer.phone) : false,
    sitePhone: text(site.customerPhone),
  };
}

export function siteQuickEditCustomerChanged(customer: QuickEditCustomer | null, fields: SiteQuickEditFields) {
  if (!customer) return false;
  return fields.customerName.trim() !== text(customer.name).trim() || fields.customerPhone.trim() !== text(customer.phone).trim();
}

// The customer's other sites that follow a change of the customer's name or number (pickSitesToSync).
export function siteQuickEditOtherSites<S extends QuickEditSite>(sites: readonly S[], site: QuickEditSite, customer: QuickEditCustomer): S[] {
  return pickSitesToSync(sites, customer._id, customer.phone).filter((item) => item._id !== site._id);
}

// What to save: the customer record (name and number only) when they changed, the site's fields that differ from what
// the popup started from (a value someone else changed meanwhile is not written back), and the customer's other sites
// when asked. The page saves the customer, then the other sites, then this site, so this site's own number is the last
// word even when it is the customer's previous one (review finding).
export function siteQuickEditPlan(
  site: QuickEditSite,
  customer: QuickEditCustomer | null,
  start: SiteQuickEditFields,
  fields: SiteQuickEditFields,
  options: { syncOthers: boolean; otherCount: number },
): SiteQuickEditPlan | { error: string } {
  if (!fields.title.trim()) return { error: '현장명을 입력해 주세요.' };
  const customerChanged = siteQuickEditCustomerChanged(customer, fields);
  const name = fields.customerName.trim();
  const phone = fields.customerPhone.trim();
  // Only a customer being changed needs a name: one saved without (old data) does not block a site-only save.
  if (customerChanged && !name) return { error: '고객 이름을 입력해 주세요.' };

  const data: Record<string, string> = {};
  for (const key of ['title', 'address', 'memo'] as const) {
    if (fields[key].trim() !== start[key].trim()) data[key] = fields[key].trim();
  }
  for (const key of ['siteType', 'status'] as const) {
    if (fields[key] !== start[key]) data[key] = fields[key];
  }
  const ownNumberChanged = fields.separatePhone !== start.separatePhone || (fields.separatePhone && fields.sitePhone.trim() !== start.sitePhone.trim());
  if (customer && (customerChanged || ownNumberChanged)) {
    data.customerName = name;
    data.customerPhone = fields.separatePhone ? fields.sitePhone.trim() : phone;
  }
  const plan: SiteQuickEditPlan = { site: { id: site._id, data } };
  if (customer && customerChanged) {
    plan.customer = { id: customer._id, data: { name, phone } };
    if (options.syncOthers && options.otherCount > 0) plan.sync = { customerId: customer._id, previousPhone: text(customer.phone) };
  }
  return plan;
}

// The page's site list after the saves: the site with its new values, the synced sites with the customer's new name and
// number.
export function applySiteQuickEdit<S extends QuickEditSite>(sites: readonly S[], plan: SiteQuickEditPlan, syncedIds: readonly string[]): S[] {
  const synced = new Set(plan.sync ? syncedIds : []);
  return sites.map((item) => {
    if (item._id === plan.site.id) return { ...item, ...plan.site.data };
    if (synced.has(item._id) && plan.customer) return { ...item, customerName: plan.customer.data.name, customerPhone: plan.customer.data.phone };
    return item;
  });
}
