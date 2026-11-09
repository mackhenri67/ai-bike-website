"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isEventProofPath } from "@/lib/storage/proof-path";
import { createClient } from "@/lib/supabase/server";
import { normalizePhMobileNumber } from "@/lib/data/customer/gcash";
import { submitEventGcashPayment } from "@/lib/data/customer/events";

export type SubmitEventPaymentState = {
  error: string | null;
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
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: "You must be signed in to submit a payment.",
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
    return { error: "Missing registration reference." };
  }
  if (!senderName) {
    return { error: "Please enter the sender name." };
  }
  if (!phoneNumber) {
    return { error: "Please enter your GCash phone number." };
  }
  if (!screenshotUrl) {
    return {
      error: "Please upload your GCash payment screenshot.",
    };
  }

  if (!isEventProofPath(screenshotUrl, user.id, registrationCode))
    return {
      error: "Upload your GCash receipt using this registration's payment form.",
    };

  const normalizedPhone = normalizePhMobileNumber(phoneNumber);
  if (!normalizedPhone)
    return { error: "Enter a valid Philippine mobile number." };
  const result = await submitEventGcashPayment({
    registrationCode,
    senderName,
    phoneNumber: normalizedPhone,
    referenceNumber: referenceNumber || null,
    screenshotUrl,
  });

  if (result.error) return { error: result.error };

  revalidatePath(`/event-payment/${registrationCode}`);
  revalidatePath("/my-events");
  revalidatePath("/profile");
  redirect(`/event-payment/${encodeURIComponent(registrationCode)}/confirmation`);
}
