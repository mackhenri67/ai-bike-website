import type { Metadata } from "next";
import { getGcashSettings } from "@/lib/data/admin/gcash";
import { getShippingFee } from "@/lib/data/shipping";
import SecurityShippingForms from "./security-shipping-forms";
import SettingsForm from "./settings-form";
import AdminDisplayNameForm from "./admin-display-name-form";
import { requireAdmin } from "@/lib/auth/guards";
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
  const [result, shipping, adminUser] = await Promise.all([
    getGcashSettings(),
    getShippingFee(),
    requireAdmin(),
  ]);
  const metadata = adminUser.user_metadata as Record<string, unknown>;
  const initialDisplayName =
    typeof metadata.admin_display_name === "string" && metadata.admin_display_name.trim()
      ? metadata.admin_display_name.trim()
      : typeof metadata.full_name === "string" && metadata.full_name.trim()
        ? metadata.full_name.trim()
        : "Administrator";

  return (
    <section className={styles.page}>
      <h1 className={styles.title}>Settings</h1>
      <p className={styles.subtitle}>
        Manage merchant GCash details, shipping fees, and your administrator password.
      </p>

      <AdminDisplayNameForm initialDisplayName={initialDisplayName} />

      <SettingsForm
        initialQrCodeUrl={result.data?.qr_code_url ?? null}
        initialGcashNumber={result.data?.gcash_number ?? null}
        error={result.error ?? undefined}
      />
      <SecurityShippingForms shippingFee={shipping.data} shippingError={shipping.error} />
    </section>
  );
}
