/**
 * Shared result envelope returned by every admin data-access function.
 * `error` is a human-readable message (null on success).
 */
export type QueryResult<T> = {
  data: T | null;
  error: string | null;
};

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductStatus = "draft" | "active" | "inactive" | "archived";

export type ProductImageRow = {
  id: string;
  product_id: string;
  url: string;
  alt: string | null;
  sort_order: number;
  is_primary: boolean;
};

export type ProductVariantRow = {
  options?: Record<string, string>;
  retired?: boolean;
  id: string;
  product_id: string;
  sku: string | null;
  name: string | null;
  size: string | null;
  color: string | null;
  price: number;
  stock: number;
  available: boolean;
  sort_order: number;
};

export type ProductRow = {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  sku: string | null;
  description: string | null;
  tagline: string[];
  specs: string[];
  price: number;
  compare_at_price: number | null;
  cost: number | null;
  stock: number;
  status: ProductStatus;
  is_featured: boolean;
  is_new_arrival: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  category?: Pick<CategoryRow, "id" | "name" | "slug"> | null;
  product_images?: ProductImageRow[];
  product_variants?: ProductVariantRow[];
};

export type CustomerRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  status: "active" | "inactive";
  /** Supabase Auth user id — set for self-service signups (null for
   *  admin-created walk-in customers). */
  auth_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderStatus = "pending" | "shipping" | "completed" | "cancelled";
export type PaymentMethod = "gcash" | "cod";
export type PaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "refunded"
  | "rejected";

export type OrderItemRow = {
  product?: { product_images?: { url: string; is_primary: boolean; sort_order: number }[] } | null;
  id: string;
  order_id: string;
  product_id: string | null;
  product_variant_id: string | null;
  product_name: string;
  size: string | null;
  color: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
};

export type OrderRow = {
  id: string;
  order_number: string;
  customer_id: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  shipping_address: string | null;
  /** Delivery coordinates snapshotted onto the order when it was placed
   *  (migration 0006). Null for walk-in orders or orders placed before the
   *  column existed — the admin Location view falls back to a Maps link. */
  shipping_latitude: number | null;
  shipping_longitude: number | null;
  subtotal: number;
  shipping_fee: number;
  discount: number;
  total: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  status: OrderStatus;
  payment_reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  order_items?: OrderItemRow[];
  /** Linked GCash submission (admin list query only) — null/absent for COD. */
  gcash_payments?: GcashPaymentRow | GcashPaymentRow[] | null;
};

/** A GCash payment submission attached to an order. */
export type GcashPaymentRow = {
  id: string;
  order_id: string;
  sender_name: string;
  phone_number: string;
  reference_number: string | null;
  screenshot_url: string;
  status: "pending" | "paid" | "rejected";
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

/** Singleton merchant GCash configuration shown to customers at payment time. */
export type GcashSettingsRow = {
  id: boolean;
  qr_code_url: string | null;
  gcash_number: string | null;
  updated_at: string;
};

export type DashboardStats = {
  newOrders: number;
  processingOrders: number;
  totalProducts: number;
  todaySales: number;
  lowStockCount: number;
  /** Soonest upcoming (published) event, if any. */
  nextEvent: {
    id: string;
    title: string;
    slug: string;
    eventDate: string;
    capacity: number;
    slotsBooked: number;
  } | null;
  /** Total event sign-ups still awaiting GCash payment verification. */
  pendingSignups: number;
  /** Count of draft events not yet published. */
  draftEvents: number;
  /** Count of products that are out of stock. */
  outOfStock: number;
};

/** Product payload sent from the admin Products form (server action input). */
export type ProductInput = {
  expected_stock?: number;
  id?: string | null;
  category_id: string | null;
  name: string;
  slug: string;
  sku: string | null;
  description: string | null;
  tagline: string[];
  specs: string[];
  price: number;
  compare_at_price: number | null;
  cost: number | null;
  stock: number;
  status: ProductStatus;
  is_featured: boolean;
  is_new_arrival: boolean;
  sort_order: number;
  images: { url: string; alt: string | null }[];
  variants: {
    id?: string;
    expected_stock?: number;
    options: Record<string, string>;
    sku: string | null;
    size: string | null;
    color: string | null;
    price: number;
    stock: number;
    available: boolean;
  }[];
};

/** Category payload sent from the admin Categories form. */
export type CategoryInput = {
  id?: string | null;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

export type EventStatus = "draft" | "published" | "cancelled";

export type EventCategory =
  | "Fun Ride"
  | "Race"
  | "Charity Ride"
  | "Workshop"
  | "Meetup";

/** A cycling event shown to customers (and managed by the admin). */
export type EventRow = {
  id: string;
  event_code: string;
  slug: string;
  title: string;
  category: string;
  description: string | null;
  event_date: string;
  end_date: string | null;
  location: string;
  banner_image_url: string | null;
  price: number;
  capacity: number;
  slots_booked: number;
  organizer: string | null;
  status: EventStatus;
  created_at: string;
  updated_at: string;
};

export type RegistrationPaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "refunded"
  | "rejected";

export type RegistrationStatus = "registered" | "cancelled";

/** A customer's sign-up for an event, including the GCash payment proof. */
export type EventRegistrationRow = {
  id: string;
  registration_code: string;
  event_id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  rider_name: string;
  plate_number: string | null;
  category: string | null;
  amount_paid: number;
  payment_method: "gcash" | "cod";
  payment_status: RegistrationPaymentStatus;
  status: RegistrationStatus;
  proof_screenshot_url: string | null;
  reference_number?: string | null;
  payment_sender_name?: string | null;
  payment_phone_number?: string | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
  /** Populated by the customer/admin detail queries. */
  event?: Pick<
    EventRow,
    | "id"
    | "slug"
    | "title"
    | "category"
    | "event_date"
    | "location"
    | "banner_image_url"
  > | null;
};

/** A customer profile enriched with their event registrations (read path). */
export type CustomerProfileWithEvents = {
  customer: CustomerRow;
  location: import("@/lib/data/customer/types").CustomerLocation | null;
  orders: OrderRow[];
  registrations: EventRegistrationRow[];
};

/**
 * Event payload sent from the admin Events form (server action input).
 * Field names mirror the DB columns for a straightforward upsert mapping.
 */
export type EventInput = {
  id?: string | null;
  event_code?: string | null;
  title: string;
  slug: string;
  category: string;
  description: string | null;
  location: string;
  organizer: string | null;
  event_date: string;
  price: number;
  capacity: number;
  banner_image_url: string | null;
  status: EventStatus;
};
