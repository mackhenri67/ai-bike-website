"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateCustomer } from "@/lib/data/customer/customers";
import { getCustomerDefaultLocation } from "@/lib/data/customer/locations";
import { createCustomerOrder } from "@/lib/data/customer/orders";
import type { CheckoutLineInput } from "@/lib/data/customer/types";

export type PlaceOrderState = {
  error: string | null;
};

/**
 * Server Action: places the order for the signed-in customer using the
 * cart lines the client serialized into the hidden `items` field.
 *
 * All pricing, stock and variant data is re-validated server-side inside
 * `createCustomerOrder` — the client cart values are only hints.
 */
export async function placeOrder(
  prevState: PlaceOrderState | undefined,
  formData: FormData,
): Promise<PlaceOrderState> {
  const supabase = await createClient();
  if (!supabase) {
    return {
      error: "Supabase is not configured. Please refresh and try again.",
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to place an order." };
  }

  const customer = await getOrCreateCustomer(user);
  if (!customer) {
    return {
      error: "We couldn't load your customer account. Please try again.",
    };
  }

  const location = await getCustomerDefaultLocation(customer.id);
  if (!location) {
    return {
      error:
        "You need a saved delivery location before you can check out. Please set one and come back.",
    };
  }

  const paymentMethod = String(formData.get("payment_method") ?? "cod");
  if (paymentMethod !== "gcash" && paymentMethod !== "cod") {
    return { error: "Please choose a payment method." };
  }

  let items: CheckoutLineInput[];
  try {
    const raw = JSON.parse(String(formData.get("items") ?? "")) as unknown;
    if (!Array.isArray(raw) || raw.length > 100)
      throw new Error("items must be an array");
    items = raw.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry))
        throw new Error("Invalid cart line");
      const line = entry as Record<string, unknown>;
      return {
        productId: String(line.productId ?? ""),
        variantId:
          typeof line.variantId === "string" ? line.variantId : undefined,
        options:
          line.options &&
          typeof line.options === "object" &&
          !Array.isArray(line.options)
            ? (line.options as Record<string, string>)
            : undefined,
        builderStepNumber:
          typeof line.builderStepNumber === "number"
            ? line.builderStepNumber
            : undefined,
        slug: line.slug ? String(line.slug) : undefined,
        name: String(line.name ?? "Product"),
        price: Number(line.price ?? 0),
        size: String(line.size ?? ""),
        color: String(line.color ?? ""),
        quantity: Number(line.quantity ?? 0),
      };
    });
  } catch {
    return {
      error:
        "Your cart could not be read. Please go back to your cart and try again.",
    };
  }

  if (items.length === 0) {
    return { error: "Your cart is empty. Add a product before checking out." };
  }

  const result = await createCustomerOrder({
    customerId: customer.id,
    customerName: customer.full_name,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    location,
    items,
    paymentMethod,
  });

  if (result.error || !result.data) {
    return {
      error:
        result.error ??
        "Something went wrong while placing your order. Please try again.",
    };
  }

  const source = formData.get("checkout_mode") === "buy-now" ? "buy-now" : "cart";
  if (result.data.paymentMethod === "gcash") {
    // GCash orders continue to the dedicated payment page where the customer
    // scans the merchant QR code and submits their payment proof. `placed=1`
    // tells that page the order was just created so it can clear the cart.
    redirect(
      `/gcash-payment/${encodeURIComponent(result.data.orderNumber)}?placed=1&source=${source}`,
    );
  }

  redirect(
    `/checkout/success?order=${encodeURIComponent(result.data.orderNumber)}&placed=1&source=${source}`,
  );
}
