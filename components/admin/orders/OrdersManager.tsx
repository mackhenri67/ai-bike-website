"use client";
import RecordPreviewButton from "@/components/admin/RecordPreviewButton";

import { useMemo, useState } from "react";
import type { GcashPaymentRow, OrderRow, OrderStatus } from "@/lib/data/types";
import {
  reviewGcashPaymentAction,
  updateOrderStatusAction,
} from "@/app/admin/(shell)/orders/actions";
import styles from "./OrdersManager.module.css";
import { MapPinIcon, SearchIcon, CloseIcon } from "./icons";
import OrderLocationMap from "./OrderLocationMap";

type DisplayOrder = {
  source: OrderRow;
  /** Database row id — used for persistence, never shown to the admin. */
  dbId: string;
  /** Human-friendly order identifier shown in the table (order number). */
  id: string;
  customer: string;
  email: string;
  item: string;
  quantity: number;
  total: number;
  paymentMethod: string;
  /** orders.payment_status — 'pending' | 'paid' | 'rejected' | ... */
  paymentStatus: string;
  /** The customer's actual GCash submission, when one exists. */
  gcashPayment: GcashPaymentRow | null;
  date: string;
  status: OrderStatus;
  /** Delivery address + coordinates snapshotted on the order. Null when the
   *  order was placed without a map location (e.g. walk-in / legacy orders). */
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  customerPhone: string | null;
};

const TABS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "shipping", label: "Shipping" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  shipping: "Shipping",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Badges shown in the GCash payment verification modal. */
const PAYMENT_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending Verification", className: styles.payPending },
  paid: { label: "Paid", className: styles.payPaid },
  rejected: { label: "Rejected", className: styles.payRejected },
};

/* Table column widths: Actions is widened so the map button + two status
   buttons can sit side by side without overflow. */
const COLUMN_WIDTHS = [7, 13, 14, 8, 14, 9, 9, 26];

