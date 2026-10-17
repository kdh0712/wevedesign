import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ManagerPermission, ManagerRole } from '../../lib/manager-permissions';

export type SessionSource = 'master' | 'account' | 'firebase';

export type SessionPayload = {
  v: 1;
  sub: string;
  name: string;
  loginId: string;
  role: ManagerRole;
  perms: ManagerPermission[];
  src: SessionSource;
  iat: number;
  exp: number;
};

export const SESSION_TTL_SECONDS = 28800;

const DERIVED_KEY_LABEL = 'weve-manager-session-v1';
const MIN_SECRET_BYTES = 32;
const warnedShortSecrets = new Set<string>();

export function resolveSessionKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const secret = env.MANAGER_SESSION_SECRET?.trim();
  if (secret) {
    const key = Buffer.from(secret, 'utf8');
    // A short secret can be guessed offline from any issued token; say so once per value instead of on every request.
    if (key.length < MIN_SECRET_BYTES && !warnedShortSecrets.has(secret)) {
      warnedShortSecrets.add(secret);
      console.warn(`MANAGER_SESSION_SECRET is shorter than ${MIN_SECRET_BYTES} bytes. Use a longer random value.`);
    }
    return key;
  }

  // Fallback so a deploy without the dedicated secret does not lock everyone out.
  // Never derive from MANAGER_PASSWORD: a leaked token would allow offline guessing of it.
  const sanityToken = env.SANITY_WRITE_TOKEN?.trim();
  if (sanityToken) return createHmac('sha256', sanityToken).update(DERIVED_KEY_LABEL).digest();

  return null;
}

const sign = (body: string, key: Buffer) => createHmac('sha256', key).update(body).digest();

export function signSessionToken(
  claims: Omit<SessionPayload, 'v' | 'iat' | 'exp'>,
  key: Buffer,
  nowMs = Date.now(),
): { token: string; payload: SessionPayload } {
  const iat = Math.floor(nowMs / 1000);
  const payload: SessionPayload = { v: 1, ...claims, iat, exp: iat + SESSION_TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return { token: `${body}.${sign(body, key).toString('base64url')}`, payload };
}

export function verifySessionToken(token: string, key: Buffer, nowMs = Date.now()): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const [body, signature] = parts;
  // Compare the canonical text: decoding first would also accept padding or stray characters.
  const expected = Buffer.from(sign(body, key).toString('base64url'));
  const provided = Buffer.from(signature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (payload.v !== 1 || typeof payload.sub !== 'string') return null;
    if (payload.role !== 'admin' && payload.role !== 'staff') return null;
    if (!Array.isArray(payload.perms) || typeof payload.exp !== 'number') return null;
    if (payload.exp <= Math.floor(nowMs / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
