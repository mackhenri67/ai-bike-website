"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useShop } from "./ShopContext";
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FacebookIcon,
  WrenchIcon,
} from "./icons";
import styles from "./HeroCarousel.module.css";

const ROTATION_INTERVAL = 6000;

/**
 * Homepage hero. Full-viewport banner carousel backed by the admin-managed
 * banner list from useShop(). Auto-rotates every 6s when 2+ banners exist.
 */
export default function HeroCarousel() {
  const { banners } = useShop();
  const [bannerIndex, setBannerIndex] = useState(0);

  const safeLength = Math.max(1, banners.length);
  const heroImage = banners[bannerIndex % safeLength];

  const prev = useCallback(() => {
    setBannerIndex((current) => (current - 1 + banners.length) % banners.length);
  }, [banners.length]);

  const next = useCallback(() => {
    setBannerIndex((current) => (current + 1) % banners.length);
  }, [banners.length]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (banners.length < 2) return;
    timerRef.current = setInterval(() => {
      setBannerIndex((current) => (current + 1) % banners.length);
    }, ROTATION_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [banners.length]);

  return (
    <section className={styles.wrap}>
      <div className={styles.banner}>
        {heroImage ? (
          <Image
            key={heroImage}
            src={heroImage}
            alt="LNR Cycle Center"
            fill
            sizes="100vw"
            className={styles.image}
            priority
          />
        ) : null}

        <div className={styles.overlay} />

        {banners.length > 1 ? (
          <>
            <button
              type="button"
              className={`${styles.arrow} ${styles.arrowLeft}`}
              onClick={prev}
              aria-label="Previous banner"
            >
              <ChevronLeftIcon size={16} />
            </button>
            <button
              type="button"
              className={`${styles.arrow} ${styles.arrowRight}`}
              onClick={next}
              aria-label="Next banner"
            >
              <ChevronRightIcon size={16} />
            </button>
          </>
        ) : null}

        <div className={styles.content}>
          <p className={styles.location}>LnR Cycle Center · Tabaco City</p>
          <h1 className={styles.heading}>
            The parts you need,
            <br />
            and the rides worth training for.
          </h1>
          <p className={styles.subtext}>
            Shop framesets, cockpits and wheels off our floor, spec a full custom
            build, or sign up for our road, criterium, MTB and community rides.
            Pay with GCash either way.
          </p>
          <div className={styles.ctaRow}>
            <Link href="/products" className={styles.ctaPrimary}>
              Shop products
              <ArrowRightIcon size={16} />
            </Link>
            <Link href="/custom-bike-builder" className={styles.ctaSecondary}>
              <WrenchIcon size={16} />
              Build a bike
            </Link>
          </div>
        </div>

        <div className={styles.socials}>
          <a
            href="https://www.facebook.com/p/LnR-Cycle-center-100063694245362/"
            target="_blank"
            rel="noreferrer"
            className={styles.social}
            aria-label="LNR Cycle Center on Facebook"
          >
            <FacebookIcon size={15} />
          </a>
        </div>
      </div>
    </section>
  );
}
