import { getCurrentUser } from "@/lib/auth/supabase-server";

// Gate for admin-only API routes: 401 when signed out, 403 for non-admins.
export async function requireAdminUser() {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized", status: 401 as const };
  if (user.role !== "admin") return { error: "Admins only", status: 403 as const };
  return { user };
}
