import type { LoginUser } from './_login';
import { MOBILE_DEVICE_TTL_MS, newDeviceSecret, type MobileDeviceRecord } from './_mobile-device-rules';
import type { SessionSource } from './_token';
import { getFirestoreDocument, listFirestoreCollection, patchFirestoreFields } from './firestore';

// The phone app's device logins. Read and written with the server service account only (no idToken), never by a browser.
export const MOBILE_DEVICES_COLLECTION = 'managerDevices';

// Every phone API needs the Firestore service account (the same check as the progress store).
export const MOBILE_STORE_MISSING = '휴대폰 앱은 Firestore 설정이 필요합니다.';

export async function createMobileDevice(
  user: LoginUser,
  src: SessionSource,
  deviceLabel: string,
  nowMs: number,
): Promise<{ deviceId: string; deviceToken: string; expiresAt: string }> {
  const { deviceId, deviceToken, tokenHash } = newDeviceSecret();
  const now = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + MOBILE_DEVICE_TTL_MS).toISOString();
  const record: MobileDeviceRecord = {
    _id: deviceId,
    userId: user.id,
    loginId: user.loginId,
    userName: user.name,
    src,
    deviceLabel,
    tokenHash,
    createdAt: now,
    expiresAt,
    lastUsedAt: now,
  };
  // exists:false: a (practically impossible) id collision fails instead of taking over another phone's record.
  await patchFirestoreFields(MOBILE_DEVICES_COLLECTION, deviceId, record, { precondition: { exists: false } });
  return { deviceId, deviceToken, expiresAt };
}

export async function getMobileDevice(id: string): Promise<MobileDeviceRecord | null> {
  return getFirestoreDocument<MobileDeviceRecord>(MOBILE_DEVICES_COLLECTION, id);
}

export async function touchMobileDevice(id: string, nowIso: string) {
  await patchFirestoreFields(MOBILE_DEVICES_COLLECTION, id, { lastUsedAt: nowIso }, { precondition: { exists: true } });
}

// Throws FirestoreConflictError when the device does not exist.
export async function revokeMobileDevice(id: string, by: string, nowIso: string) {
  await patchFirestoreFields(MOBILE_DEVICES_COLLECTION, id, { revokedAt: nowIso, revokedBy: by }, { precondition: { exists: true } });
}

// Devices that can still refresh, most recently used first.
export async function listActiveMobileDevices(nowMs: number): Promise<MobileDeviceRecord[]> {
  const devices = await listFirestoreCollection<MobileDeviceRecord>(MOBILE_DEVICES_COLLECTION);
  return devices
    .filter((device) => !device.revokedAt && Date.parse(device.expiresAt) > nowMs)
    .sort((a, b) => String(b.lastUsedAt || '').localeCompare(String(a.lastUsedAt || '')));
}
