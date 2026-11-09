"use client";

import { useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "./CartContext";
import {
  cartProductHref,
  calculateSubtotal,
  calculateTotal,
  formatCurrency,
  selectedItemCount,
  SHIPPING_FEE,
} from "./cart-store";
import { TrashIcon } from "./icons";
import styles from "./CartView.module.css";

/**
 * Shopping Cart content section — select-all row, product lines with
 * custom checkboxes / quantity steppers / delete buttons, and an order
 * summary card. All state comes from the shared cart context.
 */
export default function CartView() {
  const router = useRouter();
  const {
    items,
    toggleItemSelection,
    toggleSelectAll,
    incrementQuantity,
    decrementQuantity,
    removeItem,
    removeSelectedItems,
  } = useCart();

  const allSelected = items.length > 0 && items.every((item) => item.selected);
  const someSelected = items.some((item) => item.selected);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  const subtotal = useMemo(() => calculateSubtotal(items), [items]);
  const total = useMemo(() => calculateTotal(subtotal), [subtotal]);
  const count = selectedItemCount(items);

  const handleCheckout = () => {
    if (someSelected) router.push("/checkout");
  };

  if (items.length === 0) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>Shopping Cart</h1>
          <div className={styles.empty}>
            <p className={styles.emptyText}>Your cart is currently empty.</p>
            <Link href="/" className={styles.continueShopping}>
              Continue Shopping
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>Shopping Cart</h1>

        <div className={styles.layout}>
          {/* Cart lines */}
          <section className={styles.cartCard} aria-label="Cart items">
            <div className={styles.selectAllRow}>
              <input
                ref={selectAllRef}
                id="select-all"
                type="checkbox"
                className={styles.checkbox}
                checked={allSelected}
                onChange={toggleSelectAll}
              />
              <label htmlFor="select-all" className={styles.selectAllLabel}>
                Select All (
                {items.length} {items.length === 1 ? "item" : "items"})
              </label>
              <button type="button" className={styles.batchDelete} disabled={!someSelected} onClick={removeSelectedItems}>
                <TrashIcon size={16} /> Delete Selected ({items.filter((item) => item.selected).length})
              </button>
            </div>

            <ul className={styles.items}>
              {items.map((item) => (
                <li key={item.key} className={styles.row}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={item.selected}
                    onChange={() => toggleItemSelection(item.key)}
                    aria-label={`Select ${item.name}`}
                  />
                  <Link href={cartProductHref(item)} aria-label={`View ${item.name}`}
                    className={
                      item.productId === "proway-bottle-cage"
                        ? styles.imageSmall
                        : styles.image
                    }
                  >
                    <Image
                      src={item.image}
                      alt={item.name}
                      fill
                      sizes="100px"
                      className={styles.imageInner}
                    />
                  </Link>
                  <div className={styles.info}>
                    <h3 className={styles.name}><Link href={cartProductHref(item)}>{item.name}</Link></h3>
                    <p className={styles.price}>{formatCurrency(item.price)}</p>
                  </div>
                  <div className={styles.quantity}>
                    <button
                      type="button"
                      className={styles.qtyBtn}
                      onClick={() => decrementQuantity(item.key)}
                      aria-label={`Decrease quantity of ${item.name}`}
                    >
                      −
                    </button>
                    <span className={styles.qtyValue} aria-live="polite">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      className={styles.qtyBtn}
                      onClick={() => incrementQuantity(item.key)}
                      disabled={item.stock > 0 && item.quantity >= item.stock}
                      aria-label={`Increase quantity of ${item.name}`}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={() => removeItem(item.key)}
                    aria-label={`Remove ${item.name}`}
                  >
                    <TrashIcon size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* Order summary */}
          <aside className={styles.summary} aria-label="Order summary">
            <h2 className={styles.summaryTitle}>Order Summary</h2>
            <div className={styles.summaryRow}>
              <span>
                Subtotal ({count} {count === 1 ? "item" : "items"})
              </span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className={`${styles.summaryRow} ${styles.shippingRow}`}>
              <span>Shipping fee</span>
              <span>{formatCurrency(SHIPPING_FEE)}</span>
            </div>
            <div className={styles.divider} />
            <div className={`${styles.summaryRow} ${styles.totalRow}`}>
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
            <button
              type="button"
              className={styles.checkout}
              onClick={handleCheckout}
              disabled={!someSelected}
            >
              Checkout
            </button>
          </aside>
        </div>
      </div>
    </main>
  );
}

