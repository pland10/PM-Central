import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client for the synced LeadSimple data (the `activities`
// table that powers Search). Configured via env; returns null when not set so
// callers can degrade gracefully instead of crashing. Keys stay server-side —
// never import this from a client component.
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

export function getSupabase() {
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
