// Shrinks a photo in the browser before it is uploaded: the long edge to at most maxEdge pixels, saved as JPEG.
// Every photo is re-encoded, even a small one, which also drops the camera metadata (location included) before a photo
// reaches the customer page. fitWithin and jpegFileName are pure, so Node tests load this file directly.

// Never enlarges; keeps the aspect ratio and at least one pixel on each side.
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) throw new Error('이미지 크기를 알 수 없습니다.');
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// "IMG_0001.HEIC" -> "IMG_0001.jpg", the name the shrunk JPEG is uploaded under.
export function jpegFileName(name: string): string {
  const base = name.replace(/\.[^./\\]*$/, '').trim();
  return `${base || 'photo'}.jpg`;
}

// Throws Error('사진을 열 수 없습니다: <파일명>') when the browser cannot decode the file (an iPhone HEIC outside Safari,
// a file that is not a picture), so the caller can name the photo and stop before anything is posted.
export async function resizeImageFile(file: File, maxEdge = 1600, quality = 0.82): Promise<{ blob: Blob; width: number; height: number }> {
  const cannotOpen = () => new Error(`사진을 열 수 없습니다: ${file.name}`);
  const cannotShrink = () => new Error(`사진을 줄이지 못했습니다: ${file.name}`);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw cannotOpen();
    }

    let size: { width: number; height: number };
    try {
      size = fitWithin(image.naturalWidth, image.naturalHeight, maxEdge);
    } catch {
      throw cannotOpen();
    }

    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    try {
      const context = canvas.getContext('2d');
      if (!context) throw cannotShrink();
      // JPEG has no transparency; without a white base a transparent PNG turns black.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size.width, size.height);
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, size.width, size.height);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (!blob) throw cannotShrink();
      return { blob, width: size.width, height: size.height };
    } finally {
      // Releases the canvas memory right away: iOS Safari caps the total canvas memory, and a post can shrink many photos.
      canvas.width = canvas.height = 0;
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}
