// Staff sign-up: the rules for a sign-up link, the request a new staff member sends, and the admin's approval.
// Pure (it imports only other import-free modules), so the manager screen, the join page, the API and Node tests share it.
// Spec: docs/superpowers/specs/2026-11-21-staff-signup-approval-design.md §4.4

import { normalizeKoreanMobile } from './alert-phones.ts';
import { normalizePermissions, type ManagerPermission } from './manager-permissions.ts';

// The master password logs in with these ids (app/api/manager/_login.ts), so no account may take them.
export const RESERVED_LOGIN_IDS: readonly string[] = ['admin', 'manager'];
export const LINK_DAYS: readonly number[] = [1, 3, 7];
export const DEFAULT_LINK_DAYS = 7;
export const REQUEST_RETENTION_DAYS = 30;

const DAY_MS = 86400000;
const NAME_MAX = 30;
const PASSWORD_MIN = 8;
// scrypt takes any length; the cap keeps a public form from hashing very long inputs.
const PASSWORD_MAX = 72;
const LOGIN_ID_PATTERN = /^[a-z0-9._-]{4,20}$/;

// One wording for a missing, expired, revoked or used link: the page never says which.
export const UNUSABLE_LINK_MESSAGE = '쓸 수 없는 링크입니다. 총괄 관리자에게 새 링크를 받아 주세요.';
export const LOGIN_ID_TAKEN_MESSAGE = '이미 사용 중인 아이디입니다.';

const LOGIN_ID_FORMAT_MESSAGE = '아이디는 영문 소문자·숫자와 . _ - 로 4~20자입니다.';
const LOGIN_ID_RESERVED_MESSAGE = '쓸 수 없는 아이디입니다.';
const PASSWORD_MESSAGE = '비밀번호는 8자 이상 72자 이하로 입력해 주세요.';
const NAME_EMPTY_MESSAGE = '이름을 입력해 주세요.';
const NAME_LONG_MESSAGE = '이름은 30자까지 입력할 수 있습니다.';
const PHONE_MESSAGE = '휴대폰 번호를 확인해 주세요.';

const text = (value: unknown) => (typeof value === 'string' ? value : '');

export function normalizeLoginId(raw: unknown): string {
  return text(raw).trim().toLowerCase();
}

// Checks an id that has already been through normalizeLoginId. '@' is outside the pattern, so an id never looks like an email login.
export function loginIdError(loginId: string): string | null {
  if (!LOGIN_ID_PATTERN.test(loginId)) return LOGIN_ID_FORMAT_MESSAGE;
  if (RESERVED_LOGIN_IDS.includes(loginId)) return LOGIN_ID_RESERVED_MESSAGE;
  return null;
}

// The login trims the password before checking it, so the hash is made from the trimmed value too.
export function passwordError(password: string): string | null {
  const length = text(password).trim().length;
  return length < PASSWORD_MIN || length > PASSWORD_MAX ? PASSWORD_MESSAGE : null;
}

function nameError(name: string): string | null {
  if (!name) return NAME_EMPTY_MESSAGE;
  if (name.length > NAME_MAX) return NAME_LONG_MESSAGE;
  return null;
}

export type SignupInput = { name: string; phone: string; loginId: string; password: string };

export function validateSignupInput(raw: Record<string, unknown>): { ok: true; value: SignupInput } | { ok: false; error: string } {
  const name = text(raw.name).trim();
  const nameProblem = nameError(name);
  if (nameProblem) return { ok: false, error: nameProblem };

  const phone = normalizeKoreanMobile(text(raw.phone));
  if (!phone) return { ok: false, error: PHONE_MESSAGE };

  const loginId = normalizeLoginId(raw.loginId);
  const loginIdProblem = loginIdError(loginId);
  if (loginIdProblem) return { ok: false, error: loginIdProblem };

  const password = text(raw.password).trim();
  const passwordProblem = passwordError(password);
  if (passwordProblem) return { ok: false, error: passwordProblem };

  return { ok: true, value: { name, phone, loginId, password } };
}

export type SignupLinkState = { status?: unknown; expiresAt?: unknown };

export function isLinkUsable(link: SignupLinkState | null, nowMs: number): boolean {
  if (!link || link.status !== 'open') return false;
  const expires = Date.parse(text(link.expiresAt));
  return Number.isFinite(expires) && expires > nowMs;
}

export function linkExpiresAt(days: unknown, nowMs: number): string | null {
  if (typeof days !== 'number' || !LINK_DAYS.includes(days)) return null;
  return new Date(nowMs + days * DAY_MS).toISOString();
}

// A request older than the retention period can no longer be approved and is deleted when the admin list is read.
export function isRequestExpired(request: { createdAt?: unknown }, nowMs: number): boolean {
  const created = Date.parse(text(request.createdAt));
  if (!Number.isFinite(created)) return true;
  return nowMs - created >= REQUEST_RETENTION_DAYS * DAY_MS;
}

// Quick picks on the approval card: they only fill the checkboxes, which the admin can still change.
export const PERMISSION_PRESETS: ReadonlyArray<{ key: string; label: string; permissions: readonly ManagerPermission[] }> = [
  { key: 'field', label: '현장팀', permissions: ['dashboard', 'sites'] },
  { key: 'design', label: '견적·디자인', permissions: ['dashboard', 'customers', 'sites', 'estimates'] },
  { key: 'office', label: '사무', permissions: ['dashboard', 'consultations', 'customers', 'sites', 'sales'] },
];

// The permissions an approval grants: known ones only, and never account management (that comes with the admin role).
export function approvalPermissions(permissions: unknown): ManagerPermission[] {
  return normalizePermissions(permissions).filter((permission) => permission !== 'accounts');
}

export function approvalError(decision: { role: unknown; permissions: unknown }): string | null {
  if (decision.role !== 'admin' && decision.role !== 'staff') return '역할을 골라 주세요.';
  if (decision.role === 'staff' && approvalPermissions(decision.permissions).length === 0) {
    return '권한을 하나 이상 고르거나 총괄 관리자로 승인해 주세요.';
  }
  return null;
}

// The token goes after '#', so it never reaches a server log, a Referer header or an analytics page URL.
export function signupLinkUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/manager-weve-7519/join#${token}`;
}

// The fields an admin saves on an ID account. Turning an account off also deletes its phone number (spec §4.3, A안).
export function idAccountUpdate(input: {
  name: string;
  phone: string;
  role: 'admin' | 'staff';
  permissions: unknown;
  isActive: boolean;
}):
  | { ok: true; fields: { name: string; phone: string; role: 'admin' | 'staff'; permissions: ManagerPermission[]; isActive: boolean } }
  | { ok: false; error: string } {
  const name = text(input.name).trim();
  const nameProblem = nameError(name);
  if (nameProblem) return { ok: false, error: nameProblem };

  let phone = '';
  if (input.isActive && text(input.phone).trim()) {
    const normalized = normalizeKoreanMobile(text(input.phone));
    if (!normalized) return { ok: false, error: PHONE_MESSAGE };
    phone = normalized;
  }

  return {
    ok: true,
    fields: { name, phone, role: input.role, permissions: normalizePermissions(input.permissions), isActive: input.isActive },
  };
}
