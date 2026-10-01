import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client for the Inspections data (the pmi_inspect_* tables
// and the inspection-photos storage bucket). This is the SAME Supabase project
// that holds the user accounts (the identity hub), so it reuses
// NEXT_PUBLIC_SUPABASE_URL, plus a secret (service) key kept server-side.
//
// We use the secret key — exactly like the original Flask inspection app — so
// reads/writes work regardless of the tables' RLS; per-user identity and
// permissions come from the logged-in session (getCurrentUser) instead. NEVER
// import this from a client component, and never expose SUPABASE_SERVICE_KEY to
// the browser.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

export function getInspectionsDb() {
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export function isInspectionsConfigured(): boolean {
  return Boolean(url && serviceKey);
}

export const INSPECTION_PHOTOS_BUCKET = "inspection-photos";
