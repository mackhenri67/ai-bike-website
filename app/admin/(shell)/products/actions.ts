"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import {
  createProduct,
  deleteProduct,
  updateProduct,
} from "@/lib/data/admin/products";
import type { ProductInput } from "@/lib/data/types";

/**
 * Server-only admin backend for the Products page. Every mutation runs with
 * the service-role client (lib/supabase/admin.ts) after confirming the
 * caller has the administrator role — the browser never holds write privileges.
 *
 * Returns `{ error }` so the client manager can surface friendly messages;
 * `revalidatePath` keeps the admin list and the storefront in sync.
 */
export async function saveProductAction(
  input: ProductInput,
): Promise<{ error: string | null }> {
  await requireAdmin();

  if (!input.name.trim()) {
    return { error: "Product name is required." };
  }
  if (input.category_id && !isUuid(input.category_id)) {
    return { error: "Please choose a valid category." };
  }

  const result = input.id
    ? await updateProduct(input.id, input)
    : await createProduct(input);

  if (result.error || !result.data) {
    return { error: result.error ?? "Failed to save the product." };
  }

  revalidatePath("/admin/products");
  revalidatePath("/");
  revalidatePath("/products");
  revalidatePath(`/products/${result.data.slug}`);
  revalidatePath("/admin/dashboard");

  return { error: null };
}

export async function deleteProductAction(
  id: string,
): Promise<{ error: string | null }> {
  await requireAdmin();

  const result = await deleteProduct(id);
  if (result.error) return { error: result.error };

  revalidatePath("/admin/products");
  revalidatePath("/");
  revalidatePath("/products");
  revalidatePath("/admin/dashboard");

  return { error: null };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
