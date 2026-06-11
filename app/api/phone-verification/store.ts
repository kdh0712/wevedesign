import { createHash } from 'node:crypto';

type VerificationRecord = {
  code: string;
  expiresAt: number;
  verified: boolean;
};

const store = globalThis as typeof globalThis & {
  wevePhoneVerification?: Map<string, VerificationRecord>;
};

export const verificationStore = store.wevePhoneVerification || new Map<string, VerificationRecord>();
store.wevePhoneVerification = verificationStore;

export const normalizePhone = (value: string) => value.replace(/\D/g, '');

const tokenSecret = () => process.env.MANAGER_PASSWORD || process.env.SANITY_WRITE_TOKEN || 'weve-phone-verification';

export function createVerificationToken(phoneValue: string) {
  const phone = normalizePhone(phoneValue);
  return createHash('sha256').update(`${phone}:${tokenSecret()}`).digest('hex');
}

export function createVerificationChallenge(phoneValue: string, code: string, expiresAt: number) {
  const phone = normalizePhone(phoneValue);
  const signature = createHash('sha256').update(`${phone}:${code}:${expiresAt}:${tokenSecret()}`).digest('hex');
  return `${expiresAt}.${signature}`;
}

export function isValidVerificationChallenge(phoneValue: string, code: string, challenge?: string) {
  if (!challenge) return false;

  const [expiresAtValue, signature] = challenge.split('.');
  const expiresAt = Number(expiresAtValue);
  if (!expiresAt || !signature || expiresAt < Date.now()) return false;

  return challenge === createVerificationChallenge(phoneValue, code, expiresAt);
}

export function isPhoneVerified(phoneValue: string, token?: string) {
  if (token && token === createVerificationToken(phoneValue)) return true;

  const phone = normalizePhone(phoneValue);
  const record = verificationStore.get(phone);
  return Boolean(record?.verified && record.expiresAt >= Date.now());
}
