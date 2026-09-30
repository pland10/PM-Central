import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client for the live Invoicing project (a SEPARATE
// Supabase project from Search). PM-Central reads invoices here for the native
// read-only Invoicing views — the standalone invoicing app remains the only
// writer.
//
// Why the service_role key (and NOT the public anon key): the invoicing
// project locks its `invoices` table to signed-in users
// (`... for select to authenticated`), on purpose — its anon key ships inside
// the public invoicing client, so an anon-readable policy would expose every
// invoice to anyone. PM-Central instead reads server-side with the service_role
// key, which stays on the server (behind Basic Auth) and never reaches the
// browser. We only ever SELECT with it.
//
// NEVER import this from a client component, and never expose the key via a
// NEXT_PUBLIC_* var.
const url = process.env.INVOICING_SUPABASE_URL;
const key = process.env.INVOICING_SUPABASE_SERVICE_KEY;

export function getInvoicingSupabase() {
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function isInvoicingConfigured(): boolean {
  return Boolean(url && key);
}
