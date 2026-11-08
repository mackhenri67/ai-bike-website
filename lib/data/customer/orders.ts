import "server-only";
import { getAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";
import type { QueryResult } from "@/lib/data/types";
import type { CustomerLocation, CheckoutLineInput } from "./types";
import { getBikeBuilderSteps } from "./bike-builder";
import { builderAxes, builderVariant } from "@/lib/builder-options";
import {
  missingServiceRoleMessage,
  toFriendlyDbError,
} from "@/lib/data/admin/errors";
export const CHECKOUT_SHIPPING_FEE = 190;
export type CreateCustomerOrderInput = {
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  location: CustomerLocation;
  items: CheckoutLineInput[];
  paymentMethod: "gcash" | "cod";
};
export type CreateCustomerOrderResult = {
  orderNumber: string;
  total: number;
  paymentMethod: "gcash" | "cod";
};
export async function createCustomerOrder(
  input: CreateCustomerOrderInput,
): Promise<QueryResult<CreateCustomerOrderResult>> {
  const user = await getUser();
  if (!user) return { data: null, error: "Sign in with a customer account." };
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };
  if (
    !Array.isArray(input.items) ||
    input.items.length < 1 ||
    input.items.length > 100
  )
    return { data: null, error: "Your cart is empty or too large." };
  const needsBuilder = input.items.some(
    (item) => item.builderStepNumber !== undefined,
  );
  const catalogue = needsBuilder ? await getBikeBuilderSteps() : null;
  if (needsBuilder && (catalogue?.error || !catalogue?.data))
    return {
      data: null,
      error: "The builder catalogue could not be checked. Try again.",
    };
  const lines = [];
  for (const item of input.items) {
    if (item.builderStepNumber !== undefined) {
      const step = catalogue?.data?.find(
        (s) => s.stepNumber === item.builderStepNumber,
      );
      const product = step?.products.find((p) => p.id === item.productId);
      const options = item.options;
      if (
        !step ||
        !product ||
        !options ||
        typeof options !== "object" ||
        Array.isArray(options)
      )
        return {
          data: null,
          error: "The builder options changed. Edit your build.",
        };
      const axes = builderAxes(step, product);
      if (
        Object.keys(options).length !== axes.length ||
        !axes.every(
          (axis) =>
            typeof options[axis.label] === "string" &&
            axis.options.includes(options[axis.label]),
        )
      )
        return {
          data: null,
          error: "Choose all available builder options before checkout.",
        };
      const variant = builderVariant(product, options);
      if (product.variants?.length && !variant)
        return {
          data: null,
          error: "This builder size/color combination is unavailable.",
        };
      lines.push({
        productId: product.id,
        quantity: item.quantity,
        builder_validated: true,
        variantId: variant?.id,
        size: Object.entries(options)
          .map(([k, v]) => `${k}: ${v}`)
          .join(" · "),
        color: options.Color ?? "",
      });
    } else {
      lines.push({
        productId: item.productId,
        quantity: item.quantity,
        size: item.size,
        color: item.color,
        variantId: item.variantId,
        builder_validated: false,
      });
    }
  }
  const { data, error } = await admin.rpc("lnr_place_order", {
    p_user: user.id,
    p_items: lines,
    p_method: input.paymentMethod,
  });
  return {
    data: error ? null : (data as CreateCustomerOrderResult),
    error: error ? toFriendlyDbError(error) : null,
  };
}
