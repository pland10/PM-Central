import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { getReminderTemplate } from "@/lib/reminders-db";
import { ReminderTemplateEditor } from "./ReminderTemplateEditor";

// Admin → Rent reminder email: the template sent from the Delinquencies panel.
export const dynamic = "force-dynamic";

export default async function ReminderTemplatePage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") notFound();
  const template = await getReminderTemplate();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Rent reminder email</h1>
        <p className="mt-1 text-sm text-slate-500">
          The email sent to delinquent tenants from the dashboard&apos;s Delinquencies panel. It goes out under the
          name of whoever sends it, with replies routed back to them. Use <code>{"{tenant}"}</code>,{" "}
          <code>{"{property}"}</code> and <code>{"{balance}"}</code> to fill in each tenant&apos;s details.
        </p>
      </div>
      <ReminderTemplateEditor initial={template} />
    </div>
  );
}
