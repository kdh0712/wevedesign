import { createHash } from 'node:crypto';
import { createClient } from 'next-sanity';

export const managerClient = createClient({
  projectId: 'q2qjj1se',
  dataset: 'production',
  apiVersion: '2026-01-01',
  useCdn: false,
  token: process.env.SANITY_WRITE_TOKEN,
});

export function assertManager(request: Request) {
  const password = process.env.MANAGER_PASSWORD;

  if (!password) {
    return Response.json({ error: 'MANAGER_PASSWORD is not configured.' }, { status: 500 });
  }

  const provided = request.headers.get('x-manager-password');

  if (!provided || provided !== password) {
    return Response.json({ error: '관리자 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

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
