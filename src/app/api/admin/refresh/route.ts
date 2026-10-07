import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { getDataSource } from "@/config/data-sources";

// Admin-only: trigger an off-cycle refresh by dispatching the data source's
// GitHub Actions workflow. Needs GITHUB_DISPATCH_TOKEN (a fine-grained token
// with Actions: write on the target repos).
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
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

  const { owner, repo, workflow, ref } = source.dispatch;
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref }),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Dispatch request failed." },
      { status: 502 }
    );
  }

  if (res.status === 204) return NextResponse.json({ ok: true });

  const text = await res.text().catch(() => "");
  return NextResponse.json(
    { error: `GitHub dispatch failed (HTTP ${res.status}). ${text.slice(0, 300)}` },
    { status: 502 }
  );
}
