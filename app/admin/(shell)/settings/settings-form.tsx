"use client";

import { useActionState, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { getAdminBrowserClient } from "@/lib/supabase/client";
import { saveGcashSettingsAction } from "./actions";
import styles from "./page.module.css";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = ["image/png", "image/jpeg"];

type SettingsFormProps = {
  initialQrCodeUrl: string | null;
  initialGcashNumber: string | null;
  error?: string;
};

export default function SettingsForm({
  initialQrCodeUrl,
  initialGcashNumber,
  error: loadError,
}: SettingsFormProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState(initialQrCodeUrl ?? "");
  const [gcashNumber, setGcashNumber] = useState(initialGcashNumber ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, formAction, isSaving] = useActionState(
    saveGcashSettingsAction,
    {
      error: null,
      saved: false,
    },
  );

  const handleQrChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setUploadError("Please choose a PNG or JPG image.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError(
        "The image is larger than 10MB. Please choose a smaller one.",
      );
      return;
    }

    setUploadError(null);
    setUploading(true);

    try {
      const client = getAdminBrowserClient();
      if (!client) {
        throw new Error(
          "Supabase is not configured. Please refresh and try again.",
        );
      }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `gcash/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}-${safeName}`;
      const { data, error } = await client.storage
        .from("images")
        .upload(path, file, {
          contentType: file.type || "image/*",
          cacheControl: "3600",
          upsert: false,
        });
      if (error) {
        throw new Error(
          `Upload failed: ${error.message}. Make sure you are signed in and the "images" bucket allows uploads.`,
        );
      }
      const { data: urlData } = client.storage
        .from("images")
        .getPublicUrl(data.path);
      setQrCodeUrl(urlData.publicUrl);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Upload failed. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={styles.card}>
      {loadError ? (
        <div className={styles.banner} role="alert">
          {loadError}
        </div>
      ) : null}

      {state.saved ? (
        <div className={styles.success} role="status">
          GCash settings saved. Customers will now see the updated QR code and
          account number.
        </div>
      ) : null}
      {state.error ? (
        <div className={styles.banner} role="alert">
          {state.error}
        </div>
      ) : null}

      <form action={formAction} noValidate>
        <input type="hidden" name="qr_code_url" value={qrCodeUrl} />

        <div className={styles.field}>
          <label className={styles.label} htmlFor="gcash-qr">
            GCash QR Code
          </label>
          <p className={styles.hint}>
            The QR code customers scan on the GCash payment page. Upload a
            screenshot or export of your GCash QR (PNG or JPG, up to 10MB).
          </p>

          <input
            ref={fileInputRef}
            id="gcash-qr"
            type="file"
            accept=".png,.jpg,.jpeg,image/png,image/jpeg"
            className={styles.fileInput}
            onChange={handleQrChange}
          />

          {qrCodeUrl ? (
            <div className={styles.qrPreview}>
              <img
                src={qrCodeUrl}
                alt="Merchant GCash QR code preview"
                className={styles.qrImage}
              />
              <div className={styles.qrActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? "Uploading…" : "Replace QR code"}
                </button>
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => {
                    setQrCodeUrl("");
                    setUploadError(null);
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <label htmlFor="gcash-qr" className={styles.uploadArea}>
              <span className={styles.uploadTitle}>
                {uploading ? "Uploading…" : "Click to upload QR code"}
              </span>
              <span className={styles.uploadHint}>PNG, JPG up to 10MB</span>
            </label>
          )}

          {uploadError ? (
            <p className={styles.fieldError} role="alert">
              {uploadError}
            </p>
          ) : null}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="gcash-number">
            GCash Number <span className={styles.required}>*</span>
          </label>
          <input
            id="gcash-number"
            name="gcash_number"
            type="tel"
            className={styles.input}
            placeholder="09XX XXX XXXX"
            value={gcashNumber}
            onChange={(event) => setGcashNumber(event.target.value)}
            autoComplete="off"
          />
          <p className={styles.hint}>
            The GCash account number displayed below the QR code on the payment
            page.
          </p>
        </div>

        <button type="submit" className={styles.saveButton} disabled={isSaving}>
          {isSaving ? "Saving…" : "Save GCash Settings"}
        </button>
      </form>
    </div>
  );
}
