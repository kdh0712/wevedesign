// Customer progress photos in the private Firebase Storage bucket. Server only. The bucket's production-mode rules deny
// every client, so only this server touches it, with the Firebase service account. A browser only ever gets a short-lived
// V4 signed GET URL for a photo, made after the customer page's cookie check or the manager session. Records in Firestore
// keep the pathname, never a URL.
//
// Nothing here loads @google-cloud/storage at runtime: the bucket is passed in (createProgressPhotoStore), so tests run on
// fakes. _progress-photo-storage.ts builds the real bucket from the service account.
import { randomBytes } from 'node:crypto';
import type { Bucket } from '@google-cloud/storage';
import type { ProgressPhotoView, ProgressUpdate, ProgressUpdateView, StoredProgressPhoto } from '../../lib/site-progress.ts';
import { isProgressPhotoPathname, progressPhotoPathname } from './_progress-request.ts';

const HOUR_MS = 60 * 60 * 1000;

export const PHOTO_STORE_MISSING_MESSAGE = '사진 저장소(Firebase Storage)가 설정되지 않았습니다. 관리자에게 문의해 주세요.';
export const PHOTO_STORE_PERMISSION_MESSAGE = '사진 저장소 권한이 없습니다. 관리자에게 문의해 주세요.';

// A browser may keep a photo for an hour, the length of one URL window; private, so no shared cache keeps it.
export const PHOTO_CACHE_CONTROL = 'private, max-age=3600';

type ServiceAccountLike = { client_email: string; private_key: string; project_id?: string };

export type ProgressPhotoStorageConfig = {
  bucketName: string;
  projectId: string;
  credentials: { client_email: string; private_key: string };
};

// The same service account the server uses for Firestore, and the bucket FIREBASE_STORAGE_BUCKET names (a "gs://" prefix
// is allowed), otherwise the project's default bucket <projectId>.firebasestorage.app. Null when either part is missing,
// which is what "not configured" means.
export function progressPhotoStorageConfig(input: {
  account: ServiceAccountLike | null;
  projectId: string;
  env: Record<string, string | undefined>;
}): ProgressPhotoStorageConfig | null {
  const { account, projectId, env } = input;
  if (!account) return null;
  const named = (env.FIREBASE_STORAGE_BUCKET ?? '').trim().replace(/^gs:\/\//, '').replace(/\/+$/, '');
  const bucketName = named || (projectId ? `${projectId}.firebasestorage.app` : '');
  if (!bucketName) return null;
  return { bucketName, projectId, credentials: { client_email: account.client_email, private_key: account.private_key } };
}

// Storage answers 403 when the service account lacks rights on the bucket (the owner then grants "Storage Object Admin").
export function isStoragePermissionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, status, response } = error as { code?: unknown; status?: unknown; response?: { status?: unknown } };
  return code === 403 || status === 403 || response?.status === 403;
}

// What a log line keeps of a Storage error: its kind, status and message. Never the error object itself, whose request
// details can carry the service account's access token.
export function storageErrorSummary(error: unknown): string {
  if (typeof error === 'string') return error;
  if (!(error instanceof Error)) return 'unknown error';
  const { code, status } = error as { code?: unknown; status?: unknown };
  const statusValue = [code, status].find((value) => typeof value === 'number' || (typeof value === 'string' && value !== ''));
  return `${error.name}${statusValue !== undefined ? ` ${String(statusValue)}` : ''}: ${error.message}`;
}

// A photo URL expires at the end of the next full hour (1 to 2 hours from now). It is signed as usable from two hours
// before that, so the signed date is the same for the whole hour too: V4 URLs carry their signing date, and without a fixed
// one every page view would get a new URL and the browser could not reuse the photo it already loaded.
export function photoUrlWindow(nowMs: number): { accessibleAt: number; expires: number } {
  const expires = Math.ceil(nowMs / HOUR_MS) * HOUR_MS + HOUR_MS;
  return { accessibleAt: expires - 2 * HOUR_MS, expires };
}

export type ProgressPhotoBucket = Pick<Bucket, 'file'>;

export function createProgressPhotoStore(options: {
  // Called per operation; throws when storage is not configured.
  bucket: () => ProgressPhotoBucket;
  now?: () => number;
  log?: (message: string, error: unknown) => void;
}) {
  const { bucket } = options;
  const now = options.now ?? Date.now;
  const log = options.log ?? ((message: string, error: unknown) => console.error(message, storageErrorSummary(error)));

  // Stores the photo under a new pathname. It never overwrites (the object must not exist yet), and nothing from the site
  // or the file goes into the name.
  async function upload(bytes: Buffer, contentType: string): Promise<{ id: string; pathname: string }> {
    const pathname = progressPhotoPathname(contentType, randomBytes(12).toString('hex'));
    await bucket()
      .file(pathname)
      .save(bytes, {
        contentType,
        metadata: { cacheControl: PHOTO_CACHE_CONTROL },
        resumable: false,
        preconditionOpts: { ifGenerationMatch: 0 },
      });
    return { id: randomBytes(8).toString('hex'), pathname };
  }

  // Signed GET URLs for the photos, in order. Signing is local work with the service-account key (no network). Rejects
  // when a URL cannot be made; the caller decides what to show.
  async function sign(photos: readonly StoredProgressPhoto[]): Promise<ProgressPhotoView[]> {
    if (photos.length === 0) return [];
    const { accessibleAt, expires } = photoUrlWindow(now());
    const target = bucket();
    return Promise.all(
      photos.map(async (photo) => {
        const [url] = await target.file(photo.pathname).getSignedUrl({ version: 'v4', action: 'read', accessibleAt, expires });
        return { id: photo.id, url, width: photo.width, height: photo.height };
      }),
    );
  }

  // The records with signed photo URLs, all signed in one go. Never throws: when signing fails it is logged, every photo
  // keeps its place with an empty url, and photosUnavailable is set so the screen can say so.
  async function signUpdates(updates: readonly ProgressUpdate[]): Promise<{ updates: ProgressUpdateView[]; photosUnavailable: boolean }> {
    let signed: ProgressPhotoView[] | null = null;
    try {
      signed = await sign(updates.flatMap((update) => update.photos));
    } catch (error) {
      log('Progress photo URLs not signed:', error);
    }
    let index = 0;
    const photosOf = (photos: StoredProgressPhoto[]): ProgressPhotoView[] =>
      photos.map((photo) => (signed ? signed[index++] : { id: photo.id, url: '', width: photo.width, height: photo.height }));
    return { updates: updates.map((update) => ({ ...update, photos: photosOf(update.photos) })), photosUnavailable: signed === null };
  }

  // Deletes the objects, each pathname once; one that is already gone counts as deleted. A failure is logged and never
  // reaches the caller: the record is already gone, and the object stays behind as an orphan.
  async function remove(pathnames: readonly string[]): Promise<void> {
    const targets = [...new Set(pathnames.filter(isProgressPhotoPathname))];
    if (targets.length === 0) return;
    let target: ProgressPhotoBucket;
    try {
      target = bucket();
    } catch (error) {
      log(`Progress photos not deleted (${targets.length} of ${targets.length}):`, error);
      return;
    }
    const results = await Promise.allSettled(targets.map((pathname) => target.file(pathname).delete({ ignoreNotFound: true })));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length > 0) log(`Progress photos not deleted (${failures.length} of ${targets.length}):`, failures[0].reason);
  }

  return { upload, sign, signUpdates, remove };
}
