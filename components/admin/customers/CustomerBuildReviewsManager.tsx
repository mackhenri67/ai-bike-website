"use client";

import { useState } from "react";
import { removeBuildReview } from "@/app/admin/(shell)/customers/review-actions";
import type { AdminBuildReview } from "@/lib/data/customer/build-reviews";
import styles from "./CustomerBuildReviewsManager.module.css";

export default function CustomerBuildReviewsManager({ initialReviews }: { initialReviews: AdminBuildReview[] }) {
  const [reviews, setReviews] = useState(initialReviews);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirmRemove(id: string) {
    if (busyId) return;
    setBusyId(id);
    setError(null);
    try {
      const result = await removeBuildReview(id);
      if (result.error) setError(result.error);
      else {
        setReviews((current) => current.filter((review) => review.id !== id));
        setRemoveId(null);
      }
    } catch {
      setError("The review could not be removed. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={styles.wrap}>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      {reviews.length === 0 ? (
        <p className={styles.empty}>No customer build reviews have been submitted yet.</p>
      ) : reviews.map((review) => (
        <article className={styles.card} key={review.id}>
          <div className={styles.photoWrap}>
            {review.image_url ? <img src={review.image_url} alt="Customer custom-build review" /> : <span>Photo unavailable</span>}
          </div>
          <div className={styles.content}>
            <div className={styles.top}>
              <div>
                <strong>{review.customer_name}</strong>
                <p>{review.customer_email ?? "No email"} · {review.order_number}</p>
              </div>
              <span className={styles.published}>Published</span>
            </div>
            <div className={styles.stars} aria-label={`${review.rating} out of 5 stars`}>
              {Array.from({ length: 5 }, (_, index) => (
                <span key={index} className={index < review.rating ? styles.star : styles.starEmpty}>★</span>
              ))}
            </div>
            <p className={styles.reviewText}>{review.review_text}</p>
            <p className={styles.date}>{new Date(review.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</p>
            {removeId === review.id ? (
              <div className={styles.confirm}>
                <span>Remove this review from the homepage and customer records?</span>
                <div>
                  <button type="button" onClick={() => setRemoveId(null)} disabled={busyId === review.id}>Keep review</button>
                  <button type="button" className={styles.removeButton} onClick={() => confirmRemove(review.id)} disabled={busyId === review.id}>
                    {busyId === review.id ? "Removing…" : "Confirm remove"}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className={styles.removeButton} onClick={() => setRemoveId(review.id)} disabled={Boolean(busyId)}>
                Remove review
              </button>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
