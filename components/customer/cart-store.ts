/**
 * Pure cart model for the customer storefront. Kept separate from the React
 * components so quantity / selection / totals logic is reusable and shared by
 * the product detail page, the header badge and the cart page.
 */

export type CartItem = {
  /** Unique line key — product + size + color. */
  key: string;
  productId: string;
  variantId?: string;
  options?: Record<string, string>;
  builderStepNumber?: number;
  name: string;
  price: number;
  image: string;
  size: string;
  color: string;
  quantity: number;
  /** Max purchasable quantity for this line (product-level stock). A value
   *  < 1 means "no cap" (e.g. variant-only products where the product-level
   *  stock is not the binding constraint, or legacy persisted carts that
   *  predate this field). */
  stock: number;
  selected: boolean;
};

export type AddToCartInput = {
  productId: string;
  variantId?: string;
  options?: Record<string, string>;
  builderStepNumber?: number;
  name: string;
  price: number;
  image: string;
  size: string;
  color: string;
  quantity: number;
  /** Max purchasable quantity for this line (product-level stock); see CartItem.stock. */
  stock: number;
};

export const SHIPPING_FEE = 190;

/**
 * A brand-new visitor starts with an empty cart. Contents are restored from
 * localStorage (guest carts) or the customer's saved cart in the database once
 * they sign in — no hardcoded items are ever pre-populated.
 */
export const DEFAULT_CART_ITEMS: CartItem[] = [];

/** Philippine Peso formatting, e.g. ₱3,500.00 — always two decimals. */
export function formatCurrency(value: number): string {
  return `₱${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function lineKey(
  productId: string,
  size: string,
  color: string,
): string {
  return `${productId}::${size}::${color}`;
}

export function calculateSubtotal(items: CartItem[]): number {
  let sum = 0;
  for (const item of items) {
    if (item.selected) sum += item.price * item.quantity;
  }
  return sum;
}

export function calculateTotal(subtotal: number): number {
  return subtotal + SHIPPING_FEE;
}

/** Number of selected product lines (not their quantities). */
export function selectedItemCount(items: CartItem[]): number {
  let count = 0;
  for (const item of items) {
    if (item.selected) count += 1;
  }
  return count;
}

export function toggleItemSelection(
  items: CartItem[],
  key: string,
): CartItem[] {
  return items.map((item) =>
    item.key === key ? { ...item, selected: !item.selected } : item,
  );
}

export function toggleSelectAll(items: CartItem[]): CartItem[] {
  const allSelected = items.length > 0 && items.every((item) => item.selected);
  return items.map((item) => ({ ...item, selected: !allSelected }));
}

export function incrementQuantity(items: CartItem[], key: string): CartItem[] {
  return items.map((item) =>
    item.key === key
      ? {
          ...item,
          // Never exceed the line's stock cap (when one is known).
          quantity:
            item.stock > 0 && item.quantity >= item.stock
              ? item.quantity
              : item.quantity + 1,
        }
      : item,
  );
}

export function decrementQuantity(items: CartItem[], key: string): CartItem[] {
  return items.map((item) =>
    item.key === key
      ? { ...item, quantity: Math.max(1, item.quantity - 1) }
      : item,
  );
}

export function removeItem(items: CartItem[], key: string): CartItem[] {
  return items.filter((item) => item.key !== key);
}

/**
 * Adds a product line, merging into an existing line with the same
 * product + size + color so items are never duplicated.
 */
export function addToCart(
  items: CartItem[],
  input: AddToCartInput,
): CartItem[] {
  const key = lineKey(input.productId, input.size, input.color);
  const existingIndex = items.findIndex((item) => item.key === key);
  if (existingIndex === -1) {
    return [
      ...items,
      {
        key,
        productId: input.productId,
        variantId: input.variantId,
        options: input.options,
        builderStepNumber: input.builderStepNumber,
        name: input.name,
        price: input.price,
        image: input.image,
        size: input.size,
        color: input.color,
        quantity: input.quantity,
        stock: input.stock,
        selected: true,
      },
    ];
  }
  return items.map((item, index) =>
    index === existingIndex
      ? {
          ...item,
          price: input.price,
          stock: input.stock,
          variantId: input.variantId,
          options: input.options,
          builderStepNumber: input.builderStepNumber,
          // Re-adding refreshes the line with the current catalogue values.
          quantity:
            input.stock > 0 && item.quantity + input.quantity > input.stock
              ? input.stock
              : item.quantity + input.quantity,
          selected: true,
        }
      : item,
  );
}
