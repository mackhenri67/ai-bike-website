"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { listNewOrderIds, updateOrderStatus } from "@/lib/data/admin/orders";
import { reviewGcashPayment } from "@/lib/data/admin/gcash";
import type { OrderStatus } from "@/lib/data/types";

const VALID_STATUSES: OrderStatus[] = [
  "pending",
  "shipping",
  "completed",
  "cancelled",
];

export async function updateOrderStatusAction(
  orderId: string,
  status: OrderStatus,
): Promise<{ error: string | null }> {
  const user = await requireAdmin();

  if (!VALID_STATUSES.includes(status)) {
    return { error: "Invalid order status." };
  }

  const result = await updateOrderStatus(orderId, status, user.id, null);
  if (result.error) return { error: result.error };

  revalidatePath("/products");
  revalidatePath("/products/[slug]", "page");
  revalidatePath("/custom-bike-builder");
  revalidatePath("/profile");
  revalidatePath("/");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/dashboard");

  return { error: null };
}

export type ReviewGcashDecision = "paid" | "rejected";

/**
 * Server Action: returns the ids of all current "new" (pending) orders so an
 * authenticated admin's browser can render the real-time new-orders badge.
 * Only order UUIDs are returned — never customer data — so this is safe to
 * expose to the client. The NewOrdersProvider polls this every few seconds
 * and the result is shared between the sidebar badge and the dashboard card.
 */
export async function getNewOrderIds(): Promise<{
  ids: string[];
  error: string | null;
}> {
  await requireAdmin();

  const result = await listNewOrderIds();
  if (result.error) return { ids: [], error: result.error };

  return { ids: result.data ?? [], error: null };
}

/**
 * Server Action: approves or rejects a submitted GCash payment. The decision
 * is persisted to the database (gcash_payments + orders + audit history), so
 * the customer sees the updated payment status immediately.
 */
export async function reviewGcashPaymentAction(
  orderId: string,
  decision: ReviewGcashDecision,
  reason?: string | null,
): Promise<{ error: string | null }> {
  const user = await requireAdmin();

  if (decision !== "paid" && decision !== "rejected") {
    return { error: "Invalid review decision." };
  }

  const result = await reviewGcashPayment({
    orderId,
    decision,
    reviewerId: user.id,
    reason: decision === "rejected" ? reason : null,
  });
  if (result.error) return { error: result.error };

  revalidatePath("/admin/orders");
  revalidatePath("/admin/dashboard");

  return { error: null };
}
