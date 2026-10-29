import { NextResponse } from "next/server";
import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting } from "@/lib/accounting-access";
import { isPlaidConfigured, plaidPost } from "@/lib/plaid";

// Creates a Plaid Link token for the Connect flow on the Transactions tab. The
// browser exchanges this for a one-time public_token via Plaid Link, then POSTs
// that to /api/plaid/exchange. Gated by the accounting feature + Plaid config;
// the app's middleware already requires auth.
export const dynamic = "force-dynamic";

export async function POST() {
  if (!isFeatureEnabled("accounting")) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!canAccessAccounting(await getCurrentUser())) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!isPlaidConfigured()) {
    return NextResponse.json({ error: "Plaid isn't configured for this environment." }, { status: 503 });
  }
  try {
    const data = await plaidPost<{ link_token: string }>("/link/token/create", {
      user: { client_user_id: process.env.PLAID_LINK_USER_ID || "pmi-lighthouse" },
      client_name: "PM-Central",
      products: ["transactions"],
      country_codes: ["US"],
      language: "en",
    });
    return NextResponse.json({ link_token: data.link_token });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Plaid request failed." },
      { status: 502 }
    );
  }
}
