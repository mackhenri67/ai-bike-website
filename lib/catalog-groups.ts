/** Shared component categories for homepage and product-list Parts filtering. */
export const PART_CATEGORY_SLUGS = new Set([
  "parts", "frameset", "handlebar", "stem", "seatpost", "saddle", "wheelset",
  "tires", "front-derailleur", "rear-derailleur", "crankset", "cassette",
  "chain", "brakeset", "rotors", "pedals",
]);
export function isPartProduct(product: { categorySlug: string | null }): boolean {
  return product.categorySlug !== null && PART_CATEGORY_SLUGS.has(product.categorySlug);
}
