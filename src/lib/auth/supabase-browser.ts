"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client for authentication (login page, sign-out).
// Uses the PUBLIC anon/publishable key — this runs in the user's browser, so it
// must NEVER be the service_role/secret key. Points at the identity-hub project
// (the one that holds the inspector accounts).
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createBrowserClient(url, anonKey);
}
