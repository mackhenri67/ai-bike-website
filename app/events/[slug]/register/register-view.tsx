"use client";
import { useActionState, useMemo, useState } from "react";
import { registerForEventAction } from "./action";
import type { EventRow } from "@/lib/data/types";
import styles from "./register.module.css";
const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
export default function RegisterView({ event, email, fullName }: { event: EventRow; email?: string; fullName?: string }) {
  const [state, formAction, pending] = useActionState(registerForEventAction, { error: null });
  const categories = event.registration_categories?.length ? event.registration_categories : [{ name: "General Admission", price: Number(event.price) || 0 }];
  const [selectedCategory, setSelectedCategory] = useState(categories[0].name);
  const selectedFee = useMemo(() => categories.find((item) => item.name === selectedCategory)?.price ?? categories[0].price, [categories, selectedCategory]);
  return <form action={formAction} className={styles.form} noValidate>
    <input type="hidden" name="slug" value={event.slug} />
    <div className={styles.layout}>
      <section className={styles.card}>
        <h2 className={styles.heading}>Rider details</h2>
        <label className={styles.field}><span className={styles.label}>Full name *</span><input name="rider_name" className={styles.input} placeholder="Juan Dela Cruz" defaultValue={fullName} autoComplete="name" maxLength={150} required /></label>
        <label className={styles.field}><span className={styles.label}>Account email</span><input className={styles.input} value={email ?? ""} readOnly aria-describedby="account-email-note" /><small id="account-email-note" className={styles.note}>This registration uses your signed-in account contact details.</small></label>
        <label className={styles.field}><span className={styles.label}>Registration category *</span><select name="category" className={styles.input} value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} required>{categories.map((item) => <option key={item.name} value={item.name}>{item.name} — {money(Number(item.price) || 0)}</option>)}</select></label>
        <label className={styles.field}><span className={styles.label}>Emergency contact name *</span><input name="emergency_contact_name" className={styles.input} placeholder="Contact person's full name" maxLength={120} autoComplete="off" required /></label>
        <label className={styles.field}><span className={styles.label}>Emergency contact phone number *</span><input name="emergency_contact_phone" className={styles.input} type="tel" placeholder="09XX XXX XXXX" maxLength={30} autoComplete="tel" required /></label>
      </section>
      <aside className={styles.summary} aria-label="Order summary"><h2 className={styles.summaryLabel}>Order summary</h2><h3>{event.title}</h3><p>{new Date(event.event_date).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "full" })}</p><dl><div><dt>Category</dt><dd>{selectedCategory}</dd></div><div><dt>Registration fee</dt><dd>{money(Number(selectedFee) || 0)}</dd></div><div className={styles.total}><dt>Total</dt><dd>{money(Number(selectedFee) || 0)}</dd></div></dl></aside>
    </div>
    {state.error ? <p className={styles.error} role="alert">{state.error}</p> : null}
    <div className={styles.actions}><button type="submit" className={styles.submit} disabled={pending}>{pending ? "Reserving…" : "Continue to Online Payment"}</button></div>
  </form>;
}
