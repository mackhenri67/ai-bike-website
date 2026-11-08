import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";
import { SESSION_COOKIES, type SessionArea } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";
async function forArea(area: SessionArea) {
  const config = getSupabaseConfig();
  if (!config) return null;
  const jar = await cookies();
  return createServerClient(config.url, config.anonKey, {
    cookieOptions: { name: SESSION_COOKIES[area] },
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) =>
            jar.set(name, value, options),
          );
        } catch {
          /* Proxy refreshes cookies during Server Component renders. */
        }
      },
    },
  });
}
export async function createClient() {
  return forArea("customer");
}
export async function createAdminSessionClient() {
  return forArea("admin");
}
async function verifiedUser(area: SessionArea): Promise<User | null> {
  const client = await forArea(area);
  if (!client) return null;
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  return error ? null : user;
}
export const getUser = cache(async () => {
  const user = await verifiedUser("customer");
  return isAdmin(user) ? null : user;
});
export const getAdminUser = cache(() => verifiedUser("admin"));
