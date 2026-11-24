import { NextRequest, NextResponse } from "next/server";
import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting, canApproveOwnerDraws } from "@/lib/accounting-access";
import { drawFigures, isMonthKey, monthKeyET, type DrawSnapshot } from "@/lib/owner-draws";
import { getDrawRecord, setDrawNote, setDrawOverride, setDrawStatus, type DrawField } from "@/lib/owner-draws-db";
import { loadOwnerDrawData } from "@/lib/owner-draws-rentvine";

// Accounting → Owner Draws: save one change to one owner's row for a month.
//   { month, portfolioId, action, field?, value?, expectDue? }
//   set        field balance|reserve|unpaid, value number (or null = back to Rentvine)
//   note       value text
//   approve    approvers only; freezes today's Rentvine figures. expectDue is the
//              amount on the approver's screen — refused if Rentvine has moved.
//   unapprove  approvers only
//   paid / unpaid
// Returns the saved record.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FIELDS: DrawField[] = ["balance", "reserve", "unpaid"];
const MAX_AMOUNT = 10_000_000;
const MAX_NOTE = 4000;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  if (!isFeatureEnabled("accounting")) return bad("Not found.", 404);
  const user = await getCurrentUser();
  if (!canAccessAccounting(user)) return bad("Not found.", 404);
  const by = user ? user.name || user.email || "user" : "admin";

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { month, action } = body;
  const portfolioId = typeof body.portfolioId === "string" ? body.portfolioId.trim() : "";
  if (!isMonthKey(month)) return bad("Pick a month.");
  if (!portfolioId || portfolioId.length > 40) return bad("Missing portfolio.");

  const current = await getDrawRecord(month, portfolioId);

  // Rentvine's figures for this portfolio right now, to freeze on approve/paid.
  async function liveSnapshot(): Promise<DrawSnapshot | NextResponse> {
    if (month !== monthKeyET()) return bad("Rentvine only has today's numbers — open the current month.", 409);
    const data = await loadOwnerDrawData(portfolioId);
    if (!data.ok) return bad(data.error, 502);
    const p = data.portfolios.find((x) => x.portfolioId === portfolioId);
    if (!p) return bad("That portfolio isn't in Rentvine.", 404);
    const { portfolioId: _id, ...rest } = p;
    void _id;
    return { ...rest, bills: data.bills.get(portfolioId) ?? [] };
  }

  switch (action) {
    case "set": {
      const field = body.field as DrawField;
      if (!FIELDS.includes(field)) return bad("Unknown field.");
      const value = body.value;
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > MAX_AMOUNT)) {
        return bad("Enter an amount.");
      }
      if (current?.paidAt) return bad("This draw is marked paid — untick Paid before changing the numbers.", 409);
      await setDrawOverride(month, portfolioId, field, value === null ? null : Math.round(value * 100) / 100, by);
      break;
    }
    case "note": {
      if (typeof body.value !== "string") return bad("Missing note.");
      await setDrawNote(month, portfolioId, body.value.trim().slice(0, MAX_NOTE), by);
      break;
    }
    case "approve":
    case "paid": {
      if (action === "approve" && !canApproveOwnerDraws(user)) return bad("Only the approver can approve draws.", 403);
      let snapshot: DrawSnapshot | null = null;
      if (!current?.snapshot) {
        const snap = await liveSnapshot();
        if (snap instanceof NextResponse) return snap;
        snapshot = snap;
      }
      if (action === "approve" && typeof body.expectDue === "number") {
        const base = snapshot ?? current!.snapshot!;
        const due = drawFigures(base, {
          balance: current?.balanceOverride,
          reserve: current?.reserveOverride,
          unpaid: current?.unpaidOverride,
        }).due;
        if (Math.abs(due - body.expectDue) >= 0.005) {
          return bad("Rentvine's numbers changed since you opened the page — refresh and check before approving.", 409);
        }
      }
      await setDrawStatus(month, portfolioId, action === "approve" ? "approved" : "paid", true, by, snapshot);
      break;
    }
    case "unapprove":
    case "unpaid": {
      if (action === "unapprove" && !canApproveOwnerDraws(user)) return bad("Only the approver can undo an approval.", 403);
      await setDrawStatus(month, portfolioId, action === "unapprove" ? "approved" : "paid", false, by, null);
      break;
    }
    default:
      return bad("Unknown action.");
  }

  return NextResponse.json({ record: await getDrawRecord(month, portfolioId) });
}
