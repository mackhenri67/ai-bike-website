import "server-only";
import { redirect } from "next/navigation";
import { getAdminUser, getUser } from "@/lib/supabase/server";
import { isAdmin } from "./roles";
export async function requireAdmin() {
  const user = await getAdminUser();
  if (!user || !isAdmin(user)) redirect("/admin/login");
  return user;
}
export async function requireCustomer(loginPath = "/login") {
  const user = await getUser();
  if (!user) redirect(loginPath);
  return user;
}
