import webpush from 'web-push';
import { hasAnyPermission } from '../../lib/manager-permissions';
import { consultationPushMessage, type PushMessage } from '../../lib/push-rules';
import { reloadManagerUser } from './_login';
import { deviceIsActive, pushRecipientDecision } from './_mobile-device-rules';
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

type AlertAccount = { credential: string | null; canGetAlerts: boolean } | null;

// null: the account is gone. Throws when it cannot be read now (an outage), so that send is skipped, never dropped.
const alertAccount = async (src: 'master' | 'account' | 'firebase', userId: string): Promise<AlertAccount> => {
  const account = await reloadManagerUser(src, userId);
  if (!account) return null;
  const permissions = Array.isArray(account.user.permissions) ? (account.user.permissions as string[]) : [];
  return { credential: account.credential, canGetAlerts: hasAnyPermission({ role: account.user.role, permissions }, ['consultations']) };
};

// Every subscriber is checked again at each send, as a session refresh would: the phone login must still be live and its
// password unchanged, and the account must still have the consultations permission (pushRecipientDecision). Accounts are
// read once per person per send.
export async function notifyNewConsultations(consultations: Array<Record<string, unknown>>): Promise<void> {
  try {
    const config = webPushConfig();
    const key = resolveSessionKey();
    const nowMs = Date.now();
    const message = consultationPushMessage(consultations, nowMs);
    if (!config || !key || !message) return;

    const accounts = new Map<string, Promise<AlertAccount | undefined>>();
    for (const subscription of await listPushSubscriptions()) {
      const device = await getMobileDevice(subscription.deviceId).catch(() => undefined);
      if (device === undefined) continue; // Could not read it now; try again at the next consultation.
      let account: AlertAccount | undefined = null;
      if (device && deviceIsActive(device, nowMs, key)) {
        const person = `${device.src}:${device.userId}`;
        if (!accounts.has(person)) accounts.set(person, alertAccount(device.src, device.userId).catch(() => undefined));
        account = await accounts.get(person);
        if (account === undefined) continue; // The account could not be read now: skip, keep the subscription.
      }
      const decision = pushRecipientDecision(device, subscription.userId, account, nowMs, key);
      if (decision === 'drop') await deletePushSubscription(subscription.deviceId).catch(() => undefined);
      if (decision === 'send') await deliver(subscription, message, config);
    }
  } catch (error) {
    console.error('New consultation alerts failed:', error instanceof Error ? error.message : error);
  }
}
