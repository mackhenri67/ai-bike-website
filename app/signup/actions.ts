"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { sanitizeNext } from "@/lib/navigation";
import { upsertCustomerLocation } from "@/lib/data/customer/locations";

export type SignUpState = {
  error: string | null;
  /** True when email confirmation is enabled and the user must click a link. */
  needsEmailConfirmation: boolean;
  message: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Server Action: creates a customer account and saves their delivery
 * location in one flow.
 *
 * When email confirmation is enabled Supabase returns a user without a
 * session; the customer row + saved location are still created so the
 * confirmation link leads straight to a ready account.
 */
export async function customerSignUp(
  prevState: SignUpState | undefined,
  formData: FormData,
): Promise<SignUpState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const phone = String(formData.get("phone") ?? "").trim() || null;
  // Direct /signup visits default to the profile; the cart/checkout flow
  // always passes ?next=/checkout explicitly.
  const next = sanitizeNext(String(formData.get("next") ?? ""), "/profile");

  const label = String(formData.get("label") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim();
  const latitude = Number(formData.get("latitude") ?? NaN);
  const longitude = Number(formData.get("longitude") ?? NaN);

  if (!fullName)
    return {
      error: "Please enter your full name.",
      needsEmailConfirmation: false,
      message: null,
    };
  if (!EMAIL_PATTERN.test(email)) {
    return {
      error: "Please enter a valid email address.",
      needsEmailConfirmation: false,
      message: null,
    };
  }
  if (password.length < 8) {
    return {
      error: "Password must be at least 8 characters long.",
      needsEmailConfirmation: false,
      message: null,
    };
  }
  if (!address) {
    return {
      error: "Please set and confirm your delivery location.",
      needsEmailConfirmation: false,
      message: null,
    };
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return {
      error: "Please set and confirm your delivery location.",
      needsEmailConfirmation: false,
      message: null,
    };
  }

  const supabase = await createClient();
  if (!supabase) {
    return {
      error:
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your environment variables before signing up.",
      needsEmailConfirmation: false,
      message: null,
    };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`,
      data: {
        full_name: fullName,
        phone: phone ?? undefined,
      },
    },
  });

  if (error) {
    console.error("[auth] customer signUp failed:", error.code, error.message);

    if (
      error.code === "user_already_exists" ||
      error.code === "email_taken" ||
      /already registered/i.test(error.message)
    ) {
      return {
        error:
          "An account with this email already exists. Please log in instead.",
        needsEmailConfirmation: false,
        message: null,
      };
    }

    return {
      error: error.message,
      needsEmailConfirmation: false,
      message: null,
    };
  }

  const authUserId = data.user?.id;
  if (!authUserId) {
    return {
      error: "We couldn't create your account. Please try again.",
      needsEmailConfirmation: false,
      message: null,
    };
  }

  // Create the customer directory row + saved location (service-role, idempotent).
  const admin = getAdminClient();
  if (!admin) {
    return {
      error:
        "The admin backend is not configured. Add SUPABASE_SERVICE_ROLE_KEY to your environment variables.",
      needsEmailConfirmation: false,
      message: null,
    };
  }

  let customer = await admin
    .from("customers")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (!customer.data) {
    customer = await admin
      .from("customers")
      .insert({ auth_user_id: authUserId, full_name: fullName, email, phone })
      .select("id")
      .single();
  }
  if (customer.error || !customer.data) {
    return {
      error: "We couldn't save your profile. Please try again.",
      needsEmailConfirmation: false,
      message: null,
    };
  }

  const locationResult = await upsertCustomerLocation(customer.data.id, {
    label,
    address,
    latitude,
    longitude,
  });
  if (locationResult.error) {
    return {
      error: locationResult.error,
      needsEmailConfirmation: false,
      message: null,
    };
  }

  if (data.session) {
    redirect(next);
  }

  return {
    error: null,
    needsEmailConfirmation: true,
    message:
      "Almost done! We've saved your details and delivery location. Confirm your email address, then sign in to continue to checkout.",
  };
}
