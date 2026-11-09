import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import CustomerHeader from "@/components/customer/CustomerHeader";
import CustomerFooter from "@/components/customer/CustomerFooter";
import ClearCartOnMount from "@/components/customer/ClearCartOnMount";
import { getUser } from "@/lib/supabase/server";
import { getCustomerByAuthUserId } from "@/lib/data/customer/customers";
import { getGcashOrderForCustomer, getGcashPaymentForOrder } from "@/lib/data/customer/gcash";
import { formatPeso } from "@/components/customer/data";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Order confirmation | LNR Cycle Center" };

type Props = { searchParams: Promise<{ order?: string | string[]; placed?: string; source?: string }> };
export default async function CheckoutSuccessPage({ searchParams }: Props) {
  const params = await searchParams;
  const orderNumber = typeof params.order === "string" ? params.order.trim() : "";
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/checkout/success?order=${encodeURIComponent(orderNumber)}`)}`);
  const customer = await getCustomerByAuthUserId(user.id);
  if (!customer || !orderNumber) notFound();
  // This lookup uses the signed-in client, RLS and customer ownership filtering.
  // Amount and payment method come from the saved order, never URL parameters.
  const order = await getGcashOrderForCustomer(orderNumber, customer.id);
  if (!order) notFound();
  const payment = order.payment_method === "gcash" ? await getGcashPaymentForOrder(order.id) : null;
  const paymentStatus = order.payment_method === "cod" ? (order.status === "completed" || order.payment_status === "paid" ? "Paid" : "Pay on delivery") : ({paid:"Paid / Verified",rejected:"Payment rejected — resubmit proof",refunded:"Refunded",failed:"Payment failed"} as Record<string,string>)[order.payment_status] ?? (payment?.screenshot_url ? "Awaiting verification" : "Awaiting payment");
  const active = order.status === "pending" || order.status === "confirmed";
  const title = active ? "Your order is being processed" : "Your order details";
  return <><CustomerHeader /><main className={styles.page}>
    {params.placed === "1" ? <ClearCartOnMount direct={params.source === "buy-now"} orderNumber={order.order_number} /> : null}
    <section className={styles.container} aria-labelledby="confirmation-title">
      <div className={styles.icon} aria-hidden="true">✓</div>
      <h1 id="confirmation-title" className={styles.title}>{title}</h1>
      <p className={styles.text}>{active ? "Your order has been received. Check My Orders for delivery and status updates." : "View the latest status and details of this order in My Orders."}</p>
      <dl className={styles.summary}>
        <div><dt>Order number</dt><dd>{order.order_number}</dd></div>
        <div><dt>Amount</dt><dd><strong>{formatPeso(Number(order.total))}</strong></dd></div>
        <div><dt>Payment</dt><dd>{order.payment_method === "cod" ? "Cash on Delivery" : "GCash"}</dd></div>
        {order.payment_method === "gcash" ? <div><dt>Payment status</dt><dd>{paymentStatus}</dd></div> : null}
      </dl>
      {order.payment_method === "gcash" ? <p className={styles.text}>{order.payment_status === "paid" ? "Your GCash payment has been verified." : payment?.screenshot_url && order.payment_status !== "rejected" ? "Your proof has been received. The shop will verify your payment before fulfillment." : "Complete your GCash payment and submit proof so the shop can verify it."}</p> : null}
      {active && order.payment_method === "gcash" && (!payment || order.payment_status === "rejected") && order.payment_status !== "paid" ? <p className={styles.text}><Link href={`/gcash-payment/${encodeURIComponent(order.order_number)}`}>Complete GCash payment</Link></p> : null}
      <div className={styles.actions}>
        <Link href="/profile?tab=orders" className={styles.button}>Go to My Orders</Link>
        <Link href="/products" className={styles.secondary}>Browse products</Link>
      </div>
    </section>
  </main><CustomerFooter /></>;
}
