import { createHash, randomBytes } from 'node:crypto';
import { isRequestExpired, isLinkUsable } from '../../lib/staff-signup-rules';
import type { ManagerRole } from '../../lib/manager-permissions';
import type { LinkRecord, RequestRecord, SignupStore } from './_signup-flow';
import { hashPassword, isPasswordHash } from './_password';
import { managerClient } from './_utils';
import {
  canUseFirestoreOnServer,
  deleteFirestoreDocument,
  getFirestoreDocument,
  getFirestoreDocumentWithVersion,
  isFirestoreConflictError,
  listFirestoreCollection,
  patchFirestoreFields,
  queryFirestoreCollectionByField,
} from './firestore';

// Staff sign-up links, sign-up requests and the ID accounts they become. Read and written with the server service account
// only (no idToken); the Firestore security rules keep every browser out of these collections, as with managerDevices.
// Spec: docs/superpowers/specs/2026-11-21-staff-signup-approval-design.md §4
export const SIGNUP_LINKS_COLLECTION = 'managerSignupLinks';
export const SIGNUP_REQUESTS_COLLECTION = 'managerSignupRequests';
export const ID_ACCOUNTS_COLLECTION = 'managerAccounts';

export const STAFF_STORE_MISSING = '가입 링크 기능은 Firestore 서비스 계정 설정이 필요합니다.';

export const isStaffAccountStoreReady = () => canUseFirestoreOnServer();

const sha256Hex = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

// The same id gives the same document, so two approvals of one id cannot both create an account (exists:false).
export const accountDocId = (loginId: string) => `acct-${sha256Hex(loginId).slice(0, 24)}`;
// Only the hash of a link token is stored; the token itself is shown to the admin once.
export const signupTokenHash = (token: string) => sha256Hex(token);
export const newSignupToken = () => randomBytes(32).toString('base64url');
const newRequestId = () => `req-${randomBytes(12).toString('hex')}`;

export type IdAccount = {
  _id: string;
  name?: string;
  phone?: string;
  loginId?: string;
  passwordHash?: string;
  role?: ManagerRole;
  permissions?: string[];
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  origin?: 'signup' | 'admin';
};

type StoredLink = LinkRecord & { createdBy?: string; createdByName?: string; createdAt?: string; usedAt?: string; requestId?: string };

// --- ID accounts ---

export const getIdAccount = (id: string) => getFirestoreDocument<IdAccount>(ID_ACCOUNTS_COLLECTION, id);

export const listIdAccounts = () => listFirestoreCollection<IdAccount>(ID_ACCOUNTS_COLLECTION);

// Creates the account only if no account has this id yet; otherwise FirestoreConflictError.
export async function createIdAccount(loginId: string, fields: Record<string, unknown>) {
  const id = accountDocId(loginId);
  await patchFirestoreFields(ID_ACCOUNTS_COLLECTION, id, { _id: id, ...fields }, { precondition: { exists: false } });
}

// Writes only these fields of an existing account; FirestoreConflictError when it no longer exists.
export async function updateIdAccount(id: string, fields: Record<string, unknown>) {
  return patchFirestoreFields<IdAccount>(ID_ACCOUNTS_COLLECTION, id, fields, { precondition: { exists: true } });
}

// Sanity managerAccount ids are compared ignoring case, so 'Park01' there holds 'park01' here.
async function sanityLoginIdExists(loginId: string) {
  const count = await managerClient.fetch<number>('count(*[_type == "managerAccount" && lower(loginId) == $loginId])', { loginId });
  return count > 0;
}

// An off account keeps its id (the document id comes from it), so it counts too.
async function loginIdInAccounts(loginId: string) {
  const [account, inSanity] = await Promise.all([getIdAccount(accountDocId(loginId)), sanityLoginIdExists(loginId)]);
  return Boolean(account) || inSanity;
}

async function loginIdInPendingRequests(loginId: string, nowMs: number) {
  const requests = await queryFirestoreCollectionByField<RequestRecord>(SIGNUP_REQUESTS_COLLECTION, 'loginId', loginId);
  return requests.some((request) => !isRequestExpired(request, nowMs));
}

