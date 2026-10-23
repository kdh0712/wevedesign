// The customer's answer to the 유입 경로 survey, decided against a store the caller passes in (the same pattern as _verify.ts),
// so tests can drive every branch with a fake versioned store. No Next.js imports; only relative .ts modules.
//
// Only a customer who passed the phone check (the progress cookie) may answer, and a site keeps its first answer: a second
// submit, another tab or a staff entry that landed first all leave the stored answer as it is. The answer is written on the
// version of the site that was read; when that write loses a race, the site is read once more and the answer is a success
// if an answer is there now, otherwise a retry. The code, the cookie and the answer text are never logged.
import { PROGRESS_LINK_OFF_MESSAGE, PROGRESS_RETRY_MESSAGE, PROGRESS_UNAVAILABLE_MESSAGE, isProgressCodeShape } from '../../lib/progress-public.ts';
import { parseAcquisitionChoice, readSiteAcquisition, type AcquisitionOption, type SiteAcquisition } from '../../lib/acquisition.ts';
import { progressCookieName, progressPhoneDigits, verifyProgressCookie } from './_access.ts';
import { VERIFY_BAD_REQUEST_MESSAGE, VERIFY_RETRY_AFTER_SECONDS, isProgressLinkOpen, progressReply, type VerifyResult, type VerifySite } from './_verify.ts';

export const ACQUISITION_NEEDS_CHECK_MESSAGE = '본인 확인이 필요합니다. 페이지를 새로고침해 주세요.';

export type AcquisitionStore<S extends VerifySite = VerifySite> = {
  findSiteByCode(code: string): Promise<S | null>;
  readSite(siteId: string): Promise<{ site: S; updateTime: string } | null>;
  resolvePhone(site: S): Promise<string>;
  readOptions(): Promise<AcquisitionOption[]>;
  // Writes only acquisition, and only if the site is still at updateTime; throws otherwise.
  writeAcquisition(siteId: string, acquisition: SiteAcquisition, updateTime: string): Promise<unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const linkOff = () => progressReply(404, { error: PROGRESS_LINK_OFF_MESSAGE });
const unavailable = () => progressReply(500, { error: PROGRESS_UNAVAILABLE_MESSAGE });
const done = () => progressReply(200, { ok: true });

export async function submitAcquisition<S extends VerifySite>(
  body: unknown,
  deps: { store: AcquisitionStore<S>; storeReady: boolean; key: Buffer | null; readCookie: (name: string) => string | undefined; nowMs: number },
): Promise<Omit<VerifyResult, 'cookie'>> {
  if (!isRecord(body) || typeof body.code !== 'string' || (body.skip !== true && !isRecord(body.answer))) {
    return progressReply(400, { error: VERIFY_BAD_REQUEST_MESSAGE });
  }
  const { code } = body;
  if (!isProgressCodeShape(code) || !deps.storeReady) return linkOff();

  const { store, key, nowMs } = deps;
  let read: { site: S; updateTime: string } | null;
  let options: AcquisitionOption[];
  try {
    const found = await store.findSiteByCode(code);
    if (!isProgressLinkOpen(found, code)) return linkOff();
    if (!key) {
      console.error('Progress acquisition unavailable: neither MANAGER_SESSION_SECRET nor SANITY_WRITE_TOKEN is set.');
      return unavailable();
    }

    // The same cookie the page itself requires, bound to the code and the customer's whole number.
    const phone = await store.resolvePhone(found);
    if (!verifyProgressCookie(deps.readCookie(progressCookieName(code)), code, progressPhoneDigits(phone), key, nowMs)) {
      return progressReply(401, { error: ACQUISITION_NEEDS_CHECK_MESSAGE });
    }

    read = await store.readSite(found._id);
    if (!read || !isProgressLinkOpen(read.site, code)) return linkOff();
    // The first answer wins, whoever gave it.
    if (readSiteAcquisition(read.site.acquisition)) return done();
    options = await store.readOptions();
  } catch (error) {
    console.error('Progress acquisition failed:', error);
    return unavailable();
  }

  const at = new Date(nowMs).toISOString();
  let acquisition: SiteAcquisition;
  if (body.skip === true) {
    acquisition = { status: 'skipped', by: 'customer', at };
  } else {
    const parsed = parseAcquisitionChoice(body.answer, options, { allowHidden: false });
    if (!parsed.ok) return progressReply(400, { error: parsed.error });
    acquisition = { status: 'answered', ...parsed.choice, by: 'customer', at };
  }

  try {
    await store.writeAcquisition(read.site._id, acquisition, read.updateTime);
    return done();
  } catch (error) {
    console.error('Progress acquisition could not be saved:', error);
  }
  // Lost a race: an answer that landed first counts as this one; anything else asks the customer to try again.
  try {
    const again = await store.readSite(read.site._id);
    if (again && readSiteAcquisition(again.site.acquisition)) return done();
  } catch (error) {
    console.error('Progress acquisition re-read failed:', error);
  }
  return progressReply(503, { error: PROGRESS_RETRY_MESSAGE, retry: true }, { 'Retry-After': String(VERIFY_RETRY_AFTER_SECONDS) });
}
