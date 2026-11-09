import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
/** Resolve old saved cart entries to the current canonical product slug. */
export default async function ProductByIdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(id)) redirect(`/products/${encodeURIComponent(id)}`);
    notFound();
  }
  const client = await createClient();
  if (!client) notFound();
  const { data, error } = await client.from("products").select("slug").eq("id", id).eq("status", "active").maybeSingle();
  if (error || !data?.slug) notFound();
  redirect(`/products/${encodeURIComponent(data.slug)}`);
}
