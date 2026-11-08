import "server-only";
import { isAdmin } from "@/lib/auth/roles";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { type CustomerRow, type QueryResult } from "@/lib/data/types";
import {
  missingServiceRoleMessage,
  toFriendlyDbError,
} from "@/lib/data/admin/errors";

/**
 * Returns the customer directory row linked to the given auth user,
 * or `null` when there is no session, no row, or the DB is unreachable.
 *
 * Read path uses the RLS-bound anon client so it can only ever see the
 * caller's own row.
 */
export async function getCustomerByAuthUserId(
  authUserId: string,
): Promise<CustomerRow | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error || !data) return null;
  return data as CustomerRow;
}

/**
 * Finds the customer row for an auth user, creating it (idempotently) when
 * it does not exist yet. Used after login/signup so every authenticated
 * customer automatically has a directory row. Service-role for the write.
 */
export async function getOrCreateCustomer(
  user: User,
): Promise<CustomerRow | null> {
  if (isAdmin(user)) return null;
  const admin = getAdminClient();
  if (!admin) return null;

  const { data: existing } = await admin
    .from("customers")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (existing) return existing as CustomerRow;

  const fullName = String(
    user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "Customer",
  ).trim();
  const phone = user.user_metadata?.phone
    ? String(user.user_metadata.phone).trim() || null
    : null;

  const { data: created, error } = await admin
    .from("customers")
    .insert({
      auth_user_id: user.id,
      full_name: fullName,
      email: user.email ?? null,
      phone,
    })
    .select()
    .single();

  if (error || !created) return null;
  return created as CustomerRow;
}

/** Updates the editable profile fields on the caller's customer row. */
export async function updateCustomerProfile(
  customerId: string,
  input: { full_name: string; phone: string | null },
): Promise<QueryResult<null>> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  const { error } = await admin
    .from("customers")
    .update({
      full_name: input.full_name.trim(),
      phone: input.phone?.trim() || null,
    })
    .eq("id", customerId);

  if (error) return { data: null, error: toFriendlyDbError(error) };
  return { data: null, error: null };
}
