"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { deleteEvent, updateEventStatus, upsertEvent } from "@/lib/data/admin/events";
import type { EventInput, EventStatus } from "@/lib/data/types";

export async function saveEventAction(input: EventInput): Promise<{ error: string | null }> {
  await requireAdmin();
  if (!input.title.trim()) return { error: "Event title is required." };
  if (!Array.isArray(input.registration_categories) || input.registration_categories.length < 1 || input.registration_categories.length > 20) {
    return { error: "Add at least one registration category (maximum 20)." };
  }
  const seen = new Set<string>();
  for (const item of input.registration_categories) {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    const price = Number(item?.price);
    if (!name || name.length > 80) return { error: "Each registration category needs a name (maximum 80 characters)." };
    if (seen.has(name.toLowerCase())) return { error: "Registration category names must be unique." };
    if (!Number.isFinite(price) || price < 0 || price > 10000000) return { error: `Enter a valid fee for ${name}.` };
    seen.add(name.toLowerCase());
  }
  if (input.price < 0) return { error: "Price cannot be negative." };
  if (input.capacity < 0) return { error: "Capacity cannot be negative." };

  const result = await upsertEvent({
    id: input.id ?? null,
    eventCode: input.event_code ?? null,
    title: input.title,
    slug: input.slug,
    category: input.category,
    description: input.description,
    eventDate: input.event_date,
    endDate: null,
    location: input.location,
    bannerImageUrl: input.banner_image_url,
    price: Number(input.registration_categories[0].price),
    registrationCategories: input.registration_categories.map((item) => ({ name: item.name.trim(), price: Number(item.price) })),
    capacity: input.capacity,
    organizer: input.organizer,
    status: input.status,
  });
  if (result.error || !result.data) return { error: result.error ?? "Failed to save the event." };

  revalidatePath("/admin/events");
  revalidatePath("/admin/dashboard");
  revalidatePath("/events");
  revalidatePath(`/events/${result.data.slug}`);
  revalidatePath("/my-events");
  return { error: null };
}

export async function deleteEventAction(id: string): Promise<{ error: string | null }> {
  await requireAdmin();
  const result = await deleteEvent(id);
  if (result.error) return { error: result.error };
  revalidatePath("/admin/events"); revalidatePath("/admin/dashboard"); revalidatePath("/events");
  return { error: null };
}

const VALID_STATUS: EventStatus[] = ["draft", "published", "cancelled"];
export async function updateEventStatusAction(id: string, status: EventStatus): Promise<{ error: string | null }> {
  await requireAdmin();
  if (!VALID_STATUS.includes(status)) return { error: "Invalid event status." };
  const result = await updateEventStatus(id, status);
  if (result.error) return { error: result.error };
  revalidatePath("/admin/events"); revalidatePath("/admin/dashboard"); revalidatePath("/events");
  revalidatePath(`/events/${result.data?.slug ?? ""}`);
  return { error: null };
}
