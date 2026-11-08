import "server-only";
import { paymentProofUrl } from "@/lib/storage/proofs";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  type OrderRow,
  type OrderStatus,
  type QueryResult,
} from "@/lib/data/types";
import { missingServiceRoleMessage, toFriendlyDbError } from "./errors";

const ORDER_SELECT = `
  id, order_number, customer_id, customer_name, customer_email, customer_phone,
  shipping_address, shipping_latitude, shipping_longitude,
  subtotal, shipping_fee, discount, total,
  payment_method, payment_status, status, payment_reference, notes,
  created_at, updated_at,
  order_items(id, product_id, product_variant_id, product_name, size, color,
              unit_price, quantity, line_total),
  gcash_payments(id, order_id, sender_name, phone_number, reference_number,
                 screenshot_url, status, rejection_reason, created_at,
                 reviewed_at, reviewed_by)
`;

/** Base select without the GCash embed (fallback before migration 0008). */
const ORDER_SELECT_BASE = `
  id, order_number, customer_id, customer_name, customer_email, customer_phone,
  shipping_address, shipping_latitude, shipping_longitude,
  subtotal, shipping_fee, discount, total,
  payment_method, payment_status, status, payment_reference, notes,
  created_at, updated_at,
  order_items(id, product_id, product_variant_id, product_name, size, color,
              unit_price, quantity, line_total)
`;

export async function listOrders(): Promise<QueryResult<OrderRow[]>> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  const { data, error } = await admin
    .from("orders")
    .select(ORDER_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    // The gcash_payments table is part of migration 0008. Until it is applied
    // to the connected project, fall back to the base query so the admin
    // Orders page keeps working (GCash verification is simply not shown).
    const { data: fallback, error: fallbackError } = await admin
      .from("orders")
      .select(ORDER_SELECT_BASE)
      .order("created_at", { ascending: false });

    if (fallbackError)
      return { data: null, error: toFriendlyDbError(fallbackError) };
    return { data: (fallback as OrderRow[]) ?? [], error: null };
  }

  return {
    data: await Promise.all(
      ((data as OrderRow[]) ?? []).map(async (order) => {
        const payments = order.gcash_payments;
        if (Array.isArray(payments))
          return {
            ...order,
            gcash_payments: await Promise.all(
              payments.map(async (p) => ({
                ...p,
                screenshot_url: await paymentProofUrl(p.screenshot_url),
              })),
            ),
          };
        if (payments)
          return {
            ...order,
            gcash_payments: {
              ...payments,
              screenshot_url: await paymentProofUrl(payments.screenshot_url),
            },
          };
        return order;
      }),
    ),
    error: null,
  };
}

/**
 * Returns the id of every "new" order — defined the same way as the
 * dashboard's New Orders card: orders still in the `pending` status.
 *
 * Only the UUIDs are returned (never customer/PII), so this is safe to
 * surface to an authenticated admin's browser. It powers the real-time
 * "new orders" badge that is synchronized between the Admin sidebar and the
 * dashboard New Orders card.
 */
export async function listNewOrderIds(): Promise<QueryResult<string[]>> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  const { data, error } = await admin
    .from("orders")
    .select("id")
    .eq("status", "pending");

  if (error) return { data: null, error: toFriendlyDbError(error) };

  const ids = (data as { id: string }[] | null)
    ?.map((row) => row.id)
    .filter((id): id is string => typeof id === "string");

  return { data: ids ?? [], error: null };
}

/**
 * Updates an order's status and records the change in the audit trail.
 * `createdBy` is the authenticated admin user id (auth.users), when available.
 */
export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  createdBy: string | null,
  note: string | null,
): Promise<QueryResult<null>> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  const { error } = await admin.rpc("lnr_set_order_status", {
    p_order: orderId,
    p_status: status,
    p_admin: createdBy,
    p_note: note,
  });
  return { data: null, error: error ? toFriendlyDbError(error) : null };
}
