import type { Metadata } from "next";
import { getGcashSettings } from "@/lib/data/admin/gcash";
import { getShippingFee } from "@/lib/data/shipping";
import SecurityShippingForms from "./security-shipping-forms";
import SettingsForm from "./settings-form";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings | LnR Cycle Center",
};

/**
 * Admin Settings — merchant GCash configuration shown to customers at payment
 * time. The QR code is uploaded by the admin into the `images` storage bucket
 * and the resulting URL (plus the GCash number) is persisted in the
 * `gcash_settings` singleton, so the QR the customers scan is never static.
 */
export default async function AdminSettingsPage() {
  const [result, shipping] = await Promise.all([getGcashSettings(), getShippingFee()]);

  return (
    <section className={styles.page}>
      <h1 className={styles.title}>Settings</h1>
      <p className={styles.subtitle}>
        Manage merchant GCash details, shipping fees, and your administrator password.
      </p>

      <SettingsForm
        initialQrCodeUrl={result.data?.qr_code_url ?? null}
        initialGcashNumber={result.data?.gcash_number ?? null}
        error={result.error ?? undefined}
      />
      <SecurityShippingForms shippingFee={shipping.data} shippingError={shipping.error} />
    </section>
  );
}
