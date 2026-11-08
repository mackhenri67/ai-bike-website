import "server-only";
import { getUser, getAdminUser } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/roles";
/** The image endpoint rechecks the viewer on every request, including after logout. */
export async function paymentProofUrl(path: string): Promise<string> {
  if (!path || path.includes("://") || path.includes("..") || path.length > 600)
    return "";
  const [customer, admin] = await Promise.all([getUser(), getAdminUser()]);
  if (!isAdmin(admin) && (!customer || path.split("/")[0] !== customer.id))
    return "";
  return "/api/payment-proof?path=" + encodeURIComponent(path);
}
