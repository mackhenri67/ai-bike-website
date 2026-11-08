import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  type ProductInput,
  type ProductRow,
  type QueryResult,
} from "@/lib/data/types";
import { missingServiceRoleMessage, toFriendlyDbError } from "./errors";

const PRODUCT_SELECT = `
  id, category_id, name, slug, sku, description, tagline, specs,
  price, compare_at_price, cost, stock, status, is_featured, is_new_arrival,
  sort_order, created_at, updated_at,
  category:categories(id, name, slug),
  product_images(id, url, alt, sort_order, is_primary),
  product_variants(id, sku, name, size, color, options, retired, price, stock, available, sort_order)
`;

/** "Met Bluegrass Intox" -> "met-bluegrass-intox" (mirrors the SQL slugify()). */
function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/** Extracts the storage object path from a public `images` bucket URL. */
export function storagePathFromPublicUrl(url: string): string | null {
  const marker = "/storage/v1/object/public/images/";
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return url.slice(index + marker.length).split("?")[0];
}

/**
 * Ensures the product slug is unique across the catalog, appending a short
 * random suffix on collision (the DB unique constraint stays the final guard).
 */
async function ensureUniqueSlug(
  admin: SupabaseClient,
  desired: string,
  excludeId: string | null
): Promise<string> {
  const base = slugify(desired) || "product";
  let slug = base;

  const { data: existing } = await admin
    .from("products")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existing && existing.id !== excludeId) {
    slug = `${base}-${crypto.randomUUID().slice(0, 8)}`;
  }

  return slug;
}

export async function getProductById(
  id: string
): Promise<QueryResult<ProductRow>> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  const { data, error } = await admin
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) return { data: null, error: toFriendlyDbError(error) };
  // The untyped client infers the embedded `category` relation as an array,
  // but PostgREST returns a single object (to-one FK). Cast via `unknown`.
  return { data: (data as unknown as ProductRow) ?? null, error: null };
}

export async function listProducts(): Promise<QueryResult<ProductRow[]>> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  const { data, error } = await admin
    .from("products")
    .select(PRODUCT_SELECT)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: toFriendlyDbError(error) };
  return { data: (data as unknown as ProductRow[]) ?? [], error: null };
}

async function saveProduct(input: ProductInput, id: string | null): Promise<QueryResult<ProductRow>> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };
  const slug = await ensureUniqueSlug(admin, input.slug || input.name, id);
  const { data, error } = await admin.rpc("lnr_save_product_options", { p_id: id, p_input: { ...input, slug } });
  if (error) return { data: null, error: toFriendlyDbError(error) };
  return getProductById(String(data));
}
export async function createProduct(input: ProductInput) { return saveProduct(input, null); }
export async function updateProduct(id: string, input: ProductInput) { return saveProduct(input, id); }

export async function deleteProduct(
  id: string
): Promise<QueryResult<null>> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  // Remove the product's storage objects first (best-effort), then the row
  // (images/variants cascade).
  try {
    const { data } = await admin
      .from("product_images")
      .select("url")
      .eq("product_id", id);
    if (data) {
      const paths = data
        .map((row) => storagePathFromPublicUrl(row.url))
        .filter((path): path is string => path !== null);
      if (paths.length > 0) {
        await admin.storage.from("images").remove(paths);
      }
    }
  } catch {
    // Best-effort cleanup only.
  }

  const { error } = await admin.from("products").delete().eq("id", id);
  if (error) return { data: null, error: toFriendlyDbError(error) };

  return { data: null, error: null };
}

