import "server-only";
import { getUser } from "@/lib/supabase/server";
import { paymentProofUrl } from "@/lib/storage/proofs";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  type GcashPaymentRow,
  type GcashSettingsRow,
  type QueryResult,
} from "@/lib/data/types";
import {
  missingServiceRoleMessage,
  toFriendlyDbError,
} from "@/lib/data/admin/errors";

/**
 * Customer-side GCash payment data access.
 *
 * Reads (settings, own order, own submission) go through the RLS-bound anon
 * client so a customer can only ever see their own records. The single write
 * (`submitGcashPayment`) is performed with the service-role client and is
 * re-validated server-side: ownership, payment method, payment state and
 * duplicate submissions are all checked before anything is persisted.
 */

/** A customer's order row restricted to the fields the payment page needs. */
export type GcashOrderLookup = {
  id: string;
  order_number: string;
  customer_id: string | null;
  total: number;
  payment_method: string;
  payment_status: string;
  status: string;
};

const GCASH_ORDER_SELECT = `
  id, order_number, customer_id, total,
  payment_method, payment_status, status
`;

/** Merchant GCash QR + number configured by the admin (null when unconfigured). */
export async function getGcashSettings(): Promise<GcashSettingsRow | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("gcash_settings")
    .select("id, qr_code_url, gcash_number, updated_at")
    .eq("id", true)
    .maybeSingle();

  if (!data) return null;
  return data as GcashSettingsRow;
}

/**
 * Looks up a GCash order by its public order number, scoped to the given
 * customer id through RLS (an anon client can only see the caller's rows).
 */
export async function getGcashOrderForCustomer(
  orderNumber: string,
  customerId: string,
): Promise<GcashOrderLookup | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("orders")
    .select(GCASH_ORDER_SELECT)
    .eq("order_number", orderNumber)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (!data) return null;
  return data as GcashOrderLookup;
}

/**
 * The customer's own GCash submission for an order, if one exists.
 * RLS (`gcash_payments_select_own`) keeps this scoped to their own order.
 */
export async function getGcashPaymentForOrder(
  orderId: string,
): Promise<GcashPaymentRow | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("gcash_payments")
    .select(
      "id, order_id, sender_name, phone_number, reference_number, screenshot_url, status, rejection_reason, created_at, reviewed_at, reviewed_by",
    )
    .eq("order_id", orderId)
    .maybeSingle();

  if (!data) return null;
  const payment = data as GcashPaymentRow;
  return {
    ...payment,
    screenshot_url: await paymentProofUrl(payment.screenshot_url),
  };
}

export type SubmitGcashPaymentInput = {
  orderId: string;
  customerId: string;
  senderName: string;
  phoneNumber: string;
  referenceNumber: string | null;
  screenshotUrl: string;
};

/**
 * Persists a GCash payment submission (service-role write) after re-checking:
 *   * the order exists and belongs to this customer,
 *   * the order was placed with GCash and is still awaiting verification,
 *   * no payment has already been submitted for this order (duplicate guard).
 */
export async function submitGcashPayment(
  input: SubmitGcashPaymentInput,
): Promise<QueryResult<null>> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  const user = await getUser();
  if (!user) return { data: null, error: "Sign in with a customer account." };
  const { error } = await admin.rpc("lnr_submit_order_payment", {
    p_user: user.id,
    p_order: input.orderId,
    p_name: input.senderName,
    p_phone: input.phoneNumber,
    p_reference: input.referenceNumber,
    p_proof: input.screenshotUrl,
  });
  return { data: null, error: error ? toFriendlyDbError(error) : null };
}

/**
 * Normalizes a Philippine mobile number ("0917 123 4567", "09XXXXXXXXX",
 * "+639171234567") and validates the format. Returns the trimmed digits, or
 * `null` when the number is not a valid PH mobile number.
 */
export function normalizePhMobileNumber(value: string): string | null {
  // Accept "09XXXXXXXXX", "+639XXXXXXXXX", "639XXXXXXXXX" (and spaces/dashes).
  // The national significant number is 10 digits starting with 9; the leading
  // "0"/"+63"/"63" prefix is stripped and replaced with a single "0" so the
  // result is always in "09XXXXXXXXX" (11-digit) form. This matches PHONE_RE on
  // the GCash payment view so client and server agree on validity.
  const digits = value.replace(/[\s\-()]/g, "");
  const match = digits.match(/^(?:\+?63|0)(9\d{9})$/);
  if (!match) return null;
  return `0${match[1]}`;
}
