import type { Metadata } from "next";
import Link from "next/link";
import RevenueAnalytics from "@/components/admin/dashboard/RevenueAnalytics";
import NewOrdersStatCard from "@/components/admin/dashboard/NewOrdersStatCard";
import BannersManager from "@/components/admin/banners/BannersManager";
import {
  getDashboardStats,
  getRevenueSeries,
} from "@/lib/data/admin/dashboard";
import { formatPeso } from "@/components/customer/data";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Dashboard | LnR Cycle Center",
};

export const dynamic = "force-dynamic";

function formatEventDateLong(value: string): string {
  return new Date(value).toLocaleDateString("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatEventTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Dashboard content area. Stat cards and the revenue chart are computed from
 * the live database (orders + catalog) so every number reflects real activity.
 * The Admin shell (sidebar, header, layout) comes from the (shell) layout.
 */
export default async function AdminDashboardPage() {
  const [statsResult, dailyRevenue, weeklyRevenue, monthlyRevenue] =
    await Promise.all([
      getDashboardStats(),
      getRevenueSeries("daily"),
      getRevenueSeries("weekly"),
      getRevenueSeries("monthly"),
    ]);

  const stats = statsResult.data;
  const statsCards = stats
    ? [
        { label: "Processing Orders", value: String(stats.processingOrders) },
        { label: "Total Products", value: String(stats.totalProducts) },
        { label: "Today's Sales", value: formatPeso(stats.todaySales) },
      ]
    : [];

  const next = stats?.nextEvent ?? null;
  const nextBooked = next?.slotsBooked ?? 0;
  const nextCapacity = next?.capacity ?? 0;
  const nextFilled =
    nextCapacity > 0
      ? Math.min(100, Math.round((nextBooked / nextCapacity) * 100))
      : 0;
  const nextLeft = Math.max(0, nextCapacity - nextBooked);

  return (
    <section className={styles.page}>
      <h1 className={styles.title}>Dashboard</h1>
      <p className={styles.pageDescription}>A clear view of orders, inventory, and upcoming activity.</p>

      <div className={styles.stats}>
        {statsCards.length > 0 ? (
          <>
            <NewOrdersStatCard initialCount={stats?.newOrders ?? 0} />
            {statsCards.map((stat) => (
              <div key={stat.label} className={styles.card}>
                <p className={styles.cardLabel}>{stat.label}</p>
                <p className={styles.cardValue}>{stat.value}</p>
              </div>
            ))}
          </>
        ) : (
          <div className={styles.card}>
            <p className={styles.cardLabel}>
              {statsResult.error ?? "Dashboard unavailable"}
            </p>
          </div>
        )}
      </div>

      <RevenueAnalytics
        dailyData={dailyRevenue.data ?? []}
        weeklyData={weeklyRevenue.data ?? []}
        monthlyData={monthlyRevenue.data ?? []}
        error={
          dailyRevenue.error ??
          weeklyRevenue.error ??
          monthlyRevenue.error ??
          undefined
        }
      />

      <div className={styles.panels}>
        {/* Next event progress */}
        <section className={styles.panel}>
          {next ? (
            <>
              <div className={styles.panelHead}>
                <div>
                  <h2 className={styles.panelTitle}>{next.title}</h2>
                  <p className={styles.panelMeta}>
                    {formatEventDateLong(next.eventDate)} ·{" "}
                    {formatEventTime(next.eventDate)}
                  </p>
                </div>
                <Link href="/admin/events" className={styles.manageButton}>
                  Manage
                </Link>
              </div>

              <div className={styles.progressRow}>
                <p className={styles.progressValue}>{nextBooked}</p>
                <p className={styles.progressMeta}>
                  of {nextCapacity} slots · {nextLeft} left
                </p>
              </div>

              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${nextFilled}%` }}
                />
              </div>
            </>
          ) : (
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>No upcoming events</h2>
                <p className={styles.panelMeta}>
                  Publish an event to start taking sign ups.
                </p>
              </div>
              <Link href="/admin/events" className={styles.manageButton}>
                Manage
              </Link>
            </div>
          )}
        </section>

        {/* Needs attention */}
        <section className={styles.panel}>
          <h2 className={styles.panelSubtitle}>Needs attention</h2>

          <ul className={styles.attentionList}>
            <li className={styles.attentionItem}>
              <span className={styles.attentionLabel}>
                Event sign ups awaiting payment
              </span>
              <Link
                href="/admin/registrations"
                className={styles.attentionLink}
              >
                {stats?.pendingSignups ?? 0} riders
              </Link>
            </li>
            <li className={styles.attentionItem}>
              <span className={styles.attentionLabel}>
                Products out of stock
              </span>
              <Link href="/admin/products" className={styles.attentionLink}>
                {stats?.outOfStock ?? 0} items
              </Link>
            </li>
            <li className={styles.attentionItem}>
              <span className={styles.attentionLabel}>
                Draft events not yet published
              </span>
              <Link href="/admin/events" className={styles.attentionLink}>
                {stats?.draftEvents ?? 0} events
              </Link>
            </li>
          </ul>
        </section>
      </div>

      <BannersManager />
    </section> 
  );
}
