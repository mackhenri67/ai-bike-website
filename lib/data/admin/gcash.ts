import "server-only";
import { getAdminClient } from "@/lib/supabase/admin";
import { type GcashSettingsRow, type QueryResult } from "@/lib/data/types";
import { missingServiceRoleMessage, toFriendlyDbError } from "./errors";

/**
 * Admin GCash payment + settings data access. Everything here uses the
 * service-role client (bypasses RLS) so the admin panel can read every
 * customer submission and persist approval/rejection decisions.
 */

export async function getGcashSettings(): Promise<
  QueryResult<GcashSettingsRow | null>
> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  const { data, error } = await admin
    .from("gcash_settings")
    .select("id, qr_code_url, gcash_number, updated_at")
    .eq("id", true)
    .maybeSingle();

  if (error) return { data: null, error: toFriendlyDbError(error) };
  return { data: (data as GcashSettingsRow) ?? null, error: null };
}

export type UpdateGcashSettingsInput = {
  qrCodeUrl: string | null;
  gcashNumber: string | null;
};

export async function updateGcashSettings(
  input: UpdateGcashSettingsInput,
): Promise<QueryResult<null>> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  const { error } = await admin
    .from("gcash_settings")
    .update({
      qr_code_url: input.qrCodeUrl?.trim() || null,
      gcash_number: input.gcashNumber?.trim() || null,
    })
    .eq("id", true);

  if (error) return { data: null, error: toFriendlyDbError(error) };
  return { data: null, error: null };
}

export type ReviewGcashPaymentInput = {
  orderId: string;
  decision: "paid" | "rejected";
  reviewerId: string | null;
  reason?: string | null;
};

/**
 * Approves or rejects a submitted GCash payment and keeps every record in
 * sync:
 *
 *   Approve  -> gcash_payments.status = 'paid', orders.payment_status = 'paid'
 *               and the order moves to 'shipping' (existing business flow).
 *   Reject   -> gcash_payments.status = 'rejected' (+ rejection reason kept for
 *               audit), orders.payment_status = 'rejected', order status stays
 *               as-is so the submission history remains visible.
 *
 * Both decisions record a verification timestamp + admin and append an entry
 * to the order status history audit trail.
 */
export async function reviewGcashPayment(
  input: ReviewGcashPaymentInput,
): Promise<QueryResult<null>> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  const { error } = await admin.rpc("lnr_review_order_payment", {
    p_order: input.orderId,
    p_decision: input.decision,
    p_admin: input.reviewerId,
    p_reason: input.reason ?? null,
  });
  return { data: null, error: error ? toFriendlyDbError(error) : null };
}
