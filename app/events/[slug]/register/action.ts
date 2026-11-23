"use server";

import { redirect } from "next/navigation";
import { getOrCreateCustomer } from "@/lib/data/customer/customers";
import { createEventRegistration, getPublishedEventBySlug } from "@/lib/data/customer/events";
import { getUser } from "@/lib/supabase/server";

export type RegisterState = { error: string | null };

export async function registerForEventAction(_prevState: RegisterState | undefined, formData: FormData): Promise<RegisterState> {
  const supabase = await getUser();
  if (!supabase) return { error: "You must be signed in to register." };
  const slug = String(formData.get("slug") ?? "").trim();
  const eventResult = await getPublishedEventBySlug(slug);
  const event = eventResult.data;
  if (!event) return { error: "This event is not available." };
  const customer = await getOrCreateCustomer(supabase);
  if (!customer) return { error: "We couldn't load your account. Please try again." };

  const riderName = String(formData.get("rider_name") ?? "").trim();
  const emergencyContactName = String(formData.get("emergency_contact_name") ?? "").trim();
  const emergencyContactPhone = String(formData.get("emergency_contact_phone") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  if (!riderName) return { error: "Please enter the rider name." };
  if (!emergencyContactName || emergencyContactName.length > 120 || !/\p{L}/u.test(emergencyContactName)) {
    return { error: "Please enter the emergency contact's name." };
  }
  const phoneDigits = emergencyContactPhone.replace(/\D/g, "");
  if (emergencyContactPhone.length > 30 || phoneDigits.length < 7 || phoneDigits.length > 15) {
    return { error: "Please enter a valid emergency contact phone number." };
  }
  const categories = event.registration_categories?.length ? event.registration_categories : [{ name: "General Admission", price: Number(event.price) || 0 }];
  if (!categories.some((item) => item.name === category)) return { error: "Please select a valid registration category." };

  const result = await createEventRegistration({
    eventId: event.id,
    riderName,
    emergencyContactName,
    emergencyContactPhone,
    category,
  });
  if (result.error || !result.data) return { error: result.error ?? "Registration failed. Please try again." };
  redirect(`/event-payment/${encodeURIComponent(result.data.registrationCode)}?placed=1`);
}
