// Pure rules for the manager logins (no imports), shared by _login.ts, the phone session route and Node tests.

export type AccountSource = 'master' | 'account' | 'firebase';

// A Firebase account checked on a deploy that lacks the Firebase settings: the server can not tell whether the account
// still exists, so this is an outage (the phone keeps its device and tries again), never a removed account.
export function reloadSourceOutage(src: AccountSource, env: { firebaseConfigured: boolean }): string | null {
  if (src === 'firebase' && !env.firebaseConfigured) return 'Firebase 설정이 없어 계정을 확인할 수 없습니다.';
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
