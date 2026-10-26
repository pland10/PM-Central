import { NextRequest, NextResponse } from "next/server";
import { normalizeRange, paymentSummaryAsOf } from "@/lib/payments-dashboard";

// Payments summary "as of" a date, for the dashboard pane's date stepper.
// Behind the app's auth (middleware). Returns pending-as-of + cleared-on-date
// figures plus the in-flight list. ?days=7 widens cleared/returns to the 7 days
// ending on asOf.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const asOf = req.nextUrl.searchParams.get("asOf") || undefined;
  const data = await paymentSummaryAsOf(asOf, normalizeRange(req.nextUrl.searchParams.get("days")));
  if (!data) {
    return NextResponse.json({ error: "Payments data is not available." }, { status: 503 });
  }
  return NextResponse.json(data);
}
