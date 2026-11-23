"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCustomerAccount } from "@/components/customer/CustomerAccountContext";
import { getBrowserClient } from "@/lib/supabase/client";
import { useCart } from "@/components/customer/CartContext";
import { saveCustomerCart } from "@/app/cart/actions";
import {
  ChevronDownIcon,
  EventsIcon,
  LogOutIcon,
  OrdersIcon,
  UserIcon,
} from "./icons";
import styles from "./AccountMenu.module.css";

/** Storefront account menu backed by the persistent customer account provider. */
export default function AccountMenu() {
  const router = useRouter();
  const { items } = useCart();
  const { account, authenticated, ready } = useCustomerAccount();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  /* ---------- Close on outside click ---------- */

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  /* ---------- Close on Escape ---------- */

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  /* ---------- Sign out ---------- */

  const handleSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    setOpen(false);

    try {
      await saveCustomerCart(items);
    } catch {
      /* Sign out regardless — debounced sync already saved recent changes. */
    }

    try {
      await getBrowserClient().auth.signOut({ scope: "local" });
    } catch {
      /* CartContext's SIGNED_OUT handler also clears the client cart. */
    }

    router.push("/");
    router.refresh();
  }, [signingOut, items, router]);

  const closeDropdown = () => setOpen(false);

  /* ---------- Render ---------- */

  if (!ready) {
    // Keep the account control's space stable while the canonical profile loads.
    // Do not temporarily display the old Supabase Auth full_name here.
    return (
      <span className={styles.trigger} role="status" aria-label="Loading account">
        <UserIcon size={18} />
      </span>
    );
  }

  if (!authenticated || !account) {
    return (
      <Link href="/login" className={styles.trigger} aria-label="Sign in">
        <UserIcon size={18} />
      </Link>
    );
  }

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerActive : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <UserIcon size={18} />
        <span className={styles.triggerName}>{account.name}</span>
        <ChevronDownIcon size={14} className={styles.chevron} />
      </button>

      <div
        className={`${styles.panel} ${open ? styles.panelOpen : ""}`}
        role="menu"
        aria-label="Account"
      >
        <div className={styles.info}>
          <p className={styles.infoName}>{account.name}</p>
          <p className={styles.infoEmail}>{account.email}</p>
        </div>

        <ul className={styles.menuList}>
          <li className={styles.menuItem}>
            <Link href="/profile" className={styles.menuLink} role="menuitem" onClick={closeDropdown}>
              <UserIcon size={15} className={styles.menuIcon} />
              <span>My Account</span>
            </Link>
          </li>
          <li className={styles.menuItem}>
            <Link href="/profile?tab=orders" className={styles.menuLink} role="menuitem" onClick={closeDropdown}>
              <OrdersIcon size={15} className={styles.menuIcon} />
              <span>My Orders</span>
            </Link>
          </li>
          <li className={styles.menuItem}>
            <Link href="/my-events" className={styles.menuLink} role="menuitem" onClick={closeDropdown}>
              <EventsIcon size={15} className={styles.menuIcon} />
              <span>My Events</span>
            </Link>
          </li>
        </ul>

        <div className={styles.logoutSection}>
          <button type="button" className={styles.logoutLink} role="menuitem" onClick={handleSignOut} disabled={signingOut}>
            <LogOutIcon size={15} className={styles.logoutIcon} />
            <span>{signingOut ? "Signing Out…" : "Log Out"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
