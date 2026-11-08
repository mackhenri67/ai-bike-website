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
