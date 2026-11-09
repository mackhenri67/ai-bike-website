"use client";

import { useActionState, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import Link from "next/link";
import { uploadPaymentProof } from "@/lib/storage/upload-proof";
import type { GcashPaymentRow } from "@/lib/data/types";

import styles from "@/app/gcash-payment/[orderNumber]/page.module.css";

export type PaymentFormState = { error: string | null };
export type PaymentDetails = Pick<GcashPaymentRow, "status" | "sender_name" | "phone_number" | "reference_number" | "screenshot_url" | "rejection_reason">;
export type SharedGcashPaymentProps = {
  submitAction: (previous: PaymentFormState | undefined, formData: FormData) => Promise<PaymentFormState>;
  context?: { kind: "event"; code: string; title: string };
  order: {
    id: string;
    orderNumber: string;
    total: number;
    paymentStatus: string;
  };
  settings: {
    qrCodeUrl: string | null;
    gcashNumber: string | null;
  };
  payment: PaymentDetails | null;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = ["image/png", "image/jpeg"];

const PAYMENT_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending Verification", className: styles.statusPending },
  paid: { label: "Paid / Verified", className: styles.statusPaid },
  rejected: { label: "Rejected", className: styles.statusRejected },
};

const PHONE_RE = /^(\+?63|0)9\d{9}$/;

function formatPeso(value: number): string {
  return `₱${value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function isValidPhone(value: string): boolean {
  return PHONE_RE.test(value.replace(/[\s\-()]/g, ""));
}

/** Icons kept local to this page — no icon dependency used in the project. */
function PhoneIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

function UploadIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function CheckIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function SharedGcashPayment({
  order,
  settings,
  payment,
  submitAction,
  context,
}: SharedGcashPaymentProps) {
  // Form state — values are copied into the hidden form on submit.
  const [senderName, setSenderName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, formAction, isSubmitting] = useActionState(
    submitAction,
    { error: null },
  );

  const canSubmit =
    Boolean(screenshotUrl) &&
    senderName.trim().length > 0 &&
    isValidPhone(phoneNumber) &&
    !isUploading &&
    !isSubmitting;

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setUploadError("Please choose a PNG or JPG image.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError(
        "The screenshot is larger than 10MB. Please choose a smaller image.",
      );
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setUploadError(null);
    setIsUploading(true);

    try {
      setScreenshotUrl(await uploadPaymentProof(file, context ? "events" : "orders", context?.code ?? order.id));
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Upload failed. Please try again.",
      );
      setPreviewUrl(null);
      setScreenshotUrl("");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!canSubmit) {
      event.preventDefault();
      if (!screenshotUrl) {
        setUploadError("Please upload a screenshot of your payment.");
      }
    }
  };

  if (context && order.total === 0 && order.paymentStatus === "paid") {
    return <div className={styles.grid}><section className={styles.panel}>
      <div className={styles.panelHeading}><PhoneIcon size={20}/><h2 className={styles.panelTitle}>GCash Payment</h2></div>
      <p className={styles.panelSub}>{context.title}</p>
      <p className={styles.text}>No payment is required for this free event.</p>
      <Link href={`/event-payment/${encodeURIComponent(context.code)}/confirmation`} className={styles.button}>Continue</Link>
    </section></div>;
  }

  if (payment && payment.status !== "rejected") {
    const status = PAYMENT_STATUS[payment.status] ?? {
      label: payment.status,
      className: "",
    };
    return (
      <div className={styles.grid}>
        <section className={styles.panel} aria-labelledby="gcash-status-title">
          <div className={styles.panelHeading}>
            <PhoneIcon size={20} />
            <h1 className={styles.panelTitle} id="gcash-status-title">
              GCash Payment
            </h1>
          </div>
          <p className={styles.panelSub}>
            Payment status for {context ? "registration" : "order"} <strong>{order.orderNumber}</strong>
          </p>

          <dl className={styles.statusList}>
            <div className={styles.statusItem}>
              <dt>Payment Method</dt>
              <dd>GCash</dd>
            </div>
            <div className={styles.statusItem}>
              <dt>Payment Status</dt>
              <dd>
                <span className={`${styles.statusBadge} ${status.className}`}>
                  {status.label}
                </span>
              </dd>
            </div>
            <div className={styles.statusItem}>
              <dt>Sender Name</dt>
              <dd>{payment.sender_name}</dd>
            </div>
            <div className={styles.statusItem}>
              <dt>Phone Number</dt>
              <dd>{payment.phone_number}</dd>
            </div>
            <div className={styles.statusItem}>
              <dt>Reference Number</dt>
              <dd>{payment.reference_number || "—"}</dd>
            </div>
            <div className={styles.statusItem}>
              <dt>Amount</dt>
              <dd>{formatPeso(order.total)}</dd>
            </div>
          </dl>

          {payment.screenshot_url ? <div className={styles.screenshotBlock}>
            <p className={styles.screenshotLabel}>
              Submitted Payment Screenshot
            </p>
            <div className={styles.screenshotFrame}>
              <img
                src={payment.screenshot_url}
                alt="GCash payment screenshot"
                className={styles.screenshotImage}
              />
            </div>
          </div> : null}

          <Link href={context ? `/event-payment/${encodeURIComponent(context.code)}/confirmation` : "/profile?tab=orders"} className={styles.button}>
            {context ? "Continue" : "Back to My Account"}
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      {payment?.status === "rejected" ? (
        <p
          role="alert"
          className={styles.rejectionNote}
          style={{ gridColumn: "1 / -1" }}
        >
          Your previous proof was rejected:{" "}
          {payment.rejection_reason || "Please upload a corrected screenshot."}
        </p>
      ) : null}
      {/* Left — merchant GCash payment information */}
      <section className={styles.panel} aria-labelledby="gcash-info-title">
        <div className={styles.panelHeading}>
          <PhoneIcon size={20} />
          <h1 className={styles.panelTitle} id="gcash-info-title">
            GCash Payment
          </h1>
        </div>
        <p className={styles.panelSub}>
          Scan the QR code and submit your payment proof
        </p>

        <div className={styles.qrContainer}>
          {settings.qrCodeUrl ? (
            <img
              src={settings.qrCodeUrl}
              alt="GCash QR code"
              className={styles.qrImage}
              width={220}
              height={220}
            />
          ) : (
            <div className={styles.qrPlaceholder}>
              <p>QR code not set up yet.</p>
              <p>Please contact the store to complete your payment.</p>
            </div>
          )}
        </div>

        <p className={styles.scanHint}>Scan with GCash app</p>
        <p className={styles.accountNumber}>
          {settings.gcashNumber || "GCash number not set"}
        </p>
        <p className={styles.accountHint}>
          Amount to pay: <strong>{formatPeso(order.total)}</strong>
        </p>
      </section>

      {/* Right — payment submission form */}
      <section className={styles.panel} aria-labelledby="gcash-form-title">
        <h2 className={styles.formTitle} id="gcash-form-title">
          Submit your payment
        </h2>

        <form action={formAction} onSubmit={handleFormSubmit} noValidate>
          {context ? <input type="hidden" name="registration_code" value={context.code}/> : <>
            <input type="hidden" name="order_id" value={order.id} />
            <input type="hidden" name="order_number" value={order.orderNumber} />
          </>}
          <input type="hidden" name="screenshot_url" value={screenshotUrl} />

          <div className={styles.field}>
            <label className={styles.label} htmlFor="screenshot-upload">
              Payment Screenshot <span className={styles.required}>*</span>
            </label>

            <input
              ref={fileInputRef}
              id="screenshot-upload"
              type="file"
              accept=".png,.jpg,.jpeg,image/png,image/jpeg"
              className={styles.fileInput}
              onChange={handleFileChange}
            />

            {previewUrl ? (
              <button
                type="button"
                className={styles.previewWrap}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Change payment screenshot"
              >
                <img
                  src={previewUrl}
                  alt="Payment screenshot preview"
                  className={styles.previewImage}
                />
                <span className={styles.previewChange}>Change</span>
              </button>
            ) : (
              <label htmlFor="screenshot-upload" className={styles.uploadArea}>
                <UploadIcon size={24} />
                <span className={styles.uploadTitle}>
                  {isUploading ? "Uploading…" : "Click to upload screenshot"}
                </span>
                <span className={styles.uploadHint}>PNG, JPG up to 10MB</span>
              </label>
            )}

            {uploadError ? (
              <p className={styles.error} role="alert">
                {uploadError}
              </p>
            ) : null}
          </div>

          <hr className={styles.divider} />

          <div className={styles.field}>
            <label className={styles.label} htmlFor="sender-name">
              Sender Name <span className={styles.required}>*</span>
            </label>
            <input
              id="sender-name"
              name="sender_name"
              type="text"
              className={styles.input}
              placeholder="Enter your full name"
              value={senderName}
              onChange={(event) => setSenderName(event.target.value)}
              autoComplete="name"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="phone-number">
              Phone Number <span className={styles.required}>*</span>
            </label>
            <input
              id="phone-number"
              name="phone_number"
              type="tel"
              className={styles.input}
              placeholder="09XX XXX XXXX"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              autoComplete="tel"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="reference-number">
              Reference Number{" "}
              <span className={styles.optional}>(Optional)</span>
            </label>
            <input
              id="reference-number"
              name="reference_number"
              type="text"
              className={styles.input}
              placeholder="Enter reference number"
              value={referenceNumber}
              onChange={(event) => setReferenceNumber(event.target.value)}
            />
          </div>

          {state.error ? (
            <p className={styles.error} role="alert">
              {state.error}
            </p>
          ) : null}

          <button type="submit" className={styles.button} disabled={!canSubmit}>
            <CheckIcon size={18} />
            {isSubmitting ? "Submitting payment…" : "Confirm Payment"}
          </button>
        </form>
      </section>
    </div>
  );
}
