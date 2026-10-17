import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
// Upper bounds for parameters read from a stored hash, so a tampered hash cannot pin the server (64 MiB at most).
const MAX_STORED_N = 1 << 16;
const MAX_STORED_R = 8;
const MAX_STORED_P = 4;
const MAX_STORED_HASH_BYTES = 128;

const scryptAsync = (password: string, salt: Buffer, keyLength: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derived) => (error ? reject(error) : resolve(derived)));
  });

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await scryptAsync(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('base64'), hash.toString('base64')].join('$');
}

export function isPasswordHash(stored: string): boolean {
  return stored.startsWith('scrypt$') && stored.split('$').length === 6;
}

export function parseStoredHash(stored: string): { N: number; r: number; p: number; salt: Buffer; hash: Buffer } | null {
  if (!isPasswordHash(stored)) return null;
  const [, n, r, p, saltText, hashText] = stored.split('$');
  const N = Number(n);
  const R = Number(r);
  const P = Number(p);
  const isPowerOfTwo = Number.isInteger(N) && N > 1 && (N & (N - 1)) === 0;
  if (!isPowerOfTwo || N > MAX_STORED_N) return null;
  if (!Number.isInteger(R) || R < 1 || R > MAX_STORED_R || !Number.isInteger(P) || P < 1 || P > MAX_STORED_P) return null;

  const salt = Buffer.from(saltText, 'base64');
  const hash = Buffer.from(hashText, 'base64');
  if (!salt.length || !hash.length || hash.length > MAX_STORED_HASH_BYTES) return null;
  return { N, r: R, p: P, salt, hash };
}

export function safeEqual(a: string, b: string): boolean {
  // Hash first so both sides have the same length and the comparison time does not leak it.
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}

export async function verifyPassword(password: string, stored: string): Promise<{ ok: boolean; needsRehash: boolean }> {
  if (!isPasswordHash(stored)) {
    // Accounts saved before hashing kept the password in plain text.
    const ok = stored !== '' && safeEqual(password, stored);
    return { ok, needsRehash: ok };
  }

  const parsed = parseStoredHash(stored);
  if (!parsed) return { ok: false, needsRehash: false };

  try {
    const { N, r, p, salt, hash } = parsed;
    const derived = await scryptAsync(password, salt, hash.length, { N, r, p, maxmem: 256 * N * r });
    return { ok: timingSafeEqual(derived, hash), needsRehash: false };
  } catch {
    return { ok: false, needsRehash: false };
  }
}
