import { NextResponse } from "next/server";
import { getCurrentUser, type AppUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";

// Shared gate for the Invoicing APIs: the feature must be on and the caller
// signed in. Returns the user, or the response to send back.
export async function invoicingUser(): Promise<{ user: AppUser } | { res: NextResponse }> {
  if (!isFeatureEnabled("invoicing")) return { res: NextResponse.json({ error: "Invoicing is disabled." }, { status: 404 }) };
  const user = await getCurrentUser();
  if (!user) return { res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { user };
}
