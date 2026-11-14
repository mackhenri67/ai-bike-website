import type { Metadata } from "next";
import Link from "next/link";
import { listCustomers } from "@/lib/data/admin/customers";
import { listAdminBuildReviews } from "@/lib/data/customer/build-reviews";
import CustomersManager from "@/components/admin/customers/CustomersManager";
import CustomerBuildReviewsManager from "@/components/admin/customers/CustomerBuildReviewsManager";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Customers | LnR Cycle Center",
};

export const dynamic = "force-dynamic";

/**
 * Customer directory and custom-build review moderation share one admin
 * section, with separate tabs so customer records and reviews stay distinct.
 */
export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === "reviews" ? "reviews" : "customers";

  const [customerResult, reviews] = await Promise.all([
    activeTab === "customers"
      ? listCustomers()
      : Promise.resolve({ data: [], error: null }),
    activeTab === "reviews"
      ? listAdminBuildReviews()
      : Promise.resolve([]),
  ]);

  return (
    <section className={styles.page}>
      <h1 className={styles.title}>Customers</h1>
      <p className={styles.pageDescription}>
        Manage customer accounts and review customer-submitted custom builds.
      </p>

      <nav className={styles.tabs} aria-label="Customer management sections">
        <Link
          href="/admin/customers"
          className={activeTab === "customers" ? styles.activeTab : styles.tab}
          aria-current={activeTab === "customers" ? "page" : undefined}
        >
          Customers
        </Link>
        <Link
          href="/admin/customers?tab=reviews"
          className={activeTab === "reviews" ? styles.activeTab : styles.tab}
          aria-current={activeTab === "reviews" ? "page" : undefined}
        >
          Build Reviews
        </Link>
      </nav>

      {activeTab === "customers" ? (
        <CustomersManager
          initialCustomers={customerResult.data ?? []}
          error={customerResult.error ?? undefined}
        />
      ) : (
        <CustomerBuildReviewsManager initialReviews={reviews} />
      )}
    </section>
  );
}
