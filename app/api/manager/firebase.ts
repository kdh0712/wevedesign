import { googleAccessToken } from './firestore';

const firebaseApiKey = () => process.env.FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '';
const firebaseDatabaseUrl = () =>
  (process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || '').replace(/\/$/, '');

export type FirebaseProfile = {
  uid: string;
  name?: string;
  email?: string;
  role?: 'admin' | 'staff';
  permissions?: string[];
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export function isFirebaseManagerConfigured() {
  return Boolean(firebaseApiKey() && firebaseDatabaseUrl());
}

async function firebaseFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = (await response.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;

  if (!response.ok) {
    const message = data?.error?.message || `Firebase request failed: ${response.status}`;
    if (response.status === 401 || message.toLowerCase().includes('permission')) {
      throw new Error(
        'Firebase Realtime Database 권한이 없습니다. 로그인한 사용자의 UID가 launcher_admins에 true로 등록되어 있는지, /users 읽기 규칙이 허용되어 있는지 확인해 주세요.',
      );
    }
    throw new Error(message);
  }

  return data as T;
}

export async function firebaseSignIn(email: string, password: string) {
  return firebaseFetch<{ idToken: string; localId: string; email: string }>(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
}

export async function firebaseSignUp(email: string, password: string) {
  return firebaseFetch<{ idToken: string; localId: string; email: string }>(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseApiKey()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
}

export async function firebaseLookup(idToken: string) {
  const data = await firebaseFetch<{ users?: Array<{ localId: string; email?: string }> }>(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    },
  );

  return data.users?.[0] || null;
}

export type FirebaseDbAuth = { idToken: string } | { accessToken: string };

const RTDB_ADMIN_SCOPE = 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email';

const dbAuthQuery = (auth: FirebaseDbAuth) =>
  'accessToken' in auth ? `access_token=${encodeURIComponent(auth.accessToken)}` : `auth=${encodeURIComponent(auth.idToken)}`;

// Account management needs admin access to /users. The service account is not bound by the database rules;
// without one, the signed-in Firebase admin's own token is used.
export async function firebaseAdminDbAuth(adminIdToken?: string): Promise<FirebaseDbAuth | null> {
  const accessToken = await googleAccessToken(RTDB_ADMIN_SCOPE);
  if (accessToken) return { accessToken };
  return adminIdToken ? { idToken: adminIdToken } : null;
}

export async function getFirebaseProfile(uid: string, auth: FirebaseDbAuth) {
  const profile = await firebaseFetch<Omit<FirebaseProfile, 'uid'> | null>(
    `${firebaseDatabaseUrl()}/users/${encodeURIComponent(uid)}.json?${dbAuthQuery(auth)}`,
  );

  return profile ? { ...profile, uid } : null;
}

export async function getFirebaseAdminFlag(uid: string, auth: FirebaseDbAuth) {
  try {
    const value = await firebaseFetch<boolean | string | null>(
      `${firebaseDatabaseUrl()}/launcher_admins/${encodeURIComponent(uid)}.json?${dbAuthQuery(auth)}`,
    );
    return value === true || String(value).toLowerCase() === 'true';
  } catch {
    return false;
  }
}

export async function getFirebaseAccounts(auth: FirebaseDbAuth) {
  const rows = await firebaseFetch<Record<string, Omit<FirebaseProfile, 'uid'>> | null>(
    `${firebaseDatabaseUrl()}/users.json?${dbAuthQuery(auth)}`,
  );

  return Object.entries(rows || {}).map(([uid, profile]) => ({ uid, ...profile }));
}

export async function setFirebaseProfile(uid: string, auth: FirebaseDbAuth, profile: Omit<FirebaseProfile, 'uid'>) {
  return firebaseFetch<Omit<FirebaseProfile, 'uid'>>(
    `${firebaseDatabaseUrl()}/users/${encodeURIComponent(uid)}.json?${dbAuthQuery(auth)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    },
  );
}
