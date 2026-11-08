import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { sanitizeNext } from "@/lib/navigation";
import CustomerHeader from "@/components/customer/CustomerHeader";
import CustomerFooter from "@/components/customer/CustomerFooter";
import LoginForm from "./login-form";
import styles from "@/app/customer-auth.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in | LnR Cycle Center",
  description:
    "Sign in to your LnR Cycle Center account to check out and track orders.",
};

type LoginPageProps = {
  searchParams: Promise<{ next?: string; confirmation?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getUser();
  const { next, confirmation } = await searchParams;

  // Already signed in? Go to the profile area.
  if (user) {
    redirect("/profile");
  }

  const nextPath = sanitizeNext(
    typeof next === "string" ? next : "",
    "/profile",
  );
  const signupHref = `/signup?next=${encodeURIComponent(nextPath)}`;

  return (
    <>
      <CustomerHeader />
      <main className={styles.page}>
        <section className={styles.card} aria-labelledby="login-title">
          <h1 className={styles.heading} id="login-title">
            Welcome Back
          </h1>
          <p className={styles.subheading}>
            Sign in to continue to checkout, track your orders and manage your
            delivery location.
          </p>
          {confirmation === "failed" ? (
            <p role="alert">
              The confirmation link could not be completed in this browser. Try
              signing in, or request a new link.
            </p>
          ) : null}
          <LoginForm next={nextPath} />
          <p className={styles.switch}>
            New to LnR Cycle Center?{" "}
            <Link href={signupHref} className={styles.switchLink}>
              Create an account
            </Link>
          </p>
        </section>
      </main>
      <CustomerFooter />
    </>
  );
}
