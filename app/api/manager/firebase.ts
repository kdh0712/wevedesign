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
    throw new Error(data?.error?.message || `Firebase request failed: ${response.status}`);
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

export async function getFirebaseProfile(uid: string, idToken: string) {
  const profile = await firebaseFetch<Omit<FirebaseProfile, 'uid'> | null>(
    `${firebaseDatabaseUrl()}/users/${encodeURIComponent(uid)}.json?auth=${encodeURIComponent(idToken)}`,
  );

  return profile ? { ...profile, uid } : null;
}

export async function getFirebaseAdminFlag(uid: string, idToken: string) {
  try {
    const value = await firebaseFetch<boolean | string | null>(
      `${firebaseDatabaseUrl()}/launcher_admins/${encodeURIComponent(uid)}.json?auth=${encodeURIComponent(idToken)}`,
    );
    return value === true || String(value).toLowerCase() === 'true';
  } catch {
    return false;
  }
}

export async function getFirebaseAccounts(idToken: string) {
  const rows = await firebaseFetch<Record<string, Omit<FirebaseProfile, 'uid'>> | null>(
    `${firebaseDatabaseUrl()}/users.json?auth=${encodeURIComponent(idToken)}`,
  );

  return Object.entries(rows || {}).map(([uid, profile]) => ({ uid, ...profile }));
}

export async function setFirebaseProfile(uid: string, idToken: string, profile: Omit<FirebaseProfile, 'uid'>) {
  return firebaseFetch<Omit<FirebaseProfile, 'uid'>>(
    `${firebaseDatabaseUrl()}/users/${encodeURIComponent(uid)}.json?auth=${encodeURIComponent(idToken)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    },
  );
}
