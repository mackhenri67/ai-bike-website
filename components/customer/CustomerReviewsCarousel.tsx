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
  const review = reviews[index];

  function move(direction: -1 | 1) {
    if (reviews.length < 2) return;
    setIndex((current) => (current + direction + reviews.length) % reviews.length);
  }

  return (
    <section className={styles.section} aria-labelledby="customer-reviews-heading">
      <div className={styles.container}>
        <div className={styles.titleRow}>
          <h2 id="customer-reviews-heading">See what our customers are saying</h2>
          {reviews.length > 1 ? (
            <div className={styles.controls} aria-label="Review navigation">
              <span className={styles.counter}>{index + 1} / {reviews.length}</span>
              <button type="button" onClick={() => move(-1)} aria-label="Previous review">‹</button>
              <button type="button" onClick={() => move(1)} aria-label="Next review">›</button>
            </div>
          ) : null}
        </div>

        {review ? (
          <article
            className={styles.card}
            key={review.id}
            style={{ "--review-position": index + 1 } as CSSProperties}
          >
            <div className={styles.imageWrap}>
              {review.image_url ? (
                <img
                  src={review.image_url}
                  alt={`Custom bicycle build shared by ${review.display_name}`}
                  className={styles.image}
                  loading="lazy"
                />
              ) : (
                <div className={styles.imageFallback}>CUSTOM BUILD</div>
              )}
            </div>
            <div className={styles.body}>
              <div className={styles.stars} aria-label={`${review.rating} out of 5 stars`}>
                {Array.from({ length: 5 }, (_, starIndex) => (
                  <span
                    key={starIndex}
                    aria-hidden="true"
                    className={starIndex < review.rating ? styles.filled : styles.emptyStar}
                  >
                    ★
                  </span>
                ))}
              </div>
              <p className={styles.quote}>“{review.review_text}”</p>
              <div className={styles.authorRow}>
                <p className={styles.author}>{review.display_name}</p>
                <span className={styles.verified}>Verified custom build</span>
              </div>
            </div>
          </article>
        ) : (
          <div className={styles.empty}>
            Be the first to share a photo and review of your custom build.
          </div>
        )}
      </div>
    </section>
  );
}
