import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getPublishedEventBySlug, getMyActiveEventRegistration } from "@/lib/data/customer/events";
import CustomerHeader from "@/components/customer/CustomerHeader";
import CustomerFooter from "@/components/customer/CustomerFooter";
import EventSteps from "@/components/customer/EventSteps";
import RegisterView from "./register-view";
import styles from "./register.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Register | LnR Cycle Center",
  description: "Register for an LnR Cycle Center cycling event.",
};

export default async function EventRegisterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/events/${slug}/register`)}`);
  }

  const result = await getPublishedEventBySlug(slug);
  const event = result.data;
  if (!event) notFound();
  const active=await getMyActiveEventRegistration(event.id);

  return (
    <>
      <CustomerHeader />
      <main className={styles.page}>
        <div className={styles.container}>
            <Link href={`/events/${event.slug}`} className={styles.back}>← Back</Link>
            <h1 className={styles.title}>Registration</h1>
            <p className={styles.subtitle}>
              {new Date(event.event_date).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "full" })} · {event.capacity > 0 ? `${Math.max(0, event.capacity - event.slots_booked)} slots left` : "Open registration"}
            </p>
            {active.error?<section className={styles.card}><h2 className={styles.heading}>Registration unavailable</h2><p className={styles.error} role="alert">{active.error}</p><Link href={`/events/${event.slug}/register`} className={styles.back}>Try again</Link></section>:active.data?<section className={`${styles.card} ${styles.existingRegistrationCard}`} aria-label="Existing registration"><h2 className={styles.heading}>You’re already registered</h2><p className={styles.existingMessage}>You can only have one active ticket for this event. View your existing registration in My Events, or cancel it there before signing up again.</p><p className={styles.registrationCode}>Registration: <strong>{active.data.registrationCode}</strong></p><div className={styles.existingActions}><Link href={`/profile?tab=events&ticket=${encodeURIComponent(active.data.registrationCode)}`} className={styles.existingPrimary}>View my ticket</Link><Link href="/profile?tab=events" className={styles.existingPrimary}>Go to My Events</Link></div></section>:<><EventSteps current={1} />
            <RegisterView event={event} email={user.email} fullName={typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : undefined} /></>}
        </div>
      </main>
      <CustomerFooter />
    </>
  );
}
