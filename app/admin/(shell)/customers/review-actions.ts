"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { getAdminClient } from "@/lib/supabase/admin";

export async function moderateBuildReview(
  reviewId: string,
  status: "approved" | "rejected",
  note = "",
): Promise<{ error: string | null }> {
  const adminUser = await requireAdmin();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reviewId))
    return { error: "Invalid review reference." };
  if (note.length > 300) return { error: "Admin note must be 300 characters or fewer." };
  const admin = getAdminClient();
  if (!admin) return { error: "The review service is not configured." };

  const { error } = await admin
    .from("customer_build_reviews")
    .update({
      status,
      admin_note: note.trim() || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminUser.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reviewId);

  if (error) return { error: "The review could not be updated. Please refresh and try again." };
  revalidatePath("/admin/customers");
  revalidatePath("/");
  revalidatePath("/profile");
  return { error: null };
}
