import "server-only";
import { legacyOptions } from "@/lib/product-options";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  missingServiceRoleMessage,
  toFriendlyDbError,
} from "@/lib/data/admin/errors";
import { type QueryResult } from "@/lib/data/types";

/**
 * Server-side data access for the Custom Bike Builder experience.
 *
 * Reads the builder step definitions and the products mapped to each step
 * through the admin (service-role) client so the public storefront never
 * depends on RLS edge cases while still returning only what is needed to
 * render the builder.
 *
 * Products are discovered from the admin's `products` table: any product
 * whose `category_id` points to a builder category in `categories` is
 * automatically shown under the corresponding step. When an admin adds or
 * updates a product under a builder category, it immediately appears in
 * the customer-facing builder — no manual junction-table linking required.
 */

export type BuilderAxis = {
  label: string;
  options: string[];
};

export type BuilderVariant = {
  options?: Record<string, string>;
  retired?: boolean;
  id: string;
  size: string | null;
  color: string | null;
  price: number;
  stock: number;
  available: boolean;
};
export type BuilderProduct = {
  catalogueStock?: number;
  variants?: BuilderVariant[];
  id: string;
  name: string;
  slug: string;
  description: string | null;
  specs: string[];
  price: number;
  compareAtPrice: number | null;
  stock: number;
  image: string | null;
};

export type BuilderStep = {
  stepNumber: number;
  name: string;
  description: string;
  axes: BuilderAxis[];
  notice: string | null;
  /** Products the customer can pick for this step, ordered for display. */
  products: BuilderProduct[];
};

// Raw row shapes returned by the untyped PostgREST client. They are declared
// here so the mapping below stays fully typed (no `any`).
type ImageRow = { url: string; sort_order: number; is_primary: boolean };
type BuilderProductRow = {
  product_variants?: BuilderVariant[];
  id: string;
  name: string;
  slug: string;
  description: string | null;
  specs: string[] | null;
  price: number | string;
  compare_at_price: number | string | null;
  stock: number | string;
  product_images: ImageRow[] | ImageRow | null;
};
type StepRow = {
  step_number: number;
  name: string;
  description: string;
  customization_axes: BuilderAxis[] | null;
  notice: string | null;
};

// ---------------------------------------------------------------------------
// Builder slug → step-number mapping (mirrors categoryConfig.ts stepNumber)
// ---------------------------------------------------------------------------
const SLUG_TO_STEP: Record<string, number> = {
  frameset: 1,
  handlebar: 2,
  stem: 3,
  seatpost: 4,
  saddle: 5,
  wheelset: 6,
  tires: 7,
  "front-derailleur": 8,
  "rear-derailleur": 9,
  crankset: 10,
  cassette: 11,
  chain: 12,
  brakeset: 13,
  rotors: 14,
  pedals: 15,
};

/** PostgREST embeds a to-one relation as a single object, not an array. */
function asArray<T>(value: T[] | T | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function primaryImage(images: ImageRow[] | ImageRow | null): string | null {
  const list = asArray(images).sort((a, b) => a.sort_order - b.sort_order);
  const primary = list.find((image) => image.is_primary) ?? list[0];
  return primary?.url ?? null;
}

function mapProduct(raw: BuilderProductRow): BuilderProduct {
  const variants = (raw.product_variants ?? []).filter((v) => !v.retired).map((v) => ({
    options: legacyOptions(v),
    ...v,
    price: Number(v.price),
    stock: Number(v.stock),
  }));
  const available = variants.filter((v) => v.available && v.stock > 0);
  return {
    variants,
    catalogueStock: Number(raw.stock ?? 0),
    id: String(raw.id),
    name: raw.name,
    slug: raw.slug,
    description: raw.description ?? null,
    specs: raw.specs ?? [],
    price: available.length
      ? Math.min(...available.map((v) => v.price))
      : Number(raw.price),
    compareAtPrice:
      raw.compare_at_price === null || raw.compare_at_price === undefined
        ? null
        : Number(raw.compare_at_price),
    stock: variants.length
      ? Math.min(
          Number(raw.stock ?? 0),
          available.reduce((n, v) => n + v.stock, 0),
        )
      : Number(raw.stock ?? 0),
    image: primaryImage(raw.product_images),
  };
}

// ---------------------------------------------------------------------------
// getBikeBuilderSteps
//
// Products are sourced exclusively from the admin's `products` table — any
// product whose category slug maps to a builder step is automatically shown
// under that step. The `bike_builder_products` junction table is NOT used.
// ---------------------------------------------------------------------------

export async function getBikeBuilderSteps(): Promise<
  QueryResult<BuilderStep[]>
> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  // ------------------------------------------------------------------
  // 1. Fetch step definitions (no product join needed).
  // ------------------------------------------------------------------
  const { data: stepRows, error: stepsError } = await admin
    .from("bike_builder_steps")
    .select("step_number, name, description, customization_axes, notice")
    .order("step_number", { ascending: true });

  if (stepsError) {
    return { data: null, error: toFriendlyDbError(stepsError) };
  }

  const rawSteps = (stepRows as unknown as StepRow[] | null) ?? [];

  const steps: BuilderStep[] = rawSteps.map((s) => ({
    stepNumber: Number(s.step_number),
    name: s.name,
    description: s.description,
    axes: s.customization_axes ?? [],
    notice: s.notice ?? null,
    products: [],
  }));

  const stepByNumber = new Map<number, BuilderStep>();
  for (const step of steps) {
    stepByNumber.set(step.stepNumber, step);
  }

  // ------------------------------------------------------------------
  // 2. Fetch products from the admin's products table by category.
  //    Any product whose category slug maps to a builder step is included.
  // ------------------------------------------------------------------
  const builderSlugs = Object.keys(SLUG_TO_STEP);

  const { data: builderCats } = await admin
    .from("categories")
    .select("id, slug")
    .in("slug", builderSlugs)
    .eq("is_active", true);

  if (builderCats && builderCats.length > 0) {
    const catIdToSlug = new Map<string, string>(
      builderCats.map((c: { id: string; slug: string }) => [c.id, c.slug]),
    );
    const catIds = [...catIdToSlug.keys()];

    const { data: catProducts } = await admin
      .from("products")
      .select(
        "id, name, slug, description, specs, price, compare_at_price, stock, category_id," +
          "product_images(url, sort_order, is_primary),product_variants(id,size,color,options,retired,price,stock,available)",
      )
      .in("category_id", catIds)
      .eq("status", "active");

    if (catProducts && catProducts.length > 0) {
      for (const raw of catProducts) {
        const row = raw as unknown as BuilderProductRow & {
          category_id: string;
        };
        const slug = catIdToSlug.get(row.category_id);
        if (!slug) continue;
        const stepNum = SLUG_TO_STEP[slug];
        if (!stepNum) continue;

        const step = stepByNumber.get(stepNum);
        if (!step) continue;

        step.products.push(mapProduct(row));
      }

      for (const step of steps) {
        step.products.sort((a, b) => a.name.localeCompare(b.name));
      }
    }
  }

  return { data: steps, error: null };
}
