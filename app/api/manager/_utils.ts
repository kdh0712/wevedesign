import { createHash } from 'node:crypto';
import { createClient } from 'next-sanity';

export const managerClient = createClient({
  projectId: 'q2qjj1se',
  dataset: 'production',
  apiVersion: '2026-01-01',
  useCdn: false,
  token: process.env.SANITY_WRITE_TOKEN,
});

// Read-only check run before a delete, so an id of another document type (an account, the site settings) is never deleted.
export async function checkSanityDocumentType(id: string, expectedType: string): Promise<'ok' | 'missing' | 'mismatch'> {
  const document = await managerClient.fetch<{ _type?: string } | null>('*[_id == $id][0]{_type}', { id });
  if (!document?._type) return 'missing';
  return document._type === expectedType ? 'ok' : 'mismatch';
}

export function assertSanityWriteConfigured() {
  if (!process.env.SANITY_WRITE_TOKEN) {
    return Response.json({ error: 'SANITY_WRITE_TOKEN is not configured.' }, { status: 500 });
  }

  return null;
}

export function hashId(value: string) {
  return createHash('sha1').update(value).digest('hex').slice(0, 16);
}

export function slugValue(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || `category-${hashId(value).slice(0, 8)}`;
}

export async function getOrCreateCategory(title: string) {
  const cleanTitle = title.trim() || '주택';
  const existing = await managerClient.fetch('*[_type == "category" && title == $title][0]{_id,title}', { title: cleanTitle });

  if (existing?._id) return existing;

  const category = {
    _id: `category-${hashId(cleanTitle)}`,
    _type: 'category',
    isVisible: true,
    title: cleanTitle,
    slug: { _type: 'slug', current: slugValue(cleanTitle) },
    displayOrder: 999,
  };

  await managerClient.createIfNotExists(category);
  return category;
}
