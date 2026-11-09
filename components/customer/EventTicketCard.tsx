import Link from "next/link";
import type { EventRegistrationRow } from "@/lib/data/types";
import styles from "./EventTicketCard.module.css";
const money=(v:number)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(v);
const date=(v:string)=>new Date(v).toLocaleString("en-PH",{timeZone:"Asia/Manila",dateStyle:"long",timeStyle:"short"});
export default function EventTicketCard({ registration: reg }: { registration: EventRegistrationRow }) {
  const paid=reg.payment_status==='paid';const cancelled=reg.status==='cancelled';
  const status=cancelled?'Cancelled':paid?'Confirmed':reg.payment_status==='rejected'?'Payment rejected':reg.proof_screenshot_url?'Awaiting review':'Awaiting payment';
  return <section className={styles.ticket} aria-label="Event entry pass">
    <div className={styles.stub}><span className={styles.stubLabel}>ENTRY PASS</span><strong className={styles.stubCode}>{reg.registration_code}</strong></div>
    <div className={styles.main}><div className={styles.eventHeader}><h2 className={styles.eventTitle}>{reg.event?.title??'Event'}</h2><span className={`${styles.badge} ${paid&&!cancelled?styles.paid:styles.unpaid}`}>{status}</span></div>
      <dl className={styles.facts}><div><dt>Rider</dt><dd>{reg.rider_name}</dd></div><div><dt>Registration code</dt><dd>{reg.registration_code}</dd></div><div><dt>Date &amp; roll out</dt><dd>{reg.event?date(reg.event.event_date):'To be announced'}</dd></div><div><dt>Start / finish</dt><dd>{reg.event?.location??'To be announced'}</dd></div><div><dt>Emergency contact</dt><dd>{reg.emergency_contact || "Not provided"}</dd></div><div><dt>Account contact</dt><dd>{reg.customer_email||'Not provided'}{reg.customer_phone?<><br/>{reg.customer_phone}</>:null}</dd></div><div><dt>Registration date</dt><dd>{date(reg.created_at)}</dd></div><div><dt>Registration fee</dt><dd>{money(Number(reg.amount_paid)||0)}</dd></div><div><dt>GCash reference</dt><dd>{reg.reference_number||'Not supplied'}</dd></div><div><dt>Payment status</dt><dd>{reg.payment_status}</dd></div></dl>
      {cancelled?<p className={styles.ctaText}>This registration has been cancelled.</p>:paid?<p className={styles.confirmed}>✓ Present this registration code at the event booth.</p>:<div className={styles.cta}><p className={styles.ctaText}>{reg.proof_screenshot_url&&reg.payment_status!=='rejected'?'Your payment proof is awaiting verification.':'Complete your payment to confirm your slot.'}</p><Link href={`/event-payment/${encodeURIComponent(reg.registration_code)}`} className={styles.payButton}>View payment</Link></div>}
      {reg.proof_screenshot_url?<details className={styles.proof}><summary>View payment proof</summary><img src={reg.proof_screenshot_url} alt="Your submitted payment proof" className={styles.proofImg}/></details>:null}
    </div>
  </section>;
}
