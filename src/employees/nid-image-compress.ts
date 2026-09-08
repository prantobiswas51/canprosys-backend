import { promises as fsp } from 'fs';
import { basename, dirname, extname, join } from 'path';
import sharp from 'sharp';

export const MAX_NID_IMAGE_BYTES = 1 * 1024 * 1024; // 1MB

// Multer already wrote the original file to disk (see nid-upload.config.ts)
// -- this runs after that, and only touches images that actually exceed the
// limit. NID photos are always photographic (a phone/camera shot of a
// card), so re-encoding as JPEG is always a safe target regardless of what
// format the upload started as: much better compression than PNG for this
// kind of image, and every browser/viewer renders it identically.
//
// Repeatedly re-encodes at a lower quality and/or smaller width until the
// result fits, or gives up after a few attempts and keeps the smallest
// version produced (never rejects the upload outright over size).
export async function compressNidImageIfNeeded(filePath: string): Promise<string> {
  const { size } = await fsp.stat(filePath);
  if (size <= MAX_NID_IMAGE_BYTES) return filePath;

  let quality = 82;
  let width: number | undefined;
  let best: Buffer | undefined;

  for (let attempt = 0; attempt < 6; attempt++) {
    const pipeline = sharp(filePath, { failOn: 'none' }).rotate(); // bake in EXIF orientation before resizing
    const withResize = width ? pipeline.resize({ width, withoutEnlargement: true }) : pipeline;
    const buffer = await withResize.jpeg({ quality, mozjpeg: true }).toBuffer();

    if (!best || buffer.length < best.length) best = buffer;
    if (buffer.length <= MAX_NID_IMAGE_BYTES) {
      best = buffer;
      break;
    }

    quality = Math.max(35, quality - 12);
    width = Math.round((width ?? 2000) * 0.82);
  }

  // Bytes on disk are now always JPEG, regardless of the original upload's
  // format -- swap the extension so the filename matches what's actually
  // there (a .png that's secretly JPEG bytes would confuse anything that
  // sniffs the extension, e.g. static-file content-type headers).
  const dir = dirname(filePath);
  const newPath = join(dir, `${basename(filePath, extname(filePath))}.jpg`);
  await fsp.writeFile(newPath, best!);
  if (newPath !== filePath) {
    await fsp.unlink(filePath).catch(() => undefined);
  }
  return newPath;
}
