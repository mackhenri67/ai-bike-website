"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { adminSignOut } from "@/app/admin/actions";
import { useNewOrders } from "./NewOrdersContext";
import AdminNavItem from "./AdminNavItem";
import ChatIcon from "@/components/chat/ChatIcon";
import { useAdminMessageCount } from "@/components/chat/useAdminMessageCount";
import {
  CalendarIcon,
  CartIcon,
  CloseIcon,
  CubeIcon,
  ExternalLinkIcon,
  GridIcon,
  LogoutIcon,
  MenuIcon,
  SettingsIcon,
  TicketIcon,
  UsersIcon,
} from "./icons";
import styles from "./AdminSidebar.module.css";

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Dashboard", icon: GridIcon },
  { href: "/admin/orders", label: "Orders", icon: CartIcon },
  { href: "/admin/events", label: "Events", icon: CalendarIcon },
  { href: "/admin/registrations", label: "Sign-ups", icon: TicketIcon },
  { href: "/admin/products", label: "Products", icon: CubeIcon },
  { href: "/admin/customers", label: "Customers", icon: UsersIcon },
  { href: "/admin/messages", label: "Messages", icon: ChatIcon },
  { href: "/admin/settings", label: "Settings", icon: SettingsIcon },
];

/**
 * Fixed 255px black sidebar. Reusable across every admin page — the
 * active item follows the current route (not hardcoded). On narrow
 * screens it collapses into an off-canvas drawer opened by the menu
 * button.
 */
export default function AdminSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const { unreadCount } = useNewOrders();
  const messageCount = useAdminMessageCount();

  // "/admin" is the dashboard's redirect target, so count it as active.
  const effectivePath = pathname === "/admin" ? "/admin/dashboard" : pathname;
  const isActive = (href: string) =>
    effectivePath === href || effectivePath.startsWith(`${href}/`);

  return (
    <>
      <button
        type="button"
        className={styles.menuButton}
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={open}
      >
        <MenuIcon size={22} />
      </button>

      {open ? (
        <div className={styles.backdrop} onClick={close} aria-hidden="true" />
      ) : null}

      <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ""}`}>
        {/* Brand / logo */}
        <div className={styles.brandRow}>
          <Link href="/admin/dashboard" className={styles.brand} onClick={close}>
            <Image
              src="/assets/brand/logo-sidebar.png"
              alt="LnR Cycle Center"
              width={33}
              height={44}
              className={styles.brandImage}
            />
            <span className={styles.brandText}>LnR Cycle Center</span>
          </Link>
          <button
            type="button"
            className={styles.closeButton}
            onClick={close}
            aria-label="Close navigation menu"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        {/* Primary navigation */}
        <nav className={styles.nav} aria-label="Admin navigation">
          {NAV_ITEMS.map((item) => (
            <AdminNavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActive(item.href)}
              onClick={close}
              badge={
                item.href === "/admin/orders" ? unreadCount || undefined : item.href === "/admin/messages" ? messageCount || undefined : undefined
              }
            />
          ))}
        </nav>

        <hr className={`${styles.divider} ${styles.dividerInset}`} />

        {/* Secondary action */}
        <div className={styles.secondaryNav}>
          <AdminNavItem
            href="/"
            label="Visit Site"
            icon={ExternalLinkIcon}
            external
          />
        </div>

        <div className={styles.spacer} />

        {/* Log out — pinned to the bottom via the flex spacer */}
        <hr className={styles.divider} />
        <form action={adminSignOut} className={styles.logoutForm}>
          <button type="submit" className={styles.logoutButton}>
            <LogoutIcon size={22} />
            <span>Log out</span>
          </button>
        </form>
      </aside>
    </>
  );
}
