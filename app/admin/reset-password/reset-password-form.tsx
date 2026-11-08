"use client";
import { exchangeRecoveryCode } from "@/lib/auth/recovery";

import { isAdmin } from "@/lib/auth/roles";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getAdminBrowserClient } from "@/lib/supabase/client";
import styles from "./page.module.css";

type Stage =
  | { name: "loading" }
  | { name: "ready" }
  | { name: "invalid" }
  | { name: "error"; message: string };

function ResetPasswordFormInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const code = searchParams.get("code");

  // If there is no recovery code in the URL the link is not usable; derived
  // from props instead of set inside the effect (avoids cascading renders).
  const [stage, setStage] = useState<Stage>(
    code ? { name: "loading" } : { name: "invalid" },
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // The reset link points to this page with a one-time `code` in the URL.
  // Exchange it for a Supabase session, then let the user pick a password.
  useEffect(() => {
    if (!code) {
      return;
    }

    const recoveryCode = code;
    let cancelled = false;

    async function exchange() {
      try {
        const client = getAdminBrowserClient();
        const { error } = await exchangeRecoveryCode("admin", recoveryCode);
        if (cancelled) return;

        if (error) {
          setStage({ name: "invalid" });
          return;
        }

        const {
          data: { user },
        } = await client.auth.getUser();
        if (cancelled) return;
        if (!isAdmin(user)) {
          setStage({
            name: "error",
            message: "Use the customer password reset for this account.",
          });
          return;
        }
        setStage({ name: "ready" });
      } catch (err) {
        if (cancelled) return;
        setStage({
          name: "error",
          message:
            err instanceof Error
              ? err.message
              : "Supabase is not configured for password recovery yet.",
        });
      }
    }

    void exchange();

    return () => {
      cancelled = true;
    };
  }, [code]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (password.length < 8) {
      setFormError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirm) {
      setFormError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const client = getAdminBrowserClient();
      const { error } = await client.auth.updateUser({ password });

      if (error) {
        setFormError(
          "We couldn't update the password. Your reset link may have expired — request a new one.",
        );
        return;
      }

      router.replace("/admin");
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "Something went wrong while updating your password.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (stage.name === "loading") {
    return <p className={styles.status}>Checking your reset link…</p>;
  }

  if (stage.name === "invalid") {
    return (
      <p role="alert" className={styles.error}>
        This password reset link is invalid or has expired. Please use the
        “Forgot password?” option on the login page to request a new one.
      </p>
    );
  }

  if (stage.name === "error") {
    return (
      <p role="alert" className={styles.error}>
        {stage.message}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="password" className={styles.label}>
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={styles.input}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="confirm" className={styles.label}>
          Confirm new password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className={styles.input}
        />
      </div>

      {formError ? (
        <p role="alert" className={styles.error}>
          {formError}
        </p>
      ) : null}

      <button type="submit" className={styles.button} disabled={submitting}>
        {submitting ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}

export default function ResetPasswordForm() {
  return (
    <Suspense fallback={<p className={styles.status}>Loading…</p>}>
      <ResetPasswordFormInner />
    </Suspense>
  );
}
