import "server-only";
import { createClient } from "@/lib/supabase/server";
const fallback = [
  "/Customerpageimages/lnr%20image%20placeholder%201.png",
  "/Customerpageimages/lnr%20placeholder%201.png",
];
export async function getHomepageBanners(): Promise<string[]> {
  const client = await createClient();
  if (!client) return fallback;
  const { data, error } = await client
    .from("homepage_banners")
    .select("image_url")
    .eq("is_active", true)
    .order("sort_order")
    .order("id");
  return error ? fallback : (data ?? []).map((row) => String(row.image_url));
}
