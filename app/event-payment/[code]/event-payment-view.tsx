"use client";

import { useActionState, useRef, useState, type ChangeEvent } from "react";
import EventSteps from "@/components/customer/EventSteps";
import Link from "next/link";
import { uploadPaymentProof } from "@/lib/storage/upload-proof";
import type { GcashSettingsRow } from "@/lib/data/types";
import { submitEventGcashPaymentAction } from "./action";
import styles from "./payment.module.css";

type Props = {
  registrationCode: string;
  eventTitle: string;
  amount: number;
  settings: GcashSettingsRow | null;
  paymentStatus?: string;
  submittedProof?: string | null;
  rejectionReason?: string | null;
  paymentReference?: string | null;
};

const ACCEPTED_TYPES = ["image/png", "image/jpeg"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}

export default function EventPaymentView({
  registrationCode,
  eventTitle,
  amount,
  settings,
  paymentStatus,
  submittedProof,
  rejectionReason,
  paymentReference,
}: Props) {
  const [state, formAction, pending] = useActionState(
    submitEventGcashPaymentAction,
    { error: null, success: false },
  );
  const [preview, setPreview] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  if (paymentStatus === "paid") {
    return <>
      <h1 className={styles.pageTitle}>Online Payment</h1>
      <p className={styles.lead}>{eventTitle} · {registrationCode}</p>
      <EventSteps current={2} />
      <section className={styles.successCard}>
        <div className={styles.successHeader}><h2>{amount === 0 ? "No payment required" : "Payment already verified"}</h2></div>
        <div className={styles.successBody}><p>{amount === 0 ? "This is a free event. You can continue to your e-ticket without making a payment." : "Your payment has been verified. You do not need to pay again."}</p><p className={styles.code}>{registrationCode}</p><p>Registration fee: {formatCurrency(amount)}</p></div>
      </section>
      <div className={styles.successActions}><Link href={`/profile?tab=events&ticket=${encodeURIComponent(registrationCode)}`} className={styles.payButton}>View Ticket</Link></div>
    </>;
  }

  if (state.success || (paymentStatus === "pending" && submittedProof)) {
    return <>
      <h1 className={styles.pageTitle}>Registration received</h1>
      <p className={styles.lead}>Your payment proof is awaiting review. Keep your registration code for reference.</p>
      <EventSteps current={2} />
      <section className={styles.successCard}>
        <div className={styles.successHeader}><div><small>LNR Cycle Center registration</small><h2>{eventTitle}</h2></div><span className={styles.pendingBadge}>Awaiting review</span></div>
        <div className={styles.successBody}><p className={styles.code}>{registrationCode}</p><p>We will update your payment status after verification.</p><dl><div><dt>Amount</dt><dd>{formatCurrency(amount)}</dd></div><div><dt>GCash reference</dt><dd>{paymentReference || "See your submitted payment details"}</dd></div></dl></div>
      </section>
      <div className={styles.successActions}><Link href={`/profile?tab=events&ticket=${encodeURIComponent(registrationCode)}`} className={styles.payButton}>View Ticket</Link><Link href="/events" className={styles.secondary}>Browse more events</Link></div>
    </>;
  }

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

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    setPreview(objectUrl);
    setUploadError(null);
    setScreenshotUrl("");
    setUploading(true);

    try {
      setScreenshotUrl(
        await uploadPaymentProof(file, "events", registrationCode),
      );
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Upload failed. Please try again.",
      );
      setPreview(null);
      setScreenshotUrl("");
    } finally {
      setUploading(false);
    }
  };

  const canSubmit = Boolean(screenshotUrl) && !uploading && !pending;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    if (!canSubmit) {
      event.preventDefault();
      if (!screenshotUrl) {
        setUploadError("Please upload a screenshot of your GCash payment.");
      }
    }
  };

  return (
    <>
      <h1 className={styles.pageTitle}>Online Payment</h1>
      <p className={styles.lead}>{eventTitle} · {registrationCode}</p>
      <EventSteps current={2} />
      {paymentStatus === "rejected" ? <p className={styles.error} role="alert">Payment rejected: {rejectionReason || "Please check your payment details and submit a new proof."}</p> : null}
    <div className={styles.card}>
      <aside className={styles.paymentAside}>
        <h2 className={styles.summaryTitle}>GCash Payment</h2>
        <p className={styles.qrCaption}>Scan the QR code and submit your payment proof.</p>
      {settings?.qr_code_url ? (
        <div className={styles.qrBlock}>
          <p className={styles.qrCaption}>Scan this QR code with GCash</p>
          <img
            src={settings.qr_code_url}
            alt="Merchant GCash QR code"
            className={styles.qr}
          />
          {settings.gcash_number ? (
            <p className={styles.gcashNumber}>
              GCash number: <strong>{settings.gcash_number}</strong>
            </p>
          ) : null}
        </div>
      ) : (
        <p className={styles.missingQr}>
          The merchant GCash QR code is not configured yet. Please check back
          shortly or contact the store.
        </p>
      )}

      <div className={styles.summary}>
        <h2 className={styles.summaryTitle}>{eventTitle}</h2>
        <p className={styles.summaryCode}>
          Registration: <strong>{registrationCode}</strong>
        </p>
        <p className={styles.summaryAmount}>
          Amount due: <strong>{formatCurrency(amount)}</strong>
        </p>
      </div>

      </aside>

      <form
        action={formAction}
        onSubmit={handleSubmit}
        className={styles.form}
        noValidate
      >
        <input
          type="hidden"
          name="registration_code"
          value={registrationCode}
        />
        <input type="hidden" name="screenshot_url" value={screenshotUrl} />

        <label className={styles.field}>
          <span className={styles.label}>Payment screenshot *</span>
          <input
            ref={fileRef}
            name="screenshot"
            type="file"
            accept=".png,.jpg,.jpeg,image/png,image/jpeg"
            className={styles.file}
            onChange={handleFileChange}
            disabled={uploading}
          />
          <span className={styles.uploadCaption}>↑ Click to upload screenshot <small>PNG or JPG up to 10MB</small></span>
          {uploading ? (
            <p className={styles.uploadHint}>Uploading screenshot…</p>
          ) : null}
          {preview ? (
            <img
              src={preview}
              alt="Payment screenshot preview"
              className={styles.preview}
            />
          ) : null}
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Sender name *</span>
          <input
            name="sender_name"
            className={styles.input}
            placeholder="Name on the GCash account"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>GCash number *</span>
          <input
            name="phone_number"
            className={styles.input}
            placeholder="09XX XXX XXXX"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Reference number</span>
          <input
            name="reference_number"
            className={styles.input}
            placeholder="Optional"
          />
        </label>


        {uploadError ? (
          <p className={styles.error} role="alert">
            {uploadError}
          </p>
        ) : null}

        {state.error ? (
          <p className={styles.error} role="alert">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          className={styles.payButton}
          disabled={!canSubmit}
        >
          {pending
            ? "Submitting…"
            : uploading
              ? "Uploading…"
              : "Confirm Payment"}
        </button>
      </form>
    </div>
    </>
  );
}
