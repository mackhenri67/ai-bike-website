import "server-only";

import { getAdminClient } from "@/lib/supabase/admin";

export type CustomerBuildReviewSummary = {
  id: string;
  status: "pending" | "approved" | "rejected";
  rating: number;
  review_text: string;
  image_url: string | null;
  admin_note: string | null;
};

export type AdminBuildReview = CustomerBuildReviewSummary & {
  order_id: string;
  order_number: string;
  customer_id: string;
  customer_name: string;
  customer_email: string | null;
  created_at: string;
};

type ReviewRow = {
  id: string;
  order_id: string;
  customer_id: string;
  rating: number;
  review_text: string;
  image_path: string;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  public_display_name: string;
  created_at: string;
};

async function signedImageUrl(path: string): Promise<string | null> {
  const admin = getAdminClient();
  if (!admin || !path) return null;
  const { data, error } = await admin.storage
    .from("customer-build-reviews")
    .createSignedUrl(path, 60 * 60);
  return error ? null : data.signedUrl;
}

export async function listCustomerBuildReviews(
  customerId: string,
): Promise<Map<string, CustomerBuildReviewSummary>> {
  const admin = getAdminClient();
  if (!admin) return new Map();

  const { data, error } = await admin
    .from("customer_build_reviews")
    .select("id,order_id,customer_id,rating,review_text,image_path,status,admin_note,public_display_name,created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error || !data) return new Map();

  const rows = data as ReviewRow[];
  const entries = await Promise.all(rows.map(async (row) => [
    row.order_id,
    {
      id: row.id,
      status: row.status,
      rating: Number(row.rating),
      review_text: row.review_text,
      image_url: await signedImageUrl(row.image_path),
      admin_note: row.admin_note,
    } satisfies CustomerBuildReviewSummary,
  ] as const));

  return new Map(entries);
}

export async function listApprovedBuildReviews(limit = 12): Promise<Array<{
  id: string;
  rating: number;
  review_text: string;
  image_url: string | null;
  display_name: string;
  created_at: string;
}>> {
  const admin = getAdminClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("customer_build_reviews")
    .select("id,rating,review_text,image_path,public_display_name,created_at")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 30));

  if (error || !data) return [];

  return Promise.all((data as Array<{
    id: string; rating: number; review_text: string; image_path: string;
    public_display_name: string; created_at: string;
  }>).map(async (row) => ({
    id: row.id,
    rating: Number(row.rating),
    review_text: row.review_text,
    image_url: await signedImageUrl(row.image_path),
    display_name: row.public_display_name,
    created_at: row.created_at,
  })));
}

export async function listAdminBuildReviews(): Promise<AdminBuildReview[]> {
  const admin = getAdminClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("customer_build_reviews")
    .select("id,order_id,customer_id,rating,review_text,image_path,status,admin_note,public_display_name,created_at")
    .order("created_at", { ascending: false });

  if (error || !data || data.length === 0) return [];

  const rows = data as ReviewRow[];
  const customerIds = [...new Set(rows.map((row) => row.customer_id))];
  const orderIds = [...new Set(rows.map((row) => row.order_id))];

  const [{ data: customers }, { data: orders }] = await Promise.all([
    admin.from("customers").select("id,full_name,email").in("id", customerIds),
    admin.from("orders").select("id,order_number").in("id", orderIds),
  ]);

  const customerMap = new Map((customers ?? []).map((row) => [row.id, row]));
  const orderMap = new Map((orders ?? []).map((row) => [row.id, row]));

  return Promise.all(rows.map(async (row) => {
    const customer = customerMap.get(row.customer_id);
    const order = orderMap.get(row.order_id);
    return {
      id: row.id,
      order_id: row.order_id,
      customer_id: row.customer_id,
      customer_name: customer?.full_name ?? "Customer",
      customer_email: customer?.email ?? null,
      order_number: order?.order_number ?? "Order unavailable",
      rating: Number(row.rating),
      review_text: row.review_text,
      image_url: await signedImageUrl(row.image_path),
      admin_note: row.admin_note,
      status: row.status,
      created_at: row.created_at,
    };
  }));
}
