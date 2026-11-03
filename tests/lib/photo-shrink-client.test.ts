import { describe, expect, it, vi } from "vitest";
import { shrinkForUpload } from "@/lib/photo-shrink-client";

const file = (size: number, type = "image/jpeg", name = "IMG_1234.JPG") => new File([new Uint8Array(size)], name, { type });

describe("shrinkForUpload", () => {
  it("re-encodes a big photo to a smaller JPEG named .jpg", async () => {
    const encode = vi.fn(async () => new Blob([new Uint8Array(300_000)], { type: "image/jpeg" }));
    const out = await shrinkForUpload(file(4_000_000, "image/png", "kitchen.png"), encode);
    expect(encode).toHaveBeenCalledWith(expect.any(File), 1600, 0.8);
    expect(out.name).toBe("kitchen.jpg");
    expect(out.type).toBe("image/jpeg");
    expect(out.size).toBe(300_000);
  });

  it("sends small photos, GIFs and non-images unchanged", async () => {
    const encode = vi.fn();
    for (const f of [file(200_000), file(4_000_000, "image/gif"), file(4_000_000, "application/pdf", "a.pdf")]) {
      expect(await shrinkForUpload(f, encode)).toBe(f);
    }
    expect(encode).not.toHaveBeenCalled();
  });

  it("falls back to the original if the browser can't decode it or it wouldn't get smaller", async () => {
    const f = file(4_000_000, "image/heic", "IMG.HEIC");
    expect(await shrinkForUpload(f, async () => { throw new Error("no decoder"); })).toBe(f);
    expect(await shrinkForUpload(f, async () => new Blob([new Uint8Array(3_900_000)]))).toBe(f);
  });
});
