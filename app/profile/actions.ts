"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getOrCreateCustomer,
  updateCustomerProfile,
} from "@/lib/data/customer/customers";

export type ProfileState = {
  error: string | null;
  success: boolean;
};

/**
 * Server Action: updates the signed-in customer's editable profile fields.
 */
export async function updateProfile(
  prevState: ProfileState | undefined,
  formData: FormData,
): Promise<ProfileState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;

  if (!fullName) {
    return { error: "Please enter your full name.", success: false };
  }

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
      error: "You must be signed in to update your profile.",
      success: false,
    };
  }

  const customer = await getOrCreateCustomer(user);
  if (!customer) {
    return {
      error: "We couldn't load your customer account. Please try again.",
      success: false,
    };
  }

  const result = await updateCustomerProfile(customer.id, {
    full_name: fullName,
    phone,
  });
  if (result.error) {
    return { error: result.error, success: false };
  }

  revalidatePath("/profile");
  return { error: null, success: true };
}

/**
 * Server Action: signs the customer out and returns to the homepage.
 */
export async function customerSignOut(): Promise<void> {
  const supabase = await createClient();
  if (!supabase) return;

  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}
