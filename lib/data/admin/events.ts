import "server-only";
import { paymentProofUrl } from "@/lib/storage/proofs";
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
  customer_phone, rider_name, plate_number, emergency_contact, category, amount_paid,
  payment_method, payment_status, status, proof_screenshot_url, reference_number, payment_sender_name, payment_phone_number,
  rejection_reason, reviewed_at, reviewed_by, created_at, updated_at,
  event:events(id, slug, title, category, event_date, location, banner_image_url)
`;

/** All events for the admin list (every status, soonest first). */
export async function listAdminEvents(): Promise<QueryResult<EventRow[]>> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  const { data, error } = await admin
    .from("events")
    .select(EVENT_SELECT)
    .order("event_date", { ascending: true });

  if (error) return { data: null, error: toFriendlyDbError(error) };
  return { data: (data as EventRow[]) ?? [], error: null };
}

export async function getAdminEvent(
  id: string,
): Promise<QueryResult<EventRow | null>> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  const { data, error } = await admin
    .from("events")
    .select(EVENT_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) return { data: null, error: toFriendlyDbError(error) };
  return { data: (data as EventRow) ?? null, error: null };
}

export type UpsertEventInput = {
  id?: string | null;
  eventCode?: string | null;
  slug: string;
  title: string;
  category: string;
  description: string | null;
  eventDate: string;
  endDate: string | null;
  location: string;
  bannerImageUrl: string | null;
  price: number;
  capacity: number;
  organizer: string | null;
  status: EventRow["status"];
};

function makeEventCode(): string {
  const year = new Date().getFullYear();
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `EVT-${year}-${rand}`;
}

/** Creates or updates an event. Service-role write. */
export async function upsertEvent(
  input: UpsertEventInput,
): Promise<QueryResult<EventRow>> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  const isUpdate = Boolean(input.id);
  let eventCode = input.eventCode ?? null;
  if (!eventCode) {
    for (let attempt = 0; attempt < 3 && !eventCode; attempt++) {
      const candidate = makeEventCode();
      const { data: clash } = await admin
        .from("events")
        .select("id")
        .eq("event_code", candidate)
        .maybeSingle();
      if (!clash) eventCode = candidate;
    }
  }
  if (!eventCode) eventCode = makeEventCode();

  const payload = {
    event_code: eventCode,
    slug: input.slug,
    title: input.title,
    category: input.category,
    description: input.description,
    event_date: input.eventDate,
    end_date: input.endDate,
    location: input.location,
    banner_image_url: input.bannerImageUrl,
    price: input.price,
    capacity: input.capacity,
    organizer: input.organizer,
    status: input.status,
  };

  let result;
  if (isUpdate) {
    result = await admin
      .from("events")
      .update(payload)
      .eq("id", input.id as string)
      .select()
      .single();
  } else {
    result = await admin.from("events").insert(payload).select().single();
  }

  if (result.error)
    return { data: null, error: toFriendlyDbError(result.error) };
  return { data: result.data as EventRow, error: null };
}

/** Updates only the status of an event (publish/unpublish/cancel). */
export async function updateEventStatus(
  id: string,
  status: EventRow["status"],
): Promise<QueryResult<EventRow | null>> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  const { data, error } = await admin
    .from("events")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: toFriendlyDbError(error) };
  return { data: (data as EventRow) ?? null, error: null };
}

export async function deleteEvent(id: string): Promise<QueryResult<null>> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  const { error } = await admin.from("events").delete().eq("id", id);
  if (error) return { data: null, error: toFriendlyDbError(error) };
  return { data: null, error: null };
}

/** All registrations for the admin list (newest first). */
export async function listAllRegistrations(): Promise<
  QueryResult<EventRegistrationRow[]>
> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  const { data, error } = await admin
    .from("event_registrations")
    .select(REGISTRATION_SELECT)
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

export async function getRegistrationByCode(
  code: string,
): Promise<QueryResult<EventRegistrationRow | null>> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  const { data, error } = await admin
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

/** Reviews a customer's GCash payment for an event registration. */
export async function reviewRegistrationPayment(input: {
  registrationId: string;
  decision: "paid" | "rejected";
  reviewerId: string;
  reason?: string | null;
}): Promise<QueryResult<null>> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  const { error } = await admin.rpc("lnr_review_event_payment", {
    p_registration: input.registrationId,
    p_decision: input.decision,
    p_admin: input.reviewerId,
    p_reason: input.reason ?? null,
  });
  return { data: null, error: error ? toFriendlyDbError(error) : null };
}

export async function updateRegistrationStatus(
  registrationId: string,
  status: EventRegistrationRow["status"],
  adminId: string,
): Promise<QueryResult<null>> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  const { error } = await admin.rpc("lnr_set_registration_status", {
    p_registration: registrationId,
    p_status: status,
    p_admin: adminId,
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
