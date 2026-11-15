import Link from "next/link";
import styles from "./AccountNav.module.css";
const sections=[
 {key:"profile",label:"Profile",description:"Personal details",path:"M20 21v-2a7 7 0 0 0-14 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"},
 {key:"orders",label:"My Orders",description:"Purchases and returns",path:"m3 7 9-5 9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5M12 12v10M7.5 4.5l9 5"},
 {key:"events",label:"My Events",description:"Registrations and tickets",path:"M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"},
] as const;
export default function AccountNav({active}:{active:"profile"|"orders"|"events"}){
 return <nav className={styles.nav} aria-label="Account sections">{sections.map(section=><Link key={section.key} href={`/profile?tab=${section.key}`} aria-current={active===section.key?"page":undefined} className={styles.link}><span className={styles.icon}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={section.path}/></svg></span><span><strong>{section.label}</strong><small>{section.description}</small></span><span className={styles.arrow} aria-hidden="true">›</span></Link>)}</nav>;
}
