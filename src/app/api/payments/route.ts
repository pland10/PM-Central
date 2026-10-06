import { NextRequest, NextResponse } from "next/server";
import { paymentSummaryAsOf } from "@/lib/payments-dashboard";

// Payments summary "as of" a date, for the dashboard pane's date stepper.
// Behind the app's auth (middleware). Returns pending-as-of + cleared-on-date
// figures plus the in-flight list.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const asOf = req.nextUrl.searchParams.get("asOf") || undefined;
  const data = await paymentSummaryAsOf(asOf);
  if (!data) {
    return NextResponse.json({ error: "Payments data is not available." }, { status: 503 });
  }
  return NextResponse.json(data);
}
