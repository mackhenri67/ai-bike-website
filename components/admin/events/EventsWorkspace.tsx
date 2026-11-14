"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EventRow, EventRegistrationRow } from "@/lib/data/types";
import EventsManager from "./EventsManager";
import RegistrationsManager from "./RegistrationsManager";
import styles from "./EventsWorkspace.module.css";
export default function EventsWorkspace({events,registrations,eventError,signupError}:{events:EventRow[];registrations:EventRegistrationRow[];eventError?:string|null;signupError?:string|null}) {
 const params=useSearchParams();const router=useRouter();
 const tab=params.get("tab")==="signups"?"signups":"events";
 const [visited,setVisited]=useState(tab==="signups");
 function select(value:"events"|"signups") {if(value==="signups")setVisited(true);router.replace("/admin/events"+(value==="signups"?"?tab=signups":""),{scroll:false});}
 return <section><h1 className={styles.title}>Events</h1><p className={styles.description}>Plan cycling events and manage rider registrations.</p>
 <div className={styles.tabs} role="tablist" aria-label="Event management">
 {(["events","signups"] as const).map(t=><button key={t} id={t+"-tab"} type="button" role="tab" aria-selected={tab===t} aria-controls={t+"-panel"} tabIndex={tab===t?0:-1} onClick={()=>select(t)} onKeyDown={e=>{if(["ArrowLeft","ArrowRight","Home","End"].includes(e.key)){e.preventDefault();const next=e.key==="Home"?"events":e.key==="End"?"signups":t==="events"?"signups":"events";select(next);document.getElementById(next+"-tab")?.focus();}}}>{t==="events"?"Events":"Signups"}</button>)}
 </div>
 <div id="events-panel" role="tabpanel" aria-labelledby="events-tab" hidden={tab!=="events"}><EventsManager initialEvents={events} error={eventError} embedded/></div>
 <div id="signups-panel" role="tabpanel" aria-labelledby="signups-tab" hidden={tab!=="signups"}>{visited||tab==="signups"?<RegistrationsManager initialRegistrations={registrations} error={signupError}/>:null}</div>
 </section>;
}
