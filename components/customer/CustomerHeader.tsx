"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { HEADER_LOGO_SRC } from "./data";
import { useCart } from "./CartContext";
import AccountMenu from "./AccountMenu";
import {
  CartIcon,
  CloseIcon,
  MenuIcon,
  SearchIcon,
} from "./icons";
import styles from "./CustomerHeader.module.css";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/products", label: "Products" },
  { href: "/events", label: "Events" },
  { href: "/about", label: "About Us" },
  { href: "/#bike-customize", label: "Build A Bike" },
];

/**
 * Customer-facing storefront navbar — compact black bar with the logo,
 * uppercase nav links, a product search field, cart (with badge) and the
 * account icon. On narrow screens the links collapse into a hamburger menu.
 */
export default function CustomerHeader() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { badgeCount } = useCart();

  const closeMenu = () => setMenuOpen(false);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = query.trim();
    router.push(q ? `/products?q=${encodeURIComponent(q)}` : "/products");
  };

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <button
          type="button"
          className={styles.menuButton}
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Toggle navigation menu"
          aria-expanded={menuOpen}
        >
          {menuOpen ? <CloseIcon size={18} /> : <MenuIcon size={18} />}
        </button>

        <Link href="/" className={styles.brand} aria-label="LNR Cycle Center home">
          <Image
            src={HEADER_LOGO_SRC}
            alt="LNR Cycle Center"
            width={22}
            height={30}
            className={styles.logo}
            priority
          />
        </Link>

        <nav className={styles.nav} aria-label="Store navigation">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={styles.navLink}>
              {link.label}
            </Link>
          ))}
        </nav>

        <form className={styles.searchForm} role="search" onSubmit={handleSearch}>
          <SearchIcon size={16} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search for a product ..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search for a product"
          />
        </form>

        <div className={styles.actions}>
          <Link href="/cart" className={styles.action} aria-label="Cart">
            <CartIcon size={20} />
            {badgeCount > 0 ? <span className={styles.badge}>{badgeCount}</span> : null}
          </Link>
          <AccountMenu />
        </div>
      </div>

      {menuOpen ? (
        <nav className={styles.mobileNav} aria-label="Mobile store navigation">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={styles.mobileLink}
              onClick={closeMenu}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
