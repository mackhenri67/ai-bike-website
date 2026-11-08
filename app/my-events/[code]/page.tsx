import type { Metadata } from "next";
import EventTicketCard from "@/components/customer/EventTicketCard";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getOrCreateCustomer } from "@/lib/data/customer/customers";
import { getEventRegistrationByCode } from "@/lib/data/customer/events";
import CustomerHeader from "@/components/customer/CustomerHeader";
import CustomerFooter from "@/components/customer/CustomerFooter";
import styles from "./ticket.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Event Ticket | LnR Cycle Center",
  description: "Your event registration ticket.",
};

export default async function EventTicketPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const registrationCode = decodeURIComponent(code);

  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/my-events/${registrationCode}`)}`);

  const customer = await getOrCreateCustomer(user);
  if (!customer) redirect("/login");

  const result = await getEventRegistrationByCode(registrationCode);
  const reg = result.data;

  if (!reg) notFound();
  if (reg.customer_id !== customer.id) notFound();

  return <><CustomerHeader/><main className={styles.page}><div className={styles.container}>
    <Link href="/profile?tab=events" className={styles.back}>← Back to My Events</Link>
    <EventTicketCard registration={reg}/>
  </div></main><CustomerFooter/></>;
}
