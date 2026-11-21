// Staff sign-up: the order of the writes for a sign-up request, its approval and its rejection, and how each one loses a
// race. The store is passed in (Firestore in _staff-accounts.ts, an in-memory fake in tests/signup-flow.test.mjs).
// Spec: docs/superpowers/specs/2026-11-21-staff-signup-approval-design.md §5.1, §5.2
import {
  LOGIN_ID_TAKEN_MESSAGE,
  UNUSABLE_LINK_MESSAGE,
  approvalError,
  approvalPermissions,
  isLinkUsable,
  isRequestExpired,
  loginIdError,
  validateSignupInput,
} from '../../lib/staff-signup-rules.ts';

export type Versioned<T> = { record: T; updateTime: string };
export type LinkRecord = { _id: string; status: string; expiresAt: string; memo?: string };
export type RequestRecord = {
  _id: string;
  name: string;
  phone: string;
  loginId: string;
  passwordHash: string;
  linkId: string;
  linkMemo?: string;
  createdAt: string;
  // 'approving' while an approval is creating the account (with approvingAt); absent otherwise.
  status?: string;
  approvingAt?: string;
};

export type SignupStore = {
  readLink(tokenHash: string): Promise<Versioned<LinkRecord> | null>;
  // With updateTime the write lands only on that version; without it, only while the link exists. Either way a miss throws
  // an error isConflict recognises.
  markLink(id: string, fields: { status: 'open' | 'used'; usedAt?: string; requestId?: string }, updateTime?: string): Promise<void>;
  createRequest(request: Omit<RequestRecord, '_id'>): Promise<string>;
  readRequest(id: string): Promise<Versioned<RequestRecord> | null>;
  // Same conditions as markLink.
  markRequest(id: string, fields: Partial<RequestRecord>, updateTime?: string): Promise<void>;
  // With updateTime the delete happens only on that version (a miss throws a conflict); without it, it always succeeds.
  deleteRequest(id: string, updateTime?: string): Promise<void>;
  // Firestore ID accounts (on or off: an off account keeps its id) and Sanity managerAccount, ignoring case.
  loginIdInAccounts(loginId: string): Promise<boolean>;
  // Pending requests younger than the retention period.
  loginIdInPendingRequests(loginId: string, nowMs: number): Promise<boolean>;
  // Creates the account only if no account has this id yet; otherwise throws a conflict.
  createAccount(loginId: string, fields: Record<string, unknown>): Promise<void>;
  hashPassword(password: string): Promise<string>;
  // Whether a stored value is a scrypt hash as hashPassword writes it (_password.ts).
  isPasswordHash(stored: string): boolean;
  isConflict(error: unknown): boolean;
};

export type FlowResult = { ok: true; requestId?: string } | { ok: false; status: number; error: string };

const HANDLED_MESSAGE = '이미 처리된 요청입니다.';
const SAME_ID_MESSAGE = '이미 같은 아이디 계정이 있습니다.';
const EXPIRED_MESSAGE = '30일이 지나 지워진 요청입니다. 새 링크로 다시 받아 주세요.';
const FORGED_MESSAGE = '이 요청은 승인할 수 없습니다. 거절해 주세요.';
// An approval that stopped between its claim and its last write (a crashed function) frees the request after this long.
const APPROVING_HOLD_MS = 2 * 60000;

const fail = (status: number, error: string): FlowResult => ({ ok: false, status, error });

export async function isLoginIdTaken(store: SignupStore, loginId: string, nowMs: number): Promise<boolean> {
  const [inAccounts, inRequests] = await Promise.all([store.loginIdInAccounts(loginId), store.loginIdInPendingRequests(loginId, nowMs)]);
  return inAccounts || inRequests;
}

