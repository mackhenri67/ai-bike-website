import "server-only";
import { getAdminClient } from "@/lib/supabase/admin";
import { type CustomerRow, type QueryResult } from "@/lib/data/types";
import { missingServiceRoleMessage, toFriendlyDbError } from "./errors";

type CustomerLocationAddress = {
  customer_id: string;
  address: string;
  is_default: boolean;
  created_at: string;
};

export async function listCustomers(): Promise<QueryResult<CustomerRow[]>> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  const { data, error } = await admin
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: toFriendlyDbError(error) };

  const customers = (data as CustomerRow[]) ?? [];
  if (customers.length === 0) return { data: [], error: null };

  // Delivery addresses are saved in customer_locations, not customers.address.
  // Prefer the default location, then the most recently saved location. Keep
  // the legacy customers.address value as a fallback for older accounts.
  const { data: locationRows, error: locationError } = await admin
    .from("customer_locations")
    .select("customer_id, address, is_default, created_at")
    .in("customer_id", customers.map((customer) => customer.id))
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (locationError) {
    return { data: null, error: toFriendlyDbError(locationError) };
  }

  const addressByCustomer = new Map<string, string>();
  for (const location of (locationRows ?? []) as CustomerLocationAddress[]) {
    const address = location.address?.trim();
    if (address && !addressByCustomer.has(location.customer_id)) {
      addressByCustomer.set(location.customer_id, address);
    }
  }

  return {
    data: customers.map((customer) => ({
      ...customer,
      address:
        addressByCustomer.get(customer.id) ?? customer.address?.trim() ?? null,
    })),
    error: null,
  };
}

export async function deleteCustomer(
  id: string
): Promise<QueryResult<null>> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: missingServiceRoleMessage() };

  // orders.customer_id is `on delete set null`, so past orders keep their
  // customer snapshot and only lose the directory link.
  const { error } = await admin.from("customers").delete().eq("id", id);
  if (error) return { data: null, error: toFriendlyDbError(error) };

  return { data: null, error: null };
}
