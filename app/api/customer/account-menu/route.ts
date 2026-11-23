import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { getCustomerByAuthUserId } from "@/lib/data/customer/customers";

export const dynamic = "force-dynamic";

/**
 * Returns the signed-in customer's current directory name for the storefront
 * header. The customers table is the source of truth edited in Account Overview.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getUser();
  if (!user) {
    return NextResponse.json(
      { error: "You must be signed in as a customer." },
      {
        status: 401,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      }
    );
  }

  const customer = await getCustomerByAuthUserId(user.id);
  const metadataName = user.user_metadata?.full_name;
  const name =
    customer?.full_name?.trim() ||
    (typeof metadataName === "string" ? metadataName.trim() : "") ||
    user.email?.split("@")[0] ||
    "Customer";

  return NextResponse.json(
    { name, email: customer?.email ?? user.email ?? "" },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  );
}
