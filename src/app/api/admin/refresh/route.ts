import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { getDataSource } from "@/config/data-sources";
import { dispatchSource, hasDispatchToken } from "@/lib/dispatch";

// Admin-only: trigger an off-cycle refresh by dispatching the data source's
// GitHub Actions workflow. Needs GITHUB_DISPATCH_TOKEN (a fine-grained token
// with Actions: write on the target repos). The scheduled refreshes use the
// same dispatch helper via /api/cron/sync.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (!hasDispatchToken()) {
    return NextResponse.json(
      { error: "Refresh isn't configured — set GITHUB_DISPATCH_TOKEN." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const source = getDataSource(String(body?.source ?? ""));
  if (!source) return NextResponse.json({ error: "Unknown data source." }, { status: 400 });
  if (source.comingSoon) {
    return NextResponse.json({ error: "This source isn't wired up yet." }, { status: 400 });
  }

  const result = await dispatchSource(source);
  if (result.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: result.error }, { status: result.status });
}
