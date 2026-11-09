import type { Metadata } from "next";
import { requireCustomer } from "@/lib/auth/guards";
import { notFound } from "next/navigation";
import { getGcashSettings } from "@/lib/data/admin/gcash";
import { getEventRegistrationByCode } from "@/lib/data/customer/events";
import CustomerHeader from "@/components/customer/CustomerHeader";
import CustomerFooter from "@/components/customer/CustomerFooter";
import EventPaymentView from "./event-payment-view";
import styles from "./payment.module.css";

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
  await requireCustomer(
    `/login?next=${encodeURIComponent(`/event-payment/${registrationCode}`)}`,
  );

  const regResult = await getEventRegistrationByCode(registrationCode);
  const registration = regResult.data;

  if (!registration) notFound();
  if (registration.status === "cancelled") notFound();

  const settingsResult = await getGcashSettings();

  return (
    <>
      <CustomerHeader />
      <main className={styles.page}>
        <div className={styles.container}>
          <EventPaymentView
            key={registration.registration_code}
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
