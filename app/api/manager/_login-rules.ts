// Pure rules for the manager logins (no imports), shared by _login.ts, the phone session route and Node tests.

// 'account' is a Sanity ID account, 'firestore' an ID account made from a staff sign-up (managerAccounts).
export type AccountSource = 'master' | 'account' | 'firebase' | 'firestore';

// A Firebase account checked on a deploy that lacks the Firebase settings, or a Firestore ID account on one without the
// Firestore service account: the server can not tell whether the account still exists, so this is an outage (the phone
// keeps its device and tries again), never a removed account. firestoreConfigured left out counts as set up.
export function reloadSourceOutage(src: AccountSource, env: { firebaseConfigured: boolean; firestoreConfigured?: boolean }): string | null {
  if (src === 'firebase' && !env.firebaseConfigured) return 'Firebase 설정이 없어 계정을 확인할 수 없습니다.';
  if (src === 'firestore' && env.firestoreConfigured === false) return 'Firestore 설정이 없어 계정을 확인할 수 없습니다.';
  return null;
}

type IdAccountLike = { isActive?: boolean; passwordHash?: string };

// An ID account (Firestore managerAccounts) may be used only while it is on and holds a scrypt hash. The server only ever
// writes scrypt hashes there, so any other value was not written by it and must never log in (verifyPassword would
// otherwise compare it as an old plain-text password). isPasswordHash comes from _password.ts.
export function usableIdAccount<T extends IdAccountLike>(account: T | null, isPasswordHash: (stored: string) => boolean): T | null {
  if (!account || account.isActive === false) return null;
  return typeof account.passwordHash === 'string' && isPasswordHash(account.passwordHash) ? account : null;
}

// The account an ID login (no '@') is checked against: a usable ID account first, otherwise the Sanity account. Both are read
// together by the caller, and the password is checked once against storedHash (or a dummy when there is no account).
export function chooseLoginAccount<I extends IdAccountLike, S extends { password?: string }>(
  idAccount: I | null,
  sanityAccount: S | null,
  isPasswordHash: (stored: string) => boolean,
): { src: 'firestore'; account: I; storedHash: string } | { src: 'account'; account: S; storedHash: string | undefined } | null {
  const usable = usableIdAccount(idAccount, isPasswordHash);
  if (usable) return { src: 'firestore', account: usable, storedHash: usable.passwordHash as string };
  if (sanityAccount) return { src: 'account', account: sanityAccount, storedHash: sanityAccount.password };
  return null;
}

// What Firebase answers for a wrong email or password (or a disabled user): told to the user as a refused login, not as a
// server error. Anything else from Firebase is an outage.
const FIREBASE_CREDENTIAL_CODES = /^(INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|INVALID_EMAIL|USER_DISABLED)\b/;

export function isFirebaseCredentialRefusal(error: unknown): boolean {
  return error instanceof Error && FIREBASE_CREDENTIAL_CODES.test(error.message);
}

// The phone session route's answer when a login, refresh or logout fails unexpectedly. Fixed words only: the server error
// itself (which may name Firebase, Sanity or Firestore internals) stays in the server log.
export const LOGIN_FAILED_MESSAGE = '로그인 중 서버에 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.';
export const LOGOUT_FAILED_MESSAGE = '로그아웃 처리 중 서버에 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.';
export const ACCOUNT_CHECK_FAILED_MESSAGE = '서버에서 계정을 확인하지 못했습니다. 잠시 후 다시 시도하고, 계속되면 관리자에게 알려 주세요.';

export function sessionFailureAnswer(action: unknown): { status: number; error: string } {
  // Not a refusal: the phone keeps its device and tries again later.
  if (action === 'refresh') return { status: 503, error: ACCOUNT_CHECK_FAILED_MESSAGE };
  if (action === 'logout') return { status: 500, error: LOGOUT_FAILED_MESSAGE };
  return { status: 500, error: LOGIN_FAILED_MESSAGE };
}
