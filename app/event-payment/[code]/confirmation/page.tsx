import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCustomerByAuthUserId } from "@/lib/data/customer/customers";
import { requireCustomer } from "@/lib/auth/guards";
import { getEventRegistrationByCode } from "@/lib/data/customer/events";
import CustomerHeader from "@/components/customer/CustomerHeader";
import CustomerFooter from "@/components/customer/CustomerFooter";
import EventSteps from "@/components/customer/EventSteps";
import styles from "./page.module.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Registration status | LNR Cycle Center" };
export default async function EventConfirmation({params}: {params:Promise<{code:string}>}) {
 const {code}=await params;
 const user = await requireCustomer(`/login?next=${encodeURIComponent(`/event-payment/${encodeURIComponent(code)}/confirmation`)}`);
 const result=await getEventRegistrationByCode(code);const reg=result.data;
 const customer = await getCustomerByAuthUserId(user.id);
 if(!reg || !customer || reg.customer_id !== customer.id || reg.status==='cancelled')notFound();
 // A manually entered completion URL cannot skip required payment submission.
 if(reg.payment_status!=='paid' && (!reg.proof_screenshot_url || reg.payment_status==='rejected'))redirect(`/event-payment/${encodeURIComponent(reg.registration_code)}`);
 const paid=reg.payment_status==='paid';const free=Number(reg.amount_paid)===0;
 const amount=new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(reg.amount_paid));
 return <><CustomerHeader/><main className={styles.page}><div className={styles.container}>
  <h1 className={styles.title}>{paid?'Registration completed':'Payment submitted'}</h1>
  <p className={styles.lead}>{paid?(free?'Your free-event registration is confirmed.':'Your payment has been verified and your registration is confirmed.'):'Your GCash proof has been received. Registration is awaiting payment verification.'}</p>
  <EventSteps current={3}/>
  <section className={styles.card}><h2>{reg.event?.title??'Event registration'}</h2><dl><div><dt>Registration code</dt><dd>{reg.registration_code}</dd></div><div><dt>Rider</dt><dd>{reg.rider_name}</dd></div><div><dt>Emergency contact</dt><dd>{reg.emergency_contact||'Not provided'}</dd></div><div><dt>Amount</dt><dd>{amount}</dd></div><div><dt>Payment status</dt><dd>{paid?(free?'No payment required':'Paid / Verified'):'Awaiting verification'}</dd></div></dl>
  <div className={styles.actions}><Link href={`/profile?tab=events&ticket=${encodeURIComponent(reg.registration_code)}`} className={styles.primary}>View Ticket</Link><Link href="/events" className={styles.secondary}>Browse events</Link></div></section>
 </div></main><CustomerFooter/></>;
}