function formatPeso(value: number): string {
  return `₱${value.toLocaleString("en-US")}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Normalizes the embedded gcash_payments resource (object or array). */
function toGcashPayment(order: OrderRow): GcashPaymentRow | null {
  const raw = order.gcash_payments;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return (raw as GcashPaymentRow | null) ?? null;
}

function toDisplayOrder(order: OrderRow): DisplayOrder {
  const items = order.order_items ?? [];
  const first = items[0];
  const item =
    items.length > 1
      ? `${first?.product_name ?? "Multiple items"} +${items.length - 1}`
      : first?.product_name ?? "—";
  const quantity = items.reduce((sum, line) => sum + line.quantity, 0);

  return {
    source: order,
    dbId: order.id,
    id: order.order_number,
    customer: order.customer_name,
    email: order.customer_email ?? "—",
    item,
    quantity,
    total: order.total,
    paymentMethod:
      order.payment_method === "gcash" ? "GCash" : "Cash on Delivery",
    paymentStatus: order.payment_status,
    gcashPayment: toGcashPayment(order),
    date: formatDate(order.created_at),
    status: order.status,
    address: order.shipping_address,
    latitude: order.shipping_latitude ?? null,
    longitude: order.shipping_longitude ?? null,
    customerPhone: order.customer_phone,
  };
}

type OrdersManagerProps = {
  initialOrders: OrderRow[];
  error?: string | null;
};

export default function OrdersManager({
  initialOrders,
  error: initialError,
}: OrdersManagerProps) {
  const [orders, setOrders] = useState<DisplayOrder[]>(
    () => initialOrders.map(toDisplayOrder),
  );
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [verifying, setVerifying] = useState<DisplayOrder | null>(null);
  const [viewingLocation, setViewingLocation] = useState<DisplayOrder | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [enlarged, setEnlarged] = useState(false);

  const visibleOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesTab = activeTab === "all" || order.status === activeTab;
      if (!matchesTab) return false;
      if (!q) return true;
      return (
        order.id.toLowerCase().includes(q) ||
        order.customer.toLowerCase().includes(q) ||
        order.email.toLowerCase().includes(q)
      );
    });
  }, [orders, query, activeTab]);

  const error = actionError ?? initialError ?? null;

  const updateStatus = async (id: string, status: OrderStatus) => {
    const order = orders.find((candidate) => candidate.dbId === id);
    if (!order) return;
    const result = await updateOrderStatusAction(order.dbId, status);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setActionError(null);
    setOrders((current) =>
      current.map((candidate) =>
        candidate.dbId === order.dbId ? { ...candidate, status } : candidate,
      ),
    );
  };

  const openReview = (order: DisplayOrder) => {
    setRejecting(false);
    setRejectReason("");
    setActionError(null);
    setVerifying(order);
  };

  const closeVerification = () => {
    setVerifying(null);
    setReviewing(false);
    setRejecting(false);
    setRejectReason("");
    setEnlarged(false);
  };

  const openLocation = (order: DisplayOrder) => {
    setActionError(null);
    setViewingLocation(order);
  };

  const closeLocation = () => {
    setViewingLocation(null);
  };

  const handleApprove = (order: DisplayOrder) => {
    if (order.paymentMethod === "GCash") {
      openReview(order);
    } else {
      void updateStatus(order.dbId, "shipping");
    }
  };

  const handleReview = async (decision: "paid" | "rejected") => {
    if (!verifying) return;
    setReviewing(true);
    setActionError(null);

    const result = await reviewGcashPaymentAction(
      verifying.dbId,
      decision,
      decision === "rejected" ? rejectReason || null : null
    );
    if (result.error) {
      setActionError(result.error);
      setReviewing(false);
      return;
    }

    const reviewedId = verifying.dbId;
    setOrders((current) =>
      current.map((order) => {
        if (order.dbId !== reviewedId) return order;
        return {
          ...order,
          status: decision === "paid" ? "shipping" : order.status,
          paymentStatus: decision,
          gcashPayment: order.gcashPayment
            ? {
                ...order.gcashPayment,
                status: decision,
                rejection_reason:
                  decision === "rejected" ? rejectReason || null : null,
                reviewed_at: new Date().toISOString(),
              }
            : order.gcashPayment,
        };
      })
    );

    setReviewing(false);
    setRejecting(false);
    setRejectReason("");
    setEnlarged(false);
    setVerifying(null);
  };

  return (
    <div className={styles.card}>
      {error ? (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      ) : null}

      {/* --- Search bar --- */}
      <div className={styles.search}>
        <SearchIcon size={16} className={styles.searchIcon} />
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search by Order ID, Customer Name, or Email..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search orders"
        />
      </div>

      {/* --- Status tabs --- */}
      <div
        className={styles.tabs}
        role="tablist"
        aria-label="Filter orders by status"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* --- Orders table --- */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <colgroup>
            {COLUMN_WIDTHS.map((width, index) => (
                    <col key={`order-column-${index}`} style={{ width: `${width}%` }} />
       ))}
</colgroup>
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Payment Method</th>
              <th>Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleOrders.length > 0 ? (
              visibleOrders.map((order) => (
                <tr key={order.dbId}>
                  <td className={styles.cellId}>{order.id}</td>
                  <td>
                    <p className={styles.customerName}>{order.customer}</p>
                    <p className={styles.customerEmail}>{order.email}</p>
                  </td>
                  <td>
                    <div className={styles.itemsCell}>
                      <span className={styles.itemName}>{order.item}</span>
                      <span className={styles.itemQty}>x{order.quantity}</span>
                    </div>
                  </td>
                  <td className={styles.cellTotal}>{formatPeso(order.total)}</td>
                  <td>{order.paymentMethod}</td>
                  <td className={styles.cellDate}>{order.date}</td>
                  <td>
                    <span
                      className={`${styles.badge} ${styles[`badge${STATUS_LABELS[order.status]}`]}`}
                    >
                      {STATUS_LABELS[order.status]}
                    </span>
                  </td>
                  <td>
                    <div className={styles.actionsCell}>
<RecordPreviewButton kind="order" record={{...order.source, status: order.status, payment_status: order.paymentStatus as OrderRow["payment_status"], gcash_payments: order.gcashPayment}}/>
                      <button
                        type="button"
                        className={styles.mapButton}
                        onClick={() => openLocation(order)}
                        aria-label={`View delivery location for order ${order.id}`}
                        title="View delivery location"
                      >
                        <MapPinIcon size={14} />
                      </button>
                      {order.paymentMethod === "GCash" && (
                        <button
                          type="button"
                          className={styles.viewButton}
                          onClick={() => openReview(order)}
                        >
                          View Payment
                        </button>
                      )}
                      {order.status === "pending" && (
                        <>
                          {order.paymentMethod !== "GCash" && (
                            <button
                              type="button"
                              className={styles.approveButton}
                              onClick={() => handleApprove(order)}
                            >
                              Approve
                            </button>
                          )}
                          <button
                            type="button"
                            className={styles.cancelButton}
                            onClick={() => void updateStatus(order.dbId, "cancelled")}
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {order.status === "shipping" && (
                        <>
                          <button
                            type="button"
                            className={styles.completeButton}
                            onClick={() => void updateStatus(order.dbId, "completed")}
                          >
                            Complete
                          </button>
                          <button
                            type="button"
                            className={styles.cancelButton}
                            onClick={() => void updateStatus(order.dbId, "cancelled")}
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className={styles.emptyCell}>
                  No orders found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* --- GCash payment verification modal --- */}
      {verifying ? (
        <div
          className={styles.overlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeVerification();
          }}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="verify-title"
          >
            <div className={styles.modalHeader}>
              <h2 id="verify-title" className={styles.modalTitle}>
                Review GCash Payment
              </h2>
              <button
                type="button"
                className={styles.closeButton}
                onClick={closeVerification}
                aria-label="Close"
              >
                <CloseIcon size={18} />
              </button>
            </div>

            {actionError ? (
              <div className={styles.errorBanner} role="alert">
                {actionError}
              </div>
            ) : null}

            <div className={styles.modalInfo}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Order ID</span>
                <span className={styles.infoValue}>{verifying.id}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Customer</span>
                <span className={styles.infoValue}>{verifying.customer}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Payment Method</span>
                <span className={styles.infoValue}>GCash</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Payment Status</span>
                <span className={styles.infoValue}>
                  {verifying.gcashPayment ? (
                    <span
                      className={`${styles.payBadge} ${
                        PAYMENT_STATUS_LABELS[verifying.gcashPayment.status]
                          ?.className ?? ""
                      }`}
                    >
                      {PAYMENT_STATUS_LABELS[verifying.gcashPayment.status]
                        ?.label ?? verifying.gcashPayment.status}
                    </span>
                  ) : (
                    <span
                      className={`${styles.payBadge} ${
                        PAYMENT_STATUS_LABELS[verifying.paymentStatus]
                          ?.className ?? styles.payPending
                      }`}
                    >
                      {PAYMENT_STATUS_LABELS[verifying.paymentStatus]?.label ??
                        verifying.paymentStatus}
                    </span>
                  )}
                </span>
              </div>
            </div>

            {verifying.gcashPayment ? (
              <>
                <div className={styles.modalInfo}>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Sender Name</span>
                    <span className={styles.infoValue}>
                      {verifying.gcashPayment.sender_name}
                    </span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Phone Number</span>
                    <span className={styles.infoValue}>
                      {verifying.gcashPayment.phone_number}
                    </span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Reference Number</span>
                    <span className={styles.infoValue}>
                      {verifying.gcashPayment.reference_number ?? "—"}
                    </span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Amount</span>
                    <span className={styles.infoValue}>
                      {formatPeso(verifying.total)}
                    </span>
                  </div>
                </div>

                {verifying.gcashPayment.status === "rejected" &&
                verifying.gcashPayment.rejection_reason ? (
                  <p className={styles.rejectionReason}>
                    Rejection reason: {verifying.gcashPayment.rejection_reason}
                  </p>
                ) : null}

                <div className={styles.receiptSection}>
                  <p className={styles.screenshotLabel}>Payment Screenshot</p>
                  <button
                    type="button"
                    className={styles.screenshotButton}
                    onClick={() => setEnlarged(true)}
                    aria-label="View payment screenshot larger"
                  >
                    <img
                      src={verifying.gcashPayment.screenshot_url}
                      alt="Customer submitted GCash payment screenshot"
                      className={styles.screenshotImage}
                    />
                  </button>
                  <p className={styles.screenshotHint}>
                    Click the screenshot to enlarge
                  </p>
                </div>

                {verifying.gcashPayment.status !== "paid" ? (
                  <div className={styles.reviewBlock}>
                    {rejecting ? (
                      <div className={styles.rejectField}>
                        <label
                          className={styles.rejectLabel}
                          htmlFor="reject-reason"
                        >
                          Reason for rejection (optional)
                        </label>
                        <textarea
                          id="reject-reason"
                          className={styles.rejectInput}
                          rows={2}
                          value={rejectReason}
                          onChange={(event) => setRejectReason(event.target.value)}
                          placeholder="e.g. Screenshot does not match the order total"
                        />
                      </div>
                    ) : null}
                    <div className={styles.modalActions}>
                      <button
                        type="button"
                        className={styles.approvePaymentButton}
                        disabled={reviewing}
                        onClick={() => void handleReview("paid")}
                      >
                        {reviewing ? "Saving…" : "Approve Payment"}
                      </button>
                      {rejecting ? (
                        <button
                          type="button"
                          className={styles.rejectPaymentButton}
                          disabled={reviewing}
                          onClick={() => void handleReview("rejected")}
                        >
                          {reviewing ? "Saving…" : "Confirm Rejection"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.rejectPaymentButton}
                          onClick={() => setRejecting(true)}
                        >
                          Reject Payment
                        </button>
                      )}
                      {rejecting ? (
                        <button
                          type="button"
                          className={styles.modalCancelButton}
                          onClick={() => {
                            setRejecting(false);
                            setRejectReason("");
                          }}
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className={styles.paidNote}>
                    This payment has been approved and the order is now
                    shipping.
                  </p>
                )}
              </>
            ) : (
              <p className={styles.noPayment}>
                No payment has been submitted for this order yet.
              </p>
            )}

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.modalCancelButton}
                onClick={closeVerification}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* --- Customer location modal --- */}
      {viewingLocation ? (
        <div
          className={styles.overlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeLocation();
          }}
        >
          <div
            className={`${styles.modal} ${styles.locationModal}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="location-title"
          >
            <div className={styles.modalHeader}>
              <h2 id="location-title" className={styles.modalTitle}>
                Customer Location
              </h2>
              <button
                type="button"
                className={styles.closeButton}
                onClick={closeLocation}
                aria-label="Close"
              >
                <CloseIcon size={18} />
              </button>
            </div>

            <div className={styles.modalInfo}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Order ID</span>
                <span className={styles.infoValue}>{viewingLocation.id}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Customer</span>
                <span className={styles.infoValue}>
                  {viewingLocation.customer}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Phone</span>
                <span className={styles.infoValue}>
                  {viewingLocation.customerPhone ?? "—"}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Payment Method</span>
                <span className={styles.infoValue}>
                  {viewingLocation.paymentMethod}
                </span>
              </div>
            </div>

            <div className={styles.locationAddress}>
              <span className={styles.infoLabel}>Delivery Address</span>
              <p className={styles.addressText}>
                {viewingLocation.address ??
                  "No address recorded for this order."}
              </p>
            </div>

            <OrderLocationMap
              key={viewingLocation.dbId}
              latitude={viewingLocation.latitude}
              longitude={viewingLocation.longitude}
              address={viewingLocation.address}
            />

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.modalCancelButton}
                onClick={closeLocation}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Enlarged screenshot lightbox */}
      {enlarged && verifying?.gcashPayment ? (
        <div
          className={styles.enlargeOverlay}
          onClick={() => setEnlarged(false)}
          role="presentation"
        >
          <button
            type="button"
            className={styles.enlargeClose}
            onClick={() => setEnlarged(false)}
            aria-label="Close enlarged screenshot"
          >
            <CloseIcon size={22} />
          </button>
          <img
            src={verifying.gcashPayment.screenshot_url}
            alt="Enlarged GCash payment screenshot"
            className={styles.enlargedImage}
          />
        </div>
      ) : null}
    </div>
  );
}
