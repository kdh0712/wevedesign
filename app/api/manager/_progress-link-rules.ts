// When the customer progress link turns itself on and off. Pure, with no imports, so tests can load it directly.
//
// On: the first progress update posted for a site creates the link and switches it on.
// Off: a site saved into '완료' closes its link.
// Neither one ever silently turns a link back on, so a link staff switched off (or that '완료' closed) stays off until staff switch it on.

export type AutoLinkDecision =
  | { action: 'create' }
  | { action: 'keep-on' }
  | { action: 'keep-off'; reason: 'link-off' }
  | { action: 'none'; reason: 'no-customer-phone' };

// A link without a customer mobile number cannot work (the customer proves who they are with its last four digits), so none is created.
export function decideLinkOnUpload(site: { progressCode?: string; progressEnabled?: boolean }, hasCustomerPhone: boolean): AutoLinkDecision {
  if (!site.progressCode) return hasCustomerPhone ? { action: 'create' } : { action: 'none', reason: 'no-customer-phone' };
  return site.progressEnabled === true ? { action: 'keep-on' } : { action: 'keep-off', reason: 'link-off' };
}

export const SITE_DONE_STATUS = '완료';

// Reacts only to the transition into '완료'. A finished site whose link staff switched back on by hand is not closed again by later saves.
export function shouldCloseLinkOnSave(
  previousStatus: string | undefined,
  nextStatus: string | undefined,
  progressEnabled: boolean | undefined,
): boolean {
  return nextStatus === SITE_DONE_STATUS && previousStatus !== SITE_DONE_STATUS && progressEnabled === true;
}
