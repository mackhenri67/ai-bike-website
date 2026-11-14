import Link from "next/link";
import CustomerHeader from "./CustomerHeader";
import CustomerFooter from "./CustomerFooter";
import styles from "./PolicyPage.module.css";

type Section = { title: string; text: string };
export default function PolicyPage({ title, introduction, sections }: { title: string; introduction: string; sections: Section[] }) {
  return <><CustomerHeader /><main className={styles.page}><article>
    <p className={styles.eyebrow}>LNR Cycle Center</p><h1>{title}</h1>
    <p className={styles.date}>Last updated: November 14, 2026</p>
    <p>{introduction}</p>
    {sections.map((section) => <section key={section.title}><h2>{section.title}</h2><p>{section.text}</p></section>)}
    <section><h2>Contact us</h2><p>For questions or requests, email <a href="mailto:lnrcyclecenter@gmail.com">lnrcyclecenter@gmail.com</a> or visit LNR Cycle Center, Karangahan Boulevard, Bonbon, Tabaco City, Albay, Philippines. Please provide enough information for us to identify your account or transaction, but never send your password.</p></section>
    <nav aria-label="Policy links"><Link href="/privacy-policy">Privacy Policy</Link><Link href="/terms">Terms and Conditions</Link><Link href="/">Back to Home</Link></nav>
  </article></main><CustomerFooter /></>;
}
