import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const PROJECT_ID = process.env.SANITY_PROJECT_ID || 'q2qjj1se';
const DATASET = process.env.SANITY_DATASET || 'production';
const API_VERSION = process.env.SANITY_API_VERSION || '2025-02-19';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
const collator = new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' });

loadDotEnv('.env.local');
loadDotEnv('.env');

const args = parseArgs(process.argv.slice(2));

if (!args.path) {
  printHelp();
  process.exit(1);
}

const token = process.env.SANITY_WRITE_TOKEN;

if (!args.dryRun && !token) {
  console.error('SANITY_WRITE_TOKEN이 필요합니다. .env.local에 SANITY_WRITE_TOKEN=... 형태로 넣어주세요.');
  process.exit(1);
}

const rootPath = path.resolve(args.path);
const projectFolders = await findProjectFolders(rootPath);

if (projectFolders.length === 0) {
  console.error('업로드할 이미지가 있는 현장 폴더를 찾지 못했습니다.');
  process.exit(1);
}

console.log(`현장 폴더 ${projectFolders.length}개를 확인했습니다.`);

const categoryRef = args.dryRun ? null : await getOrCreateCategory(args.category);

for (const folder of projectFolders) {
  await importProjectFolder(folder, categoryRef);
}

console.log(args.dryRun ? '미리보기 완료' : '업로드 완료');

function parseArgs(argv) {
  const result = {
    path: '',
    category: '주택',
    visible: true,
    featured: false,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === '--category') {
      result.category = argv[index + 1] || result.category;
      index += 1;
    } else if (value === '--featured') {
      result.featured = true;
    } else if (value === '--hidden') {
      result.visible = false;
    } else if (value === '--dry-run') {
      result.dryRun = true;
    } else if (!result.path) {
      result.path = value;
    }
  }

  return result;
}

function printHelp() {
  console.log(`
사용법:
  npm run upload:projects -- "C:\\사진\\현장모음" --category 주택
  npm run upload:projects -- "C:\\사진\\의왕 현장" --category 아파트 --dry-run

폴더 규칙:
  현장 폴더명 = Project 이름
  사진 파일명 = 공간명 + 숫자

예시:
  의왕 32평 리모델링/
    대표.jpg
    거실1.jpg
    거실2.jpg
    주방1.jpg
    침실1.jpg
    침실2.jpg
    시공전.jpg

결과:
  Project: 의왕 32평 리모델링
  대표 사진: 대표.jpg
  상세 사진: 거실, 주방, 침실로 묶이고 숫자 순서대로 표시
`);
}

function loadDotEnv(fileName) {
  const filePath = path.resolve(fileName);
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;

    const [rawKey, ...rawValue] = trimmed.split('=');
    const key = rawKey.trim();
    const value = rawValue.join('=').trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

async function findProjectFolders(root) {
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) throw new Error('폴더 경로만 사용할 수 있습니다.');

  if ((await listImages(root)).length > 0) return [root];

  const children = await fs.readdir(root, { withFileTypes: true });
  const folders = [];

  for (const child of children) {
    if (!child.isDirectory()) continue;
    const folder = path.join(root, child.name);
    if ((await listImages(folder)).length > 0) folders.push(folder);
  }

  return folders.sort((a, b) => collator.compare(path.basename(a), path.basename(b)));
}

async function listImages(folder) {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(folder, entry.name))
    .sort((a, b) => collator.compare(path.basename(a), path.basename(b)));
}

