import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const MAX_STORED_N = 1 << 20;

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

  const [, n, r, p, saltText, hashText] = stored.split('$');
  const N = Number(n);
  const R = Number(r);
  const P = Number(p);
  const salt = Buffer.from(saltText, 'base64');
  const expected = Buffer.from(hashText, 'base64');
  const validParams = [N, R, P].every((value) => Number.isInteger(value) && value > 0) && N <= MAX_STORED_N;
  if (!validParams || !salt.length || !expected.length) return { ok: false, needsRehash: false };

  try {
    const derived = await scryptAsync(password, salt, expected.length, { N, r: R, p: P, maxmem: 256 * N * R });
    return { ok: timingSafeEqual(derived, expected), needsRehash: false };
  } catch {
    return { ok: false, needsRehash: false };
  }
}
