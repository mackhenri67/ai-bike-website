import type { User } from "@supabase/supabase-js";
export function isAdmin(
  user: Pick<User, "app_metadata"> | null | undefined,
): boolean {
  return user?.app_metadata?.role === "admin";
}
