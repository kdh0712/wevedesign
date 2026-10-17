// Helpers for the manual manager auth checks (not part of `npm test`).
// Reads test values from .env.local so they never live in git or in the scripts.
import { existsSync, readFileSync } from 'node:fs';
import { SESSION_TTL_SECONDS, signSessionToken } from '../app/api/manager/_token.ts';

export function loadLocalEnv() {
  const values = {};
  const file = new URL('../.env.local', import.meta.url);
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match) values[match[1]] = match[2];
    }
  }
  return { ...values, ...process.env };
}

const env = loadLocalEnv();

export function sessionKey() {
  const secret = env.MANAGER_SESSION_SECRET?.trim();
  if (!secret) throw new Error('MANAGER_SESSION_SECRET is missing from .env.local');
  return Buffer.from(secret, 'utf8');
}

// remainingSeconds < 0 produces an already expired token.
export function mintSession(role, permissions, { remainingSeconds = SESSION_TTL_SECONDS, key = sessionKey() } = {}) {
  const nowMs = Date.now() - (SESSION_TTL_SECONDS - remainingSeconds) * 1000;
  const loginId = role === 'admin' ? 'admin' : `test-${permissions.join('-') || 'none'}`;
  const { token, payload } = signSessionToken(
    { sub: role === 'admin' ? 'test-admin' : loginId, name: role === 'admin' ? '테스트 관리자' : '테스트 직원', loginId, role, perms: permissions, src: 'account' },
    key,
    nowMs,
  );
  return {
    token,
    firebaseToken: '',
    user: { id: payload.sub, name: payload.name, loginId, role, permissions: payload.perms },
    expiresAt: payload.exp * 1000,
    savedAt: Date.now(),
  };
}

export const localEnv = env;
