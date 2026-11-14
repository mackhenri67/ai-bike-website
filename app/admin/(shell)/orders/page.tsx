import type { Metadata } from "next";
import { listOrders } from "@/lib/data/admin/orders";
import OrdersWorkspace from "@/components/admin/orders/OrdersWorkspace";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Orders | LnR Cycle Center",
};

export const dynamic = "force-dynamic";

/**
 * Orders content area. Every row comes from real customer-placed orders in the
 * database. The Admin shell (sidebar, header, layout) comes from the (shell)
 * layout — this page only provides the title and the orders card.
 */
export default async function AdminOrdersPage() {
  const result = await listOrders();

  return (
    <section className={styles.page}>
      <h1 className={styles.title}>Orders</h1>
      <p className={styles.pageDescription}>Review purchases, verify payments, and manage fulfillment.</p>

      <OrdersWorkspace
        initialOrders={result.data ?? []}
        error={result.error ?? undefined}
      />
    </section>
  );
}
