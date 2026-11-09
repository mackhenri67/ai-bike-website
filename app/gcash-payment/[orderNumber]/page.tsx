import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getOrCreateCustomer } from "@/lib/data/customer/customers";
import {
  getGcashOrderForCustomer,
  getGcashPaymentForOrder,
  getGcashSettings,
} from "@/lib/data/customer/gcash";
import CustomerHeader from "@/components/customer/CustomerHeader";
import CustomerFooter from "@/components/customer/CustomerFooter";
import ClearCartOnMount from "@/components/customer/ClearCartOnMount";
import GcashPaymentView from "./gcash-payment-view";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GCash Payment | LnR Cycle Center",
  description:
    "Scan the merchant QR code and submit your GCash payment proof for verification.",
};

type GcashPaymentPageProps = {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ placed?: string; source?: string }>;
};

export default async function GcashPaymentPage({
  params,
  searchParams,
}: GcashPaymentPageProps) {
  const { orderNumber } = await params;
  const cleanOrderNumber = orderNumber.trim();
  const { placed, source } = await searchParams;
  const justPlaced = placed === "1";

  const user = await getUser();
  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent(`/gcash-payment/${cleanOrderNumber}`)}`
    );
  }

  const customer = await getOrCreateCustomer(user);
  if (!customer) {
    return (
      <>
        <CustomerHeader />
        <main className={styles.page}>
          <div className={styles.container}>
            <h1 className={styles.title}>GCash Payment</h1>
            <p className={styles.text}>
              We couldn&apos;t load your customer account. Please try again
              later.
            </p>
          </div>
        </main>
        <CustomerFooter />
      </>
    );
  }

  const order = await getGcashOrderForCustomer(cleanOrderNumber, customer.id);

  if (!order || order.payment_method !== "gcash") {
    return (
      <>
        <CustomerHeader />
        <main className={styles.page}>
          <div className={styles.container}>
            <h1 className={styles.title}>Order not found</h1>
            <p className={styles.text}>
              We couldn&apos;t find a GCash order with that number for your
              account. If you placed an order, check your{" "}
              <Link href="/profile" className={styles.link}>
                order history
              </Link>
              .
            </p>
            <Link href="/profile" className={styles.button}>
              Go to My Account
            </Link>
          </div>
        </main>
        <CustomerFooter />
      </>
    );
  }

  const [settings, payment] = await Promise.all([
    getGcashSettings(),
    getGcashPaymentForOrder(order.id),
  ]);

  if (payment && payment.status !== "rejected" || order.payment_status === "paid") {
    redirect(`/checkout/success?order=${encodeURIComponent(order.order_number)}`);
  }
  return (
    <>
      <CustomerHeader />
      {/* Clears the cart right after a freshly placed GCash order (redirect
          comes with ?placed=1). Revisits of older payment pages never clear
          the cart. */}
      {justPlaced ? <ClearCartOnMount direct={source === "buy-now"} orderNumber={order.order_number} /> : null}
      <main className={styles.page}>
        <div className={styles.container}>
          <GcashPaymentView
            order={{
              id: order.id,
              orderNumber: order.order_number,
              total: order.total,
              paymentStatus: order.payment_status,
            }}
            settings={{
              qrCodeUrl: settings?.qr_code_url ?? null,
              gcashNumber: settings?.gcash_number ?? null,
            }}
            payment={payment}
          />
        </div>
      </main>
      <CustomerFooter />
    </>
  );
}
