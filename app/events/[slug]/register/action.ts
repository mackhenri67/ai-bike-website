"use server";

import { redirect } from "next/navigation";
import { getOrCreateCustomer } from "@/lib/data/customer/customers";
import {
  createEventRegistration,
  getPublishedEventBySlug,
} from "@/lib/data/customer/events";
import { getUser } from "@/lib/supabase/server";

export type RegisterState = {
  error: string | null;
};

/**
 * Server Action: registers the signed-in customer for an event. The rider
 * details come from the form; the registration is created server-side and the
 * customer is sent to the GCash payment page for that registration.
 */
export async function registerForEventAction(
  _prevState: RegisterState | undefined,
  formData: FormData
): Promise<RegisterState> {
  const supabase = await getUser();
  if (!supabase) {
    return { error: "You must be signed in to register." };
  }

  const slug = String(formData.get("slug") ?? "").trim();
  const eventResult = await getPublishedEventBySlug(slug);
  const event = eventResult.data;
  if (!event) return { error: "This event is not available." };

  const customer = await getOrCreateCustomer(supabase);
  if (!customer) return { error: "We couldn't load your account. Please try again." };

  const riderName = String(formData.get("rider_name") ?? "").trim();
  const emergencyContact = String(formData.get("emergency_contact") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();

  if (!riderName) {
    return { error: "Please enter the rider name." };
  }

  const phoneDigits = emergencyContact.replace(/\D/g, "");
  if (emergencyContact.length > 250 || !/\p{L}/u.test(emergencyContact) || phoneDigits.length < 7 || phoneDigits.length > 15) {
    return { error: "Please enter an emergency contact name and phone number." };
  }

  const result = await createEventRegistration({
    eventId: event.id,
    customerId: customer.id,
    customerName: customer.full_name,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    riderName,
    emergencyContact,
    category,
    amountPaid: Number(event.price) || 0,
  });

  if (result.error || !result.data) {
    return { error: result.error ?? "Registration failed. Please try again." };
  }

  redirect(
    `/event-payment/${encodeURIComponent(result.data.registrationCode)}?placed=1`
  );
}
