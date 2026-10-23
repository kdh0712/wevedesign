import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import {
  PROGRESS_LINK_OFF_MESSAGE,
  PROGRESS_NO_PHONE_MESSAGE,
  PROGRESS_UNAVAILABLE_MESSAGE,
  isProgressCodeShape,
} from '../../lib/progress-public';
import { ProgressNotice, ProgressShell, ProgressView } from '../../lib/progress-view';
import { buildCustomerProgressView, phoneLast4, todayInSeoul } from '../../lib/site-progress';
import { signProgressUpdatePhotos } from '../../api/manager/_progress-photo-storage';
import {
  findSiteByProgressCode,
  isProgressStoreReady,
  listProgressUpdates,
  listSiteEstimates,
  resolveCustomerPhone,
  type ProgressSite,
} from '../../api/manager/_progress-store';
import { progressCookieName, progressPhoneDigits, resolveProgressKey, verifyProgressCookie } from '../../api/progress/_access';
import { ProgressGate } from './progress-gate';
import { AcquisitionSurvey } from './acquisition-survey';
import { needsAcquisitionSurvey, surveyOptions } from '../../lib/acquisition';
import { readAcquisitionOptions } from '../../api/manager/_acquisition-store';

// Per-customer data behind a cookie: never prerendered or cached.
export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return {
    title: '공사 진행 현황 | 위브디자인',
    // The root layout's canonical points at the home page; a private page has none.
    alternates: {},
    robots: { index: false, follow: false },
  };
}

export default async function ProgressPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  // A code that cannot exist, a missing store and a switched-off link all show the same notice,
  // so the page never reveals whether a code exists or which site it belongs to.
  if (!isProgressCodeShape(code) || !isProgressStoreReady()) return <ProgressNotice message={PROGRESS_LINK_OFF_MESSAGE} />;

  let site: ProgressSite | null;
  let phone: string;
  try {
    site = await findSiteByProgressCode(code);
    if (!site || !site.progressEnabled) return <ProgressNotice message={PROGRESS_LINK_OFF_MESSAGE} />;
    phone = await resolveCustomerPhone(site);
  } catch (error) {
    console.error('Progress page lookup failed:', error);
    return <ProgressNotice message={PROGRESS_UNAVAILABLE_MESSAGE} />;
  }

  // Without a customer number nothing can be checked, so the gate would only ever fail.
  if (!phoneLast4(phone)) return <ProgressNotice message={PROGRESS_NO_PHONE_MESSAGE} />;

  // The cookie is bound to the code and the customer's whole number (the same one verify resolved): a new link or a changed
  // number invalidates it.
  const key = resolveProgressKey();
  const cookie = (await cookies()).get(progressCookieName(code))?.value;
  if (!key || !verifyProgressCookie(cookie, code, progressPhoneDigits(phone), key)) return <ProgressGate code={code} />;

  // A verified customer whose site has no 유입 경로 answer (nor a skip or a staff entry) is asked once before the progress
  // view. If the options cannot be read, the progress view shows without the question.
  if (needsAcquisitionSurvey(site)) {
    const options = await readAcquisitionOptions()
      .then((read) => read.options)
      .catch((error) => {
        console.error('Acquisition options read failed:', error);
        return null;
      });
    if (options) return <AcquisitionSurvey code={code} options={surveyOptions(options)} />;
  }

  try {
    const [updates, estimates] = await Promise.all([listProgressUpdates(site._id), listSiteEstimates(site._id)]);
    // Photos are private: only now, after the cookie check, does the server make their short-lived URLs. If that fails
    // (logged without the code or the phone), the records show without photos and with a short notice.
    const signed = await signProgressUpdatePhotos(updates);
    // Only the view (site title, customer name, schedule, records) leaves the server; prices, vendors and phones never do.
    const view = buildCustomerProgressView({
      site,
      updates: signed.updates,
      estimates,
      today: todayInSeoul(),
      photosUnavailable: signed.photosUnavailable,
    });
    return (
      <ProgressShell>
        <ProgressView view={view} syncHash />
      </ProgressShell>
    );
  } catch (error) {
    console.error('Progress page load failed:', error);
    return <ProgressNotice message={PROGRESS_UNAVAILABLE_MESSAGE} />;
  }
}
