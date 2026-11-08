import "server-only";
import { getUser } from "@/lib/supabase/server";
import { paymentProofUrl } from "@/lib/storage/proofs";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import type {
  EventRegistrationRow,
  EventRow,
  QueryResult,
} from "@/lib/data/types";
import {
  missingServiceRoleMessage,
  toFriendlyDbError,
} from "@/lib/data/admin/errors";

const EVENT_SELECT = `
  id, event_code, slug, title, category, description, event_date, end_date,
  location, banner_image_url, price, capacity, slots_booked, organizer,
  status, created_at, updated_at
`;

const REGISTRATION_SELECT = `
  id, registration_code, event_id, customer_id, customer_name, customer_email,
  customer_phone, rider_name, plate_number, category, amount_paid,
  payment_method, payment_status, status, proof_screenshot_url, reference_number, payment_sender_name, payment_phone_number,
  rejection_reason, reviewed_at, reviewed_by, created_at, updated_at,
  event:events(id, slug, title, category, event_date, location, banner_image_url)
`;

/** Public storefront list — only published events, soonest first. */
export async function listPublishedEvents(upcomingOnly = false): Promise<QueryResult<EventRow[]>> {
  const supabase = await createClient();
  if (!supabase) return { data: null, error: null };

  const { data, error } = await supabase
    .from("events")
    .select(EVENT_SELECT)
    .eq("status", "published")
    .order("event_date", { ascending: true });

  if (error) return { data: null, error: toFriendlyDbError(error) };
  const now = Date.now();
  const events = ((data as EventRow[]) ?? []).filter((event) => !upcomingOnly || new Date(event.end_date ?? event.event_date).getTime() >= now);
  return { data: events, error: null };
}

/** Public storefront detail — only when the event is published. */
export async function getPublishedEventBySlug(
  slug: string,
): Promise<QueryResult<EventRow | null>> {
  const supabase = await createClient();
  if (!supabase) return { data: null, error: null };

  const { data, error } = await supabase
    .from("events")
    .select(EVENT_SELECT)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) return { data: null, error: toFriendlyDbError(error) };
  return { data: (data as EventRow) ?? null, error: null };
}

/** The signed-in customer's own registration for an event (RLS-scoped). */
export async function getOwnRegistrationForEvent(
  eventId: string,
  customerId: string,
): Promise<QueryResult<EventRegistrationRow | null>> {
  const supabase = await createClient();
  if (!supabase) return { data: null, error: null };

  const { data, error } = await supabase
    .from("event_registrations")
    .select(REGISTRATION_SELECT)
    .eq("event_id", eventId)
    .eq("customer_id", customerId)
    .eq("status", "registered")
    .maybeSingle();

  if (error) return { data: null, error: toFriendlyDbError(error) };
  return {
    data: data
      ? await signedRegistration(data as unknown as EventRegistrationRow)
      : null,
    error: null,
  };
}

/** The signed-in customer's own registration by code (RLS-scoped). */
export async function getEventRegistrationByCode(
  code: string,
): Promise<QueryResult<EventRegistrationRow | null>> {
  const supabase = await createClient();
  if (!supabase) return { data: null, error: null };

  const { data, error } = await supabase
    .from("event_registrations")
    .select(REGISTRATION_SELECT)
    .eq("registration_code", code)
    .maybeSingle();

  if (error) return { data: null, error: toFriendlyDbError(error) };
  return {
    data: data
      ? await signedRegistration(data as unknown as EventRegistrationRow)
      : null,
    error: null,
  };
}

/** The signed-in customer's registrations, newest first (RLS-scoped). */
export async function listMyEventRegistrations(
  customerId: string,
): Promise<QueryResult<EventRegistrationRow[]>> {
  const supabase = await createClient();
  if (!supabase) return { data: null, error: null };

  const { data, error } = await supabase
    .from("event_registrations")
    .select(REGISTRATION_SELECT)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: toFriendlyDbError(error) };
  return {
    data: await Promise.all(
      ((data as unknown as EventRegistrationRow[]) ?? []).map(
        signedRegistration,
      ),
    ),
    error: null,
  };
}

export type CreateEventRegistrationInput = {
  eventId: string;
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  riderName: string;
  plateNumber?: string | null;
  category?: string | null;
  amountPaid: number;
};

/**
 * Creates a registration for the given event (service-role write). Returns an
 * error when the event is full or the customer already registered.
 */
export async function createEventRegistration(
  input: CreateEventRegistrationInput,
): Promise<QueryResult<{ registrationCode: string; paymentMethod: string }>> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  const user = await getUser();
  if (!user) return { data: null, error: "Sign in with a customer account." };
  const { data, error } = await admin.rpc("lnr_register_event", {
    p_user: user.id,
    p_event: input.eventId,
    p_rider: input.riderName,
    p_plate: input.plateNumber ?? null,
    p_category: input.category ?? null,
  });
  return {
    data: error
      ? null
      : (data as { registrationCode: string; paymentMethod: string }),
    error: error ? toFriendlyDbError(error) : null,
  };
}

export type SubmitEventPaymentInput = {
  registrationCode: string;
  senderName: string;
  phoneNumber: string;
  referenceNumber?: string | null;
  screenshotUrl: string;
};

/** Saves the customer's GCash payment proof for an event registration. */
export async function submitEventGcashPayment(
  input: SubmitEventPaymentInput,
): Promise<QueryResult<null>> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  const user = await getUser();
  if (!user) return { data: null, error: "Sign in with a customer account." };
  const { error } = await admin.rpc("lnr_submit_event_payment", {
    p_user: user.id,
    p_code: input.registrationCode,
    p_name: input.senderName,
    p_phone: input.phoneNumber,
    p_reference: input.referenceNumber ?? null,
    p_proof: input.screenshotUrl,
  });
  return { data: null, error: error ? toFriendlyDbError(error) : null };
}
async function signedRegistration(
  row: EventRegistrationRow,
): Promise<EventRegistrationRow> {
  return {
    ...row,
    proof_screenshot_url: row.proof_screenshot_url
      ? await paymentProofUrl(row.proof_screenshot_url)
      : null,
  };
}
