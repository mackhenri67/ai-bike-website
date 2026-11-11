import type { Metadata } from "next";
import Link from "next/link";
import { listPublishedEvents } from "@/lib/data/customer/events";
import CustomerHeader from "@/components/customer/CustomerHeader";
import CustomerFooter from "@/components/customer/CustomerFooter";
import ListingPageHeader from "@/components/customer/ListingPageHeader";
import listingStyles from "@/components/customer/ListingPageHeader.module.css";
import styles from "./events.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Events | LnR Cycle Center",
  description: "Upcoming cycling events, fun rides and races from LnR Cycle Center.",
};

function formatEventDate(value: string): string {
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const showAll = view === "all";
  const result = await listPublishedEvents(!showAll);
  const events = result.data ?? [];

  return (
    <>
      <CustomerHeader />
      <main className={styles.page}>
        <ListingPageHeader title="Events">
          Join our fun rides, races and community events. Reserve your slot
          and pay securely with GCash.
        </ListingPageHeader>
        <div className={`${listingStyles.container} ${listingStyles.content}`}>

          <nav className={styles.tabs} aria-label="Event filters">
            <Link href="/events" className={!showAll ? styles.activeTab : styles.tab} aria-current={!showAll ? "page" : undefined}>Upcoming Events</Link>
            <Link href="/events?view=all" className={showAll ? styles.activeTab : styles.tab} aria-current={showAll ? "page" : undefined}>All Events</Link>
          </nav>
          {result.error ? (
            <p className={styles.error} role="alert">
              {result.error}
            </p>
          ) : null}

          {events.length === 0 ? (
            <p className={styles.empty}>
              {showAll ? "No published events right now." : "No upcoming events right now. Check All Events for previous events."}
            </p>
          ) : (
            <ul className={styles.grid}>
              {events.map((event) => {
                const bookedOut =
                  event.capacity > 0 && event.slots_booked >= event.capacity;
                return (
                  <li key={event.id}>
                    <Link
                      href={`/events/${event.slug}`}
                      className={styles.card}
                      aria-label={event.title}
                    >
                      <div className={styles.imageWrap}>
                        {event.banner_image_url ? (
                          <img
                            src={event.banner_image_url}
                            alt={event.title}
                            className={styles.image}
                          />
                        ) : (
                          <div className={styles.imageFallback}>LnR</div>
                        )}
                        <span className={styles.category}>{event.category}</span>
                      </div>
                      <div className={styles.body}>
                        <h2 className={styles.cardTitle}>{event.title}</h2>
                        <p className={styles.meta}>
                          {formatEventDate(event.event_date)} · {event.location}
                        </p>
                        <div className={styles.footerRow}>
                          <span className={styles.price}>
                            {event.price > 0
                              ? formatCurrency(event.price)
                              : "Free"}
                          </span>
                          <span
                            className={`${styles.status} ${
                              bookedOut ? styles.full : styles.open
                            }`}
                          >
                            {bookedOut ? "Fully booked" : "Open"}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
      <CustomerFooter />
    </>
  );
}
