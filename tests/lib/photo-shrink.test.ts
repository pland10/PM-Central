import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { shrinkPhoto, MAX_EDGE, SHRINK_OVER_BYTES } from "@/lib/photo-shrink";

// A "phone photo": 4000x3000, noisy so it doesn't compress to nothing.
async function bigPhoto(): Promise<Buffer> {
  return sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#888", noise: { type: "gaussian", mean: 128, sigma: 40 } } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

describe("shrinkPhoto", () => {
  it("resizes a large photo to fit 1600px and re-encodes it as a much smaller JPEG", async () => {
    const original = await bigPhoto();
    expect(original.length).toBeGreaterThan(SHRINK_OVER_BYTES);

    const out = await shrinkPhoto(original, "image/jpeg");
    expect(out.shrunk).toBe(true);
    expect(out.contentType).toBe("image/jpeg");
    expect(out.buffer.length).toBeLessThan(original.length / 3);
    const meta = await sharp(out.buffer).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(MAX_EDGE);
    expect(meta.format).toBe("jpeg");
  }, 20000);

  it("leaves small photos, GIFs and unreadable files as they are", async () => {
    const small = await sharp({ create: { width: 200, height: 100, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    expect(await shrinkPhoto(small, "image/jpeg")).toMatchObject({ shrunk: false, contentType: "image/jpeg" });

    const big = await bigPhoto();
    expect((await shrinkPhoto(big, "image/gif")).shrunk).toBe(false);

    const junk = Buffer.alloc(SHRINK_OVER_BYTES + 10, 7);
    const res = await shrinkPhoto(junk, "image/heic");
    expect(res).toMatchObject({ shrunk: false, contentType: "image/heic" });
    expect(res.buffer).toBe(junk);
  }, 20000);
});
