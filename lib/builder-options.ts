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
  const available = product.variants.filter((v) => v.available && v.stock > 0);
  const sizes = [
    ...new Set(
      available.map((v) => v.size).filter((v): v is string => Boolean(v)),
    ),
  ];
  const colors = [
    ...new Set(
      available.map((v) => v.color).filter((v): v is string => Boolean(v)),
    ),
  ];
  return [
    ...(sizes.length ? [{ label: "Size", options: sizes }] : []),
    ...(colors.length ? [{ label: "Color", options: colors }] : []),
  ];
}
export function builderVariant(
  product: BuilderProduct,
  options: Record<string, string>,
) {
  return product.variants?.find(
    (v) =>
      v.available &&
      v.stock > 0 &&
      (v.size ?? "") === (options.Size ?? "") &&
      (v.color ?? "") === (options.Color ?? ""),
  );
}
