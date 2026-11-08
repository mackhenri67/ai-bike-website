"use server";

import { isAdmin } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { createAdminSessionClient } from "@/lib/supabase/server";

export type LoginState = {
  error: string | null;
};

export type ForgotState = {
  status: "idle" | "sending" | "sent" | "error";
  message: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Server Action: signs an administrator in with email + password.
 * The session cookie is written by @supabase/ssr on the redirect
 * response.
 */
export async function adminLogin(
  prevState: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Please enter your email address and password." };
  }

  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Please enter a valid email address." };
  }

  const supabase = await createAdminSessionClient();
  if (!supabase) {
    return {
      error:
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your environment variables before signing in.",
    };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Supabase intentionally returns a generic message for security.
    // Log the real reason server-side so it can be diagnosed, and surface
    // a targeted hint for the one case admins can act on directly.
    console.error(
      "[auth] signInWithPassword failed:",
      error.code,
      error.message,
    );

    if (
      error.code === "email_not_confirmed" ||
      /email not confirmed/i.test(error.message)
    ) {
      return {
        error:
          "Your email address has not been confirmed yet. Check your inbox for the confirmation link, or confirm the user in the Supabase dashboard (Authentication → Users).",
      };
    }

    return {
      error:
        "Invalid email or password. If you believe this is a mistake, contact an administrator.",
    };
  }

  if (!isAdmin(data.user)) {
    await supabase.auth.signOut({ scope: "local" });
    return {
      error:
        "This account does not have administrator access. Use the customer login.",
    };
  }
  redirect("/admin");
}

/**
 * Server Action: sends a password reset email through Supabase Auth.
 * Used from the "Forgot password?" control on the login card.
 */
export async function adminForgotPassword(
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

  const supabase = await createAdminSessionClient();
  if (!supabase) {
    return {
      status: "error",
      message:
        "Supabase is not configured. Add the Supabase environment variables before requesting a reset.",
    };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/admin/reset-password`,
  });

  if (error) {
    return {
      status: "error",
      message:
        "We couldn't send a reset link right now. Please try again or contact an administrator.",
    };
  }

  return {
    status: "sent",
    message: "If that email exists, a password reset link has been sent.",
  };
}
