import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminUser } from "@/lib/admin-gate";
import { getInspectionsDb, INSPECTION_PHOTOS_BUCKET } from "@/lib/inspections/supabase";
import { shrinkPhoto, SHRINK_OVER_BYTES } from "@/lib/photo-shrink";

// One-time cleanup (admin): shrink inspection photos already in Supabase
// Storage, in place — same path, so every saved URL keeps working. Works in
// small batches by photo id; the Data page button calls it with `after` = the
// last `next` until `next` is null. Safe to re-run: already-small photos are
// skipped.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 12;

export async function POST(req: NextRequest) {
  const gate = await requireAdminUser();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const db = getInspectionsDb();
  if (!db) return NextResponse.json({ error: "Photo storage not configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { after?: unknown };
  const after = Number(body.after) || 0;
  const rows = await prisma.inspectPhoto.findMany({
    where: { id: { gt: after } },
    orderBy: { id: "asc" },
    take: BATCH,
    select: { id: true, inspection_id: true, filename: true },
  });
  if (rows.length === 0) return NextResponse.json({ checked: 0, shrunk: 0, savedBytes: 0, next: null, remaining: 0 });

  const bucket = db.storage.from(INSPECTION_PHOTOS_BUCKET);
  let shrunk = 0;
  let savedBytes = 0;
  for (const r of rows) {
    if (!r.filename) continue;
    const path = `${r.inspection_id}/${r.filename}`;
    try {
      const { data, error } = await bucket.download(path);
      if (error || !data || data.size <= SHRINK_OVER_BYTES) continue;
      const out = await shrinkPhoto(Buffer.from(await data.arrayBuffer()), data.type || "image/jpeg");
      if (!out.shrunk) continue;
      const up = await bucket.upload(path, out.buffer, { contentType: out.contentType, upsert: true });
      if (up.error) continue;
      shrunk++;
      savedBytes += data.size - out.buffer.length;
    } catch {
      // leave this photo as it is; carry on with the rest
    }
  }

  const last = rows[rows.length - 1].id;
  const remaining = await prisma.inspectPhoto.count({ where: { id: { gt: last } } });
  return NextResponse.json({ checked: rows.length, shrunk, savedBytes, next: remaining > 0 ? last : null, remaining });
}
