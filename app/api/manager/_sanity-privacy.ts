// Customer progress photos go to the same Sanity dataset as the site's portfolio. If that dataset is public, anyone can list
// its image assets without a token, and with them the customers' photos. So an upload first asks Sanity, without a token,
// whether it would list an image asset, and goes ahead only when the answer is clearly no.
// No imports: the caller passes the project id and dataset (from managerClient) and, in tests, a fake fetch.

export type SanityPrivacy = 'public' | 'private' | 'unknown';

export const ANONYMOUS_ASSET_QUERY = 'count(*[_type == "sanity.imageAsset"][0...1])';
export const SANITY_PRIVACY_TIMEOUT_MS = 5000;
// Only "private" is remembered: a dataset that turns public is noticed within this time, a fixed one at the next upload.
export const SANITY_PRIVATE_CACHE_MS = 600000;

export const SANITY_PUBLIC_DATASET_MESSAGE =
  '사진 저장소(Sanity)가 공개 상태라 고객 사진을 올릴 수 없습니다. 관리자에게 비공개 전환을 요청해 주세요.';
export const SANITY_PRIVACY_UNKNOWN_MESSAGE = '사진 저장소 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

// The live API host, never the CDN (apicdn), so the answer is current.
export function anonymousAssetQueryUrl(projectId: string, dataset: string): string {
  return `https://${projectId}.api.sanity.io/v2021-10-21/data/query/${encodeURIComponent(dataset)}?query=${encodeURIComponent(ANONYMOUS_ASSET_QUERY)}`;
}

// 200 with an asset: public. 200 with none, or 401/403: private. Anything else (an error, a body without a number): unknown.
export function classifySanityPrivacy(httpStatus: number, body: unknown): SanityPrivacy {
  if (httpStatus === 401 || httpStatus === 403) return 'private';
  if (httpStatus !== 200 || !isRecord(body)) return 'unknown';
  const { result } = body;
  if (typeof result !== 'number' || !Number.isFinite(result)) return 'unknown';
  return result > 0 ? 'public' : 'private';
}

// The upload goes ahead only on 'private'; otherwise this is the 503 message staff see.
export function photoStoreRefusal(privacy: SanityPrivacy): string | null {
  if (privacy === 'private') return null;
  return privacy === 'public' ? SANITY_PUBLIC_DATASET_MESSAGE : SANITY_PRIVACY_UNKNOWN_MESSAGE;
}

type FetchLike = (input: string, init: { cache: 'no-store'; signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;

// One check per call, except that a 'private' answer is kept in memory for SANITY_PRIVATE_CACHE_MS.
export function createSanityPrivacyCheck(options: {
  projectId?: string;
  dataset?: string;
  fetch?: FetchLike;
  now?: () => number;
  timeoutMs?: number;
}): () => Promise<SanityPrivacy> {
  const fetchImpl: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? SANITY_PRIVACY_TIMEOUT_MS;
  const { projectId = '', dataset = '' } = options;
  const usable = /^[a-z0-9-]+$/.test(projectId) && /^[a-z0-9_-]+$/i.test(dataset);
  let privateUntil = 0;

  return async function checkSanityPrivacy() {
    if (!usable) return 'unknown';
    if (now() < privateUntil) return 'private';

    let privacy: SanityPrivacy;
    try {
      // No Authorization header: the question is what a stranger can see.
      const response = await fetchImpl(anonymousAssetQueryUrl(projectId, dataset), {
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'application/json' },
      });
      privacy = classifySanityPrivacy(response.status, await response.json().catch(() => null));
    } catch {
      privacy = 'unknown';
    }
    if (privacy === 'private') privateUntil = now() + SANITY_PRIVATE_CACHE_MS;
    return privacy;
  };
}
