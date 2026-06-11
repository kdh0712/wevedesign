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

export function isPhoneVerified(phoneValue: string, token?: string) {
  if (token && token === createVerificationToken(phoneValue)) return true;

  const phone = normalizePhone(phoneValue);
  const record = verificationStore.get(phone);
  return Boolean(record?.verified && record.expiresAt >= Date.now());
}
