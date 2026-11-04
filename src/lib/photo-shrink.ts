import sharp from "sharp";

// Shrink inspection photos before they're stored (Supabase Storage is billed by
// size, and phone photos are 3–5 MB). Fit inside 1600px, honour the camera's
// rotation, re-encode as JPEG q80 — ~200–500 KB, plenty for an inspection
// report. Anything we can't read (e.g. HEIC without a decoder) or animated GIFs
// are stored as-is; shrinking is never allowed to lose a photo.
export const MAX_EDGE = 1600;
export const JPEG_QUALITY = 80;
export const SHRINK_OVER_BYTES = 500_000;

export type ShrinkResult = { buffer: Buffer; contentType: string; shrunk: boolean };

export async function shrinkPhoto(buffer: Buffer, contentType: string): Promise<ShrinkResult> {
  const unchanged = { buffer, contentType, shrunk: false };
  if (buffer.length <= SHRINK_OVER_BYTES || /gif/i.test(contentType)) return unchanged;
  try {
    const out = await sharp(buffer)
      .rotate() // apply EXIF orientation before the metadata is dropped
      .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    // Only keep it if it's a real saving.
    if (out.length >= buffer.length * 0.9) return unchanged;
    return { buffer: out, contentType: "image/jpeg", shrunk: true };
  } catch {
    return unchanged;
  }
}
