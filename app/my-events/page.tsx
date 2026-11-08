import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getOrCreateCustomer } from "@/lib/data/customer/customers";
import { listMyEventRegistrations } from "@/lib/data/customer/events";
import CustomerHeader from "@/components/customer/CustomerHeader";
import CustomerFooter from "@/components/customer/CustomerFooter";
import AccountNav from "@/components/customer/AccountNav";
import AccountPanel from "@/components/customer/AccountPanel";
import styles from "@/app/profile/page.module.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My Events | LNR Cycle Center" };
export default async function MyEventsPage() {
 const user=await getUser();if(!user)redirect("/login?next=%2Fmy-events");
 const customer=await getOrCreateCustomer(user);if(!customer)redirect("/login?next=%2Fmy-events");
 const result=await listMyEventRegistrations(customer.id);
 return <><CustomerHeader/><main className={styles.page}><div className={styles.container}><h1 className={styles.title}>Account Overview</h1><AccountNav active="events"/><h2 className={styles.sectionHeading}>My Events</h2>{result.error?<p role="alert" className={styles.error}>{result.error}</p>:null}<AccountPanel kind="events" registrations={result.data??[]}/></div></main><CustomerFooter/></>;
}
