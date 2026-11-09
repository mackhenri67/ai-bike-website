"use client";

import { useDirectCheckout } from "@/components/customer/direct-checkout";
import { useMemo, useState } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { useCart } from "@/components/customer/CartContext";
import {
  calculateSubtotal,
  calculateTotal,
  formatCurrency,
  SHIPPING_FEE,
} from "@/components/customer/cart-store";
import { placeOrder } from "./actions";
import styles from "./page.module.css";

type CheckoutViewProps = {
  direct?: boolean;
  customerName: string;
  location: {
    label: string | null;
    address: string;
  };
};

const PAYMENT_METHODS = [
  {
    value: "gcash" as const,
    title: "GCash",
    description: "Pay securely with your GCash wallet.",
  },
  {
    value: "cod" as const,
    title: "Cash on Delivery",
    description: "Pay in cash when your order arrives.",
  },
];

export default function CheckoutView({
  customerName,
  location,
  direct = false,
}: CheckoutViewProps) {
  const { items } = useCart();
  const directItems = useDirectCheckout();
  const [paymentMethod, setPaymentMethod] = useState<"gcash" | "cod">("gcash");
  const [state, formAction, isPlacing] = useActionState(placeOrder, {
    error: null,
  });

  const selectedItems = useMemo(
    () => direct ? (directItems ?? []) : items.filter((item) => item.selected),
    [items, direct, directItems],
  );

  const subtotal = useMemo(
    () => calculateSubtotal(selectedItems),
    [selectedItems],
  );
  const total = useMemo(() => calculateTotal(subtotal), [subtotal]);

  if (selectedItems.length === 0) {
    return (
      <div className={styles.emptyCard}>
        <h2 className={styles.cardTitle}>{direct ? "No Buy Now selection" : "Your cart is empty"}</h2>
        <p className={styles.text}>
          {direct ? "Return to the product or bike builder and click Buy Now again." : "Select at least one product in your cart before checking out."}
        </p>
        <Link href={direct ? "/products" : "/cart"} className={styles.button}>
          {direct ? "Browse products" : "Go to Cart"}
        </Link>
      </div>
    );
  }

  const itemsJson = JSON.stringify(
    selectedItems.map((item) => ({
      productId: item.productId,
      name: item.name,
      price: item.price,
      variantId: item.variantId,
      options: item.options,
      builderStepNumber: item.builderStepNumber,
      size: item.size,
      color: item.color,
      quantity: item.quantity,
    })),
  );

  return (
    <div className={styles.grid}>
      {/* Delivery + payment details */}
      <div className={styles.stack}>
        <section className={styles.card} aria-labelledby="delivery-title">
          <h2 className={styles.cardTitle} id="delivery-title">
            Delivery Details
          </h2>
          <p className={styles.deliveryName}>{customerName}</p>
          {location.label ? (
            <p className={styles.deliveryLabel}>{location.label}</p>
          ) : null}
          <p className={styles.deliveryAddress}>{location.address}</p>
          <Link href="/location?next=%2Fcheckout" className={styles.editLink}>
            Change delivery location
          </Link>
        </section>

        <section className={styles.card} aria-labelledby="payment-title">
          <h2 className={styles.cardTitle} id="payment-title">
            Payment Method
          </h2>
          <div className={styles.paymentOptions}>
            {PAYMENT_METHODS.map((method) => {
              const selected = paymentMethod === method.value;
              return (
                <label key={method.value} className={styles.paymentOption}>
                  <input
                    type="radio"
                    name="payment_method"
                    value={method.value}
                    checked={selected}
                    onChange={() => setPaymentMethod(method.value)}
                    className={styles.radio}
                  />
                  <span className={styles.paymentCopy}>
                    <span className={styles.paymentTitle}>{method.title}</span>
                    <span className={styles.paymentDesc}>
                      {method.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {paymentMethod === "gcash" ? (
            <p className={styles.note}>
              After confirming your order you&apos;ll be taken to a payment page
              where you can scan the GCash QR code and upload your payment
              proof. We confirm the order once payment is verified.
            </p>
          ) : null}
        </section>
      </div>

      {/* Order summary */}
      <section className={styles.card} aria-labelledby="summary-title">
        <h2 className={styles.cardTitle} id="summary-title">
          Order Summary
        </h2>

        <ul className={styles.lineList}>
          {selectedItems.map((item) => (
            <li key={item.key} className={styles.line}>
              <div className={styles.lineCopy}>
                <span className={styles.lineName}>{item.name}</span>
                <span className={styles.lineMeta}>
                  {item.size}
                  {item.size && item.color ? " · " : ""}
                  {item.color} × {item.quantity}
                </span>
              </div>
              <span className={styles.linePrice}>
                {formatCurrency(item.price * item.quantity)}
              </span>
            </li>
          ))}
        </ul>

        <dl className={styles.totals}>
          <div className={styles.totalRow}>
            <dt>Subtotal</dt>
            <dd>{formatCurrency(subtotal)}</dd>
          </div>
          <div className={styles.totalRow}>
            <dt>Shipping</dt>
            <dd>{formatCurrency(SHIPPING_FEE)}</dd>
          </div>
          <div className={`${styles.totalRow} ${styles.grand}`}>
            <dt>Total</dt>
            <dd>{formatCurrency(total)}</dd>
          </div>
        </dl>

        <form action={formAction} noValidate>
          <input type="hidden" name="checkout_mode" value={direct ? "buy-now" : "cart"} />
            <input type="hidden" name="items" value={itemsJson} />
          <input type="hidden" name="payment_method" value={paymentMethod} />

          {state.error ? (
            <p role="alert" className={styles.error}>
              {state.error}
            </p>
          ) : null}

          <button type="submit" className={styles.button} disabled={isPlacing}>
            {isPlacing ? "Placing order…" : "Confirm Order"}
          </button>
        </form>
      </section>
    </div>
  );
}
