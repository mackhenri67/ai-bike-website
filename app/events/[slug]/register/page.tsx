import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getPublishedEventBySlug } from "@/lib/data/customer/events";
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
            <EventSteps current={1} />
            <RegisterView event={event} email={user.email} fullName={typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : undefined} />
        </div>
      </main>
      <CustomerFooter />
    </>
  );
}
