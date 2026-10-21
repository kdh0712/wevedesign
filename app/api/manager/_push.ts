import webpush from 'web-push';
import { hasAnyPermission } from '../../lib/manager-permissions';
import { consultationPushMessage, type PushMessage } from '../../lib/push-rules';
import { reloadManagerUser } from './_login';
import { deviceIsActive } from './_mobile-device-rules';
import { getMobileDevice } from './_mobile-devices';
import {
  deletePushSubscription,
  getPushSubscription,
  listPushSubscriptions,
  markPushSent,
  type PushSubscriptionRecord,
} from './_push-subscriptions';
import { resolveSessionKey } from './_token';

// Sends web push alerts (spec 2026-10-21 staff push §2). Nothing here may change the result of saving a consultation:
// callers run it after the answer (after()), and every failure is logged, never thrown. Push addresses are never logged.

type WebPushConfig = { publicKey: string; privateKey: string; subject: string };

export function webPushConfig(): WebPushConfig | null {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY?.trim();
  const subject = process.env.WEB_PUSH_SUBJECT?.trim();
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

type Delivery = 'sent' | 'gone' | 'failed';

async function deliver(subscription: PushSubscriptionRecord, message: PushMessage, config: WebPushConfig): Promise<Delivery> {
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(message),
      { vapidDetails: config, TTL: 86400, urgency: 'high' },
    );
    await markPushSent(subscription.deviceId, new Date().toISOString()).catch(() => undefined);
    return 'sent';
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    // The push service says this subscription no longer exists (app removed, alerts turned off in the phone settings).
    if (statusCode === 404 || statusCode === 410) {
      await deletePushSubscription(subscription.deviceId).catch(() => undefined);
      return 'gone';
    }
    console.error('Web push failed:', statusCode ?? (error instanceof Error ? error.name : 'unknown'));
    return 'failed';
  }
}

// The one phone's own test alert.
export async function sendPushToDevice(deviceId: string, message: PushMessage): Promise<Delivery | 'none'> {
  const config = webPushConfig();
  const subscription = config ? await getPushSubscription(deviceId) : null;
  if (!config || !subscription) return 'none';
  return deliver(subscription, message, config);
}

const canGetConsultationAlerts = async (src: 'master' | 'account' | 'firebase', userId: string) => {
  const account = await reloadManagerUser(src, userId);
  if (!account) return false;
  const permissions = Array.isArray(account.user.permissions) ? (account.user.permissions as string[]) : [];
  return hasAnyPermission({ role: account.user.role, permissions }, ['consultations']);
};

// Every subscriber is checked again at each send: the phone login must still be live and the account must still have the
// consultations permission. Accounts are read once per person per send.
export async function notifyNewConsultations(consultations: Array<Record<string, unknown>>): Promise<void> {
  try {
    const config = webPushConfig();
    const key = resolveSessionKey();
    const nowMs = Date.now();
    const message = consultationPushMessage(consultations, nowMs);
    if (!config || !key || !message) return;

    const allowed = new Map<string, Promise<boolean>>();
    for (const subscription of await listPushSubscriptions()) {
      const device = await getMobileDevice(subscription.deviceId).catch(() => undefined);
      if (device === undefined) continue; // Could not read it now; try again at the next consultation.
      if (!device || !deviceIsActive(device, nowMs, key) || device.userId !== subscription.userId) {
        await deletePushSubscription(subscription.deviceId).catch(() => undefined);
        continue;
      }
      const person = `${device.src}:${device.userId}`;
      if (!allowed.has(person)) allowed.set(person, canGetConsultationAlerts(device.src, device.userId).catch(() => false));
      if (!(await allowed.get(person))) continue;
      await deliver(subscription, message, config);
    }
  } catch (error) {
    console.error('New consultation alerts failed:', error instanceof Error ? error.message : error);
  }
}
