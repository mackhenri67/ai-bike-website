import type { Metadata } from "next";
import { listCustomers } from "@/lib/data/admin/customers";
import CustomersManager from "@/components/admin/customers/CustomersManager";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Customers | LnR Cycle Center",
};

export const dynamic = "force-dynamic";

/**
 * Customers page content. Every row comes from real customer accounts in the
 * database. The Admin shell (sidebar, header, layout) comes from the (shell)
 * layout — this page only provides its own content.
 */
export default async function AdminCustomersPage() {
  const result = await listCustomers();

  return (
    <section className={styles.page}>
      <h1 className={styles.title}>Customers</h1>
      <p className={styles.pageDescription}>View customer accounts and their contact information.</p>

      <CustomersManager
        initialCustomers={result.data ?? []}
        error={result.error ?? undefined}
      />
    </section>
  );
}
