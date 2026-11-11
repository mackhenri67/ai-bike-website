import Image from "next/image";
import Link from "next/link";
import type { CatalogProduct } from "@/lib/products";
import { formatPeso, PRODUCT_PLACEHOLDER_SRC } from "./data";
import styles from "./ProductCard.module.css";

type ProductCardProps = {
  product: CatalogProduct;
  /** Show the category name under the product name (listing pages). */
  showCategory?: boolean;
  variant?: "default" | "home";
};

/**
 * Reusable storefront product card — image (with placeholder fallback), name,
 * price (with compare-at strikethrough + sale badge) and a stock line. Every
 * card links to its detail page. Used on the homepage sections and the
 * `/products` listing page.
 */
export default function ProductCard({
  product,
  showCategory = false,
  variant = "default",
}: ProductCardProps) {
  const image = product.image ?? PRODUCT_PLACEHOLDER_SRC;
  const onSale =
    product.compareAtPrice !== null &&
    product.compareAtPrice > product.price;
  const outOfStock = product.stock <= 0;

  return (
    <Link href={`/products/${product.slug}`} className={styles.cardLink}>
      <article className={`${styles.card} ${variant === "home" ? styles.home : ""}`}>
        <div className={styles.imageWrap}>
          <Image
            src={image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 44vw, (max-width: 900px) 44vw, 260px"
            className={styles.image}
          />
          {onSale ? <span className={styles.badge}>Sale</span> : null}
        </div>

        <h3 className={styles.name}>{product.name}</h3>
        {showCategory && product.categoryName ? (
          <p className={styles.category}>{product.categoryName}</p>
        ) : null}

        <p className={styles.price}>
          {formatPeso(product.price)}
          {onSale ? (
            <span className={styles.compareAt}>
              {formatPeso(product.compareAtPrice ?? 0)}
            </span>
          ) : null}
        </p>

        <p
          className={outOfStock ? styles.stockOut : styles.stock}
          aria-live="polite"
        >
          {outOfStock ? "Out of stock" : `${product.stock} in stock`}
        </p>
      </article>
    </Link>
  );
}
