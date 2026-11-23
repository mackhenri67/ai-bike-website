"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { returnFetch } from "@/lib/returns/client";
import type { OrderKind } from "@/lib/order-management";
import styles from "./ManualOrderDialog.module.css";

type Variant = {
  id: string;
  name: string | null;
  size: string | null;
  color: string | null;
  options: Record<string, string>;
  retired: boolean;
  price: number;
  stock: number;
  available: boolean;
};

type Product = {
  id: string;
  name: string;
  price: number;
  stock: number;
  category: { is_active: boolean } | null;
  product_variants: Variant[];
};

type Line = {
  id: string;
  productId: string;
  variantId: string;
  quantity: number;
  type: "catalogue" | "custom";
  search: string;
  customName: string;
  customPrice: string;
};

const money = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(value);

const newLine = (): Line => ({
  id: crypto.randomUUID(),
  productId: "",
  variantId: "",
  quantity: 1,
  type: "catalogue",
  search: "",
  customName: "",
  customPrice: "",
});

export default function ManualOrderDialog({
  kind,
  onClose,
  onSaved,
}: {
  kind: OrderKind;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef(crypto.randomUUID());
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<Line[]>(() => [newLine()]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [address, setAddress] = useState("");
  const [laborCost, setLaborCost] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{
    orderNumber: string;
    total: number;
  } | null>(null);

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    const controller = new AbortController();

    (async () => {
      const all: Product[] = [];
      let page = 0;
      do {
        const result = await returnFetch<{
          products: Product[];
          hasMore: boolean;
        }>(
          "/api/admin/store-sales?page=" + page,
          undefined,
          controller.signal,
        );
        all.push(...result.products);
        if (!result.hasMore) break;
        page += 1;
      } while (page <= 1000);

      if (!controller.signal.aborted) {
        setProducts(all.filter((product) => !product.category || product.category.is_active));
      }
    })()
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Could not load products.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  function changeLine(id: string, values: Partial<Line>) {
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...values } : line)),
    );
  }

  const productSubtotal = lines.reduce((sum, line) => {
    if (line.type === "custom") {
      return sum + (Number(line.customPrice) || 0) * (Number(line.quantity) || 0);
    }

    const product = products.find((item) => item.id === line.productId);
    const variant = product?.product_variants.find(
      (item) => item.id === line.variantId,
    );
    return (
      sum +
      Number(variant?.price ?? product?.price ?? 0) *
        (Number(line.quantity) || 0)
    );
  }, 0);

  const laborCostValue = Number(laborCost) || 0;
  const total = productSubtotal + laborCostValue;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || saved) return;

    setBusy(true);
    setError(null);

    try {
      const result = await returnFetch<{ orderNumber: string; total: number }>(
        "/api/admin/store-sales",
        {
          id: request.current,
          sale: {
            kind,
            customerName: name,
            phone,
            address,
            notes,
            paymentMethod: method,
            reference,
            confirmed,
            laborCost: laborCostValue,
            items: lines.map((line) =>
              line.type === "custom"
                ? {
                    type: "custom",
                    name: line.customName,
                    unitPrice: Number(line.customPrice),
                    quantity: line.quantity,
                  }
                : {
                    type: "catalogue",
                    productId: line.productId,
                    variantId: line.variantId || null,
                    quantity: line.quantity,
                  },
            ),
          },
        },
      );
      setSaved(result);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not record the sale.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="manual-order-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) {
          if (saved) onSaved();
          else onClose();
        }
      }}
    >
      <header>
        <div>
          <small>In-store sale · {kind === "custom" ? "Custom Bikes" : "Parts"}</small>
          <h2 id="manual-order-title">Manual order</h2>
        </div>
        <button
          type="button"
          disabled={busy}
          aria-label="Close manual order"
          onClick={() => (saved ? onSaved() : onClose())}
        >
          ×
        </button>
      </header>

      {saved ? (
        <div className={styles.body}>
          <h3>Sale recorded</h3>
          <p>
            {saved.orderNumber} · {money(saved.total)}
          </p>
          <p>
            Paid and completed. Catalogue stock has been updated. Custom items
            are recorded as one-off sale lines. No delivery fee was charged.
          </p>
          <button type="button" className={styles.primary} onClick={onSaved}>
            View completed sales
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className={styles.body}>
          <p>
            Record a sale after payment has been collected and the items have
            been handed over. Prices and stock are checked again when you save.
          </p>

          <div className={styles.fields}>
            <label>
              Customer name (optional)
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={150}
                disabled={busy}
                placeholder="Walk-in customer"
              />
            </label>
            <label>
              Phone (optional)
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                maxLength={40}
                disabled={busy}
              />
            </label>
          </div>

          <label>
            Customer address (optional)
            <textarea
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              maxLength={1000}
              disabled={busy}
              rows={2}
              placeholder="Street, barangay, city / municipality"
            />
          </label>

          {loading ? (
            <p role="status">Loading catalogue…</p>
          ) : (
            <>
              <h3>{kind === "custom" ? "Build components" : "Products"}</h3>
              {lines.map((line, index) => {
                const product = products.find(
                  (item) => item.id === line.productId,
                );
                const variants =
                  product?.product_variants.filter((variant) => !variant.retired) ?? [];
                const selected = variants.find(
                  (variant) => variant.id === line.variantId,
                );
                const stock = selected
                  ? Math.min(product?.stock ?? 0, selected.stock)
                  : product?.stock ?? 0;

                return (
                  <fieldset key={line.id} className={styles.line} disabled={busy}>
                    <legend>Item {index + 1}</legend>
                    <label>
                      Item source
                      <select
                        value={line.type}
                        onChange={(event) =>
                          changeLine(line.id, {
                            type: event.target.value as Line["type"],
                            productId: "",
                            variantId: "",
                            search: "",
                            customName: "",
                            customPrice: "",
                          })
                        }
                      >
                        <option value="catalogue">Catalogue product</option>
                        <option value="custom">Custom product</option>
                      </select>
                    </label>

                    {line.type === "custom" ? (
                      <>
                        <div className={styles.fields}>
                          <label>
                            Custom product name
                            <input
                              value={line.customName}
                              onChange={(event) =>
                                changeLine(line.id, { customName: event.target.value })
                              }
                              minLength={2}
                              maxLength={200}
                              required
                            />
                          </label>
                          <label>
                            Unit price (PHP)
                            <input
                              type="number"
                              min="0"
                              max="9999999.99"
                              step="0.01"
                              value={line.customPrice}
                              onChange={(event) =>
                                changeLine(line.id, { customPrice: event.target.value })
                              }
                              required
                            />
                          </label>
                        </div>
                        <p>
                          This one-off item is saved with the sale. It does not
                          create a shop product or deduct catalogue stock.
                        </p>
                      </>
                    ) : (
                      <>
                        <label>
                          Search products
                          <input
                            type="search"
                            value={line.search}
                            onChange={(event) =>
                              changeLine(line.id, { search: event.target.value })
                            }
                            placeholder="Type a product name…"
                          />
                        </label>
                        <label>
                          Product
                          <select
                            required
                            value={line.productId}
                            onChange={(event) =>
                              changeLine(line.id, {
                                productId: event.target.value,
                                variantId: "",
                              })
                            }
                          >
                            <option value="">Select a product</option>
                            {products
                              .filter(
                                (item) =>
                                  item.id === line.productId ||
                                  item.name
                                    .toLowerCase()
                                    .includes(line.search.trim().toLowerCase()),
                              )
                              .map((item) => (
                                <option
                                  value={item.id}
                                  key={item.id}
                                  disabled={item.stock < 1}
                                >
                                  {item.name} · {item.stock} available
                                </option>
                              ))}
                          </select>
                        </label>
                        {variants.length ? (
                          <label>
                            Combination
                            <select
                              required
                              value={line.variantId}
                              onChange={(event) =>
                                changeLine(line.id, { variantId: event.target.value })
                              }
                            >
                              <option value="">Select a combination</option>
                              {variants.map((variant) => (
                                <option
                                  value={variant.id}
                                  key={variant.id}
                                  disabled={!variant.available || variant.stock < 1}
                                >
                                  {Object.entries(variant.options ?? {})
                                    .map(([key, value]) => key + ": " + value)
                                    .join(" · ") ||
                                    variant.name ||
                                    [variant.size, variant.color]
                                      .filter(Boolean)
                                      .join(" · ") ||
                                    "Standard"}{" "}
                                  · {variant.stock} available · {money(Number(variant.price))}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                      </>
                    )}

                    <div className={styles.lineFooter}>
                      <label>
                        Quantity
                        <input
                          type="number"
                          required
                          min={1}
                          max={line.type === "custom" ? 10000 : Math.min(10000, stock)}
                          step={1}
                          value={line.quantity}
                          onChange={(event) =>
                            changeLine(line.id, { quantity: Number(event.target.value) })
                          }
                        />
                      </label>
                      <span>
                        {money(
                          line.type === "custom"
                            ? Number(line.customPrice) || 0
                            : Number(selected?.price ?? product?.price ?? 0),
                        )}{" "}
                        each
                      </span>
                      <button
                        type="button"
                        disabled={lines.length === 1}
                        onClick={() =>
                          setLines((current) =>
                            current.filter((item) => item.id !== line.id),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </fieldset>
                );
              })}

              <button
                type="button"
                disabled={busy || lines.length >= 100}
                onClick={() => setLines((current) => [...current, newLine()])}
              >
                ＋ Add product
              </button>
            </>
          )}

          <label>
            Labor cost (optional, PHP)
            <input
              type="number"
              min="0"
              max="9999999999.99"
              step="0.01"
              value={laborCost}
              onChange={(event) => setLaborCost(event.target.value)}
              disabled={busy}
              placeholder="0.00"
            />
          </label>

          <div className={styles.fields}>
            <label>
              Payment method
              <select
                value={method}
                onChange={(event) => setMethod(event.target.value)}
                disabled={busy}
              >
                <option value="cash">Cash</option>
                <option value="gcash">GCash</option>
              </select>
            </label>
            <label>
              Payment reference {method === "gcash" ? "" : "(optional)"}
              <input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                maxLength={150}
                minLength={method === "gcash" ? 4 : undefined}
                required={method === "gcash"}
                disabled={busy}
              />
            </label>
          </div>

          <label>
            Notes (optional)
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={2000}
              rows={2}
              disabled={busy}
            />
          </label>

          <div className={styles.costSummary}>
            <p>Product subtotal: {money(productSubtotal)}</p>
            <p>Labor revenue: {money(laborCostValue)}</p>
            <p className={styles.total}>
              Total: {money(total)}
              <small>No delivery fee</small>
            </p>
          </div>

          <label className={styles.confirm}>
            <input
              type="checkbox"
              required
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              disabled={busy}
            />
            I confirm the payment was collected and all items were handed to the
            customer.
          </label>

          {error ? (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          ) : null}

          <footer>
            <button type="button" disabled={busy} onClick={onClose}>
              Back
            </button>
            <button
              type="submit"
              className={styles.primary}
              disabled={busy || loading || !confirmed}
            >
              {busy ? "Recording…" : "Record completed sale"}
            </button>
          </footer>
        </form>
      )}
    </dialog>
  );
}
