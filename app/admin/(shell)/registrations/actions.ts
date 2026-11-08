"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import {
  reviewRegistrationPayment,
  updateRegistrationStatus,
} from "@/lib/data/admin/events";
import type { RegistrationStatus } from "@/lib/data/types";

export type RegistrationReviewDecision = "paid" | "rejected";

export async function reviewRegistrationAction(
  registrationId: string,
  decision: RegistrationReviewDecision,
  reason?: string | null,
): Promise<{ error: string | null }> {
  const user = await requireAdmin();

  if (decision !== "paid" && decision !== "rejected") {
    return { error: "Invalid review decision." };
  }

  const result = await reviewRegistrationPayment({
    registrationId,
    decision,
    reviewerId: user.id,
    reason: decision === "rejected" ? reason : null,
  });
  if (result.error) return { error: result.error };

  revalidatePath("/admin/registrations");
  revalidatePath("/admin/dashboard");
  revalidatePath("/my-events");

  return { error: null };
}

const VALID_STATUS: RegistrationStatus[] = ["registered", "cancelled"];

export async function updateRegistrationStatusAction(
  registrationId: string,
  status: RegistrationStatus,
): Promise<{ error: string | null }> {
  const admin = await requireAdmin();

  if (!VALID_STATUS.includes(status)) {
    return { error: "Invalid registration status." };
  }

  const result = await updateRegistrationStatus(
    registrationId,
    status,
    admin.id,
  );
  if (result.error) return { error: result.error };

  revalidatePath("/admin/registrations");
  revalidatePath("/my-events");

  return { error: null };
}
