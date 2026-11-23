import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getPublishedEventBySlug } from "@/lib/data/customer/events";
import CustomerHeader from "@/components/customer/CustomerHeader";
import CustomerFooter from "@/components/customer/CustomerFooter";
import styles from "./detail.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Event | LnR Cycle Center",
  description: "Event details and registration for LnR Cycle Center cycling events.",
};

function formatEventDate(value: string): string {
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency", currency: "PHP", minimumFractionDigits: 2,
  }).format(value);
}

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await getPublishedEventBySlug(slug);
  const event = result.data;
  if (!event) notFound();

  const user = await getUser();
  const bookedOut = event.capacity > 0 && event.slots_booked >= event.capacity;
  const registrationCategories = event.registration_categories?.length
    ? event.registration_categories
    : [{ name: "General Admission", price: Number(event.price) || 0 }];

  return <>
    <CustomerHeader />
    <main className={styles.page}>
      <div className={styles.container}>
        <Link href="/events" className={styles.back}>← Back to events</Link>
        <article className={styles.card}>
          <div className={styles.imageWrap}>
            {event.banner_image_url ? <img src={event.banner_image_url} alt={event.title} className={styles.image} /> : <div className={styles.imageFallback}>LnR</div>}
            <span className={styles.category}>{event.category}</span>
          </div>
          <div className={styles.content}>
            <h1 className={styles.title}>{event.title}</h1>
            <p className={styles.organized}>{event.organizer ? `Organized by ${event.organizer}` : "LnR Cycle Center"}</p>
            <dl className={styles.facts}>
              <div><dt>Date</dt><dd>{formatEventDate(event.event_date)}</dd></div>
              <div><dt>Location</dt><dd>{event.location}</dd></div>
              <div><dt>Slots</dt><dd>{event.capacity > 0 ? `${event.slots_booked} / ${event.capacity} booked` : "Unlimited"}</dd></div>
              <div><dt>Discipline</dt><dd>{event.category}</dd></div>
            </dl>

            <section className={styles.registrationOptions} aria-labelledby="registration-options-title">
              <h2 id="registration-options-title" className={styles.optionsTitle}>Available registration categories</h2>
              <p className={styles.optionsIntro}>Choose one of these ticket categories when you register.</p>
              <ul className={styles.optionsList}>
                {registrationCategories.map((item) => <li key={item.name} className={styles.option}>
                  <span className={styles.optionName}>{item.name}</span>
                  <span className={styles.optionPrice}>{Number(item.price) > 0 ? formatCurrency(Number(item.price)) : "Free"}</span>
                </li>)}
              </ul>
            </section>

            {event.description ? <p className={styles.description}>{event.description}</p> : null}
            <div className={styles.actions}>
              {user ? (bookedOut
                ? <button type="button" className={styles.soldOut} disabled>Fully booked</button>
                : <Link href={`/events/${event.slug}/register`} className={styles.register}>Register now</Link>)
                : <Link href={`/login?next=${encodeURIComponent(`/events/${event.slug}/register`)}`} className={styles.register}>Sign in to register</Link>}
            </div>
          </div>
        </article>
      </div>
    </main>
    <CustomerFooter />
  </>;
}
