"use client";

import { useRef } from "react";
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
  const trackRef = useRef<HTMLDivElement>(null);

  function scrollReviews(direction: -1 | 1) {
    const track = trackRef.current;
    if (!track) return;
    const distance = Math.max(track.clientWidth * 0.78, 260);
    track.scrollBy({ left: direction * distance, behavior: "smooth" });
  }

  return (
    <section className={styles.section} aria-labelledby="customer-reviews-heading">
      <div className={styles.container}>
        <div className={styles.titleRow}>
          <div>
            <p className={styles.eyebrow}>LNR CYCLE CENTER</p>
            <h2 id="customer-reviews-heading">See what our customers are saying</h2>
          </div>
          {reviews.length > 1 ? (
            <div className={styles.controls} aria-label="Review slider controls">
              <button type="button" onClick={() => scrollReviews(-1)} aria-label="Previous reviews">‹</button>
              <button type="button" onClick={() => scrollReviews(1)} aria-label="Next reviews">›</button>
            </div>
          ) : null}
        </div>

        {reviews.length > 0 ? (
          <div
            ref={trackRef}
            className={styles.track}
            role="region"
            aria-label="Customer custom-build reviews"
            tabIndex={0}
          >
            {reviews.map((review) => (
              <article className={styles.card} key={review.id}>
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
                    {Array.from({ length: 5 }, (_, index) => (
                      <span key={index} aria-hidden="true" className={index < review.rating ? styles.filled : styles.emptyStar}>★</span>
                    ))}
                  </div>
                  <p className={styles.quote}>“{review.review_text}”</p>
                  <div className={styles.authorRow}>
                    <p className={styles.author}>{review.display_name}</p>
                    <span className={styles.verified}>Verified custom build</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            Be the first to share a photo and review of your custom build.
          </div>
        )}
      </div>
    </section>
  );
}
