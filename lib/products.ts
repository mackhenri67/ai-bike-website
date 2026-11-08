import "server-only";
import { legacyOptions } from "@/lib/product-options";
import { getCategoryAxes } from "@/components/admin/products/categoryConfig";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Public, read-only product access for the customer-facing storefront.
 *
 * Queries run through the anonymous/user client, so Row Level Security is
 * enforced: only products with `status = 'active'` (and active categories)
 * are ever returned. This is the single source of truth shared with the admin
 * panel — products created there appear here automatically.
 */

export type CatalogProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  compareAtPrice: number | null;
  image: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  stock: number;
  status: string;
  isNewArrival: boolean;
  isFeatured: boolean;
};

export type CatalogProductDetail = {
  hasVariants: boolean;
  variants: {
    options: Record<string, string>;
    retired?: boolean;
    id: string;
    size: string | null;
    color: string | null;
    price: number;
    stock: number;
  }[];
  id: string;
  slug: string;
  name: string;
  description: string | null;
  tagline: string[];
  specs: string[];
  price: number;
  compareAtPrice: number | null;
  category: string;
  categorySlug: string | null;
  images: string[];
  thumbnails: string[];
  sizes: string[];
  colors: string[];
  available: boolean;
  stock: number;
};

export type CatalogCategory = {
  id: string;
  name: string;
  slug: string;
};

/** Optional filters shared by every catalog listing query. */
export type CatalogProductsOptions = {
  /** Only products in this category (matched by category slug). */
  categorySlug?: string | null;
  /** Free-text search over the product name and description. */
  query?: string | null;
  /** Only products flagged as new arrivals. */
  newArrivalsOnly?: boolean;
  /** Maximum number of rows to return. */
  limit?: number | null;
};

const CATALOG_PRODUCT_SELECT = `
  id, name, slug, description, price, compare_at_price, stock, status,
  is_featured, is_new_arrival,
  category:categories(name, slug),
  product_images(url, sort_order, is_primary)
`;

function primaryImage(
  images: { url: string; is_primary: boolean; sort_order: number }[] | null,
): string | null {
  if (!images || images.length === 0) return null;
  const sorted = [...images].sort((a, b) => a.sort_order - b.sort_order);
  return sorted.find((image) => image.is_primary)?.url ?? sorted[0].url;
}

/**
 * PostgREST returns a single object for a to-one embed (when the foreign key
 * is declared, as it is for products.category_id). Because the client is
 * untyped, TypeScript infers the relation as an array — this normalizes both
 * shapes so the storefront keeps working either way.
 */
function asSingle<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return value ?? null;
}

function mapCatalogProduct(row: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number | string;
  compare_at_price: number | string | null;
  stock: number | string;
  status: string;
  is_featured: boolean;
  is_new_arrival: boolean;
  category:
    | { name: string; slug: string }
    | { name: string; slug: string }[]
    | null;
  product_images:
    | {
        url: string;
        is_primary: boolean;
        sort_order: number;
      }[]
    | null;
}): CatalogProduct {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price: Number(row.price),
    compareAtPrice:
      row.compare_at_price === null || row.compare_at_price === undefined
        ? null
        : Number(row.compare_at_price),
    image: primaryImage(row.product_images),
    categoryName: asSingle(row.category)?.name ?? null,
    categorySlug: asSingle(row.category)?.slug ?? null,
    stock: Number(row.stock),
    status: row.status,
    isNewArrival: row.is_new_arrival,
    isFeatured: row.is_featured,
  };
}

/**
 * Core catalog query shared by the homepage sections, the full listing page
 * and the search box. Returns `null` when Supabase is unreachable/not
 * configured and an empty array when the filters simply match nothing.
 */
export async function getCatalogProducts(
  options: CatalogProductsOptions = {},
): Promise<CatalogProduct[] | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  let query = supabase
    .from("products")
    .select(CATALOG_PRODUCT_SELECT)
    .eq("status", "active");

  // PostgREST embedded-resource filters proved unreliable on the project's
  // API version, so resolve the category slug to its id first and filter by
  // the foreign-key column instead (a single extra lightweight request).
  if (options.categorySlug) {
    const { data: category } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", options.categorySlug)
      .maybeSingle();
    if (!category) return [];
    query = query.eq("category_id", category.id);
  }

  if (options.newArrivalsOnly) {
    query = query.eq("is_new_arrival", true);
  }

  const term = options.query?.trim();
  if (term) {
    query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
  }

  query = query.order("sort_order", { ascending: true });
  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error || !data) return null;

  return (data as Parameters<typeof mapCatalogProduct>[0][]).map(
    mapCatalogProduct,
  );
}

export async function getCatalogProductBySlug(
  slug: string,
): Promise<CatalogProductDetail | null> {
  const supabase = getAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("products")
    .select(
      `id, name, slug, description, tagline, specs, price, compare_at_price,
       stock, is_featured, is_new_arrival,
       category:categories(name, slug, is_active),
       product_images(url, sort_order, is_primary),
       product_variants(id,size,color,options,retired,price,stock,available)`,
    )
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) return null;

  const hasVariants = (data.product_variants ?? []).some((v) => !v.retired);
  const variants = (data.product_variants ?? [])
    .filter((v) => !v.retired && v.available && Number(v.stock) > 0)
    .map((v) => ({ ...v, options: legacyOptions(v), price: Number(v.price), stock: Number(v.stock) }));
  const images =
    (data.product_images ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((image) => image.url) ?? [];

  const sizes = Array.from(
    new Set(
      variants
        .map((variant) => variant.size)
        .filter((size): size is string => Boolean(size)),
    ),
  );
  const colors = Array.from(
    new Set(
      variants
        .map((variant) => variant.color)
        .filter((color): color is string => Boolean(color)),
    ),
  );

  return {
    hasVariants,
    variants,
    id: data.id,
    slug: data.slug,
    name: data.name,
    description: data.description,
    tagline: data.tagline ?? [],
    specs: (data.specs ?? []).filter((line: string) => !getCategoryAxes(asSingle(data.category)?.slug).some((axis) => line.split(":")[0].trim() === axis.flag)),
    price: variants.length
      ? Math.min(...variants.map((v) => v.price))
      : Number(data.price),
    compareAtPrice:
      data.compare_at_price === null || data.compare_at_price === undefined
        ? null
        : Number(data.compare_at_price),
    category: asSingle(data.category)?.name ?? "Products",
    categorySlug: asSingle(data.category)?.slug ?? null,
    images,
    thumbnails: images,
    sizes,
    colors,
    available: Number(data.stock) > 0 && (!hasVariants || variants.length > 0),
    stock: Number(data.stock),
  };
}

export async function searchCatalogProducts(
  query: string,
): Promise<CatalogProduct[] | null> {
  return getCatalogProducts({ query, limit: 40 });
}

export async function getCatalogCategories(): Promise<
  CatalogCategory[] | null
> {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error || !data) return null;
  return data as CatalogCategory[];
}
