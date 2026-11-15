"use client";
import { useActionState, useEffect, useRef } from "react";
import { changeAdminPassword, saveShippingFee } from "./security-shipping-actions";
import styles from "./page.module.css";
export default function SecurityShippingForms({ shippingFee, shippingError }: { shippingFee: number | null; shippingError: string | null }) {
  const [shipping, shippingAction, saving] = useActionState(saveShippingFee, { saved: false, error: null });
  const [password, passwordAction, changing] = useActionState(changeAdminPassword, { saved: false, error: null });
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (password.saved) form.current?.reset(); }, [password]);
  return <div className={styles.extraSettings}>
    <section className={styles.card}>
      <h2 className={styles.sectionTitle}>Shipping fee</h2>
      <p className={styles.hint}>One shipping fee per online order, for all products and custom builds. Applies to new orders; existing order totals stay unchanged. Enter 0 for free shipping.</p>
      {shippingError ? <p className={styles.banner} role="alert">{shippingError}</p> : null}
      <form action={shippingAction}>
        <div className={styles.field}><label className={styles.label} htmlFor="shipping-fee">Shipping fee (PHP)</label><input id="shipping-fee" className={styles.input} type="number" name="shipping_fee" min="0" max="100000" step="0.01" defaultValue={shippingFee ?? ''} required disabled={saving} /></div>
        {shipping.error ? <p className={styles.banner} role="alert">{shipping.error}</p> : null}
        {shipping.saved ? <p className={styles.success} role="status">Shipping fee saved.</p> : null}
        <button className={styles.saveButton} disabled={saving}>{saving ? 'Saving…' : 'Save shipping fee'}</button>
      </form>
    </section>
    <section className={styles.card}>
      <h2 className={styles.sectionTitle}>Change admin password</h2>
      <p className={styles.hint}>Change the password for your signed-in administrator account.</p>
      <form ref={form} action={passwordAction}>
        <div className={styles.field}><label className={styles.label} htmlFor="current-password">Current password</label><input id="current-password" className={styles.input} type="password" name="current_password" autoComplete="current-password" required disabled={changing} /></div>
        <div className={styles.field}><label className={styles.label} htmlFor="new-password">New password</label><input id="new-password" className={styles.input} type="password" name="new_password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={changing} /></div>
        <div className={styles.field}><label className={styles.label} htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" className={styles.input} type="password" name="confirm_password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={changing} /></div>
        {password.error ? <p className={styles.banner} role="alert">{password.error}</p> : null}
        {password.saved ? <p className={styles.success} role="status">{password.notice ?? 'Password updated.'}</p> : null}
        <button className={styles.saveButton} disabled={changing}>{changing ? 'Updating…' : 'Update password'}</button>
      </form>
    </section>
  </div>;
}
