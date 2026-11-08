"use client";

import { isAdmin } from "@/lib/auth/roles";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
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

type AccountState = {
  name: string;
  email: string;
} | null;

/**
 * Account control for the storefront header.
 *
 * Signed-out visitors see a user icon linking to /login.
 * Signed-in customers see a trigger (icon + name + chevron) that opens a
 * dropdown with: customer info, My Account, My Orders, My Events, and
 * Log Out. The dropdown closes on outside click, Escape key, or after an
 * action. Sign-out persists the cart before clearing the session.
 */
export default function AccountMenu() {
  const router = useRouter();
  const { items } = useCart();
  const [account, setAccount] = useState<AccountState>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  /* ---------- Auth listener ---------- */

  useEffect(() => {
    const client = getBrowserClient();
    let active = true;
    let changed = false;
    const toAccount = (user: User | null | undefined): AccountState => {
      if (!user?.email || isAdmin(user)) return null;
      const fullName = user.user_metadata?.full_name;
      return {
        name:
          typeof fullName === "string" && fullName.trim()
            ? fullName.trim()
            : user.email.split("@")[0],
        email: user.email,
      };
    };
    client.auth
      .getUser()
      .then(({ data }: { data: { user: User | null } }) => {
        if (active && !changed) {
          setAccount(toAccount(data.user));
          setReady(true);
        }
      })
      .catch(() => {
        if (active) setReady(true);
      });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        if (!active) return;
        if (event !== "INITIAL_SESSION") changed = true;
        setAccount(toAccount(session?.user));
        setReady(true);
      },
    );
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

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

  /* ---------- Close dropdown ---------- */

  const closeDropdown = () => setOpen(false);

  /* ---------- Render ---------- */

  if (!ready) {
    return (
      <Link href="/login" className={styles.trigger} aria-label="Account">
        <UserIcon size={18} />
      </Link>
    );
  }

  if (!account) {
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
            <Link
              href="/profile"
              className={styles.menuLink}
              role="menuitem"
              onClick={closeDropdown}
            >
              <UserIcon size={15} className={styles.menuIcon} />
              <span>My Account</span>
            </Link>
          </li>
          <li className={styles.menuItem}>
            <Link
              href="/profile?tab=orders"
              className={styles.menuLink}
              role="menuitem"
              onClick={closeDropdown}
            >
              <OrdersIcon size={15} className={styles.menuIcon} />
              <span>My Orders</span>
            </Link>
          </li>
          <li className={styles.menuItem}>
            <Link
              href="/my-events"
              className={styles.menuLink}
              role="menuitem"
              onClick={closeDropdown}
            >
              <EventsIcon size={15} className={styles.menuIcon} />
              <span>My Events</span>
            </Link>
          </li>
        </ul>

        <div className={styles.logoutSection}>
          <button
            type="button"
            className={styles.logoutLink}
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            <LogOutIcon size={15} className={styles.logoutIcon} />
            <span>{signingOut ? "Signing Out\u2026" : "Log Out"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
