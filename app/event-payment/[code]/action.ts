"use server";

import { revalidatePath } from "next/cache";
import { isOwnProofPath } from "@/lib/storage/proof-path";
import { createClient } from "@/lib/supabase/server";
import { normalizePhMobileNumber } from "@/lib/data/customer/gcash";
import { submitEventGcashPayment } from "@/lib/data/customer/events";

export type SubmitEventPaymentState = {
  error: string | null;
  success: boolean;
};

/** Accepts a private object path. The database transaction rechecks ownership,
 * payment state, and object existence before saving the submission. */
export async function submitEventGcashPaymentAction(
  _prevState: SubmitEventPaymentState | undefined,
  formData: FormData,
): Promise<SubmitEventPaymentState> {
  const supabase = await createClient();
  if (!supabase) {
    return {
      error: "Supabase is not configured. Please refresh and try again.",
      success: false,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: "You must be signed in to submit a payment.",
      success: false,
    };
  }

  const registrationCode = String(
    formData.get("registration_code") ?? "",
  ).trim();
  const senderName = String(formData.get("sender_name") ?? "").trim();
  const phoneNumber = String(formData.get("phone_number") ?? "").trim();
  const referenceNumber = String(formData.get("reference_number") ?? "").trim();
  const screenshotUrl = String(formData.get("screenshot_url") ?? "").trim();

  if (!registrationCode) {
    return { error: "Missing registration reference.", success: false };
  }
  if (!senderName) {
    return { error: "Please enter the sender name.", success: false };
  }
  if (!phoneNumber) {
    return { error: "Please enter your GCash phone number.", success: false };
  }
  if (!screenshotUrl) {
    return {
      error: "Please upload your GCash payment screenshot.",
      success: false,
    };
  }

  if (!isOwnProofPath(screenshotUrl, user.id))
    return {
      error: "Upload a new screenshot using your own account.",
      success: false,
    };

  const normalizedPhone = normalizePhMobileNumber(phoneNumber);
  if (!normalizedPhone)
    return { error: "Enter a valid Philippine mobile number.", success: false };
  const result = await submitEventGcashPayment({
    registrationCode,
    senderName,
    phoneNumber: normalizedPhone,
    referenceNumber: referenceNumber || null,
    screenshotUrl,
  });

  if (result.error) return { error: result.error, success: false };

  revalidatePath(`/event-payment/${registrationCode}`);
  revalidatePath("/my-events");
  return { error: null, success: true };
}