async function importProjectFolder(folder, categoryRef) {
  const projectTitle = path.basename(folder);
  const files = await listImages(folder);
  const parsed = files.map(parseImageFile);
  const cover = parsed.find((item) => item.kind === 'cover') || parsed.find((item) => item.kind === 'detail');
  const before = parsed.find((item) => item.kind === 'before');
  const detailImages = parsed.filter((item) => item.kind === 'detail');
  const groups = groupDetailImages(detailImages);

  console.log(`\n[${projectTitle}]`);
  console.log(`- 사진 ${files.length}장`);
  console.log(`- 대표 사진: ${cover ? path.basename(cover.filePath) : '없음'}`);
  if (before) console.log(`- 시공 전 사진: ${path.basename(before.filePath)}`);
  for (const group of groups) {
    console.log(`- ${group.roomType}: ${group.images.map((image) => path.basename(image.filePath)).join(', ')}`);
  }

  if (args.dryRun) return;

  if (!cover) {
    console.warn(`대표로 사용할 이미지가 없어 건너뜁니다: ${projectTitle}`);
    return;
  }

  const existingProject = await sanityQuery('*[_type == "project" && title == $title][0]{_id}', { title: projectTitle });
  const projectId = existingProject?._id || `project-${hash(projectTitle)}`;
  const mainImage = await uploadImage(cover.filePath, `${projectTitle} 대표 사진`);
  const beforeImage = before ? await uploadImage(before.filePath, `${projectTitle} 시공 전 사진`) : null;
  const galleryGroups = [];

  for (const [groupIndex, group] of groups.entries()) {
    const images = [];

    for (const [imageIndex, image] of group.images.entries()) {
      const uploaded = await uploadImage(image.filePath, `${projectTitle} ${group.roomType} ${image.order}`);
      images.push({
        _type: 'image',
        _key: `image-${hash(`${image.filePath}-${imageIndex}`)}`,
        asset: { _type: 'reference', _ref: uploaded._id },
        caption: stripExtension(path.basename(image.filePath)),
        displayOrder: image.order || imageIndex + 1,
        alt: `${projectTitle} ${group.roomType}`,
      });
    }

    galleryGroups.push({
      _type: 'object',
      _key: `group-${hash(`${projectTitle}-${group.roomType}`)}`,
      roomType: group.roomType,
      title: group.roomType,
      displayOrder: groupIndex + 1,
      images,
    });
  }

  const projectFields = {
    isVisible: args.visible,
    featured: args.featured,
    title: projectTitle,
    category: { _type: 'reference', _ref: categoryRef._id },
    mainImage: {
      _type: 'image',
      asset: { _type: 'reference', _ref: mainImage._id },
      alt: `${projectTitle} 대표 사진`,
    },
    galleryGroups,
  };

  if (beforeImage) {
    projectFields.beforeImage = {
      _type: 'image',
      asset: { _type: 'reference', _ref: beforeImage._id },
      alt: `${projectTitle} 시공 전 사진`,
    };
  }

  if (existingProject?._id) {
    await sanityMutate([{ patch: { id: projectId, set: projectFields } }]);
  } else {
    await sanityMutate([{ create: { _id: projectId, _type: 'project', ...projectFields } }]);
  }

  console.log(`- Sanity 반영 완료: ${projectTitle}`);
}

function parseImageFile(filePath) {
  const baseName = stripExtension(path.basename(filePath)).trim();
  const normalized = baseName.toLowerCase().replace(/\s+/g, '');

  if (/^(대표|메인|썸네일|커버|cover|main|thumbnail|thumb)$/i.test(normalized)) {
    return { filePath, kind: 'cover', roomType: '대표', order: 1 };
  }

  if (/^(시공전|공사전|before|비포)$/i.test(normalized)) {
    return { filePath, kind: 'before', roomType: '시공 전', order: 1 };
  }

  const match = baseName.match(/^(.*?)[\s_-]*(\d+)$/);
  const roomType = (match ? match[1] : baseName).trim() || '상세';
  const order = match ? Number(match[2]) : 1;

  return { filePath, kind: 'detail', roomType, order };
}

function groupDetailImages(images) {
  const map = new Map();

  for (const image of images) {
    if (!map.has(image.roomType)) map.set(image.roomType, []);
    map.get(image.roomType).push(image);
  }

  return Array.from(map.entries()).map(([roomType, groupImages]) => ({
    roomType,
    images: groupImages.sort((a, b) => a.order - b.order || collator.compare(a.filePath, b.filePath)),
  }));
}

async function getOrCreateCategory(title) {
  const existing = await sanityQuery('*[_type == "category" && title == $title][0]{_id,title}', { title });
  if (existing) return existing;

  const category = {
    _id: `category-${hash(title)}`,
    _type: 'category',
    isVisible: true,
    title,
    slug: { _type: 'slug', current: hash(title).slice(0, 12) },
    displayOrder: 999,
  };

  await sanityMutate([{ createOrReplace: category }]);
  return category;
}

async function uploadImage(filePath, label) {
  const bytes = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = mimeTypeForExtension(ext);
  const url = `https://${PROJECT_ID}.api.sanity.io/${API_VERSION}/assets/images/${DATASET}?filename=${encodeURIComponent(path.basename(filePath))}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': mimeType,
    },
    body: bytes,
  });

  if (!response.ok) {
    throw new Error(`${label} 업로드 실패: ${response.status} ${await response.text()}`);
  }

  const result = await response.json();
  return result.document;
}

async function sanityQuery(query, params = {}) {
  const search = new URLSearchParams({ query });
  for (const [key, value] of Object.entries(params)) {
    search.set(`$${key}`, JSON.stringify(value));
  }

  const response = await fetch(`https://${PROJECT_ID}.api.sanity.io/${API_VERSION}/data/query/${DATASET}?${search}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) throw new Error(`Sanity 조회 실패: ${response.status} ${await response.text()}`);
  const data = await response.json();
  return data.result;
}

async function sanityMutate(mutations) {
  const response = await fetch(`https://${PROJECT_ID}.api.sanity.io/${API_VERSION}/data/mutate/${DATASET}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mutations }),
  });

  if (!response.ok) throw new Error(`Sanity 저장 실패: ${response.status} ${await response.text()}`);
  return response.json();
}

function mimeTypeForExtension(ext) {
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.avif':
      return 'image/avif';
    default:
      return 'application/octet-stream';
  }
}

function stripExtension(fileName) {
  return fileName.replace(/\.[^.]+$/, '');
}

function hash(value) {
  return createHash('sha1').update(value).digest('hex').slice(0, 16);
}
