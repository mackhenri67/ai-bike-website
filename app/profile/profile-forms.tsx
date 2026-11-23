"use client";

import { useActionState, useEffect } from "react";
import { updateProfile } from "./actions";
import styles from "./page.module.css";

type ProfileFormsProps = {
  initial: {
    fullName: string;
    email: string | null;
    phone: string | null;
  };
};

/** Editable personal information + read-only email, bound to the profile page. */
export default function ProfileForms({ initial }: ProfileFormsProps) {
  const [state, formAction, isSaving] = useActionState(updateProfile, {
    error: null,
    success: false,
  });

  // Notify the persistent storefront header after the database update succeeds.
  useEffect(() => {
    if (!state.success || !state.fullName) return;
    window.dispatchEvent(
      new CustomEvent("lnr:customer-profile-updated", {
        detail: { name: state.fullName },
      })
    );
  }, [state.success, state.fullName]);

  return (
    <form action={formAction} noValidate className={styles.profileForm}>
      <div className={styles.field}>
        <label htmlFor="full_name" className={styles.label}>
          Full Name:
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          autoComplete="name"
          defaultValue={initial.fullName}
          required
          className={styles.input}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="email" className={styles.label}>
          Email Address:
        </label>
        <input
          id="email"
          name="email"
          type="email"
          value={initial.email ?? ""}
          readOnly
          disabled
          className={`${styles.input} ${styles.readOnly}`}
        />
        <p className={styles.hint}>
          Your email is tied to your account and can&apos;t be changed here.
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor="phone" className={styles.label}>
          Phone Number:
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          defaultValue={initial.phone ?? ""}
          placeholder="0917 000 0000"
          className={styles.input}
        />
      </div>

      {state.error ? (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className={styles.success}>
          Profile updated.
        </p>
      ) : null}

      <button type="submit" className={styles.button} disabled={isSaving}>
        {isSaving ? "Saving…" : "Save Changes"}
      </button>
    </form>
  );
}
