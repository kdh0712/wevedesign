// The real progress photo store: the Firebase Storage bucket, reached with the Firebase service account the server already
// uses for Firestore. Server only (the route and the customer page import it); the rules live in _progress-photos.ts.
import { Storage, type Bucket } from '@google-cloud/storage';
import { createProgressPhotoStore, progressPhotoStorageConfig } from './_progress-photos';
import { firebaseServiceAccount, firestoreProjectId } from './firestore';

const storageConfig = () =>
  progressPhotoStorageConfig({ account: firebaseServiceAccount(), projectId: firestoreProjectId(), env: process.env });

// "Configured": a service account and a bucket name. Whether the account may use the bucket shows only on the first
// upload (a 403 answers PHOTO_STORE_PERMISSION_MESSAGE).
export const isProgressPhotoStoreConfigured = () => storageConfig() !== null;

// One client per server instance, made on first use.
let bucketCache: Bucket | null = null;

function progressPhotoBucket(): Bucket {
  if (bucketCache) return bucketCache;
  const config = storageConfig();
  if (!config) throw new Error('Firebase Storage is not configured (service account or bucket name missing).');
  const storage = new Storage({ projectId: config.projectId || undefined, credentials: config.credentials });
  bucketCache = storage.bucket(config.bucketName);
  return bucketCache;
}

const store = createProgressPhotoStore({ bucket: progressPhotoBucket });

export const uploadProgressPhoto = store.upload;
export const signProgressPhotoUrls = store.sign;
export const signProgressUpdatePhotos = store.signUpdates;
export const deleteProgressPhotos = store.remove;