// --- the store the sign-up flow runs on ---

export function firestoreSignupStore(): SignupStore {
  return {
    async readLink(tokenHash) {
      return getFirestoreDocumentWithVersion<StoredLink>(SIGNUP_LINKS_COLLECTION, tokenHash);
    },
    async markLink(id, fields, updateTime) {
      await patchFirestoreFields(SIGNUP_LINKS_COLLECTION, id, fields, { precondition: updateTime ? { updateTime } : { exists: true } });
    },
    async createRequest(request) {
      const id = newRequestId();
      await patchFirestoreFields(SIGNUP_REQUESTS_COLLECTION, id, { _id: id, ...request }, { precondition: { exists: false } });
      return id;
    },
    async readRequest(id) {
      return getFirestoreDocumentWithVersion<RequestRecord>(SIGNUP_REQUESTS_COLLECTION, id);
    },
    async markRequest(id, fields, updateTime) {
      await patchFirestoreFields(SIGNUP_REQUESTS_COLLECTION, id, fields, { precondition: updateTime ? { updateTime } : { exists: true } });
    },
    async deleteRequest(id, updateTime) {
      await deleteFirestoreDocument(SIGNUP_REQUESTS_COLLECTION, id, undefined, updateTime ? { precondition: { updateTime } } : {});
    },
    loginIdInAccounts,
    loginIdInPendingRequests,
    createAccount: createIdAccount,
    hashPassword,
    isPasswordHash,
    isConflict: isFirestoreConflictError,
  };
}

// --- links and requests for the admin screen ---

export async function createSignupLink(input: { memo: string; expiresAt: string; createdBy: string; createdByName: string; nowMs: number }) {
  const token = newSignupToken();
  const id = signupTokenHash(token);
  const link = {
    _id: id,
    memo: input.memo,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: new Date(input.nowMs).toISOString(),
    expiresAt: input.expiresAt,
    status: 'open',
  };
  await patchFirestoreFields(SIGNUP_LINKS_COLLECTION, id, link, { precondition: { exists: false } });
  return { token, link };
}

// Links that can still be used: open and not expired. Used, revoked and expired links stay stored but are not listed.
export async function listOpenSignupLinks(nowMs: number) {
  const links = await listFirestoreCollection<StoredLink>(SIGNUP_LINKS_COLLECTION);
  return links.filter((link) => isLinkUsable(link, nowMs)).sort((a, b) => String(a.expiresAt).localeCompare(String(b.expiresAt)));
}

// false when the link is no longer open (used, revoked, expired or gone) or changed while this ran.
export async function revokeSignupLink(id: string, nowMs: number) {
  const found = await getFirestoreDocumentWithVersion<StoredLink>(SIGNUP_LINKS_COLLECTION, id);
  if (!found || !isLinkUsable(found.record, nowMs)) return false;
  try {
    await patchFirestoreFields(SIGNUP_LINKS_COLLECTION, id, { status: 'revoked', revokedAt: new Date(nowMs).toISOString() }, { precondition: { updateTime: found.updateTime } });
    return true;
  } catch (error) {
    if (isFirestoreConflictError(error)) return false;
    throw error;
  }
}

// Requests younger than the retention period, oldest first. Older ones are deleted here (no scheduled job); a failed
// delete is only logged and the list is answered anyway.
export async function listPendingSignupRequests(nowMs: number) {
  const requests = await listFirestoreCollection<RequestRecord>(SIGNUP_REQUESTS_COLLECTION);
  const expired = requests.filter((request) => isRequestExpired(request, nowMs));
  await Promise.all(
    expired.map((request) =>
      deleteFirestoreDocument(SIGNUP_REQUESTS_COLLECTION, request._id).catch((error) => {
        console.error('Expired staff sign-up request could not be deleted:', request._id, error);
      }),
    ),
  );
  return requests.filter((request) => !isRequestExpired(request, nowMs)).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}
