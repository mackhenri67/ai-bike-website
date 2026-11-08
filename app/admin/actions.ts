"use server";

import { redirect } from "next/navigation";
import { createAdminSessionClient } from "@/lib/supabase/server";

/**
 * Server Action: signs the administrator out and returns them to the
 * login page.
 */
export async function adminSignOut() {
  const supabase = await createAdminSessionClient();
  await supabase?.auth.signOut({ scope: "local" });
  redirect("/admin/login");
}
