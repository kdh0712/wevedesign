// Keeps the customer progress link code out of analytics. The code in /progress/<code> works as the link's credential,
// so no analytics service may receive it. Pure helpers (no imports), shared by the analytics component and Node tests.

export const SCRUBBED_PROGRESS_PATH = '/progress/[code]';

// Next matches routes case-sensitively, but decode and collapse slashes anyway so an odd spelling of the path cannot slip past.
function normalizedPath(pathname: string): string {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // Not valid percent-encoding; test the text as written.
  }
  return path.replace(/\/{2,}/g, '/');
}

export function isProgressPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return /^\/progress(?:\/|$)/.test(normalizedPath(pathname));
}

// The manager screens (PC and the staff phone app) are staff tools, not site visits.
const isManagerPath = (pathname: string) => /^\/manager-weve-7519(?:\/|$)/.test(normalizedPath(pathname));

// Naver wcslog is a third party that logs the page URL: never on progress links, and not on the manager screens.
export function naverAnalyticsAllowed(pathname: string | null | undefined): boolean {
  if (!pathname) return true;
  return !isProgressPath(pathname) && !isManagerPath(pathname);
}

// Any /progress/<anything> URL becomes /progress/[code]; the query string and hash are dropped too. Other URLs are untouched.
export function scrubProgressUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url, 'http://localhost');
  } catch {
    // Cannot be read as a URL: keep it unless it mentions the progress path, in which case none of it is kept.
    return /\/progress/i.test(url) ? SCRUBBED_PROGRESS_PATH : url;
  }
  if (!isProgressPath(parsed.pathname)) return url;
  const isAbsolute = /^[a-z][a-z0-9+.-]*:/i.test(url);
  return isAbsolute ? `${parsed.origin}${SCRUBBED_PROGRESS_PATH}` : SCRUBBED_PROGRESS_PATH;
}
