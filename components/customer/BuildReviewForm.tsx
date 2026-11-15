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
  const [photoName,setPhotoName]=useState("");
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
        setPhotoName("");
        router.refresh();
      }
    } catch {
      setError("Your review could not be submitted. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (review?.status === "approved") {
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
      <fieldset className={styles.ratingField} disabled={busy}><legend>Your rating</legend><div className={styles.stars}>{[1,2,3,4,5].map(value=><label key={value} className={rating>=value?styles.starActive:styles.star}><input type="radio" name="rating" value={value} checked={rating===value} onChange={()=>setRating(value)}/><span aria-hidden="true">★</span><span className={styles.srOnly}>{value} {value===1?'star':'stars'}</span></label>)}<span className={styles.ratingValue}>{rating} / 5</span></div></fieldset>
      <label className={styles.label}>Your review
        <textarea name="reviewText" required minLength={5} maxLength={600} defaultValue={review?.status === "rejected" ? review.review_text : ""} placeholder="How was your custom build?" />
      </label>
      <label className={styles.upload}><span className={styles.uploadIcon} aria-hidden="true">＋</span><span><strong>{photoName||'Attach a photo of your build'}</strong><small>JPG, PNG or WebP · up to 5 MB</small></span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required disabled={busy} aria-label="Build photo" onChange={e=>setPhotoName(e.target.files?.[0]?.name??'')}/></label>
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
