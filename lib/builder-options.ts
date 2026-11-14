import { legacyOptions, optionAxes, optionKey } from "@/lib/product-options";
import type {
  BuilderAxis,
  BuilderProduct,
  BuilderStep,
} from "@/lib/data/customer/bike-builder";
export function builderAxes(
  step: BuilderStep,
  product?: BuilderProduct,
): BuilderAxis[] {
  if (!product?.variants?.length) return step.axes;
  return optionAxes(product.variants.filter((v) => v.available && v.stock > 0).map((v) => ({ options: legacyOptions(v) })));

}
export function builderVariant(
  product: BuilderProduct,
  options: Record<string, string>,
) {
  return product.variants?.find((v) => v.available && v.stock > 0 && optionKey(legacyOptions(v)) === optionKey(options));
}


/**
 * Calculates the lowest complete build price from the current catalogue.
 * Each customer-facing builder step contributes its cheapest in-stock
 * product. A missing category makes a complete starting price unavailable.
 * Variant products already expose their cheapest available variant as price
 * from getBikeBuilderSteps().
 */
export function builderStartingPrice(steps: BuilderStep[]): number | null {
  if (steps.length === 0) return null;

  let total = 0;
  for (const step of steps) {
    const prices = step.products
      .filter(
        (product) =>
          Number.isFinite(product.price) &&
          product.price >= 0 &&
          Number.isFinite(product.stock) &&
          product.stock > 0,
      )
      .map((product) => product.price);

    if (prices.length === 0) return null;
    total += Math.min(...prices);
  }

  return Number.isFinite(total) ? total : null;
}
