import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getCustomerProfile } from "@/lib/data/customer/profile";
import { listMyEventRegistrations } from "@/lib/data/customer/events";
import CustomerHeader from "@/components/customer/CustomerHeader";
import CustomerFooter from "@/components/customer/CustomerFooter";
import AccountNav from "@/components/customer/AccountNav";
import AccountPanel from "@/components/customer/AccountPanel";
import ProfileForms from "./profile-forms";
import SignOutButton from "./sign-out-button";
import styles from "./page.module.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account Overview | LNR Cycle Center" };
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{tab?:string;ticket?:string}> }) {
  const {tab,ticket}=await searchParams;const active=tab==='orders'?'orders':tab==='events'?'events':'profile';
  const next = `/profile?tab=${active}${ticket ? `&ticket=${encodeURIComponent(ticket)}` : ""}`;
  const user=await getUser();if(!user)redirect(`/login?next=${encodeURIComponent(next)}`);
  const profile=await getCustomerProfile(user.id);
  if(!profile)return <><CustomerHeader/><main className={styles.page}><div className={styles.container}><p>We couldn&apos;t load your account. Please try again later.</p></div></main><CustomerFooter/></>;
  const {customer,location,orders}=profile;
  const eventsResult=active==='events'?await listMyEventRegistrations(customer.id):null;
  return <><CustomerHeader/><main className={styles.page}><div className={styles.container}>
    <div className={styles.headRow}><div><h1 className={styles.title}>Account Overview</h1><p className={styles.subtitle}>Hi, {customer.full_name}</p></div><SignOutButton/></div>
    <AccountNav active={active}/>
    <h2 className={styles.sectionHeading}>{active==='orders'?'My Orders':active==='events'?'My Events':'My Profile'}</h2>
    {active==='profile' ? <>
          <div className={styles.grid}>
            <section className={styles.card} aria-labelledby="info-title">
              <h2 className={styles.cardTitle} id="info-title">
                Personal Information
              </h2>
              <ProfileForms
                initial={{
                  fullName: customer.full_name,
                  email: customer.email,
                  phone: customer.phone,
                }}
              />
            </section>

            <section className={styles.card} aria-labelledby="location-title">
              <h2 className={styles.cardTitle} id="location-title">
                Delivery Location
              </h2>
              {location ? (
                <div className={styles.location}>
                  {location.label ? (
                    <p className={styles.locationLabel}>{location.label}</p>
                  ) : null}
                  <p className={styles.locationAddress}>{location.address}</p>
                  <p className={styles.locationCoords}>
                    {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                  </p>
                  <Link href="/location?next=%2Fprofile" className={styles.editLocation}>
                    Update delivery location
                  </Link>
                </div>
              ) : (
                <div className={styles.location}>
                  <p className={styles.locationEmpty}>
                    You haven&apos;t set a delivery location yet — checkout requires
                    one before you can place an order.
                  </p>
                  <Link href="/location?next=%2Fprofile" className={styles.editLocation}>
                    Set delivery location
                  </Link>
                </div>
              )}
            </section>
          </div>


    </> : active==='orders'?<div id="orders-title"><AccountPanel kind="orders" orders={orders}/></div>:<>{eventsResult?.error?<p className={styles.error} role="alert">{eventsResult.error}</p>:null}<AccountPanel key={ticket ?? "events"} kind="events" registrations={eventsResult?.data??[]} initialTicketCode={ticket}/></>}
  </div></main><CustomerFooter/></>;
}
