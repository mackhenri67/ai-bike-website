import type { Metadata } from "next";
import { getCustomerByAuthUserId } from "@/lib/data/customer/customers";
import { requireCustomer } from "@/lib/auth/guards";
import { notFound } from "next/navigation";
import { getGcashSettings } from "@/lib/data/admin/gcash";
import { getEventRegistrationByCode } from "@/lib/data/customer/events";
import EventSteps from "@/components/customer/EventSteps";
import Link from "next/link";
import CustomerHeader from "@/components/customer/CustomerHeader";
import CustomerFooter from "@/components/customer/CustomerFooter";
import EventPaymentView from "./event-payment-view";
import styles from "@/app/gcash-payment/[orderNumber]/page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Event Payment | LnR Cycle Center",
  description: "GCash payment for your LnR Cycle Center event registration.",
};

export default async function EventPaymentPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const registrationCode = decodeURIComponent(code);
  const user = await requireCustomer(
    `/login?next=${encodeURIComponent(`/event-payment/${registrationCode}`)}`,
  );

  const regResult = await getEventRegistrationByCode(registrationCode);
  const registration = regResult.data;

  const customer = await getCustomerByAuthUserId(user.id);
  if (!registration || !customer || registration.customer_id !== customer.id) notFound();
  if (registration.status === "cancelled") notFound();

  const settingsResult = await getGcashSettings();

  return (
    <>
      <CustomerHeader />
      <main className={styles.page}>
        <div className={styles.container}>
          <Link href={registration.event?.slug ? `/events/${registration.event.slug}` : "/events"} className={styles.link}>← Back to event</Link>
          <h1 className={styles.title} style={{marginTop:20}}>Online Payment</h1>
          <p className={styles.text}>{registration.event?.title ?? "Event registration"} · {registration.registration_code}</p>
          <EventSteps current={2}/>
          <EventPaymentView
            key={registration.registration_code}
            senderName={registration.payment_sender_name}
            phoneNumber={registration.payment_phone_number}
            paymentStatus={registration.payment_status}
            submittedProof={registration.proof_screenshot_url}
            rejectionReason={registration.rejection_reason}
            paymentReference={registration.reference_number}
            registrationCode={registration.registration_code}
            eventTitle={registration.event?.title ?? "Event registration"}
            amount={Number(registration.amount_paid) || 0}
            settings={settingsResult.data ?? null}
          />
        </div>
      </main>
      <CustomerFooter />
    </>
  );
}
