import Link from "next/link";
import styles from "./AccountPanel.module.css";
export default function AccountNav({ active }: { active: "profile" | "orders" | "events" }) {
  return <nav className={styles.tabs} aria-label="Account sections">{([['profile','Profile'],['orders','My Orders'],['events','My Events']] as const).map(([key,label]) => <Link key={key} href={`/profile?tab=${key}`} aria-current={active===key?'page':undefined} className={active===key?styles.activeTab:styles.tab}>{label}</Link>)}</nav>;
}
