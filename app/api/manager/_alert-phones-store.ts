import { normalizeKoreanMobile } from '../../lib/alert-phones';
import { canUseFirestoreOnServer, getFirestoreDocument, saveFirestoreDocument } from './firestore';

// Kept in Firestore (server service account only), not in Sanity siteSettings, so staff phone numbers stay private.
const ALERT_SETTINGS_COLLECTION = 'managerSettings';
const ALERT_SETTINGS_ID = 'consultationAlimtalk';

export const isAlertPhoneStoreReady = () => canUseFirestoreOnServer();

export async function readSavedAlertPhones(): Promise<string[] | null> {
  if (!isAlertPhoneStoreReady()) return null;
  const record = await getFirestoreDocument<{ receiverPhones?: unknown }>(ALERT_SETTINGS_COLLECTION, ALERT_SETTINGS_ID);
  if (!record || !Array.isArray(record.receiverPhones)) return null;
  return record.receiverPhones.map((phone) => normalizeKoreanMobile(String(phone))).filter((phone): phone is string => Boolean(phone));
}

export async function saveAlertPhones(phones: string[], updatedBy: string) {
  await saveFirestoreDocument(
    ALERT_SETTINGS_COLLECTION,
    { receiverPhones: phones, updatedAt: new Date().toISOString(), updatedBy },
    undefined,
    ALERT_SETTINGS_ID,
  );
}

// Same variables, in the same order, that the consultation API has always read.
export function envAlertPhones(env: Record<string, string | undefined> = process.env): string[] {
  const raw =
    env.ALIGO_CONSULTATION_ADMIN_RECEIVER_PHONES ||
    env.ALIGO_CONSULTATION_RECEIVER_PHONE ||
    env.KAKAO_CONSULTATION_RECEIVER_PHONE ||
    env.CONSULTATION_NOTIFY_PHONE ||
    '';
  return Array.from(new Set(raw.split(/[,;|\n]+/).map((value) => value.replace(/\D/g, '')).filter(Boolean)));
}
