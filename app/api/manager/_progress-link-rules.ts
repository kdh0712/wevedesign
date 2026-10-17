// When the customer progress link turns itself on and off. Pure, with no imports, so tests can load it directly.
//
// On: the first progress update posted for a site creates the link and switches it on, unless the site is already '완료'.
// Off: a site saved into '완료' closes its link.
// Neither one ever silently turns a link back on, so a link staff switched off (or that '완료' closed) stays off until staff switch it on.

export const SITE_DONE_STATUS = '완료';

export type AutoLinkDecision =
  | { action: 'create' }
  | { action: 'keep-on' }
  | { action: 'keep-off'; reason: 'link-off' | 'site-done' }
  | { action: 'none'; reason: 'no-customer-phone' };

// A link without a customer mobile number cannot work (the customer proves who they are with its last four digits), so none is created.
// A site that is already '완료' never gets a new link: 완료 closes links, so a first upload must not open one. That rule wins over a
// missing phone number, and it leaves an existing enabled link alone (only the move into '완료' closes one, see shouldCloseLinkOnSave).
export function decideLinkOnUpload(
  site: { progressCode?: string; progressEnabled?: boolean; status?: string },
  hasCustomerPhone: boolean,
): AutoLinkDecision {
  if (!site.progressCode) {
    if (site.status === SITE_DONE_STATUS) return { action: 'keep-off', reason: 'site-done' };
    return hasCustomerPhone ? { action: 'create' } : { action: 'none', reason: 'no-customer-phone' };
  }
  return site.progressEnabled === true ? { action: 'keep-on' } : { action: 'keep-off', reason: 'link-off' };
}

// Reacts only to the transition into '완료'. A finished site whose link staff switched back on by hand is not closed again by later saves.
export function shouldCloseLinkOnSave(
  previousStatus: string | undefined,
  nextStatus: string | undefined,
  progressEnabled: boolean | undefined,
): boolean {
  return nextStatus === SITE_DONE_STATUS && previousStatus !== SITE_DONE_STATUS && progressEnabled === true;
}

export type VersionedRead<S> = { site: S; updateTime: string };

// The first upload creates the link only on the version of the site it read (create writes with that updateTime as its
// precondition). If another write got there first, usually a second upload that has just created the code, the site is read
// again and decided once more, which then keeps that code. A second conflict, or any other failure, is thrown like a failed save.
export async function applyLinkOnUpload<S>(steps: {
  first: VersionedRead<S>;
  reread: () => Promise<VersionedRead<S> | null>;
  decide: (site: S) => AutoLinkDecision | Promise<AutoLinkDecision>;
  create: (updateTime: string) => Promise<S>;
  isConflict: (error: unknown) => boolean;
}): Promise<{ site: S; decision: AutoLinkDecision; created: boolean }> {
  let read = steps.first;
  for (let attempt = 1; ; attempt += 1) {
    const decision = await steps.decide(read.site);
    if (decision.action !== 'create') return { site: read.site, decision, created: false };
    try {
      return { site: await steps.create(read.updateTime), decision, created: true };
    } catch (error) {
      if (attempt >= 2 || !steps.isConflict(error)) throw error;
    }
    const again = await steps.reread();
    if (!again) throw new Error('현장을 찾을 수 없습니다.');
    read = again;
  }
}

export const PROGRESS_LINK_DEFAULT_BASE_URL = 'https://www.wevedesign.co.kr';

// Where customer links point. A Vercel preview links to its own branch URL, so a link made while testing a preview opens that
// preview (and its data) instead of production; everywhere else NEXT_PUBLIC_SITE_URL, then the public domain.
export function progressLinkBaseUrl(env: Record<string, string | undefined>): string {
  const branchUrl = (env.VERCEL_BRANCH_URL || '').trim();
  const base =
    env.VERCEL_ENV === 'preview' && branchUrl
      ? `https://${branchUrl}`
      : (env.NEXT_PUBLIC_SITE_URL || '').trim() || PROGRESS_LINK_DEFAULT_BASE_URL;
  return base.replace(/\/+$/, '');
}
