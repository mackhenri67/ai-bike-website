"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveAdminDisplayName, type SettingsResult } from "./security-shipping-actions";
import styles from "./page.module.css";

export default function AdminDisplayNameForm({
  initialDisplayName,
}: {
  initialDisplayName: string;
}) {
  const router = useRouter();
  const [state, formAction, saving] = useActionState<SettingsResult, FormData>(
    saveAdminDisplayName,
    { saved: false, error: null },
  );

  useEffect(() => {
    if (state.saved) router.refresh();
  }, [state.saved, router]);

  return (
    <section className={styles.card}>
      <h2 className={styles.sectionTitle}>Admin header name</h2>
      <p className={styles.hint}>
        Change the name shown in the upper-right corner of the admin dashboard.
        The Administrator role label below it will stay the same.
      </p>
      <form action={formAction}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="admin-display-name">
            Display name
          </label>
          <input
            id="admin-display-name"
            name="admin_display_name"
            type="text"
            className={styles.input}
            defaultValue={initialDisplayName}
            maxLength={40}
            autoComplete="off"
            required
            disabled={saving}
          />
        </div>
        {state.error ? (
          <p className={styles.banner} role="alert">{state.error}</p>
        ) : null}
        {state.saved ? (
          <p className={styles.success} role="status">
            Admin header name saved.
          </p>
        ) : null}
        <button type="submit" className={styles.saveButton} disabled={saving}>
          {saving ? "Saving…" : "Save display name"}
        </button>
      </form>
    </section>
  );
}
