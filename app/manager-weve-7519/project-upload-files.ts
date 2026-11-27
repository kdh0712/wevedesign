// Browser helpers for 시공 사례 uploads: reading picked or dropped folders, previewing them per folder, and shrinking each
// photo before it is uploaded on its own (spec docs/superpowers/specs/2026-11-27-project-upload-per-photo-design.md).
// Moved from page.tsx.

export type PreviewProject = {
  title: string;
  count: number;
  rooms: string[];
  coverCount: number;
  beforeCount: number;
};

// Each photo goes in a request of its own (Vercel caps one near 4.5MB; /api/manager/project-asset takes up to 4MB), so it
// keeps 2048px at quality 0.85; one still over 3.9MB goes down to 1600px at 0.8.
export const PHOTO_PRESET = { maxWidth: 2048, quality: 0.85 };
const PHOTO_FALLBACK_PRESET = { maxWidth: 1600, quality: 0.8 };
const MAX_PHOTO_BYTES = 3.9 * 1024 * 1024;
// The image types /api/manager/project-asset stores. Others (HEIC from an iPhone, videos …) are left out of an upload.
export const UPLOADABLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

const COVER_NAME = /^(대표|메인|썸네일|커버|cover|main|thumbnail|thumb)$/i;
const BEFORE_NAME = /^(시공전|공사전|before|비포)$/i;

// The folder a file belongs to: the folder that holds it (a project), or the file name for a loose file.
export function projectTitleOfPath(path: string, fallbackName: string) {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  const fileName = parts[parts.length - 1] || fallbackName;
  return parts.length > 1 ? parts[parts.length - 2] : fileName.replace(/\.[^.]+$/, '');
}

export function buildPreview(files: File[]): PreviewProject[] {
  const map = new Map<string, { count: number; rooms: Set<string>; coverCount: number; beforeCount: number }>();

  files.forEach((file) => {
    const path = file.webkitRelativePath || file.name;
    const parts = path.split(/[\\/]+/).filter(Boolean);
    const fileName = parts[parts.length - 1] || file.name;
    const projectTitle = projectTitleOfPath(path, file.name);
    const normalized = fileName.replace(/\.[^.]+$/, '').trim().toLowerCase().replace(/\s+/g, '');
    const room = roomNameFromFile(fileName);
    const current = map.get(projectTitle) || { count: 0, rooms: new Set<string>(), coverCount: 0, beforeCount: 0 };
    current.count += 1;
    if (COVER_NAME.test(normalized)) current.coverCount += 1;
    else if (BEFORE_NAME.test(normalized)) current.beforeCount += 1;
    else if (room) current.rooms.add(room);
    map.set(projectTitle, current);
  });

  return Array.from(map.entries()).map(([title, value]) => ({
    title,
    count: value.count,
    rooms: Array.from(value.rooms),
    coverCount: value.coverCount,
    beforeCount: value.beforeCount,
  }));
}

type DropFileEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (success: (file: File) => void, error?: (error: Error) => void) => void;
  createReader?: () => { readEntries: (success: (entries: DropFileEntry[]) => void, error?: (error: Error) => void) => void };
};

type DropItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => DropFileEntry | null;
};

export async function filesFromDrop(dataTransfer: DataTransfer) {
  const entries = Array.from(dataTransfer.items || [])
    .map((item): DropFileEntry | null => ((item as DropItemWithEntry).webkitGetAsEntry?.() as unknown as DropFileEntry | null) || null)
    .filter((entry): entry is DropFileEntry => Boolean(entry));

  if (entries.length === 0) return Array.from(dataTransfer.files || []);

  const nested = await Promise.all(entries.map((entry) => readDropEntry(entry)));
  return nested.flat();
}

async function readDropEntry(entry: DropFileEntry, parentPath = ''): Promise<File[]> {
  const relativePath = parentPath ? `${parentPath}/${entry.name}` : entry.name;

  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => entry.file?.(resolve, reject));
    return [fileWithRelativePath(file, relativePath)];
  }

  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const children: DropFileEntry[] = [];

    while (true) {
      const batch = await new Promise<DropFileEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (batch.length === 0) break;
      children.push(...batch);
    }

    const nested = await Promise.all(children.map((child) => readDropEntry(child, relativePath)));
    return nested.flat();
  }

  return [];
}

function fileWithRelativePath(file: File, relativePath: string) {
  try {
    Object.defineProperty(file, 'webkitRelativePath', {
      configurable: true,
      value: relativePath,
    });
  } catch {
    return new File([file], relativePath, { type: file.type, lastModified: file.lastModified });
  }

  return file;
}

function roomNameFromFile(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, '').trim();
  const normalized = baseName.toLowerCase().replace(/\s+/g, '');

  if (COVER_NAME.test(normalized)) return '';
  if (BEFORE_NAME.test(normalized)) return '시공 전';

  const match = baseName.match(/^(.*?)[\s_-]*(\d+)$/);
  return (match ? match[1] : baseName).trim();
}

// One photo, ready for its own upload request.
export async function shrinkPhotoForUpload(file: File) {
  const shrunk = await compressImage(file, PHOTO_PRESET);
  return shrunk.size > MAX_PHOTO_BYTES ? compressImage(file, PHOTO_FALLBACK_PRESET) : shrunk;
}

export async function compressImage(file: File, preset: { maxWidth: number; quality: number } = PHOTO_PRESET) {
  if (!file.type.startsWith('image/')) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, preset.maxWidth / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error('이미지 압축에 실패했습니다.'));
      },
      'image/jpeg',
      preset.quality,
    );
  });

  if (blob.size >= file.size) return file;

  return new File([blob], toJpegFileName(file.name), {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  });
}

function toJpegFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '') + '.jpg';
}
