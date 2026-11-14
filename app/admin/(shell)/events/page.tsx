import type { Metadata } from "next";
import { listAdminEvents, listAllRegistrations } from "@/lib/data/admin/events";
import EventsWorkspace from "@/components/admin/events/EventsWorkspace";
export const metadata:Metadata={title:"Events | LnR Cycle Center"};
export const dynamic="force-dynamic";
export default async function AdminEventsPage(){
 const [events,signups]=await Promise.all([listAdminEvents(),listAllRegistrations()]);
 return <EventsWorkspace events={events.data??[]} registrations={signups.data??[]} eventError={events.error} signupError={signups.error}/>;
}
