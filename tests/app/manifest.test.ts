import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

// Chrome's "Install app" uses the manifest's icons; a missing file or a wrong
// size means a blank icon (what we had before).
function pngSize(publicPath: string): string {
  const buf = readFileSync(join(__dirname, "..", "..", "public", publicPath));
  expect(buf.subarray(1, 4).toString()).toBe("PNG");
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
}

describe("web app manifest", () => {
  const m = manifest();

  it("names the app and opens it standalone at the dashboard", () => {
    expect(m.name).toMatch(/^PMI Lighthouse/);
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
  });

  it("lists 192 and 512 icons plus a maskable one, each a real PNG of the stated size", () => {
    const icons = m.icons ?? [];
    for (const icon of icons) expect(pngSize(icon.src)).toBe(icon.sizes);
    const sizes = icons.map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("ships a favicon and an Apple touch icon", () => {
    const ico = readFileSync(join(__dirname, "..", "..", "public", "favicon.ico"));
    expect(ico.readUInt16LE(2)).toBe(1); // ICO type
    expect(pngSize("apple-touch-icon.png")).toBe("180x180");
  });
});
