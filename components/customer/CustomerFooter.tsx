import Link from "next/link";
import Image from "next/image";
import { FOOTER_LOGO_SRC, STORE_INFO } from "./data";
import { FacebookIcon, MailIcon } from "./icons";
import styles from "./CustomerFooter.module.css";

/**
 * Compact black footer: navigation + legal links on the left, centered logo
 * with copyright, and Follow Us / email on the right.
 */
export default function CustomerFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <nav className={`${styles.column} ${styles.navigation}`} aria-label="Footer navigation">
          <div className={styles.primaryLinks}>
            <Link href="/" className={styles.link}>
              Home
            </Link>
            <Link href="/products" className={styles.link}>
              Products
            </Link>
            <Link href="/about" className={styles.link}>
              About Us
            </Link>
            <Link href="/events" className={styles.link}>
              Events
            </Link>
            <Link href="/custom-bike-builder" className={styles.link}>
              Build a Bike
            </Link>
          </div>

          <span className={styles.separator} />

          <div className={styles.legalLinks}>
            <Link href="/privacy-policy" className={styles.link}>
              Privacy Policy
            </Link>
            <Link href="/terms" className={styles.link}>
              Terms and Conditions
            </Link>
          </div>
        </nav>

        <div className={styles.brand}>
          <Link href="/" aria-label="LNR Cycle Center home">
          <Image
            src={FOOTER_LOGO_SRC}
            alt="LNR Cycle Center"
            width={63}
            height={73}
            className={styles.logo}
          />
          </Link>
          <p className={styles.copyright}>© LNR Cycle Center 2026</p>
        </div>

        <div className={styles.column}>
          <p className={styles.follow}>Follow Us</p>
          <a
            href="https://www.facebook.com/"
            target="_blank"
            rel="noreferrer"
            className={styles.socialLink}
            aria-label="LNR Cycle Center on Facebook"
          >
            <FacebookIcon size={14} />
          </a>
          <p className={styles.emailLabel}>Email us at:</p>
          <a href={`mailto:${STORE_INFO.email}`} className={styles.email}>
            <MailIcon size={12} />
            <span>{STORE_INFO.email}</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
