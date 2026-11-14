"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import styles from "./CustomerReviewsCarousel.module.css";

type Review = {
  id: string;
  rating: number;
  review_text: string;
  image_url: string | null;
  display_name: string;
  created_at: string;
};

export default function CustomerReviewsCarousel({ reviews }: { reviews: Review[] }) {
  const [index, setIndex] = useState(0);
  if (!reviews.length) return null;
  const review = reviews[index];
  const move = (delta: number) => setIndex((current) => (current + delta + reviews.length) % reviews.length);

  return (
    <section className={styles.section} aria-labelledby="customer-reviews-heading">
      <div className={styles.container}>
        <div className={styles.titleRow}>
          <div>
            <p className={styles.eyebrow}>LNR CYCLE CENTER</p>
            <h2 id="customer-reviews-heading">See what our customers are saying</h2>
          </div>
          {reviews.length > 1 ? <div className={styles.controls}>
            <button type="button" onClick={() => move(-1)} aria-label="Previous review">‹</button>
            <span>{index + 1} / {reviews.length}</span>
            <button type="button" onClick={() => move(1)} aria-label="Next review">›</button>
          </div> : null}
        </div>
        <article className={styles.card} style={{ "--review-progress": `${(index + 1) / reviews.length * 100}%` } as CSSProperties}>
          {review.image_url ? <img src={review.image_url} alt={`Custom bicycle build reviewed by ${review.display_name}`} className={styles.image}/> : <div className={styles.imageFallback}>CUSTOM BUILD</div>}
          <div className={styles.body}>
            <div className={styles.stars} aria-label={`${review.rating} out of 5 stars`}>{Array.from({length: 5}, (_, i) => <span key={i} aria-hidden="true" className={i < review.rating ? styles.filled : styles.emptyStar}>★</span>)}</div>
            <p className={styles.quote}>“{review.review_text}”</p>
            <p className={styles.author}>{review.display_name}<span>Verified custom build</span></p>
          </div>
        </article>
        {reviews.length > 1 ? <div className={styles.progress}><span style={{width: `${(index + 1) / reviews.length * 100}%`}}/></div> : null}
      </div>
    </section>
  );
}
