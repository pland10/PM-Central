import { NextRequest, NextResponse } from "next/server";
import { getInspectionsDb, INSPECTION_PHOTOS_BUCKET } from "@/lib/inspections/supabase";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";

// Upload a photo to the inspection-photos bucket and record it, or delete one.
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
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

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

  const ins = await db
    .from("pmi_inspect_photos")
    .insert({
      inspection_id: inspectionId,
      filename,
      original_name: file.name,
      url: pub.publicUrl,
    })
    .select("*")
    .single();
  if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 502 });

  return NextResponse.json(ins.data, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isFeatureEnabled("inspections")) {
    return NextResponse.json({ error: "Inspections is disabled." }, { status: 404 });
  }
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getInspectionsDb();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const inspectionId = Number((await params).id);
  const photoId = Number(req.nextUrl.searchParams.get("photoId"));
  if (!Number.isFinite(inspectionId) || !Number.isFinite(photoId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const row = await db
    .from("pmi_inspect_photos")
    .select("id,filename")
    .eq("id", photoId)
    .eq("inspection_id", inspectionId)
    .maybeSingle();
  if (row.data?.filename) {
    await db.storage
      .from(INSPECTION_PHOTOS_BUCKET)
      .remove([`${inspectionId}/${row.data.filename}`]);
  }
  const del = await db.from("pmi_inspect_photos").delete().eq("id", photoId);
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 502 });

  return NextResponse.json({ ok: true });
}
