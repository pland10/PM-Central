import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { inspectPhoto: { findMany: vi.fn(), count: vi.fn() } } }));
vi.mock("@/lib/admin-gate", () => ({ requireAdminUser: vi.fn() }));
vi.mock("@/lib/photo-shrink", () => ({ SHRINK_OVER_BYTES: 500_000, shrinkPhoto: vi.fn() }));
const download = vi.fn();
const upload = vi.fn();
vi.mock("@/lib/inspections/supabase", () => ({
  INSPECTION_PHOTOS_BUCKET: "inspection-photos",
  getInspectionsDb: () => ({ storage: { from: () => ({ download, upload }) } }),
}));

import { prisma } from "@/lib/prisma";
import { requireAdminUser } from "@/lib/admin-gate";
import { shrinkPhoto } from "@/lib/photo-shrink";
import { POST } from "@/app/api/admin/shrink-photos/route";

const post = (body: unknown) =>
  POST(new NextRequest("https://pmilighthouse.app/api/admin/shrink-photos", { method: "POST", body: JSON.stringify(body) }));
const blob = (n: number, type = "image/jpeg") => new Blob([new Uint8Array(n)], { type });

beforeEach(() => {
  vi.mocked(requireAdminUser).mockResolvedValue({ user: { id: "u", role: "admin" } } as never);
  vi.mocked(prisma.inspectPhoto.findMany).mockResolvedValue([
    { id: 5, inspection_id: 40, filename: "a.jpg" },
    { id: 6, inspection_id: 40, filename: "b.png" },
    { id: 7, inspection_id: 41, filename: null },
  ] as never);
  vi.mocked(prisma.inspectPhoto.count).mockResolvedValue(30);
  download.mockImplementation(async (path: string) => ({ data: path.endsWith("a.jpg") ? blob(4_000_000) : blob(200_000, "image/png"), error: null }));
  upload.mockResolvedValue({ error: null });
  vi.mocked(shrinkPhoto).mockResolvedValue({ buffer: Buffer.alloc(300_000), contentType: "image/jpeg", shrunk: true });
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/admin/shrink-photos", () => {
  it("is admin-only", async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ error: "Admins only", status: 403 } as never);
    expect((await post({})).status).toBe(403);
  });

  it("shrinks big stored photos in place (same path), skipping small ones, and returns the next cursor", async () => {
    const res = await post({ after: 4 });
    expect(prisma.inspectPhoto.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { gt: 4 } }, orderBy: { id: "asc" } }));
    expect(download).toHaveBeenCalledTimes(2); // the row without a filename is skipped
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith("40/a.jpg", expect.any(Buffer), { contentType: "image/jpeg", upsert: true });
    expect(await res.json()).toEqual({ checked: 3, shrunk: 1, savedBytes: 3_700_000, next: 7, remaining: 30 });
  });

  it("says it's done when there's nothing left", async () => {
    vi.mocked(prisma.inspectPhoto.findMany).mockResolvedValue([] as never);
    expect(await (await post({ after: 99 })).json()).toEqual({ checked: 0, shrunk: 0, savedBytes: 0, next: null, remaining: 0 });
  });
});
