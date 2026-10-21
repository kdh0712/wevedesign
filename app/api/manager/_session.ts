import {
  effectivePermissions,
  hasAnyPermission,
  type ManagerPermission,
  type ManagerRole,
} from '../../lib/manager-permissions';
import { resolveSessionKey, signSessionToken, verifySessionToken, type SessionPayload, type SessionSource } from './_token';

export type ManagerSession = SessionPayload & { permissions: ManagerPermission[] };

export type ManagerRule = { anyOf?: readonly ManagerPermission[]; admin?: boolean };

export type SessionUser = { id: string; name: string; loginId: string; role: ManagerRole; permissions: ManagerPermission[] };

export const SESSION_KEY_MISSING_MESSAGE = '세션 서명 키가 설정되지 않았습니다. MANAGER_SESSION_SECRET를 확인해 주세요.';

const errorResponse = (error: string, status: number) => Response.json({ error }, { status });

// Verifies the signed session in memory (no database read) and applies the route's permission rule.
export function requireManager(
  request: Request,
  rule: ManagerRule = {},
): { session: ManagerSession; error: null } | { session: null; error: Response } {
  const key = resolveSessionKey();
  if (!key) return { session: null, error: errorResponse(SESSION_KEY_MISSING_MESSAGE, 500) };

  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization')?.trim() || '');
  const payload = match ? verifySessionToken(match[1], key) : null;
  if (!payload) return { session: null, error: errorResponse('로그인이 필요합니다. 다시 로그인해 주세요.', 401) };

  const session: ManagerSession = { ...payload, permissions: effectivePermissions(payload.role, payload.perms) };
  if (rule.admin && session.role !== 'admin') {
    return { session: null, error: errorResponse('총괄 관리자만 사용할 수 있습니다.', 403) };
  }
  if (rule.anyOf && !hasAnyPermission(session, rule.anyOf)) {
    return { session: null, error: errorResponse('권한이 없습니다.', 403) };
  }

  return { session, error: null };
}

export function issueManagerSession(
  user: { id: string; name: string; loginId: string; role: ManagerRole; permissions: unknown },
  src: SessionSource,
  ttlSeconds?: number,
): { token: string; expiresAt: number; user: SessionUser } | null {
  const key = resolveSessionKey();
  if (!key) return null;

  const permissions = effectivePermissions(user.role, user.permissions);
  const { token, payload } = signSessionToken(
    { sub: user.id, name: user.name, loginId: user.loginId, role: user.role, perms: permissions, src },
    key,
    Date.now(),
    ttlSeconds,
  );

  return {
    token,
    expiresAt: payload.exp * 1000,
    user: { id: user.id, name: user.name, loginId: user.loginId, role: user.role, permissions },
  };
}
