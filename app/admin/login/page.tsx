import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth/roles";
import { getAdminUser } from "@/lib/supabase/server";
import LoginForm from "./login-form";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in | LnR Cycle Center",
  description: "Sign in to the LnR Cycle Center administrator panel.",
};

export default async function AdminLoginPage() {
  const user = await getAdminUser();

  // Already signed in? Go straight to the admin area.
  if (isAdmin(user)) {
    redirect("/admin");
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.brand}>
          <Image
            src="/assets/brand/logo-lnr.png"
            alt="LnR Cycle Center logo"
            fill
            priority
            sizes="240px"
            className={styles.brandImage}
          />
        </div>

        <h1 className={styles.heading}>Administrator</h1>

        <section className={styles.card} aria-labelledby="login-title">
          <h2 className={styles.cardTitle} id="login-title">
            Log In
          </h2>
          <LoginForm />
        </section>
      </div>

      <footer className={styles.footer}>© LnR Cycle Center 2025</footer>
    </main>
  );
}
