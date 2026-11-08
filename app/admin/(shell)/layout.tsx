import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import AdminLayout from "@/components/admin/AdminLayout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | LnR Cycle Center",
};

/**
 * Shell layout for every authenticated admin page. Guards the route and
 * provides the reusable sidebar + header once — future pages (orders,
 * products, customers, …) only supply their own content via {children}.
 *
 * The NewOrdersProvider is mounted inside AdminLayout (as a client component)
 * so the sidebar badge and dashboard New Orders card share a single
 * synchronized real-time count.
 */
export default async function AdminShellLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireAdmin();

  return <AdminLayout user={user}>{children}</AdminLayout>;
}
