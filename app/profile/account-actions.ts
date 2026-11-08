"use server";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/auth/guards";
import { getAdminClient } from "@/lib/supabase/admin";
import { toFriendlyDbError } from "@/lib/data/admin/errors";
export async function cancelAccountItem(kind: "order" | "event", id: string): Promise<{ error: string | null }> {
  const user = await requireCustomer();
  if ((kind !== "order" && kind !== "event") || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { error: "Invalid cancellation reference." };
  const admin = getAdminClient();
  if (!admin) return { error: "The shop backend is not configured." };
  const { error } = kind === "order" ? await admin.rpc("lnr_cancel_customer_order", { p_order: id, p_user: user.id }) : await admin.rpc("lnr_cancel_customer_registration", { p_registration: id, p_user: user.id });
  if (error) return { error: error.code === "PGRST202" ? "Apply migration 0014_customer_account_cancellation.sql before cancelling." : toFriendlyDbError(error) };
  for (const path of ["/profile", "/my-events", "/events", "/products", "/", "/admin/orders", "/admin/products", "/admin/registrations", "/admin/events"]) revalidatePath(path);
  revalidatePath("/my-events/[code]", "page");
  return { error: null };
}
