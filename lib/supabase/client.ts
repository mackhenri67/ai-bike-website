"use client";
import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";
import { SESSION_COOKIES, type SessionArea } from "@/lib/auth/session";
const clients: Partial<
  Record<SessionArea, ReturnType<typeof createBrowserClient>>
> = {};
function forArea(area: SessionArea) {
  const cached = clients[area];
  if (cached) return cached;
  const config = getSupabaseConfig();
  if (!config)
    throw new Error(
      "Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY first.",
    );
  const client = createBrowserClient(config.url, config.anonKey, {
    cookieOptions: { name: SESSION_COOKIES[area] },
    isSingleton: false,
    auth: { detectSessionInUrl: false },
  });
  clients[area] = client;
  return client;
}
export function getBrowserClient() {
  return forArea("customer");
}
export function getAdminBrowserClient() {
  return forArea("admin");
}
