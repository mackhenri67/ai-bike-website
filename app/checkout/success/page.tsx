import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import CustomerHeader from "@/components/customer/CustomerHeader";
import CustomerFooter from "@/components/customer/CustomerFooter";
import ClearCartOnMount from "@/components/customer/ClearCartOnMount";
import { getUser } from "@/lib/supabase/server";
import { getCustomerByAuthUserId } from "@/lib/data/customer/customers";
import { getGcashOrderForCustomer } from "@/lib/data/customer/gcash";
import { formatPeso } from "@/components/customer/data";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Order confirmation | LNR Cycle Center" };

type Props = { searchParams: Promise<{ order?: string | string[] }> };
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
  const active = order.status === "pending" || order.status === "confirmed";
  const title = active ? "Your order is being processed" : "Your order details";
  return <><CustomerHeader /><main className={styles.page}>
    {active ? <ClearCartOnMount /> : null}
    <section className={styles.container} aria-labelledby="confirmation-title">
      <div className={styles.icon} aria-hidden="true">✓</div>
      <h1 id="confirmation-title" className={styles.title}>{title}</h1>
      <p className={styles.text}>{active ? "Your order has been received. Check My Orders for delivery and status updates." : "View the latest status and details of this order in My Orders."}</p>
      <dl className={styles.summary}>
        <div><dt>Order number</dt><dd>{order.order_number}</dd></div>
        <div><dt>Amount</dt><dd><strong>{formatPeso(Number(order.total))}</strong></dd></div>
        <div><dt>Payment</dt><dd>{order.payment_method === "cod" ? "Cash on Delivery" : "GCash"}</dd></div>
      </dl>
      <div className={styles.actions}>
        <Link href="/profile?tab=orders" className={styles.button}>Go to My Orders</Link>
        <Link href="/products" className={styles.secondary}>Browse products</Link>
      </div>
    </section>
  </main><CustomerFooter /></>;
}
