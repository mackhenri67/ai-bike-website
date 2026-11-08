"use client";
import { getBrowserClient, getAdminBrowserClient } from "@/lib/supabase/client";
import type { SessionArea } from "./session";
type Exchange = ReturnType<
  ReturnType<typeof getBrowserClient>["auth"]["exchangeCodeForSession"]
>;
const pending = new Map<string, Exchange>();
/** Prevents React development remounts from consuming a one-use code twice. */
export function exchangeRecoveryCode(
  area: SessionArea,
  code: string,
): Exchange {
  const key = area + ":" + code;
  const existing = pending.get(key);
  if (existing) return existing;
  const client =
    area === "admin" ? getAdminBrowserClient() : getBrowserClient();
  const task = client.auth.exchangeCodeForSession(code);
  pending.set(key, task);
  if (pending.size > 8) pending.delete(pending.keys().next().value!);
  return task;
}
