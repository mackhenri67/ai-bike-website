"use server";

import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/auth/guards";
import { getAdminClient } from "@/lib/supabase/admin";
import { getCustomerByAuthUserId } from "@/lib/data/customer/customers";

export type ReviewActionResult = { error: string | null; success: boolean };

export async function submitBuildReview(formData: FormData): Promise<ReviewActionResult> {
  const user = await requireCustomer();
  const admin = getAdminClient();
  if (!admin) return { error: "The review service is not configured.", success: false };

  const orderId = String(formData.get("orderId") ?? "");
  const rating = Number(formData.get("rating"));
  const reviewText = String(formData.get("reviewText") ?? "").trim();
  const consent = formData.get("publicConsent") === "on";
  const file = formData.get("photo");

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId))
    return { error: "The order reference is invalid.", success: false };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    return { error: "Choose a rating from 1 to 5 stars.", success: false };
  if (reviewText.length < 5 || reviewText.length > 600)
    return { error: "Write a review between 5 and 600 characters.", success: false };
  if (!consent)
    return { error: "Please confirm that your approved review and photo may be displayed publicly.", success: false };
  if (!(file instanceof File) || file.size < 1 || file.size > 5 * 1024 * 1024)
    return { error: "Upload one JPG, PNG, or WebP photo up to 5 MB.", success: false };
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    return { error: "Only JPG, PNG, and WebP photos are supported.", success: false };

  const customer = await getCustomerByAuthUserId(user.id);
  if (!customer) return { error: "Customer account not found.", success: false };

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id,customer_id,status,custom_build_id")
    .eq("id", orderId)
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (orderError || !order || !order.custom_build_id)
    return { error: "This order is not an eligible custom build.", success: false };
  if (order.status !== "completed")
    return { error: "You can review a custom build after the order is marked completed.", success: false };

  const { data: existing, error: existingError } = await admin
    .from("customer_build_reviews")
    .select("id,status,image_path")
    .eq("order_id", orderId)
    .maybeSingle();
  if (existingError) return { error: "Could not check your previous review. Try again.", success: false };
  if (existing && existing.status !== "rejected")
    return { error: "A review has already been submitted for this build.", success: false };

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const objectPath = `${user.id}/${orderId}/${crypto.randomUUID()}.${extension}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from("customer-build-reviews")
    .upload(objectPath, bytes, { contentType: file.type, upsert: false });
  if (uploadError) return { error: "The build photo could not be uploaded. Please try again.", success: false };

  const nameParts = customer.full_name.trim().split(/\s+/).filter(Boolean);
  const displayName = nameParts.length > 1
    ? `${nameParts[0]} ${nameParts[nameParts.length - 1][0]}.`
    : nameParts[0] || "LNR Customer";

  const payload = {
    order_id: order.id,
    custom_build_id: order.custom_build_id,
    customer_id: customer.id,
    rating,
    review_text: reviewText,
    image_path: objectPath,
    status: "pending",
    admin_note: null,
    public_display_name: displayName,
    reviewed_at: null,
    reviewed_by: null,
    updated_at: new Date().toISOString(),
  };

  const result = existing
    ? await admin.from("customer_build_reviews").update(payload).eq("id", existing.id)
    : await admin.from("customer_build_reviews").insert(payload);

  if (result.error) {
    await admin.storage.from("customer-build-reviews").remove([objectPath]);
    return { error: result.error.code === "23505" ? "A review already exists for this build." : "Your review could not be saved. Please try again.", success: false };
  }

  if (existing?.image_path) {
    await admin.storage.from("customer-build-reviews").remove([existing.image_path]);
  }

  revalidatePath("/profile");
  revalidatePath("/admin/customers");
  revalidatePath("/");
  return { error: null, success: true };
}
