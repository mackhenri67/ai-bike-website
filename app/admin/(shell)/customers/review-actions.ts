"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { getAdminClient } from "@/lib/supabase/admin";

export async function removeBuildReview(
  reviewId: string,
): Promise<{ error: string | null }> {
  await requireAdmin();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reviewId))
    return { error: "Invalid review reference." };

  const admin = getAdminClient();
  if (!admin) return { error: "The review service is not configured." };

  const { data: review, error: readError } = await admin
    .from("customer_build_reviews")
    .select("id,image_path")
    .eq("id", reviewId)
    .maybeSingle();
  if (readError || !review)
    return { error: "This review could not be found. Refresh and try again." };

  const { error: deleteError } = await admin
    .from("customer_build_reviews")
    .delete()
    .eq("id", reviewId);
  if (deleteError)
    return { error: "The review could not be removed. Please try again." };

  if (review.image_path) {
    await admin.storage.from("customer-build-reviews").remove([review.image_path]);
  }

  revalidatePath("/admin/customers");
  revalidatePath("/");
  revalidatePath("/profile");
  return { error: null };
}
