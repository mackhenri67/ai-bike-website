"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "./CartContext";
import { formatCurrency } from "./cart-store";
import { CartIcon, ChevronDownIcon } from "./icons";
import type { CatalogProductDetail } from "@/lib/products";
import { PRODUCT_PLACEHOLDER_SRC } from "./data";
import styles from "./ProductDetail.module.css";

/**
 * Product information section — breadcrumb, image gallery, and the purchase
 * controls (size / color / quantity, Add to Cart, Buy Now). All controls are
 * wired to the shared cart context so the header badge stays in sync.
 */
export default function ProductDetail({
  product,
}: {
  product: CatalogProductDetail;
}) {
  const router = useRouter();
  const { addItem } = useCart();

  // Products without image rows yet (or whose uploads failed) fall back to a
  // branded placeholder so the gallery never renders broken images.
  const images =
    product.images.length > 0 ? product.images : [PRODUCT_PLACEHOLDER_SRC];

  const [activeImage, setActiveImage] = useState(images[0]);
  // Products without variants still go through the cart with neutral
  // size/color values (the selects below are hidden when there are none).
  const [size, setSize] = useState(
    product.sizes.length > 0 ? product.sizes[0] : "One Size",
  );
  const [color, setColor] = useState(
    product.colors.length > 0 ? product.colors[0] : "Default",
  );
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const addTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (addTimer.current) clearTimeout(addTimer.current);
    };
  }, []);

  const selectedVariant = product.variants.find(
    (v) =>
      (v.size ?? "") === (size === "One Size" ? "" : size) &&
      (v.color ?? "") === (color === "Default" ? "" : color),
  );
  const unitPrice = selectedVariant?.price ?? product.price;
  const availableStock = selectedVariant
    ? Math.min(product.stock, selectedVariant.stock)
    : product.stock;
  const outOfStock =
    !product.available || (product.hasVariants && !selectedVariant);
  const categoryHref = product.categorySlug
    ? `/products?category=${product.categorySlug}`
    : "/products";

  const currentSelection = () => ({
    productId: product.id,
    name: product.name,
    price: unitPrice,
    variantId: selectedVariant?.id,
    image: images[0],
    size,
    color,
    quantity,
    stock: availableStock,
  });

  const handleAddToCart = () => {
    addItem(currentSelection());
    setJustAdded(true);
    if (addTimer.current) clearTimeout(addTimer.current);
    addTimer.current = setTimeout(() => setJustAdded(false), 1500);
  };

  const handleBuyNow = () => {
    addItem(currentSelection());
    // Straight to checkout — if the customer isn't signed in the checkout
    // page sends them to /login?next=/checkout, and the localStorage cart
    // survives the round-trip.
    router.push("/checkout");
  };

  return (
    <main className={styles.section}>
      <div className={styles.container}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/" className={styles.crumb}>
            Home
          </Link>
          <span className={styles.crumbSeparator} aria-hidden="true">
            &gt;
          </span>
          <Link href={categoryHref} className={styles.crumb}>
            {product.category}
          </Link>
          <span className={styles.crumbSeparator} aria-hidden="true">
            &gt;
          </span>
          <span className={styles.crumbCurrent}>{product.name}</span>
        </nav>

        <div className={styles.layout}>
          {/* Product gallery */}
          <div className={styles.gallery}>
            <div className={styles.mainImage}>
              <Image
                key={activeImage}
                src={activeImage}
                alt={product.name}
                fill
                sizes="(max-width: 900px) 92vw, 480px"
                className={styles.mainImg}
                priority
              />
            </div>
            <div className={styles.thumbnails}>
              {images.map((src, index) => {
                const isActive = src === activeImage;
                return (
                  <button
                    key={`${src}-${index}`}
                    type="button"
                    className={
                      isActive
                        ? `${styles.thumb} ${styles.thumbActive}`
                        : styles.thumb
                    }
                    onClick={() => setActiveImage(src)}
                    aria-label={`View ${product.name} image ${index + 2}`}
                    aria-pressed={isActive}
                  >
                    <Image
                      src={src}
                      alt=""
                      fill
                      sizes="96px"
                      className={styles.thumbImg}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Product information */}
          <div className={styles.info}>
            <h1 className={styles.name}>{product.name}</h1>
            <p className={styles.price}>{formatCurrency(unitPrice)}</p>

            <p className={outOfStock ? styles.stockOut : styles.stock}>
              {outOfStock ? "Out of stock" : `${availableStock} in stock`}
            </p>

            {(product.description || product.tagline.length > 0) && (
              <div className={styles.description}>
                {product.description ? <p>{product.description}</p> : null}
                {product.tagline.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            )}

            {product.specs.length > 0 && (
              <div className={styles.specs}>
                <h2 className={styles.specsHeading}>Product Specifications-</h2>
                <ul className={styles.specsList}>
                  {product.specs.map((spec) => (
                    <li key={spec}>{spec}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className={styles.options}>
              {product.sizes.length > 0 && (
                <div className={styles.option}>
                  <label className={styles.optionLabel} htmlFor="product-size">
                    Size
                  </label>
                  <div className={styles.selectWrap}>
                    <select
                      id="product-size"
                      className={styles.select}
                      value={size}
                      onChange={(event) => {
                        setSize(event.target.value);
                        setQuantity(1);
                      }}
                    >
                      {product.sizes.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <ChevronDownIcon size={14} className={styles.selectIcon} />
                  </div>
                </div>
              )}

              {product.colors.length > 0 && (
                <div className={styles.option}>
                  <label className={styles.optionLabel} htmlFor="product-color">
                    Color
                  </label>
                  <div className={styles.selectWrap}>
                    <select
                      id="product-color"
                      className={styles.select}
                      value={color}
                      onChange={(event) => {
                        setColor(event.target.value);
                        setQuantity(1);
                      }}
                    >
                      {product.colors.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <ChevronDownIcon size={14} className={styles.selectIcon} />
                  </div>
                </div>
              )}

              <div className={styles.option}>
                <span className={styles.optionLabel}>Quantity</span>
                <div className={styles.quantity}>
                  <button
                    type="button"
                    className={styles.qtyBtn}
                    onClick={() =>
                      setQuantity((current) => Math.max(1, current - 1))
                    }
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className={styles.qtyValue} aria-live="polite">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    className={styles.qtyBtn}
                    onClick={() => setQuantity((current) => current + 1)}
                    disabled={product.stock > 0 && quantity >= availableStock}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              className={styles.addToCart}
              onClick={handleAddToCart}
              disabled={outOfStock}
            >
              <CartIcon size={16} />
              <span>
                {justAdded
                  ? "Added to Cart ✓"
                  : outOfStock
                    ? "Out of Stock"
                    : "Add to Cart"}
              </span>
            </button>
            <button
              type="button"
              className={styles.buyNow}
              onClick={handleBuyNow}
              disabled={outOfStock}
            >
              Buy Now
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
