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

export function resolveSessionKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const secret = env.MANAGER_SESSION_SECRET?.trim();
  if (secret) return Buffer.from(secret, 'utf8');

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
  const expected = sign(body, key);
  const provided = Buffer.from(signature, 'base64url');
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
