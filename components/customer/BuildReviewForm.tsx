"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CustomerBuildReviewSummary } from "@/lib/data/customer/build-reviews";
import { submitBuildReview } from "@/app/profile/review-actions";
import styles from "./BuildReviewForm.module.css";

export default function BuildReviewForm({
  orderId,
  review,
}: {
  orderId: string;
  review: CustomerBuildReviewSummary | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [rating, setRating] = useState(review?.rating ?? 5);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const form = formRef.current;
    if (!form) {
      setBusy(false);
      return;
    }
    const data = new FormData(form);
    data.set("rating", String(rating));
    try {
      const result = await submitBuildReview(data);
      if (result.error) setError(result.error);
      else {
        setMessage("Your review is now live. Thank you for sharing your build!");
        form.reset();
        setRating(5);
        router.refresh();
      }
    } catch {
      setError("Your review could not be submitted. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (review) {
    return (
      <div className={styles.status}>
        <strong>Your review is published</strong>
        <span>{review.rating}/5 stars · {review.review_text}</span>
        {review.image_url ? <img src={review.image_url} alt="Your submitted build review" /> : null}
      </div>
    );
  }

  return (
    <form ref={formRef} className={styles.form} onSubmit={handleSubmit}>
      <input type="hidden" name="orderId" value={orderId} />
      <div className={styles.heading}>
        <strong>Review your custom build</strong>
        <span>Your review and photo will be published as soon as you submit.</span>
      </div>
      <div className={styles.stars} role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((value) => (
          <button key={value} type="button" onClick={() => setRating(value)} aria-pressed={rating === value} aria-label={`${value} star`} className={rating >= value ? styles.starActive : styles.star}>★</button>
        ))}
      </div>
      <input type="hidden" name="rating" value={rating} />
      <label className={styles.label}>Your review
        <textarea name="reviewText" required minLength={5} maxLength={600} placeholder="How was your custom build?" />
      </label>
      <label className={styles.label}>Build photo
        <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required />
      </label>
      <label className={styles.consent}>
        <input type="checkbox" name="publicConsent" required />
        I agree that my review, display name, and build photo will be displayed publicly.
      </label>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {message ? <p className={styles.success} role="status">{message}</p> : null}
      <button className={styles.submit} type="submit" disabled={busy}>{busy ? "Publishing…" : "Publish review"}</button>
    </form>
  );
}
