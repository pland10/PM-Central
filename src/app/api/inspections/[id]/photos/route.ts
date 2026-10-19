import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInspectionsDb, INSPECTION_PHOTOS_BUCKET } from "@/lib/inspections/supabase";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";
import { setPhotoLabel } from "@/lib/inspections/db";

// Upload a photo to the inspection-photos bucket (Supabase Storage) and record
// it in the single DB (Prisma), or delete one. The row lives in Postgres; the
// file itself stays in Supabase Storage.
export const dynamic = "force-dynamic";

const ALLOWED = [".jpg", ".jpeg", ".png", ".gif", ".heic", ".heif", ".webp", ".bmp"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isFeatureEnabled("inspections")) {
    return NextResponse.json({ error: "Inspections is disabled." }, { status: 404 });
  }
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getInspectionsDb();
  if (!db) return NextResponse.json({ error: "Photo storage not configured" }, { status: 503 });

  const inspectionId = Number((await params).id);
  if (!Number.isFinite(inspectionId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  const labelRaw = form?.get("label");
  const label = typeof labelRaw === "string" && labelRaw.trim() ? labelRaw.trim() : null;

  const dot = file.name.lastIndexOf(".");
  let ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : ".jpg";
  if (!ALLOWED.includes(ext)) ext = ".jpg";

  const filename = `${crypto.randomUUID()}${ext}`;
  const path = `${inspectionId}/${filename}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const up = await db.storage
    .from(INSPECTION_PHOTOS_BUCKET)
    .upload(path, buffer, { contentType: file.type || "image/jpeg" });
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 502 });

  const { data: pub } = db.storage.from(INSPECTION_PHOTOS_BUCKET).getPublicUrl(path);

  try {
    const row = await prisma.inspectPhoto.create({
      data: {
        inspection_id: inspectionId,
        filename,
        original_name: file.name,
        url: pub.publicUrl,
      },
    });
    if (label) await setPhotoLabel(row.id, label);
    return NextResponse.json(
      {
        id: row.id,
        inspection_id: row.inspection_id,
        filename: row.filename,
        original_name: row.original_name,
        url: row.url,
        label,
      },
      { status: 201 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Insert failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// Delete one or more of an inspection's photos. Only the inspection's owner
// (its creator) or an admin may delete. Accepts a single ?photoId=<n> or a
// multiselect ?photoIds=<n,n,n>.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isFeatureEnabled("inspections")) {
    return NextResponse.json({ error: "Inspections is disabled." }, { status: 404 });
  }
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const inspectionId = Number((await params).id);
  if (!Number.isFinite(inspectionId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  // Permission: admins, or the user who created this inspection ("owner").
  const insp = await prisma.inspectVisit.findUnique({
    where: { id: inspectionId },
    select: { created_by_user_id: true },
  });
  if (!insp) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isOwner = !!insp.created_by_user_id && insp.created_by_user_id === me.id;
  if (me.role !== "admin" && !isOwner) {
    return NextResponse.json(
      { error: "Only the inspection owner or an admin can delete photos." },
      { status: 403 }
    );
  }

  // Gather requested photo ids from ?photoId= and/or ?photoIds=1,2,3.
  const ids = new Set<number>();
  const single = Number(req.nextUrl.searchParams.get("photoId"));
  if (Number.isFinite(single)) ids.add(single);
  for (const part of (req.nextUrl.searchParams.get("photoIds") || "").split(",")) {
    const n = Number(part.trim());
    if (part.trim() !== "" && Number.isFinite(n)) ids.add(n);
  }
  if (ids.size === 0) {
    return NextResponse.json({ error: "No photo ids provided" }, { status: 400 });
  }

  // Only photos that actually belong to this inspection.
  const rows = await prisma.inspectPhoto.findMany({
    where: { id: { in: [...ids] }, inspection_id: inspectionId },
    select: { id: true, filename: true },
  });
  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Remove the files from Supabase Storage (best-effort), then the DB rows.
  const db = getInspectionsDb();
  if (db) {
    const paths = rows
      .filter((r) => r.filename)
      .map((r) => `${inspectionId}/${r.filename}`);
    if (paths.length) {
      await db.storage.from(INSPECTION_PHOTOS_BUCKET).remove(paths);
    }
  }

  try {
    await prisma.inspectPhoto.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
  return NextResponse.json({ ok: true, deleted: rows.length });
}
