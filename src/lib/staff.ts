import { getInspectionsDb } from "@/lib/inspections/supabase";
import type { StaffMember } from "@/lib/work-order-notes";
import { accountingAllowedEmails } from "@/lib/accounting-access";
import { isAccountingStaff } from "@/lib/transaction-notes";

// Everyone who logs into PM-Central (the Supabase Auth users), as name + email.
// The only people a work-order note can be emailed to. Empty if Supabase isn't
// configured (e.g. basic-auth dev).
export async function listStaff(): Promise<StaffMember[]> {
  const db = getInspectionsDb();
  if (!db) return [];
  const res = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (res.error) return [];
  return (res.data?.users ?? [])
    .filter((u) => u.email)
    .map((u) => {
      const m = (u.user_metadata ?? {}) as Record<string, unknown>;
      const name = (typeof m.full_name === "string" && m.full_name) || (typeof m.name === "string" && m.name) || u.email!;
      return { name, email: u.email! };
    })
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

// The people with Accounting access (admins + ACCOUNTING_ALLOWED_EMAILS) — the
// only ones a transaction note can be emailed to, since it carries card details.
export async function listAccountingStaff(): Promise<StaffMember[]> {
  const db = getInspectionsDb();
  if (!db) return [];
  const res = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (res.error) return [];
  const allowed = accountingAllowedEmails();
  const users = (res.data?.users ?? []).filter(
    (u) => u.email && isAccountingStaff((u.app_metadata ?? {}) as Record<string, unknown>, u.email, allowed)
  );
  const emails = new Set(users.map((u) => u.email!.toLowerCase()));
  return (await listStaff()).filter((s) => emails.has(s.email.toLowerCase()));
}
