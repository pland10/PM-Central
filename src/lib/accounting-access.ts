import type { AppUser } from "@/lib/auth/supabase-server";

// Who may see the Accounting module. The `accounting` feature flag turns the
// module on per environment; this is the finer, per-user gate on top of it so
// financial data (cash, reimbursables, card transactions) isn't visible to
// every logged-in user.
//
// Allowed:
//   - Admins (role resolved from Supabase app_metadata — can't be spoofed).
//   - Anyone whose email is in ACCOUNTING_ALLOWED_EMAILS (comma-separated),
//     for naming specific non-admin people (e.g. a bookkeeper).
//   - The Basic-Auth operator (no Supabase user) — a single shared admin login,
//     consistent with the rest of the app.

export function accountingAllowedEmails(): string[] {
  return (process.env.ACCOUNTING_ALLOWED_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function canAccessAccounting(user: AppUser | null): boolean {
  // Basic-Auth mode: no Supabase user, the single operator is the admin.
  if (!user) return true;
  if (user.role === "admin") return true;
  const email = (user.email || "").toLowerCase();
  return !!email && accountingAllowedEmails().includes(email);
}

// Who may approve an owner draw (Accounting → Owner Draws). The coordinator
// prepares the month; the owner of the business approves every payment.
// OWNER_DRAW_APPROVER_EMAILS (comma-separated) names the approvers; until it's
// set, admins approve. The Basic-Auth operator always can.
export function canApproveOwnerDraws(user: AppUser | null): boolean {
  if (!user) return true;
  const approvers = (process.env.OWNER_DRAW_APPROVER_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (approvers.length) return approvers.includes((user.email || "").toLowerCase());
  return user.role === "admin";
}
