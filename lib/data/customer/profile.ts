import "server-only";
import { paymentProofUrl } from "@/lib/storage/proofs";
import { createClient } from "@/lib/supabase/server";
import type { CustomerRow, OrderRow } from "@/lib/data/types";
import { getCustomerByAuthUserId } from "./customers";
import { getCustomerDefaultLocation } from "./locations";
import type { CustomerLocation } from "./types";

const ORDER_SELECT = `
  id, order_number, customer_id, customer_name, customer_email, customer_phone,
  shipping_address, subtotal, shipping_fee, discount, total,
  payment_method, payment_status, status, payment_reference, notes,
  created_at, updated_at,
  gcash_payments(screenshot_url,sender_name,reference_number,status),
  order_items(id, product_id, product_variant_id, product_name, size, color,
              unit_price, quantity, line_total, product:products(product_images(url,is_primary,sort_order)))
`;

export type CustomerProfile = {
  customer: CustomerRow;
  location: CustomerLocation | null;
  orders: OrderRow[];
};

/**
 * Loads everything the profile / checkout pages need for one customer:
 * directory row, saved location and their order history (RLS scoped reads).
 */
export async function getCustomerProfile(
  authUserId: string
): Promise<CustomerProfile | null> {
  const customer = await getCustomerByAuthUserId(authUserId);
  if (!customer) return null;

  const [location, orders] = await Promise.all([
    getCustomerDefaultLocation(customer.id),
    listCustomerOrders(customer.id),
  ]);

  return { customer, location, orders: orders ?? [] };
}

/** The customer's own orders, newest first. `null` when the DB is unreachable. */
export async function listCustomerOrders(
  customerId: string
): Promise<OrderRow[] | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error || !data) return null;
  return Promise.all((data as unknown as OrderRow[]).map(async (order) => {
    const payment = Array.isArray(order.gcash_payments) ? order.gcash_payments[0] : order.gcash_payments;
    const url = payment?.screenshot_url ? await paymentProofUrl(payment.screenshot_url) : null;
    return { ...order, gcash_payments: undefined, payment_receipt: payment ? { url: url || null, sender: payment.sender_name, reference: payment.reference_number, status: payment.status } : null };
  }));
}
