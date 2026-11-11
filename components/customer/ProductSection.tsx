import Link from "next/link";
import type { CatalogProduct } from "@/lib/products";
import ProductCard from "./ProductCard";
import styles from "./ProductSection.module.css";

type ProductSectionProps = {
  title: string;
  products: CatalogProduct[];
  viewAllHref: string;
  /** Optional extra class (e.g. vertical spacing between sections). */
  className?: string;
};

/**
 * Reusable product row — centered heading, 4-column grid of compact
 * product cards (image / name / price / stock) and a small outlined
 * "View All" button. Used for New Arrivals, Parts and Accessories.
 */
export default function ProductSection({
  title,
  products,
  viewAllHref,
  className,
}: ProductSectionProps) {
  const sectionClass = className
    ? `${styles.section} ${className}`
    : styles.section;

  return (
    <section className={sectionClass}>
      <div className={styles.container}>
        <h2 className={styles.title}>{title}</h2>

        {products.length === 0 ? <p className={styles.empty}>No available products in this section yet.</p> : null}
        <div className={styles.grid}>
          {products.map((product) => (
            <ProductCard key={product.id} product={product} variant="home" />
          ))}
        </div>

        <div className={styles.viewAllWrap}>
          <Link href={viewAllHref} className={styles.viewAll}>
            View All
          </Link>
        </div>
      </div>
    </section>
  );
}

