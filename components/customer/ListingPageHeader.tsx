import type { ReactNode } from "react";
import styles from "./ListingPageHeader.module.css";

/** Shared heading geometry for the product and event listing pages. */
export default function ListingPageHeader({
  title,
  children,
  light = false,
}: {
  title: string;
  children: ReactNode;
  light?: boolean;
}) {
  return (
    <header className={`${styles.intro} ${light ? styles.light : ""}`}>
      <div className={styles.container}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.description}>{children}</p>
      </div>
    </header>
  );
}
