import "server-only";

/** A saved delivery location belonging to a customer account. */
export type CustomerLocation = {
  id: string;
  customer_id: string;
  label: string | null;
  address: string;
  latitude: number;
  longitude: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

/** Fields a client may send when saving/updating a location. */
export type CustomerLocationInput = {
  label: string | null;
  address: string;
  latitude: number;
  longitude: number;
};

/** A single line on the checkout page before it becomes an order row. */
export type CheckoutLineInput = {
  productId: string;
  variantId?: string;
  options?: Record<string, string>;
  builderStepNumber?: number;
  /** Product slug, used as a fallback lookup when `productId` is missing. */
  slug?: string;
  name: string;
  price: number;
  size: string;
  color: string;
  quantity: number;
};
