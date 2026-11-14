"use client";
import RecordPreviewButton from "@/components/admin/RecordPreviewButton";

import { useMemo, useState } from "react";
import {
  reviewRegistrationAction,
  updateRegistrationStatusAction,
} from "@/app/admin/(shell)/registrations/actions";
import type {
  EventRegistrationRow,
  RegistrationPaymentStatus,
  RegistrationStatus,
} from "@/lib/data/types";
import styles from "./RegistrationsManager.module.css";
import { CloseIcon, SearchIcon } from "./icons";

type TabId = "all" | RegistrationPaymentStatus;

const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "paid", label: "Paid" },
  { id: "rejected", label: "Rejected" },
];

const PAYMENT_LABELS: Record<RegistrationPaymentStatus, string> = {
  pending: "Pending Verification",
  paid: "Paid",
  rejected: "Rejected",
  failed: "Failed",
  refunded: "Refunded",
};

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

type RegistrationsManagerProps = {
  initialRegistrations: EventRegistrationRow[];
  error?: string | null;
};

export default function RegistrationsManager({
  initialRegistrations,
  error: initialError,
}: RegistrationsManagerProps) {
  const [registrations, setRegistrations] =
    useState<EventRegistrationRow[]>(initialRegistrations);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [reviewing, setReviewing] = useState<EventRegistrationRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [enlarged, setEnlarged] = useState(false);

  const error = actionError ?? initialError ?? null;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return registrations.filter((reg) => {
      const matchesTab =
        activeTab === "all" || reg.payment_status === activeTab;
      if (!matchesTab) return false;
      if (!q) return true;
      return (
        reg.registration_code.toLowerCase().includes(q) ||
        reg.rider_name.toLowerCase().includes(q) ||
        (reg.event?.title ?? "").toLowerCase().includes(q)
      );
    });
  }, [registrations, query, activeTab]);

  const openReview = (reg: EventRegistrationRow) => {
    setRejectReason("");
    setActionError(null);
    setEnlarged(false);
    setReviewing(reg);
  };

  const closeReview = () => {
    setReviewing(null);
    setBusy(false);
    setRejectReason("");
    setEnlarged(false);
  };

  const handleReview = async (decision: "paid" | "rejected") => {
    if (!reviewing) return;
    setBusy(true);
    setActionError(null);
    const result = await reviewRegistrationAction(
      reviewing.id,
      decision,
      decision === "rejected" ? rejectReason || null : null,
    );
    if (result.error) {
      setActionError(result.error);
      setBusy(false);
      return;
    }
    const reviewedId = reviewing.id;
    setRegistrations((current) =>
      current.map((reg) =>
        reg.id === reviewedId
          ? {
              ...reg,
              payment_status: decision === "paid" ? "paid" : "rejected",
              rejection_reason:
                decision === "rejected" ? rejectReason || null : null,
            }
          : reg,
      ),
    );
    setBusy(false);
    closeReview();
  };

  const handleStatus = async (
    reg: EventRegistrationRow,
    status: RegistrationStatus,
  ) => {
    setActionError(null);
    const result = await updateRegistrationStatusAction(reg.id, status);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    const targetId = reg.id;
    setRegistrations((current) =>
      current.map((r) => (r.id === targetId ? { ...r, status } : r)),
    );
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <SearchIcon size={16} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search code, rider, event…"
            className={styles.search}
          />
        </div>
      </div>

      <div className={styles.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`${styles.tab} ${
              activeTab === tab.id ? styles.tabActive : ""
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {visible.length === 0 ? (
        <p className={styles.empty}>No registrations found.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Event</th>
                <th>Rider</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((reg) => (
                <tr key={reg.id}>
                  <td className={styles.mono}>{reg.registration_code}</td>
                  <td>{reg.event?.title ?? "—"}</td>
                  <td>{reg.rider_name}{reg.emergency_contact ? <p className={styles.emergencyContact}>Emergency: {reg.emergency_contact}</p> : null}</td>
                  <td>{formatPeso(Number(reg.amount_paid) || 0)}</td>
                  <td>
                    <span
                      className={`${styles.payBadge} ${
                        styles[`pay_${reg.payment_status}`]
                      }`}
                    >
                      {PAYMENT_LABELS[reg.payment_status]}
                    </span>
                  </td>
                  <td>{reg.status}</td>
                  <td>
                    <div className={styles.actionsCell}>
<RecordPreviewButton kind="signup" record={reg}/>
                      <button
                        type="button"
                        className={styles.viewButton}
                        onClick={() => openReview(reg)}
                      >
                        {reg.payment_status === "paid"
                          ? "View"
                          : "Review Payment"}
                      </button>
                      {reg.status === "registered" ? (
                        <button
                          type="button"
                          className={styles.cancelButton}
                          onClick={() => void handleStatus(reg, "cancelled")}
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reviewing ? (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>
                Registration {reviewing.registration_code}
              </h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={closeReview}
                aria-label="Close"
              >
                <CloseIcon size={20} />
              </button>
            </div>

            <dl className={styles.facts}>
              <div>
                <dt>Event</dt>
                <dd>{reviewing.event?.title ?? "—"}</dd>
              </div>
              <div>
                <dt>Rider</dt>
                <dd>{reviewing.rider_name}</dd>
              </div>
              {reviewing.emergency_contact ? <div><dt>Emergency contact</dt><dd>{reviewing.emergency_contact}</dd></div> : null}
              <div>
                <dt>Amount</dt>
                <dd>{formatPeso(Number(reviewing.amount_paid) || 0)}</dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{formatDate(reviewing.created_at)}</dd>
              </div>
              {reviewing.customer_name ? (
                <div>
                  <dt>Contact</dt>
                  <dd>{reviewing.customer_name}</dd>
                </div>
              ) : null}
              {reviewing.customer_phone ? (
                <div>
                  <dt>Phone</dt>
                  <dd>{reviewing.customer_phone}</dd>
                </div>
              ) : null}
            </dl>

            <dl>
              <dt>GCash sender</dt>
              <dd>{reviewing.payment_sender_name || "—"}</dd>
              <dt>GCash phone</dt>
              <dd>{reviewing.payment_phone_number || "—"}</dd>
              <dt>Payment reference</dt>
              <dd>{reviewing.reference_number || "—"}</dd>
            </dl>
            {reviewing.proof_screenshot_url ? (
              <div className={styles.proof}>
                <span className={styles.proofLabel}>Payment screenshot</span>
                <img
                  src={reviewing.proof_screenshot_url}
                  alt="GCash payment screenshot"
                  className={styles.proofImg}
                  onClick={() => setEnlarged(true)}
                />
              </div>
            ) : (
              <p className={styles.noPayment}>
                No payment screenshot has been submitted yet.
              </p>
            )}

            {error ? <p className={styles.error}>{error}</p> : null}

            {reviewing.payment_status !== "paid" ? (
              <>
                <label className={styles.rejectField}>
                  <span>Rejection reason (optional)</span>
                  <textarea
                    className={styles.textarea}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                    placeholder="e.g. Screenshot does not match the registration amount"
                  />
                </label>
                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.approvePaymentButton}
                    disabled={busy}
                    onClick={() => void handleReview("paid")}
                  >
                    {busy ? "Saving…" : "Approve Payment"}
                  </button>
                  <button
                    type="button"
                    className={styles.rejectPaymentButton}
                    disabled={busy}
                    onClick={() => void handleReview("rejected")}
                  >
                    Reject Payment
                  </button>
                </div>
              </>
            ) : (
              <p className={styles.paidNote}>
                This payment has been approved and the registration is
                confirmed.
              </p>
            )}

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.modalCancelButton}
                onClick={closeReview}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {enlarged && reviewing?.proof_screenshot_url ? (
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
            src={reviewing.proof_screenshot_url}
            alt="Enlarged GCash payment screenshot"
            className={styles.enlargedImage}
          />
        </div>
      ) : null}
    </div>
  );
}
