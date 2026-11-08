"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useActionState } from "react";
import { customerSignUp, type SignUpState } from "./actions";
import LocationPicker from "@/components/customer/LocationPicker";
import styles from "@/app/customer-auth.module.css";

const INITIAL: SignUpState = {
  error: null,
  needsEmailConfirmation: false,
  message: null,
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SignUpFormProps = {
  /** Sanitized in-app path to continue to after signing up. */
  next: string;
};

/**
 * Two-step signup:
 *   1. Account details (name, email, password, phone).
 *   2. Delivery location — one-tap geolocation, map preview and address
 *      confirmation (shared LocationPicker).
 * Both steps stay mounted (CSS visibility toggles) so the location state is
 * preserved if the customer goes back to step 1.
 */
export default function SignUpForm({ next }: SignUpFormProps) {
  const [state, formAction, isSubmitting] = useActionState(customerSignUp, INITIAL);
  const [step, setStep] = useState<1 | 2>(1);
  const [localError, setLocalError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [locationPending, setLocationPending] = useState(false);

  const handleContinue = (event: FormEvent) => {
    event.preventDefault();
    const form = (event.currentTarget as HTMLButtonElement).form;
    if (!form) return;

    const name = String(new FormData(form).get("full_name") ?? "").trim();
    const email = String(new FormData(form).get("email") ?? "").trim().toLowerCase();
    const password = String(new FormData(form).get("password") ?? "");

    if (!name) {
      setLocalError("Please enter your full name.");
      return;
    }
    if (!EMAIL_PATTERN.test(email)) {
      setLocalError("Please enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setLocalError("Password must be at least 8 characters long.");
      return;
    }

    if (!agreed) {
      setLocalError("Please agree to the Terms and Conditions and acknowledge the Privacy Policy.");
      return;
    }
    setLocalError(null);
    setStep(2);
  };

  if (state.needsEmailConfirmation) {
    return (
      <div className={styles.confirmPanel}>
        <div className={styles.confirmIcon}>✓</div>
        <h2 className={styles.confirmTitle}>Almost done!</h2>
        <p className={styles.confirmText}>{state.message}</p>
        <a
          href={`/login?next=${encodeURIComponent(next)}`}
          className={styles.button}
          style={{ textDecoration: "none" }}
        >
          Go to Sign In
        </a>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className={styles.form}>
      <input type="hidden" name="next" value={next} />

      {/* Step indicator */}
      <div className={styles.steps} aria-hidden="true">
        <span
          className={
            step === 1 ? styles.stepDotActive : step === 2 ? styles.stepDotDone : styles.stepDot
          }
        />
        <span className={step === 1 ? styles.stepLabelActive : styles.stepLabel}>
          Account
        </span>
        <span className={styles.stepLine} />
        <span
          className={step === 2 ? styles.stepDotActive : styles.stepDot}
        />
        <span className={step === 2 ? styles.stepLabelActive : styles.stepLabel}>
          Delivery location
        </span>
      </div>

      {/* Step 1 — account details */}
      <div className={step === 1 ? styles.stepPanel : styles.stepHidden}>
        <div className={styles.field}>
          <label htmlFor="full_name" className={styles.label}>
            Full Name:
          </label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            autoComplete="name"
            placeholder="Juan Dela Cruz"
            required
            className={styles.input}
            autoFocus
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
            autoComplete="email"
            placeholder="you@example.com"
            required
            className={styles.input}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="password" className={styles.label}>
            Password:
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            required
            minLength={8}
            className={styles.input}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="phone" className={styles.label}>
            Phone Number (optional):
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="0917 000 0000"
            className={styles.input}
          />
        </div>

        <label className={styles.agreement}>
          <input type="checkbox" name="accept_terms" value="yes" required
            checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
          <span>I agree to the <Link href="/terms" target="_blank" rel="noopener noreferrer">Terms and Conditions</Link> and acknowledge the <Link href="/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>.</span>
        </label>

        {localError ? (
          <p role="alert" className={styles.error}>
            {localError}
          </p>
        ) : null}

        <button
          type="button"
          className={styles.button}
          onClick={handleContinue}
        >
          Continue
        </button>
      </div>

      {/* Step 2 — delivery location */}
      <div className={step === 2 ? styles.stepPanel : styles.stepHidden}>
        <p className={styles.note}>
          We deliver to your saved location. Set it once here — you can change
          it later from your profile.
        </p>
        <LocationPicker onPendingChange={setLocationPending} />

        {state.error ? (
          <p role="alert" className={styles.error}>
            {state.error}
          </p>
        ) : null}

        <div className={styles.stepActions}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => setStep(1)}
          >
            Back
          </button>
          <button
            type="submit"
            className={styles.button}
            disabled={isSubmitting || locationPending || !agreed}
          >
            {isSubmitting
              ? "Creating account…"
              : locationPending
                ? "Confirming location…"
                : "Create Account"}
          </button>
        </div>
      </div>
    </form>
  );
}
