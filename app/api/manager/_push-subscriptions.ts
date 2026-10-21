import { PUSH_SUBSCRIPTIONS_COLLECTION, pushSubscriptionId } from '../../lib/push-rules';
import type { MobileDeviceRecord } from './_mobile-device-rules';
import { deleteFirestoreDocument, getFirestoreDocument, listFirestoreCollection, patchFirestoreFields } from './firestore';

// Web push subscriptions, one per phone login (spec 2026-10-21 staff push §2). Server service account only; the Firestore
// security rules keep browsers out, as with managerDevices.

export type PushSubscriptionRecord = {
  _id: string;
  deviceId: string;
  userId: string;
  loginId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: string;
  updatedAt: string;
  lastSentAt?: string;
};

export async function savePushSubscription(
  device: Pick<MobileDeviceRecord, '_id' | 'userId' | 'loginId'>,
  subscription: { endpoint: string; p256dh: string; auth: string },
  nowIso: string,
): Promise<void> {
  const id = pushSubscriptionId(device._id);
  const existing = await getFirestoreDocument<PushSubscriptionRecord>(PUSH_SUBSCRIPTIONS_COLLECTION, id);
  await patchFirestoreFields(PUSH_SUBSCRIPTIONS_COLLECTION, id, {
    deviceId: device._id,
    userId: device.userId,
    loginId: device.loginId,
    endpoint: subscription.endpoint,
    p256dh: subscription.p256dh,
    auth: subscription.auth,
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
  });
}

export async function hasPushSubscription(deviceId: string): Promise<boolean> {
  return Boolean(await getFirestoreDocument(PUSH_SUBSCRIPTIONS_COLLECTION, pushSubscriptionId(deviceId)));
}

export async function getPushSubscription(deviceId: string): Promise<PushSubscriptionRecord | null> {
  return getFirestoreDocument<PushSubscriptionRecord>(PUSH_SUBSCRIPTIONS_COLLECTION, pushSubscriptionId(deviceId));
}

export async function listPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
  return listFirestoreCollection<PushSubscriptionRecord>(PUSH_SUBSCRIPTIONS_COLLECTION);
}

// Succeeds when there is nothing to delete.
export async function deletePushSubscription(deviceId: string): Promise<void> {
  await deleteFirestoreDocument(PUSH_SUBSCRIPTIONS_COLLECTION, pushSubscriptionId(deviceId));
}

export async function markPushSent(deviceId: string, nowIso: string): Promise<void> {
  await patchFirestoreFields(PUSH_SUBSCRIPTIONS_COLLECTION, pushSubscriptionId(deviceId), { lastSentAt: nowIso }, { precondition: { exists: true } });
}
