"use server";
import { createClient } from "@supabase/supabase-js";
import { createAdminSessionClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { getAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";
import { isAdmin } from "@/lib/auth/roles";
import { parseShippingFee, passwordValidation } from "@/lib/admin-settings-validation";
import { revalidatePath } from "next/cache";
export type SettingsResult = { error: string | null; saved: boolean; notice?: string };

export async function saveAdminDisplayName(
  _state: SettingsResult,
  form: FormData,
): Promise<SettingsResult> {
  await requireAdmin();

  const rawName = form.get("admin_display_name");
  const displayName = typeof rawName === "string" ? rawName.trim() : "";
  if (!displayName) {
    return { saved: false, error: "Enter the name to display in the admin header." };
  }
  if (Array.from(displayName).length > 40) {
    return { saved: false, error: "The admin display name must be 40 characters or fewer." };
  }

  const adminSession = await createAdminSessionClient();
  if (!adminSession) {
    return { saved: false, error: "The administrator session is unavailable. Please sign in again." };
  }

  const { error } = await adminSession.auth.updateUser({
    data: { admin_display_name: displayName },
  });
  if (error) {
    return { saved: false, error: "The admin display name could not be saved. Please try again." };
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin", "layout");
  return { saved: true, error: null };
}

export async function saveShippingFee(_state: SettingsResult, form: FormData): Promise<SettingsResult> {
  const user = await requireAdmin();
  const fee = parseShippingFee(form.get("shipping_fee"));
  if (fee === null) return { saved: false, error: "Enter an amount from 0 to 100000 with up to two decimal places." };
  const client = getAdminClient();
  if (!client) return { saved: false, error: "The shop backend is unavailable." };
  const { error } = await client.rpc("lnr_set_shipping_fee", { p_admin: user.id, p_fee: fee });
  if (error) return { saved: false, error: error.code === "P0001" ? error.message : "The shipping fee could not be saved. Check migration 0028 and try again." };
  for (const path of ["/admin/settings", "/cart", "/checkout", "/checkout/buy-now"]) revalidatePath(path);
  return { saved: true, error: null };
}
export async function changeAdminPassword(_state: SettingsResult, form: FormData): Promise<SettingsResult> {
  const user = await requireAdmin();
  const current = form.get("current_password"), next = form.get("new_password"), confirm = form.get("confirm_password");
  const invalid = passwordValidation(current, next, confirm);
  if (invalid) return { saved: false, error: invalid };
  const config = getSupabaseConfig();
  if (!config || !user.email) return { saved: false, error: "Password settings are unavailable for this account." };
  // This isolated client does not alter the customer or admin cookies during verification.
  const verifier = createClient(config.url, config.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const checked = await verifier.auth.signInWithPassword({ email: user.email, password: current as string });
  if (checked.error || checked.data.user?.id !== user.id || !isAdmin(checked.data.user)) return { saved: false, error: "Your current password could not be verified." };
  const changed = await verifier.auth.updateUser({ password: next as string, current_password: current as string });
  if (changed.error) return { saved: false, error: changed.error.code === "weak_password" ? "The new password does not meet the account password requirements." : "The password could not be updated. Sign in again and retry." };
  const adminSession = await createAdminSessionClient();
  const refreshed = adminSession ? await adminSession.auth.signInWithPassword({ email: user.email, password: next as string }) : null;
  return { saved: true, error: null, notice: !refreshed || refreshed.error ? "Password updated. Please sign in again with your new password." : "Password updated successfully." };
}
