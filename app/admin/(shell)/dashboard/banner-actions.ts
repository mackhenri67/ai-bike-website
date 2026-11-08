"use server";
import { requireAdmin } from "@/lib/auth/guards";
import { getAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
export async function saveHomepageBanner(
  url: string,
): Promise<{ error: string | null }> {
  await requireAdmin();
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (
    !base ||
    !url.startsWith(base + "/storage/v1/object/public/images/banners/") ||
    url.length > 2000
  )
    return { error: "Upload a new banner image first." };
  const client = getAdminClient();
  if (!client) return { error: "Supabase admin configuration is missing." };
  const { data: last } = await client
    .from("homepage_banners")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await client.from("homepage_banners").insert({
    image_url: url,
    sort_order: Number(last?.sort_order ?? -1) + 1,
    is_active: true,
  });
  if (error)
    return { error: "The banner could not be saved. Check migration 0012." };
  revalidatePath("/", "layout");
  return { error: null };
}
export async function removeHomepageBanner(
  url: string,
): Promise<{ error: string | null }> {
  await requireAdmin();
  const client = getAdminClient();
  if (!client) return { error: "Supabase admin configuration is missing." };
  const { error } = await client
    .from("homepage_banners")
    .delete()
    .eq("image_url", url);
  if (error) return { error: "The banner could not be removed." };
  revalidatePath("/", "layout");
  return { error: null };
}
