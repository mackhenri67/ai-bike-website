
"use client";
import type {User} from "@supabase/supabase-js";
import {usePathname} from "next/navigation";
import styles from "./AdminHeader.module.css";
const names:Record<string,string>={dashboard:"Overview",orders:"Orders",products:"Products",events:"Events",registrations:"Events",customers:"Customers",messages:"Messages",settings:"Settings"};
export default function AdminHeader({user}:{user:User|null}){
 const path=usePathname();const section=names[path.split("/")[2]??"dashboard"]??"Overview";
 const meta=user?.user_metadata as Record<string,unknown>|undefined;
 const name=typeof meta?.full_name==="string" && meta.full_name.trim()?meta.full_name:"Administrator";
 const initials=name.split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase();
 return <header className={styles.header}><div className={styles.breadcrumb}><span>Workspace</span><span aria-hidden="true">/</span><strong>{section}</strong></div><div className={styles.identity}><div className={styles.text}><p className={styles.name}>{name}</p><p className={styles.role}>Administrator</p></div><span className={styles.avatar} aria-hidden="true">{initials}</span></div></header>;
}
