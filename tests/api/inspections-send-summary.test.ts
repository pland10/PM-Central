import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { inspectVisit: { update: vi.fn() } } }));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/config/features", () => ({ isFeatureEnabled: vi.fn() }));
vi.mock("@/lib/inspections/db", () => ({ getInspectionDetail: vi.fn(), saveSummaryDraft: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), isEmailConfigured: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";
import { getInspectionDetail, saveSummaryDraft } from "@/lib/inspections/db";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { POST } from "@/app/api/inspections/[id]/send-summary/route";
import { inspection, property } from "../lib/inspections/fixtures";

const photo = (id: number, over = {}) => ({
  id,
  inspection_id: 1,
  filename: `f${id}.jpg`,
  original_name: `Photo ${id}.jpg`,
  url: `https://storage.example.com/p${id}.jpg`,
  ...over,
});

const send = (body: unknown) =>
  POST(new NextRequest("https://pmilighthouse.app/api/inspections/1/send-summary", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "1" }),
  });

// Photo storage: each URL answers with `bytes` of data, or fails.
function stubPhotos(sizes: Record<string, number | "fail">) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const size = sizes[url];
      if (size === undefined || size === "fail") return { ok: false, status: 404 };
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "image/jpeg" }),
        arrayBuffer: async () => new ArrayBuffer(size),
      };
    })
  );
}

const sentEmail = () => vi.mocked(sendEmail).mock.calls[0][0];

beforeEach(() => {
  vi.mocked(isFeatureEnabled).mockReturnValue(true);
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" } as never);
  vi.mocked(isEmailConfigured).mockReturnValue(true);
  vi.mocked(sendEmail).mockResolvedValue({ ok: true, id: "email-1" });
  vi.mocked(prisma.inspectVisit.update).mockResolvedValue({} as never);
  vi.mocked(getInspectionDetail).mockResolvedValue({
    inspection: inspection(),
    property,
    checklist: [],
    workItems: [],
    photos: [photo(1), photo(2), photo(3, { url: null })],
  } as never);
  stubPhotos({ "https://storage.example.com/p1.jpg": 100, "https://storage.example.com/p2.jpg": 200 });
});

describe("POST /api/inspections/[id]/send-summary", () => {
  it("requires a signed-in user and configured email", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    expect((await send({})).status).toBe(401);

    vi.mocked(isEmailConfigured).mockReturnValueOnce(false);
    expect((await send({})).status).toBe(503);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing inspection", async () => {
    vi.mocked(getInspectionDetail).mockResolvedValue(null);
    expect((await send({})).status).toBe(404);
  });

  it("emails the summary with only the selected photos to the inspections inbox", async () => {
    const res = await send({ photoIds: [2, "3", "x"], ownerMessage: "See attached." });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, to: "info@pmilighthouse.com", attached: 1 });
    const email = sentEmail();
    expect(email.to).toBe("info@pmilighthouse.com");
    expect(email.subject).toBe("Inspection — 66 Francis Court — Oct 20, 2026");
    expect(email.html).toContain("See attached.");
    expect(email.attachments).toHaveLength(1);
    expect(email.attachments![0]).toMatchObject({ filename: "Photo 2.jpg", contentType: "image/jpeg" });
  });

  it("sends to INSPECTION_SUMMARY_TO when set", async () => {
    vi.stubEnv("INSPECTION_SUMMARY_TO", "owners@example.com");
    await send({});
    expect(sentEmail().to).toBe("owners@example.com");
  });

  it("skips photos that fail to download", async () => {
    stubPhotos({ "https://storage.example.com/p1.jpg": "fail", "https://storage.example.com/p2.jpg": 200 });
    const body = await (await send({ photoIds: [1, 2] })).json();
    expect(body.attached).toBe(1);
  });

  it("keeps attachments under the 20 MB cap", async () => {
    const mb = 1024 * 1024;
    stubPhotos({ "https://storage.example.com/p1.jpg": 15 * mb, "https://storage.example.com/p2.jpg": 15 * mb });
    const body = await (await send({ photoIds: [1, 2] })).json();
    expect(body.attached).toBe(1);
  });

  it("stamps summary_sent_at and remembers the draft after sending", async () => {
    await send({ photoIds: [1], ownerMessage: "Hi" });

    expect(prisma.inspectVisit.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { summary_sent_at: expect.any(Date) },
    });
    expect(saveSummaryDraft).toHaveBeenCalledWith(1, "Hi", [1]);
  });

  it("does not stamp the inspection when the email fails", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ ok: false, status: 403, error: "domain not verified" });

    const res = await send({});

    expect(res.status).toBe(403);
    expect(prisma.inspectVisit.update).not.toHaveBeenCalled();
  });

  it("still succeeds if stamping fails after the email went out", async () => {
    vi.mocked(prisma.inspectVisit.update).mockRejectedValue(new Error("db blip"));
    expect((await send({})).status).toBe(200);
  });
});
