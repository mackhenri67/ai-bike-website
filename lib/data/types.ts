/** Shared result envelope returned by every admin data-access function. */
export type QueryResult<T> = { data: T | null; error: string | null };
export type CategoryRow = {
  customization_axes?: import("@/components/admin/products/categoryConfig").CategoryAxis[] | null;
  id: string; name: string; slug: string; description: string | null; sort_order: number;
  is_active: boolean; created_at: string; updated_at: string;
};
export type ProductStatus = "draft" | "active" | "inactive" | "archived";
export type ProductImageRow = { id: string; product_id: string; url: string; alt: string | null; sort_order: number; is_primary: boolean };
export type ProductVariantRow = {
  options?: Record<string, string>; retired?: boolean; id: string; product_id: string; sku: string | null;
  name: string | null; size: string | null; color: string | null; price: number; stock: number; available: boolean; sort_order: number;
};
export type ProductRow = {
  id: string; category_id: string | null; name: string; slug: string; sku: string | null; description: string | null;
  tagline: string[]; specs: string[]; price: number; compare_at_price: number | null; cost: number | null; stock: number;
  status: ProductStatus; is_featured: boolean; is_new_arrival: boolean; sort_order: number; created_at: string; updated_at: string;
  category?: Pick<CategoryRow, "id" | "name" | "slug"> | null; product_images?: ProductImageRow[]; product_variants?: ProductVariantRow[];
};
export type CustomerRow = {
  id: string; full_name: string; email: string | null; phone: string | null; address: string | null; notes: string | null;
  status: "active" | "inactive"; auth_user_id: string | null; created_at: string; updated_at: string;
};
export type OrderStatus = "pending" | "shipping" | "completed" | "cancelled";
export type PaymentMethod = "gcash" | "cod" | "cash";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded" | "rejected";
export type OrderItemRow = {
  is_custom_item?: boolean;
  product?: { product_images?: { url: string; is_primary: boolean; sort_order: number }[] } | null;
  id: string; order_id: string; product_id: string | null; product_variant_id: string | null; product_name: string;
  size: string | null; color: string | null; unit_price: number; quantity: number; line_total: number;
};
export type OrderRow = {
  sale_channel?: "online" | "in_store"; recorded_by?: string | null;
  payment_receipt?: { url: string | null; sender: string | null; reference: string | null; status: string } | null;
  custom_build_id?: string | null;
  build_review?: { id: string; status: "pending" | "approved" | "rejected"; rating: number; review_text: string; image_url: string | null; admin_note: string | null } | null;
  id: string; order_number: string; customer_id: string | null; customer_name: string; customer_email: string | null;
  customer_phone: string | null; shipping_address: string | null; shipping_latitude: number | null; shipping_longitude: number | null;
  subtotal: number; shipping_fee: number; discount: number; total: number; payment_method: PaymentMethod; payment_status: PaymentStatus;
  status: OrderStatus; payment_reference: string | null; notes: string | null; created_at: string; updated_at: string;
  order_items?: OrderItemRow[]; gcash_payments?: GcashPaymentRow | GcashPaymentRow[] | null;
};
export type GcashPaymentRow = {
  id: string; order_id: string; sender_name: string; phone_number: string; reference_number: string | null;
  screenshot_url: string; status: "pending" | "paid" | "rejected"; rejection_reason: string | null;
  created_at: string; reviewed_at: string | null; reviewed_by: string | null;
};
export type GcashSettingsRow = { id: boolean; qr_code_url: string | null; gcash_number: string | null; updated_at: string };
export type DashboardStats = {
  newOrders: number; processingOrders: number; totalProducts: number; todaySales: number; lowStockCount: number;
  nextEvent: { id: string; title: string; slug: string; eventDate: string; capacity: number; slotsBooked: number } | null;
  pendingSignups: number; draftEvents: number; outOfStock: number;
};
export type ProductInput = {
  expected_stock?: number; id?: string | null; category_id: string | null; name: string; slug: string; sku: string | null;
  description: string | null; tagline: string[]; specs: string[]; price: number; compare_at_price: number | null; cost: number | null;
  stock: number; status: ProductStatus; is_featured: boolean; is_new_arrival: boolean; sort_order: number;
  images: { url: string; alt: string | null }[];
  variants: { id?: string; expected_stock?: number; options: Record<string, string>; sku: string | null; size: string | null; color: string | null; price: number; stock: number; available: boolean }[];
};
export type CategoryInput = { id?: string | null; name: string; slug: string; description: string | null; sort_order: number; is_active: boolean };
export type EventStatus = "draft" | "published" | "cancelled";
export type EventCategory = "Fun Ride" | "Race" | "Charity Ride" | "Workshop" | "Meetup";
/** One selectable ticket type and its fee for an event. */
export type EventRegistrationCategory = { name: string; price: number };
export type EventRow = {
  id: string; event_code: string; slug: string; title: string; category: string; description: string | null;
  event_date: string; end_date: string | null; location: string; banner_image_url: string | null; price: number;
  registration_categories: EventRegistrationCategory[]; capacity: number; slots_booked: number; organizer: string | null;
  status: EventStatus; created_at: string; updated_at: string;
};
export type RegistrationPaymentStatus = "pending" | "paid" | "failed" | "refunded" | "rejected";
export type RegistrationStatus = "registered" | "cancelled";
export type EventRegistrationRow = {
  emergency_contact?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  id: string; registration_code: string; event_id: string; customer_id: string; customer_name: string; customer_email: string | null;
  customer_phone: string | null; rider_name: string; plate_number: string | null; category: string | null; amount_paid: number;
  payment_method: "gcash" | "cod"; payment_status: RegistrationPaymentStatus; status: RegistrationStatus;
  proof_screenshot_url: string | null; reference_number?: string | null; payment_sender_name?: string | null;
  payment_phone_number?: string | null; rejection_reason: string | null; reviewed_at: string | null; reviewed_by: string | null;
  created_at: string; updated_at: string;
  event?: Pick<EventRow, "id" | "slug" | "title" | "category" | "event_date" | "location" | "banner_image_url"> | null;
};
export type CustomerProfileWithEvents = {
  customer: CustomerRow;
  location: import("@/lib/data/customer/types").CustomerLocation | null;
  orders: OrderRow[];
  registrations: EventRegistrationRow[];
};
export type EventInput = {
  id?: string | null; event_code?: string | null; title: string; slug: string; category: string; description: string | null;
  location: string; organizer: string | null; event_date: string; price: number; capacity: number;
  banner_image_url: string | null; status: EventStatus; registration_categories: EventRegistrationCategory[];
};
