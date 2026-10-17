// Failed-login counter kept in this server instance's memory: no added latency, but each Vercel instance counts
// separately, so it slows brute force down rather than stopping it outright.

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILURES_PER_LOGIN = 5;
export const MAX_FAILURES_PER_IP = 30;
const MAX_TRACKED_KEYS = 5000;

type Bucket = { count: number; resetAt: number };

export function createLoginLimiter({
  windowMs = LOGIN_WINDOW_MS,
  maxPerLogin = MAX_FAILURES_PER_LOGIN,
  maxPerIp = MAX_FAILURES_PER_IP,
} = {}) {
  const buckets = new Map<string, Bucket>();
  // Keyed by IP and login ID together, so nobody can lock the owner's account from another address.
  const loginKey = (ip: string, loginId: string) => `login:${ip}:${loginId.trim().toLowerCase()}`;
  const ipKey = (ip: string) => `ip:${ip}`;

  const count = (key: string, now: number) => {
    const bucket = buckets.get(key);
    if (!bucket) return 0;
    if (bucket.resetAt <= now) {
      buckets.delete(key);
      return 0;
    }
    return bucket.count;
  };

  const increment = (key: string, now: number) => {
    const current = count(key, now);
    const resetAt = current ? buckets.get(key)!.resetAt : now + windowMs;
    buckets.set(key, { count: current + 1, resetAt });
  };

  const prune = (now: number) => {
    if (buckets.size < MAX_TRACKED_KEYS) return;
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  };

  return {
    isBlocked(ip: string, loginId: string, now = Date.now()) {
      return count(loginKey(ip, loginId), now) >= maxPerLogin || count(ipKey(ip), now) >= maxPerIp;
    },
    recordFailure(ip: string, loginId: string, now = Date.now()) {
      prune(now);
      increment(loginKey(ip, loginId), now);
      increment(ipKey(ip), now);
    },
    // The per-IP count stays, so one valid account cannot be used to reset guessing at others.
    recordSuccess(ip: string, loginId: string) {
      buckets.delete(loginKey(ip, loginId));
    },
  };
}

export const loginLimiter = createLoginLimiter();

// Vercel overwrites x-forwarded-for with the real client address, so its first entry can be trusted there.
export function clientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
}
