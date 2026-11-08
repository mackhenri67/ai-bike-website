"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrCreateCustomer } from "@/lib/data/customer/customers";
import {
  getCustomerCart,
  saveCustomerCart as persistCart,
} from "@/lib/data/customer/carts";
import type { CartItem } from "@/components/customer/cart-store";

/**
 * Coerces untrusted client input into a well-formed CartItem[] so garbage can
 * never be written into a customer's saved cart.
 */
function sanitizeItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];

  const items: CartItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;

    const key = String(e.key ?? "");
    const productId = String(e.productId ?? "");
    if (!key || !productId) continue;

    const quantity = Number(e.quantity);
    items.push({
      key,
      productId,
      variantId: typeof e.variantId === "string" ? e.variantId : undefined,
      options:
        e.options && typeof e.options === "object" && !Array.isArray(e.options)
          ? (Object.fromEntries(
              Object.entries(e.options).filter(
                ([, v]) => typeof v === "string",
              ),
            ) as Record<string, string>)
          : undefined,
      builderStepNumber:
        typeof e.builderStepNumber === "number"
          ? e.builderStepNumber
          : undefined,
      name: String(e.name ?? "Product"),
      price: Number.isFinite(Number(e.price)) ? Number(e.price) : 0,
      image: String(e.image ?? ""),
      size: String(e.size ?? ""),
      color: String(e.color ?? ""),
      quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : 1,
      stock: Number.isFinite(Number(e.stock))
        ? Math.max(0, Number(e.stock))
        : 0,
      selected: Boolean(e.selected),
    });
  }
  return items;
}

/**
 * Server Action: loads the signed-in customer's saved cart.
 *
 * Returns `null` when signed out, Supabase is not configured, or the account
 * has not saved a cart yet — in which case the client keeps its local cart.
 */
export async function loadCustomerCart(): Promise<CartItem[] | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const customer = await getOrCreateCustomer(user);
  if (!customer) return null;

  return getCustomerCart(customer.id);
}

/**
 * Server Action: persists the signed-in customer's cart.
 *
 * This NEVER deletes a saved cart — an empty array simply stores an empty
 * cart, so signing out never destroys the account's cart. Returns `false`
 * when the save could not be completed (callers treat this as non-fatal).
 */
export async function saveCustomerCart(itemsRaw: unknown): Promise<boolean> {
  const supabase = await createClient();
  if (!supabase) return false;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const customer = await getOrCreateCustomer(user);
  if (!customer) return false;

  const result = await persistCart(customer.id, sanitizeItems(itemsRaw));
  return !result.error;
}
