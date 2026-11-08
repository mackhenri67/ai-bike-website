"use server";

import { redirect } from "next/navigation";
import { isOwnProofPath } from "@/lib/storage/proof-path";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateCustomer } from "@/lib/data/customer/customers";
import {
  normalizePhMobileNumber,
  submitGcashPayment,
} from "@/lib/data/customer/gcash";

export type SubmitGcashState = {
  error: string | null;
};

/** Accepts a private object path. The database transaction rechecks ownership,
 * payment state, and object existence before saving the submission. */
export async function submitGcashPaymentAction(
  prevState: SubmitGcashState | undefined,
  formData: FormData,
): Promise<SubmitGcashState> {
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
    return { error: "You must be signed in to submit a payment." };
  }

  const customer = await getOrCreateCustomer(user);
  if (!customer) {
    return {
      error: "We couldn't load your customer account. Please try again.",
    };
  }

  const orderId = String(formData.get("order_id") ?? "").trim();
  const orderNumber = String(formData.get("order_number") ?? "").trim();
  const senderName = String(formData.get("sender_name") ?? "").trim();
  const phoneNumber = String(formData.get("phone_number") ?? "").trim();
  const referenceNumber = String(formData.get("reference_number") ?? "").trim();
  const screenshotUrl = String(formData.get("screenshot_url") ?? "").trim();

  if (!orderId || !orderNumber) {
    return {
      error: "The order could not be identified. Please go back and try again.",
    };
  }
  if (!senderName) {
    return { error: "Please enter your full name." };
  }
  const normalizedPhone = normalizePhMobileNumber(phoneNumber);
  if (!normalizedPhone) {
    return {
      error:
        "Please enter a valid Philippine mobile number (e.g. 0917 123 4567).",
    };
  }
  if (!screenshotUrl) {
    return { error: "Please upload a screenshot of your GCash payment." };
  }

  if (!isOwnProofPath(screenshotUrl, user.id))
    return { error: "Upload a new screenshot using your own account." };

  const result = await submitGcashPayment({
    orderId,
    customerId: customer.id,
    senderName,
    phoneNumber: normalizedPhone,
    referenceNumber: referenceNumber || null,
    screenshotUrl,
  });

  if (result.error) {
    return { error: result.error };
  }

  redirect(`/gcash-payment/${encodeURIComponent(orderNumber)}`);
}
