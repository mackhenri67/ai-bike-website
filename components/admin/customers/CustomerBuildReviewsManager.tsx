"use client";

import { useState } from "react";
import { moderateBuildReview } from "@/app/admin/(shell)/customers/review-actions";
import type { AdminBuildReview } from "@/lib/data/customer/build-reviews";
import styles from "./CustomerBuildReviewsManager.module.css";

export default function CustomerBuildReviewsManager({ initialReviews }: { initialReviews: AdminBuildReview[] }) {
  const [reviews, setReviews] = useState(initialReviews);
  const [notes, setNotes] = useState<Record<string,string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function moderate(id: string, status: "approved" | "rejected") {
    if (busyId) return;
    setBusyId(id); setError(null);
    const result = await moderateBuildReview(id,status,notes[id] ?? "");
    if (result.error) setError(result.error);
    else setReviews((current) => current.map((review) => review.id === id ? {...review,status,admin_note:notes[id]?.trim()||null} : review));
    setBusyId(null);
  }

  return <section className={styles.wrap}>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {reviews.length === 0 ? <p className={styles.empty}>No custom-build reviews have been submitted yet.</p> : reviews.map((review) => <article className={styles.card} key={review.id}>
      <div className={styles.photoWrap}>{review.image_url ? <img src={review.image_url} alt="Customer custom-build review"/> : <span>Photo unavailable</span>}</div>
      <div className={styles.content}>
        <div className={styles.top}><div><strong>{review.customer_name}</strong><p>{review.customer_email ?? "No email"} · {review.order_number}</p></div><span className={review.status==="approved"?styles.approved:review.status==="rejected"?styles.rejected:styles.pending}>{review.status}</span></div>
        <div className={styles.stars} aria-label={`${review.rating} out of 5 stars`}>{Array.from({length:5},(_,i)=><span key={i} className={i<review.rating?styles.star:styles.starEmpty}>★</span>)}</div>
        <p className={styles.reviewText}>{review.review_text}</p>
        <p className={styles.date}>{new Date(review.created_at).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"})}</p>
        <label className={styles.noteLabel}>Admin note (optional)<textarea value={notes[review.id] ?? review.admin_note ?? ""} onChange={(e)=>setNotes((old)=>({...old,[review.id]:e.target.value}))} maxLength={300}/></label>
        <div className={styles.actions}>
          <button type="button" disabled={busyId===review.id || review.status==="approved"} onClick={()=>moderate(review.id,"approved")}>{busyId===review.id?"Saving…":"Approve & publish"}</button>
          <button type="button" className={styles.rejectButton} disabled={busyId===review.id || review.status==="rejected"} onClick={()=>moderate(review.id,"rejected")}>Reject</button>
        </div>
      </div>
    </article>)}
  </section>;
}
