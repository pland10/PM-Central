import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInspectionsDb, INSPECTION_PHOTOS_BUCKET } from "@/lib/inspections/supabase";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";

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
    return NextResponse.json(
      {
        id: row.id,
        inspection_id: row.inspection_id,
        filename: row.filename,
        original_name: row.original_name,
        url: row.url,
      },
      { status: 201 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Insert failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isFeatureEnabled("inspections")) {
    return NextResponse.json({ error: "Inspections is disabled." }, { status: 404 });
  }
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const inspectionId = Number((await params).id);
  const photoId = Number(req.nextUrl.searchParams.get("photoId"));
  if (!Number.isFinite(inspectionId) || !Number.isFinite(photoId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const row = await prisma.inspectPhoto.findFirst({
    where: { id: photoId, inspection_id: inspectionId },
    select: { id: true, filename: true },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Remove the file from Supabase Storage (best-effort), then the DB row.
  const db = getInspectionsDb();
  if (db && row.filename) {
    await db.storage
      .from(INSPECTION_PHOTOS_BUCKET)
      .remove([`${inspectionId}/${row.filename}`]);
  }

  try {
    await prisma.inspectPhoto.delete({ where: { id: photoId } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
