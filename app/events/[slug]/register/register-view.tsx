"use client";
import { useActionState } from "react";
import Link from "next/link";
import { registerForEventAction } from "./action";
import type { EventRow } from "@/lib/data/types";
import styles from "./register.module.css";
const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
export default function RegisterView({ event, email, fullName }: { event: EventRow; email?: string; fullName?: string }) {
  const [state, formAction, pending] = useActionState(registerForEventAction, { error: null });
  return <form action={formAction} className={styles.form} noValidate>
    <input type="hidden" name="slug" value={event.slug} />
    <input type="hidden" name="category" value={event.category} />
    <div className={styles.layout}>
      <section className={styles.card}>
        <h2 className={styles.heading}>Rider details</h2>
        <label className={styles.field}><span className={styles.label}>Full name *</span><input name="rider_name" className={styles.input} placeholder="Juan Dela Cruz" defaultValue={fullName} autoComplete="name" required /></label>
        <label className={styles.field}><span className={styles.label}>Account email</span><input className={styles.input} value={email ?? ""} readOnly aria-describedby="account-email-note" /><small id="account-email-note" className={styles.note}>This registration uses your signed-in account contact details.</small></label>
        <label className={styles.field}><span className={styles.label}>Plate number (optional)</span><input name="plate_number" className={styles.input} placeholder="e.g. ABC-1234" /></label>
      </section>
      <aside className={styles.summary} aria-label="Order summary"><h2 className={styles.summaryLabel}>Order summary</h2><h3>{event.title}</h3><p>{new Date(event.event_date).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "full" })}</p><dl><div><dt>Registration fee</dt><dd>{money(Number(event.price))}</dd></div><div className={styles.total}><dt>Total</dt><dd>{money(Number(event.price))}</dd></div></dl></aside>
    </div>
    {state.error ? <p className={styles.error} role="alert">{state.error}</p> : null}
    <div className={styles.actions}><Link href={`/events/${event.slug}`} className={styles.cancel}>Cancel</Link><button type="submit" className={styles.submit} disabled={pending}>{pending ? "Reserving…" : "Confirm Registration"}</button></div>
  </form>;
}
