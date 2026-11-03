import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { normalizeTemplate } from "@/lib/reminders";
import { getReminderTemplate, saveReminderTemplate } from "@/lib/reminders-db";

// The editable rent-reminder email.
//   GET → { subject, body }           (any signed-in user)
//   PUT { subject, body }             (admin only)
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ template: await getReminderTemplate() });
  } catch (e) {
    console.error("[reminders] template load failed:", e);
    return NextResponse.json({ error: "Could not load the template." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const template = normalizeTemplate({ subject: b?.subject, body: b?.body });
  try {
    await saveReminderTemplate(template, user.email ?? "");
    return NextResponse.json({ template });
  } catch (e) {
    console.error("[reminders] template save failed:", e);
    return NextResponse.json({ error: "Could not save the template." }, { status: 500 });
  }
}
