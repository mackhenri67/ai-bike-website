"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import {
  deleteEvent,
  updateEventStatus,
  upsertEvent,
} from "@/lib/data/admin/events";
import type { EventInput, EventStatus } from "@/lib/data/types";

export async function saveEventAction(
  input: EventInput,
): Promise<{ error: string | null }> {
  await requireAdmin();

  if (!input.title.trim()) {
    return { error: "Event title is required." };
  }
  if (input.price < 0) {
    return { error: "Price cannot be negative." };
  }
  if (input.capacity < 0) {
    return { error: "Capacity cannot be negative." };
  }

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
    price: input.price,
    capacity: input.capacity,
    organizer: input.organizer,
    status: input.status,
  });

  if (result.error || !result.data) {
    return { error: result.error ?? "Failed to save the event." };
  }

  revalidatePath("/admin/events");
  revalidatePath("/admin/dashboard");
  revalidatePath("/events");
  revalidatePath(`/events/${result.data.slug}`);
  revalidatePath("/my-events"); // in case details affect tickets

  return { error: null };
}

export async function deleteEventAction(
  id: string,
): Promise<{ error: string | null }> {
  await requireAdmin();

  const result = await deleteEvent(id);
  if (result.error) return { error: result.error };

  revalidatePath("/admin/events");
  revalidatePath("/admin/dashboard");
  revalidatePath("/events");

  return { error: null };
}

const VALID_STATUS: EventStatus[] = ["draft", "published", "cancelled"];

export async function updateEventStatusAction(
  id: string,
  status: EventStatus,
): Promise<{ error: string | null }> {
  await requireAdmin();

  if (!VALID_STATUS.includes(status)) {
    return { error: "Invalid event status." };
  }

  const result = await updateEventStatus(id, status);
  if (result.error) return { error: result.error };

  revalidatePath("/admin/events");
  revalidatePath("/admin/dashboard");
  revalidatePath("/events");
  revalidatePath(`/events/${result.data?.slug ?? ""}`);

  return { error: null };
}
