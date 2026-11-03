// Browser-side photo shrinking, before upload: phone photos are 3–5 MB, which
// is slow on a phone connection, can exceed Vercel's ~4.5 MB request limit, and
// fills Supabase Storage. Fit inside 1600px, re-encode JPEG q0.8. If the
// browser can't decode the file (e.g. some HEIC) or it wouldn't get smaller,
// the original is sent and the server shrinks it instead (src/lib/photo-shrink).
const MAX_EDGE = 1600;
const QUALITY = 0.8;
const SHRINK_OVER_BYTES = 500_000;

type Encode = (file: File, maxEdge: number, quality: number) => Promise<Blob | null>;

async function canvasEncode(file: File, maxEdge: number, quality: number): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function shrinkForUpload(file: File, encode: Encode = canvasEncode): Promise<File> {
  if (!file.type.startsWith("image/") || /gif/i.test(file.type) || file.size <= SHRINK_OVER_BYTES) return file;
  try {
    const blob = await encode(file, MAX_EDGE, QUALITY);
    if (!blob || blob.size >= file.size * 0.9) return file;
    const name = file.name.replace(/\.[^.]*$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
