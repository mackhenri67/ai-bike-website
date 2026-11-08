"use server";

import { isAdmin } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sanitizeNext } from "@/lib/navigation";
import { getOrCreateCustomer } from "@/lib/data/customer/customers";
import { getCustomerDefaultLocation } from "@/lib/data/customer/locations";

export type LoginState = {
  error: string | null;
};

export type ForgotState = {
  status: "idle" | "sending" | "sent" | "error";
  message: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Server Action: signs a customer in with email + password.
 *
 * After a successful sign-in the customer directory row is ensured
 * (walk-ins are backfilled) and — because checkout requires a saved
 * delivery location — the customer is routed to `/location` when they
 * have not set one yet.
 */
export async function customerLogin(
  prevState: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  // Direct /login visits default to the profile; the cart/checkout flow
  // always passes ?next=/checkout explicitly.
  const next = sanitizeNext(String(formData.get("next") ?? ""), "/profile");

  if (!email || !password) {
    return { error: "Please enter your email address and password." };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Please enter a valid email address." };
  }

  const supabase = await createClient();
  if (!supabase) {
    return {
      error:
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your environment variables before signing in.",
    };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error(
      "[auth] customer signInWithPassword failed:",
      error.code,
      error.message,
    );

    if (
      error.code === "email_not_confirmed" ||
      /email not confirmed/i.test(error.message)
    ) {
      return {
        error:
          "Your email address has not been confirmed yet. Check your inbox for the confirmation link.",
      };
    }

    return { error: "Invalid email or password. Please try again." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error:
        "We couldn't load your account after signing in. Please try again.",
    };
  }

  if (isAdmin(user)) {
    await supabase.auth.signOut({ scope: "local" });
    return {
      error:
        "This is an administrator account. Use /admin/login or a separate customer account.",
    };
  }
  const customer = await getOrCreateCustomer(user);
  const location = customer
    ? await getCustomerDefaultLocation(customer.id)
    : null;

  if (!location) {
    redirect(`/location?next=${encodeURIComponent(next)}`);
  }

  redirect(next);
}

/**
 * Server Action: sends a customer password reset email through Supabase
 * Auth. Used from the "Forgot password?" control on the login card and the
 * dedicated /forgot-password page.
 */
export async function customerForgotPassword(
  prevState: ForgotState | undefined,
  formData: FormData,
): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    return {
      status: "error",
      message: "Enter a valid email address to request a password reset.",
    };
  }

  const supabase = await createClient();
  if (!supabase) {
    return {
      status: "error",
      message:
        "Supabase is not configured. Add the Supabase environment variables before requesting a reset.",
    };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/reset-password`,
  });

  if (error) {
    console.error(
      "[auth] customer resetPasswordForEmail failed:",
      error.code,
      error.message,
    );
    return {
      status: "error",
      message:
        "We couldn't send a reset link right now. Please try again or contact the store.",
    };
  }

  return {
    status: "sent",
    message: "If that email exists, a password reset link has been sent.",
  };
}
