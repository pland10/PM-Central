import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server-side Supabase client bound to the request's cookies, for reading the
// logged-in user in server components / route handlers. Uses the PUBLIC anon
// key (RLS still applies); the user's session comes from cookies set at login.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component where cookies are read-only — safe to
          // ignore; the middleware refreshes the session cookie instead.
        }
      },
    },
  });
}

export type AppUser = {
  id: string;
  email: string | null;
  name: string | null;
  role: "admin" | "inspector" | "user";
  canDelete: boolean;
  canEditAll: boolean;
};

// Resolve the current user (or null) plus a simple role. Role comes from the
// Supabase user's app_metadata (set by an admin, so it can't be spoofed client
// side): an explicit `role` claim, or `can_delete` which the inspection app
// already uses to mark privileged users.
export async function getCurrentUser(): Promise<AppUser | null> {
  // Safe when auth isn't configured (e.g. Basic Auth mode): no env -> no user.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }
  let user = null;
  try {
    const supabase = await createSupabaseServerClient();
    ({
      data: { user },
    } = await supabase.auth.getUser());
  } catch {
    return null;
  }
  if (!user) return null;

  const app = (user.app_metadata ?? {}) as Record<string, unknown>;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const canDelete = app.can_delete === true;
  const canEditAll = app.can_edit_all === true;
  const claimed = typeof app.role === "string" ? (app.role as string) : "";
  const role: AppUser["role"] =
    claimed === "admin" || canDelete || canEditAll
      ? "admin"
      : claimed === "inspector"
        ? "inspector"
        : "user";

  return {
    id: user.id,
    email: user.email ?? null,
    name: (typeof meta.name === "string" ? meta.name : null) ?? user.email ?? null,
    role,
    canDelete,
    canEditAll,
  };
}