// Spec §5.2 steps 1-6. The password leaves this function only as its hash.
export async function submitSignup(input: { tokenHash: string; fields: Record<string, unknown> }, store: SignupStore, nowMs: number): Promise<FlowResult> {
  const checked = validateSignupInput(input.fields);
  if (!checked.ok) return fail(400, checked.error);
  const { name, phone, loginId, password } = checked.value;

  const link = await store.readLink(input.tokenHash);
  if (!link || !isLinkUsable(link.record, nowMs)) return fail(404, UNUSABLE_LINK_MESSAGE);
  if (await isLoginIdTaken(store, loginId, nowMs)) return fail(409, LOGIN_ID_TAKEN_MESSAGE);

  const passwordHash = await store.hashPassword(password);
  const now = new Date(nowMs).toISOString();

  // Only one request per link: the write that uses the link up lands only on the version that was read.
  try {
    await store.markLink(link.record._id, { status: 'used', usedAt: now }, link.updateTime);
  } catch (error) {
    if (store.isConflict(error)) return fail(404, UNUSABLE_LINK_MESSAGE);
    throw error;
  }

  let requestId: string;
  try {
    requestId = await store.createRequest({ name, phone, loginId, passwordHash, linkId: link.record._id, linkMemo: link.record.memo || '', createdAt: now });
  } catch (error) {
    // Give the link back so the same link can be tried again.
    await store.markLink(link.record._id, { status: 'open' }).catch((reopenError) => {
      console.error('Staff sign-up link could not be reopened after a failed request save:', reopenError);
    });
    throw error;
  }

  await store.markLink(link.record._id, { status: 'used', requestId }).catch((error) => {
    console.warn('Staff sign-up link could not record its request id:', error);
  });
  return { ok: true, requestId };
}

const approvalInProgress = (request: RequestRecord, nowMs: number) => {
  if (request.status !== 'approving') return false;
  const since = Date.parse(request.approvingAt || '');
  return Number.isFinite(since) && nowMs - since < APPROVING_HOLD_MS;
};

// Claims the request (status 'approving', on the version that was read) before creating the account, so a reject that
// lands in between cannot leave an account for a rejected request: whichever write comes second loses.
export async function approveSignup(
  input: { requestId: string; role: unknown; permissions: unknown; approvedBy: string },
  store: SignupStore,
  nowMs: number,
): Promise<FlowResult> {
  const decisionProblem = approvalError({ role: input.role, permissions: input.permissions });
  if (decisionProblem) return fail(400, decisionProblem);
  const role = input.role === 'admin' ? 'admin' : 'staff';

  const found = await store.readRequest(input.requestId);
  if (!found) return fail(404, HANDLED_MESSAGE);
  const request = found.record;
  if (isRequestExpired(request, nowMs)) return fail(410, EXPIRED_MESSAGE);
  if (approvalInProgress(request, nowMs)) return fail(409, HANDLED_MESSAGE);
  // A request this server wrote always has a valid id and a scrypt hash; anything else never becomes an account.
  if (typeof request.loginId !== 'string' || loginIdError(request.loginId) || typeof request.passwordHash !== 'string' || !store.isPasswordHash(request.passwordHash)) {
    return fail(400, FORGED_MESSAGE);
  }
  if (await store.loginIdInAccounts(request.loginId)) return fail(409, SAME_ID_MESSAGE);

  const now = new Date(nowMs).toISOString();
  try {
    await store.markRequest(input.requestId, { status: 'approving', approvingAt: now }, found.updateTime);
  } catch (error) {
    if (store.isConflict(error)) return fail(409, HANDLED_MESSAGE);
    throw error;
  }

  try {
    await store.createAccount(request.loginId, {
      name: request.name,
      phone: request.phone,
      loginId: request.loginId,
      passwordHash: request.passwordHash,
      role,
      permissions: approvalPermissions(input.permissions),
      isActive: true,
      createdAt: now,
      updatedAt: now,
      approvedBy: input.approvedBy,
      approvedAt: now,
      origin: 'signup',
    });
  } catch (error) {
    // Release the claim so the admin can reject the request (or approve it after the other account is dealt with). Nothing
    // else writes a claimed request, so this needs only the request to still exist.
    await store.markRequest(input.requestId, { status: '', approvingAt: '' }).catch((releaseError) => {
      console.error('Staff sign-up request could not be released after a failed approval:', releaseError);
    });
    if (store.isConflict(error)) return fail(409, SAME_ID_MESSAGE);
    throw error;
  }

  // The account exists; the request (with its hash) goes. If this delete fails the claim runs out and the admin sees the
  // request again, where approving says the id is taken and rejecting removes it.
  await store.deleteRequest(input.requestId).catch((error) => {
    console.error('Staff sign-up request could not be deleted after its approval:', error);
  });
  return { ok: true };
}

export async function rejectSignup(input: { requestId: string }, store: SignupStore, nowMs: number): Promise<FlowResult> {
  const found = await store.readRequest(input.requestId);
  if (!found) return fail(404, HANDLED_MESSAGE);
  if (approvalInProgress(found.record, nowMs)) return fail(409, HANDLED_MESSAGE);
  try {
    await store.deleteRequest(input.requestId, found.updateTime);
  } catch (error) {
    if (store.isConflict(error)) return fail(409, HANDLED_MESSAGE);
    throw error;
  }
  return { ok: true };
}
