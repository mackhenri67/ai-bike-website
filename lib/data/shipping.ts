import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { QueryResult } from "@/lib/data/types";
export async function getShippingFee(): Promise<QueryResult<number>> {
  const client = await createClient();
  if (!client) return { data: null, error: "Shipping settings are unavailable." };
  const { data, error } = await client.from("shop_settings").select("shipping_fee").eq("id", true).maybeSingle();
  if (error || !data || !Number.isFinite(Number(data.shipping_fee))) return { data: null, error: "Shipping settings could not be loaded. Check migration 0028 or try again later." };
  return { data: Number(data.shipping_fee), error: null };
}
